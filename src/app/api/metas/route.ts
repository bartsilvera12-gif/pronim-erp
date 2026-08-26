import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  DIAS_HABILES_POR_SEMANA, diasHabilesEnRango, diasHabilesDelMes,
} from "@/lib/metas/dias-habiles";

export const dynamic = "force-dynamic";

/**
 * GET /api/metas
 *
 * Devuelve, por cada sucursal visible al usuario:
 *   - meta diaria vigente + % de comisión (alcanza / no alcanza).
 *   - venta acumulada del día actual + % de meta + faltante.
 *   - venta acumulada de la semana (lunes → hoy) + meta semanal (suma de
 *     metas diarias por días laborables ya transcurridos incl. hoy) +
 *     % de meta semanal + faltante.
 *   - comisión estimada del período (según si va alcanzando la semanal).
 *   - récords históricos: mejor día, mejor semana y mejor mes de la
 *     sucursal (por total vendido).
 *
 * Sucursal fija del usuario limita el listado a esa sucursal;
 * admin ve todas.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 503 });

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tS = quoteSchemaTable(schema, "sucursales");
    const tM = quoteSchemaTable(schema, "metas_sucursal");
    const tV = quoteSchemaTable(schema, "ventas");

    // Sucursales visibles.
    const params: unknown[] = [auth.empresa_id];
    let sucFilter = "";
    if (auth.sucursal_id) {
      params.push(auth.sucursal_id);
      sucFilter = ` AND s.id = $2::uuid`;
    }
    type SucMetaRow = {
      id: string; nombre: string; moneda: string;
      monto_meta_diaria: number | string | null;
      comision_alcanza_pct: number | string | null;
      comision_no_alcanza_pct: number | string | null;
      monto_meta_semanal?: number | string | null;
      monto_meta_mensual?: number | string | null;
      bono_meta_superada_pct?: number | string | null;
      bono_ticket_prom_min?: number | string | null;
      bono_ticket_prom_pct?: number | string | null;
    };
    // Query completa (con columnas de bonos). Si el schema aún no tiene las
    // columnas nuevas, cae al fallback → fallback → sin moneda.
    const sucRes = await pool.query<SucMetaRow>(
      `SELECT s.id, s.nombre, COALESCE(s.moneda, 'PYG') AS moneda,
              m.monto_meta_diaria, m.comision_alcanza_pct, m.comision_no_alcanza_pct,
              m.monto_meta_semanal, m.monto_meta_mensual,
              m.bono_meta_superada_pct, m.bono_ticket_prom_min, m.bono_ticket_prom_pct
         FROM ${tS} s
         LEFT JOIN ${tM} m ON m.sucursal_id = s.id AND m.activo = true
        WHERE s.empresa_id = $1::uuid AND s.activo = true${sucFilter}
        ORDER BY s.es_principal DESC, s.nombre ASC`,
      params,
    ).catch(async () =>
      pool.query<SucMetaRow>(
        `SELECT s.id, s.nombre, COALESCE(s.moneda, 'PYG') AS moneda,
                m.monto_meta_diaria, m.comision_alcanza_pct, m.comision_no_alcanza_pct
           FROM ${tS} s
           LEFT JOIN ${tM} m ON m.sucursal_id = s.id AND m.activo = true
          WHERE s.empresa_id = $1::uuid AND s.activo = true${sucFilter}
          ORDER BY s.es_principal DESC, s.nombre ASC`,
        params,
      ).catch(async () => {
        const r = await pool.query<SucMetaRow>(
          `SELECT s.id, s.nombre,
                  m.monto_meta_diaria, m.comision_alcanza_pct, m.comision_no_alcanza_pct
             FROM ${tS} s
             LEFT JOIN ${tM} m ON m.sucursal_id = s.id AND m.activo = true
            WHERE s.empresa_id = $1::uuid AND s.activo = true${sucFilter}
            ORDER BY s.es_principal DESC, s.nombre ASC`,
          params,
        );
        return { ...r, rows: r.rows.map(x => ({ ...x, moneda: 'PYG' })) };
      }),
    );

    // Fechas: hoy y lunes de esta semana (en zona local del server; suficiente
    // para KPIs. Para reportes finos se calcula con `AT TIME ZONE`.)
    const hoy = new Date();
    const dia = hoy.getDay(); // 0=dom, 1=lun … 6=sáb
    const diffLun = ((dia + 6) % 7); // días desde lunes
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diffLun);
    lunes.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().slice(0, 10);
    const lunStr = lunes.toISOString().slice(0, 10);

    // Inicio de mes.
    const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const mesInicioStr = mesInicio.toISOString().slice(0, 10);
    // Días laborables del mes en curso (aproximado — cuenta 26/mes por defecto).
    const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diaDelMes = hoy.getDate();

    // Suma por sucursal en día / semana / mes + tickets del mes (para ticket promedio).
    const kpisRes = await pool.query<{
      sucursal_id: string;
      total_dia: number | string;
      total_semana: number | string;
      total_mes: number | string;
      tickets_mes: number | string;
    }>(
      `SELECT sucursal_id,
              COALESCE(SUM(total) FILTER (WHERE fecha::date = $2::date), 0)::float8 AS total_dia,
              COALESCE(SUM(total) FILTER (WHERE fecha::date >= $3::date), 0)::float8 AS total_semana,
              COALESCE(SUM(total) FILTER (WHERE fecha::date >= $4::date), 0)::float8 AS total_mes,
              COUNT(*) FILTER (WHERE fecha::date >= $4::date)::float8 AS tickets_mes
         FROM ${tV}
        WHERE empresa_id = $1::uuid
          AND estado <> 'anulada'
          AND fecha::date >= $4::date
          AND sucursal_id IS NOT NULL
        GROUP BY sucursal_id`,
      [auth.empresa_id, hoyStr, lunStr, mesInicioStr],
    );
    const kpisBySuc = new Map<string, { dia: number; semana: number; mes: number; tickets: number }>();
    for (const r of kpisRes.rows) {
      kpisBySuc.set(r.sucursal_id, {
        dia: Number(r.total_dia),
        semana: Number(r.total_semana),
        mes: Number(r.total_mes),
        tickets: Number(r.tickets_mes),
      });
    }

    // Récords por sucursal.
    const recRes = await pool.query<{
      sucursal_id: string;
      mejor_dia_fecha: string | null; mejor_dia_total: number | string | null;
      mejor_sem_ini: string | null;   mejor_sem_total: number | string | null;
      mejor_mes_ym: string | null;    mejor_mes_total: number | string | null;
    }>(
      `WITH ventas_ok AS (
         SELECT sucursal_id, total, (fecha AT TIME ZONE 'America/Asuncion')::date AS f
           FROM ${tV}
          WHERE empresa_id = $1::uuid AND estado <> 'anulada' AND sucursal_id IS NOT NULL
       ),
       por_dia AS (
         SELECT sucursal_id, f AS fecha, SUM(total)::float8 AS total
           FROM ventas_ok GROUP BY sucursal_id, f
       ),
       por_semana AS (
         SELECT sucursal_id, date_trunc('week', f)::date AS ini, SUM(total)::float8 AS total
           FROM ventas_ok GROUP BY sucursal_id, date_trunc('week', f)
       ),
       por_mes AS (
         SELECT sucursal_id, to_char(f, 'YYYY-MM') AS ym, SUM(total)::float8 AS total
           FROM ventas_ok GROUP BY sucursal_id, to_char(f, 'YYYY-MM')
       ),
       md AS (SELECT DISTINCT ON (sucursal_id) sucursal_id, fecha, total FROM por_dia ORDER BY sucursal_id, total DESC),
       ms AS (SELECT DISTINCT ON (sucursal_id) sucursal_id, ini,   total FROM por_semana ORDER BY sucursal_id, total DESC),
       mm AS (SELECT DISTINCT ON (sucursal_id) sucursal_id, ym,    total FROM por_mes ORDER BY sucursal_id, total DESC)
       SELECT s.id AS sucursal_id,
              md.fecha::text AS mejor_dia_fecha, md.total AS mejor_dia_total,
              ms.ini::text   AS mejor_sem_ini,   ms.total AS mejor_sem_total,
              mm.ym          AS mejor_mes_ym,    mm.total AS mejor_mes_total
         FROM ${tS} s
         LEFT JOIN md ON md.sucursal_id = s.id
         LEFT JOIN ms ON ms.sucursal_id = s.id
         LEFT JOIN mm ON mm.sucursal_id = s.id
        WHERE s.empresa_id = $1::uuid`,
      [auth.empresa_id],
    );
    const recBySuc = new Map<string, typeof recRes.rows[number]>();
    for (const r of recRes.rows) recBySuc.set(r.sucursal_id, r);

    // Días laborables desde el lunes hasta hoy (incluidos). Contamos 7 días
    // porque muchas tiendas trabajan sáb+dom; el admin ajusta la meta
    // diaria si aplica.
    const diasTranscurridos = diffLun + 1;
    // Días de VENTA (hábiles) ya transcurridos en la semana y totales del mes.
    const diasHabilesTranscurridosSemana = diasHabilesEnRango(lunes, hoy);
    const diasHabilesMes = diasHabilesDelMes(hoy);

    const metas = sucRes.rows.map((r) => {
      const metaDia = Number(r.monto_meta_diaria ?? 0);
      const comAlc = Number(r.comision_alcanza_pct ?? 1);
      const comNo = Number(r.comision_no_alcanza_pct ?? 0.5);
      const bonoSuperada = Number(r.bono_meta_superada_pct ?? 0);
      const bonoTkMin = Number(r.bono_ticket_prom_min ?? 0);
      const bonoTkPct = Number(r.bono_ticket_prom_pct ?? 0);
      const kpi = kpisBySuc.get(r.id) ?? { dia: 0, semana: 0, mes: 0, tickets: 0 };
      // La tienda abre 6 días por semana (cierra domingos): las metas se
      // derivan de días HÁBILES, no de días calendario.
      const metaSem = Number(r.monto_meta_semanal ?? 0) || metaDia * DIAS_HABILES_POR_SEMANA;
      const metaMes = Number(r.monto_meta_mensual ?? 0) || metaDia * diasHabilesMes;
      const metaSemProrrateada = metaDia * diasHabilesTranscurridosSemana;
      const pctDia = metaDia > 0 ? Math.round((kpi.dia / metaDia) * 100) : 0;
      const pctSem = metaSem > 0 ? Math.round((kpi.semana / metaSem) * 100) : 0;
      const pctMes = metaMes > 0 ? Math.round((kpi.mes / metaMes) * 100) : 0;
      const alcanza = metaSem > 0 && kpi.semana >= metaSem;
      const supera = metaSem > 0 && kpi.semana > metaSem;
      const ticketProm = kpi.tickets > 0 ? kpi.mes / kpi.tickets : 0;

      // Comisión escalonada:
      //   - alcanza meta semanal → comAlc + bonoSuperada (si la superó)
      //   - ticket promedio del mes >= umbral → suma bonoTkPct
      //   - sino → comNo
      let pctComision = alcanza ? comAlc : comNo;
      if (supera) pctComision += bonoSuperada;
      if (bonoTkMin > 0 && ticketProm >= bonoTkMin) pctComision += bonoTkPct;
      const comisionEstimada = (kpi.semana * pctComision) / 100;

      // Proyección de cierre del mes: extrapola el ritmo actual (mes / díaActual).
      // Ritmo: por encima/dentro/debajo comparado con el necesario para meta.
      const promedioDiarioActual = diaDelMes > 0 ? kpi.mes / diaDelMes : 0;
      const proyeccionCierreMes = promedioDiarioActual * diasEnMes;
      const diasRestantes = Math.max(0, diasEnMes - diaDelMes);
      const necesarioPorDiaMes = diasRestantes > 0 ? Math.max(0, metaMes - kpi.mes) / diasRestantes : 0;
      let ritmo: "encima" | "dentro" | "debajo" | "sin_meta" = "sin_meta";
      if (metaMes > 0) {
        const necesarioAcumulado = (metaMes / diasEnMes) * diaDelMes;
        const razon = kpi.mes / (necesarioAcumulado || 1);
        ritmo = razon >= 1.05 ? "encima" : razon >= 0.95 ? "dentro" : "debajo";
      }
      const rec = recBySuc.get(r.id);
      return {
        sucursal_id: r.id,
        sucursal_nombre: r.nombre,
        moneda: r.moneda,
        meta_diaria: metaDia,
        meta_semanal: metaSem,
        meta_mensual: metaMes,
        meta_semanal_prorrateada: metaSemProrrateada,
        comision_alcanza_pct: comAlc,
        comision_no_alcanza_pct: comNo,
        bono_meta_superada_pct: bonoSuperada,
        bono_ticket_prom_min: bonoTkMin,
        bono_ticket_prom_pct: bonoTkPct,
        vendido_hoy: kpi.dia,
        vendido_semana: kpi.semana,
        vendido_mes: kpi.mes,
        tickets_mes: kpi.tickets,
        ticket_promedio_mes: Math.round(ticketProm),
        pct_dia: pctDia,
        pct_semana: pctSem,
        pct_mes: pctMes,
        falta_hoy: Math.max(0, metaDia - kpi.dia),
        falta_semana: Math.max(0, metaSem - kpi.semana),
        falta_mes: Math.max(0, metaMes - kpi.mes),
        alcanza_semana: alcanza,
        comision_pct_actual: pctComision,
        comision_estimada: Math.round(comisionEstimada),
        // Proyección de cierre y ritmo (dashboard colaboradora)
        proyeccion_cierre_mes: Math.round(proyeccionCierreMes),
        necesario_por_dia_mes: Math.round(necesarioPorDiaMes),
        promedio_diario_actual: Math.round(promedioDiarioActual),
        dias_restantes_mes: diasRestantes,
        ritmo,
        records: {
          mejor_dia: rec?.mejor_dia_fecha ? { fecha: rec.mejor_dia_fecha, total: Number(rec.mejor_dia_total) } : null,
          mejor_semana: rec?.mejor_sem_ini ? { desde: rec.mejor_sem_ini, total: Number(rec.mejor_sem_total) } : null,
          mejor_mes: rec?.mejor_mes_ym ? { mes: rec.mejor_mes_ym, total: Number(rec.mejor_mes_total) } : null,
        },
      };
    });

    return NextResponse.json(successResponse({
      metas,
      contexto: {
        fecha_hoy: hoyStr,
        semana_desde: lunStr,
        dias_transcurridos_semana: diasTranscurridos,
      },
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[metas GET]", msg);
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json(successResponse({
        metas: [],
        warning: "La tabla pronimerp.metas_sucursal no existe. Aplicá la migración 20260816000000_pronimerp_metas_sucursal.sql.",
      }));
    }
    return NextResponse.json(errorResponse("No se pudieron cargar las metas."), { status: 500 });
  }
}

/**
 * PATCH /api/metas  (admin-only)
 * Body: { sucursal_id, monto_meta_diaria, comision_alcanza_pct?, comision_no_alcanza_pct? }
 *
 * Upsert de la fila activa (single-active-per-sucursal). Guarda quién y cuándo.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  if (!isAdmin(auth)) {
    return NextResponse.json(errorResponse("Solo administradores pueden editar metas."), { status: 403 });
  }

  let body: {
    sucursal_id?: string;
    monto_meta_diaria?: number | string;
    comision_alcanza_pct?: number | string;
    comision_no_alcanza_pct?: number | string;
    monto_meta_semanal?: number | string | null;
    monto_meta_mensual?: number | string | null;
    bono_meta_superada_pct?: number | string;
    bono_ticket_prom_min?: number | string | null;
    bono_ticket_prom_pct?: number | string;
  };
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }
  const sucId = String(body.sucursal_id ?? "").trim();
  if (!sucId) return NextResponse.json(errorResponse("sucursal_id es obligatorio."), { status: 400 });
  const monto = Number(body.monto_meta_diaria);
  if (!Number.isFinite(monto) || monto < 0) {
    return NextResponse.json(errorResponse("monto_meta_diaria debe ser un número >= 0."), { status: 400 });
  }
  const comAlc = body.comision_alcanza_pct != null ? Number(body.comision_alcanza_pct) : null;
  const comNo = body.comision_no_alcanza_pct != null ? Number(body.comision_no_alcanza_pct) : null;
  if (comAlc != null && (!Number.isFinite(comAlc) || comAlc < 0 || comAlc > 100)) {
    return NextResponse.json(errorResponse("comision_alcanza_pct fuera de rango."), { status: 400 });
  }
  if (comNo != null && (!Number.isFinite(comNo) || comNo < 0 || comNo > 100)) {
    return NextResponse.json(errorResponse("comision_no_alcanza_pct fuera de rango."), { status: 400 });
  }

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 503 });
  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tS = quoteSchemaTable(schema, "sucursales");
    const tM = quoteSchemaTable(schema, "metas_sucursal");

    // Verificar pertenencia.
    const sQ = await pool.query<{ empresa_id: string; activo: boolean }>(
      `SELECT empresa_id::text, activo FROM ${tS} WHERE id = $1::uuid`, [sucId],
    );
    const sRow = sQ.rows[0];
    if (!sRow || sRow.empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("La sucursal no pertenece a tu empresa."), { status: 404 });
    }

    // Si existe activa → UPDATE, sino INSERT.
    const existe = await pool.query<{ id: string }>(
      `SELECT id FROM ${tM} WHERE sucursal_id = $1::uuid AND activo = true LIMIT 1`,
      [sucId],
    );
    // Bonos y metas opcionales (tanda 7). Best-effort: si el schema aún no
    // tiene esas columnas, degradamos al UPDATE/INSERT legacy sin bonos.
    const metaSem = body.monto_meta_semanal != null ? Number(body.monto_meta_semanal) : null;
    const metaMes = body.monto_meta_mensual != null ? Number(body.monto_meta_mensual) : null;
    const bonoSup = body.bono_meta_superada_pct != null ? Number(body.bono_meta_superada_pct) : null;
    const bonoTkMin = body.bono_ticket_prom_min != null ? Number(body.bono_ticket_prom_min) : null;
    const bonoTkPct = body.bono_ticket_prom_pct != null ? Number(body.bono_ticket_prom_pct) : null;

    const tryExtendido = async (): Promise<boolean> => {
      try {
        if (existe.rows[0]) {
          await pool.query(
            `UPDATE ${tM} SET
                monto_meta_diaria = $1::numeric,
                comision_alcanza_pct = COALESCE($2::numeric, comision_alcanza_pct),
                comision_no_alcanza_pct = COALESCE($3::numeric, comision_no_alcanza_pct),
                monto_meta_semanal = $6::numeric,
                monto_meta_mensual = $7::numeric,
                bono_meta_superada_pct = COALESCE($8::numeric, bono_meta_superada_pct),
                bono_ticket_prom_min = $9::numeric,
                bono_ticket_prom_pct = COALESCE($10::numeric, bono_ticket_prom_pct),
                updated_at = now(),
                updated_by = $4,
                updated_by_nombre = $5
              WHERE id = $11::uuid`,
            [monto, comAlc, comNo, auth.usuarioCatalogId ?? null, auth.nombre ?? auth.user?.email ?? null,
              metaSem, metaMes, bonoSup, bonoTkMin, bonoTkPct, existe.rows[0].id],
          );
        } else {
          await pool.query(
            `INSERT INTO ${tM} (empresa_id, sucursal_id, monto_meta_diaria,
               comision_alcanza_pct, comision_no_alcanza_pct,
               monto_meta_semanal, monto_meta_mensual,
               bono_meta_superada_pct, bono_ticket_prom_min, bono_ticket_prom_pct,
               updated_by, updated_by_nombre)
             VALUES ($1::uuid, $2::uuid, $3::numeric,
               COALESCE($4::numeric, 1), COALESCE($5::numeric, 0.5),
               $6::numeric, $7::numeric,
               COALESCE($8::numeric, 0), $9::numeric, COALESCE($10::numeric, 0),
               $11, $12)`,
            [auth.empresa_id, sucId, monto, comAlc, comNo, metaSem, metaMes,
              bonoSup, bonoTkMin, bonoTkPct,
              auth.usuarioCatalogId ?? null, auth.nombre ?? auth.user?.email ?? null],
          );
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/column.*(monto_meta_semanal|monto_meta_mensual|bono_)/i.test(msg)) return false;
        throw e;
      }
    };
    const ok = await tryExtendido();
    if (!ok) {
      // Fallback: schema sin columnas nuevas → escribimos solo lo legacy.
      if (existe.rows[0]) {
        await pool.query(
          `UPDATE ${tM} SET
              monto_meta_diaria = $1::numeric,
              comision_alcanza_pct = COALESCE($2::numeric, comision_alcanza_pct),
              comision_no_alcanza_pct = COALESCE($3::numeric, comision_no_alcanza_pct),
              updated_at = now(),
              updated_by = $4,
              updated_by_nombre = $5
            WHERE id = $6::uuid`,
          [monto, comAlc, comNo, auth.usuarioCatalogId ?? null, auth.nombre ?? auth.user?.email ?? null, existe.rows[0].id],
        );
      } else {
        await pool.query(
          `INSERT INTO ${tM} (empresa_id, sucursal_id, monto_meta_diaria, comision_alcanza_pct, comision_no_alcanza_pct, updated_by, updated_by_nombre)
           VALUES ($1::uuid, $2::uuid, $3::numeric, COALESCE($4::numeric, 1), COALESCE($5::numeric, 0.5), $6, $7)`,
          [auth.empresa_id, sucId, monto, comAlc, comNo, auth.usuarioCatalogId ?? null, auth.nombre ?? auth.user?.email ?? null],
        );
      }
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    console.error("[metas PATCH]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo actualizar la meta."), { status: 500 });
  }
}
