import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/clientes/segmentos
 *
 * Filtros combinables (todos AND):
 *   ?vip=1 & con_credito=1 & con_cashback=1
 *   & inactivos_90d=1 & nuevos_mes=1 & en_riesgo=1
 *   & q=texto  (busca en nombre/teléfono/email)
 *
 * Devuelve:
 *   - segmentos: baseline counts (cuántos clientes de la empresa hay en cada
 *     segmento en total, sin considerar los filtros — para poder tildar más)
 *   - clientes: los que cumplen TODOS los filtros activos
 *   - count: total del listado devuelto
 */

type SegmentoSlug =
  | "vip" | "con_credito" | "con_cashback"
  | "inactivos_90d" | "nuevos_mes" | "en_riesgo";

const SEGMENTOS: { slug: SegmentoSlug; label: string; descripcion: string; emoji: string }[] = [
  { slug: "vip",           label: "VIP",                 descripcion: "Marcados manualmente como VIP.",                    emoji: "⭐" },
  { slug: "con_credito",   label: "Con crédito a favor", descripcion: "Saldo de crédito disponible mayor a cero.",        emoji: "💰" },
  { slug: "con_cashback",  label: "Con cashback",        descripcion: "Cashback acreditado pendiente de usar.",            emoji: "🎁" },
  { slug: "inactivos_90d", label: "Inactivos +90 días",  descripcion: "Ya operaron alguna vez, pero hace 90 días o más que no vuelven.", emoji: "📅" },
  { slug: "nuevos_mes",    label: "Nuevos este mes",     descripcion: "Hicieron su primera compra o evaluación este mes.", emoji: "🆕" },
  { slug: "en_riesgo",     label: "En riesgo",           descripcion: "Antes venían seguido y hace ≥45 días no vuelven.",  emoji: "📉" },
];

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const flags: Record<SegmentoSlug, boolean> = {
      vip:            url.searchParams.get("vip") === "1",
      con_credito:    url.searchParams.get("con_credito") === "1",
      con_cashback:   url.searchParams.get("con_cashback") === "1",
      inactivos_90d:  url.searchParams.get("inactivos_90d") === "1",
      nuevos_mes:     url.searchParams.get("nuevos_mes") === "1",
      en_riesgo:      url.searchParams.get("en_riesgo") === "1",
    };
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    // Rango de última compra (fecha). Formato YYYY-MM-DD.
    const desde = (url.searchParams.get("desde") ?? "").trim();
    const hasta = (url.searchParams.get("hasta") ?? "").trim();
    const fechaOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const cliT = quoteSchemaTable(schema, "clientes");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");

    const tblQ = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name IN ('ventas','cliente_creditos_movimientos','cliente_recepciones')`,
      [schema],
    );
    const tables = new Set(tblQ.rows.map((r) => r.table_name));
    const hasVentas = tables.has("ventas");
    const hasCred = tables.has("cliente_creditos_movimientos");
    const hasRecep = tables.has("cliente_recepciones");

    // Columnas opcionales de ventas / recepciones para armar "última transacción".
    let rCols = new Set<string>();
    if (hasRecep) {
      const rColQ = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='cliente_recepciones'`,
        [schema],
      );
      rCols = new Set(rColQ.rows.map((r) => r.column_name));
    }
    const recTotalCol = rCols.has("total_final") ? "COALESCE(r.total_final, r.total_compra, 0)" : "COALESCE(r.total_compra, 0)";
    const recCambio = rCols.has("cambio_id");

    // ¿La tabla de créditos tiene la columna vencimiento_at? Si sí, el
    // cashback vencido (vencimiento_at < now()) NO cuenta como saldo disponible.
    let credHasVenc = false;
    if (hasCred) {
      const ccQ = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'cliente_creditos_movimientos' AND column_name = 'vencimiento_at'`,
        [schema],
      );
      credHasVenc = ccQ.rows.length > 0;
    }
    // Cashback ENTRADA solo suma si no está vencido.
    const cashVigente = credHasVenc ? "AND (m.vencimiento_at IS NULL OR m.vencimiento_at >= now())" : "";

    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'clientes'`,
      [schema],
    );
    const cliCols = new Set(colQ.rows.map((r) => r.column_name));
    const hasEsVip = cliCols.has("es_vip");

    let vCols = new Set<string>();
    if (hasVentas) {
      const vColQ = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'ventas'`,
        [schema],
      );
      vCols = new Set(vColQ.rows.map((r) => r.column_name));
    }
    const ventasFiltroEstado = vCols.has("estado") ? "AND (v.estado IS NULL OR v.estado <> 'anulada')" : "";
    const ventasFechaCol = vCols.has("fecha") ? "v.fecha" : "v.created_at";

    const actividadCTE = hasVentas ? `
      actividad AS (
        SELECT v.cliente_id,
               MAX(${ventasFechaCol})           AS ultima_venta_at,
               MIN(${ventasFechaCol})           AS primera_venta_at,
               COALESCE(SUM(v.total),0)::numeric AS total_comprado,
               COUNT(*)                          AS cnt_ventas,
               COUNT(*) FILTER (WHERE ${ventasFechaCol} >= now() - interval '90 days') AS cnt_90d,
               COUNT(*) FILTER (WHERE ${ventasFechaCol} >= now() - interval '180 days'
                                  AND ${ventasFechaCol} <  now() - interval '90 days') AS cnt_prev_90d
          FROM ${ventasT} v
         WHERE v.empresa_id = $1 ${ventasFiltroEstado}
           AND v.cliente_id IS NOT NULL
         GROUP BY v.cliente_id
      )
    ` : `actividad AS (SELECT NULL::uuid AS cliente_id, NULL::timestamptz AS ultima_venta_at, NULL::timestamptz AS primera_venta_at, 0::numeric AS total_comprado, 0 AS cnt_ventas, 0 AS cnt_90d, 0 AS cnt_prev_90d WHERE false)`;

    // Cashback vencido (emitido con vencimiento ya pasado) — solo si hay columna.
    const cashVencidoExpr = credHasVenc
      ? `COALESCE(SUM(CASE WHEN tipo='ENTRADA' AND origen='cashback' AND m.vencimiento_at IS NOT NULL AND m.vencimiento_at < now() THEN monto ELSE 0 END),0)`
      : "0";
    const creditosCTE = hasCred ? `
      creditos AS (
        SELECT m.cliente_id,
               COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto ELSE -monto END),0)::numeric AS saldo_credito,
               GREATEST(0, COALESCE(SUM(CASE WHEN tipo='ENTRADA' AND origen='cashback' ${cashVigente} THEN monto
                                 WHEN tipo='SALIDA' AND origen='cashback' THEN -monto
                                 ELSE 0 END),0))::numeric AS saldo_cashback,
               ${cashVencidoExpr}::numeric AS cashback_vencido
          FROM ${credT} m
         WHERE m.empresa_id = $1
         GROUP BY m.cliente_id
      )
    ` : `creditos AS (SELECT NULL::uuid AS cliente_id, 0::numeric AS saldo_credito, 0::numeric AS saldo_cashback, 0::numeric AS cashback_vencido WHERE false)`;

    // Recepciones (lo que el cliente NOS vende) — total vendido + count + última.
    const recepCTE = hasRecep ? `
      recact AS (
        SELECT r.cliente_id,
               COALESCE(SUM(${recTotalCol}),0)::numeric AS total_vendido,
               COUNT(*) AS cnt_recep,
               MAX(r.fecha) AS ultima_recep_at,
               MIN(r.fecha) AS primera_recep_at,
               COUNT(*) FILTER (WHERE r.fecha >= now() - interval '90 days') AS rec_90d,
               COUNT(*) FILTER (WHERE r.fecha >= now() - interval '180 days'
                                  AND r.fecha <  now() - interval '90 days') AS rec_prev_90d
          FROM ${recepT} r
         WHERE r.empresa_id = $1 AND (r.estado IS NULL OR r.estado <> 'anulada') AND r.cliente_id IS NOT NULL
         GROUP BY r.cliente_id
      ),
      ur AS (
        SELECT DISTINCT ON (r.cliente_id) r.cliente_id,
               r.fecha AS ur_fecha, ${recTotalCol}::numeric AS ur_monto,
               ${recCambio ? "(r.cambio_id IS NOT NULL)" : "false"} AS ur_cambio
          FROM ${recepT} r
         WHERE r.empresa_id = $1 AND (r.estado IS NULL OR r.estado <> 'anulada') AND r.cliente_id IS NOT NULL
         ORDER BY r.cliente_id, r.fecha DESC
      )
    ` : `
      recact AS (SELECT NULL::uuid AS cliente_id, 0::numeric AS total_vendido, 0 AS cnt_recep, NULL::timestamptz AS ultima_recep_at, NULL::timestamptz AS primera_recep_at, 0 AS rec_90d, 0 AS rec_prev_90d WHERE false),
      ur AS (SELECT NULL::uuid AS cliente_id, NULL::timestamptz AS ur_fecha, 0::numeric AS ur_monto, false AS ur_cambio WHERE false)
    `;

    // Última venta (para tipo + monto de la última transacción).
    const uvCTE = hasVentas ? `
      uv AS (
        SELECT DISTINCT ON (v.cliente_id) v.cliente_id,
               ${ventasFechaCol} AS uv_fecha, COALESCE(v.total,0)::numeric AS uv_monto,
               ${vCols.has("cambio_id") ? "(v.cambio_id IS NOT NULL)" : "false"} AS uv_cambio
          FROM ${ventasT} v
         WHERE v.empresa_id = $1 ${ventasFiltroEstado} AND v.cliente_id IS NOT NULL
         ORDER BY v.cliente_id, ${ventasFechaCol} DESC
      )
    ` : `uv AS (SELECT NULL::uuid AS cliente_id, NULL::timestamptz AS uv_fecha, 0::numeric AS uv_monto, false AS uv_cambio WHERE false)`;

    // Expiración de cashback: el vencimiento más próximo aún vigente.
    const cbexpCTE = (hasCred && credHasVenc) ? `
      cbexp AS (
        SELECT m.cliente_id, MIN(m.vencimiento_at) AS expira
          FROM ${credT} m
         WHERE m.empresa_id = $1 AND m.tipo='ENTRADA' AND m.origen='cashback'
           AND m.vencimiento_at IS NOT NULL AND m.vencimiento_at >= now()
         GROUP BY m.cliente_id
      )
    ` : `cbexp AS (SELECT NULL::uuid AS cliente_id, NULL::timestamptz AS expira WHERE false)`;

    // Una "transacción" del cliente es tanto comprar (venta) como traer prendas
    // (recepción): las dos son visitas y las dos lo mantienen activo. Los
    // segmentos se calculan sobre esa actividad combinada, no solo ventas.
    const ultimaTx = `NULLIF(GREATEST(
      COALESCE(a.ultima_venta_at, '-infinity'::timestamptz),
      COALESCE(recact.ultima_recep_at, '-infinity'::timestamptz)
    ), '-infinity'::timestamptz)`;
    const primeraTx = `NULLIF(LEAST(
      COALESCE(a.primera_venta_at, 'infinity'::timestamptz),
      COALESCE(recact.primera_recep_at, 'infinity'::timestamptz)
    ), 'infinity'::timestamptz)`;
    const txPrev90 = `(COALESCE(a.cnt_prev_90d,0) + COALESCE(recact.rec_prev_90d,0))`;

    // Expresiones booleanas por segmento (reutilizables en filtros y counts)
    const expr: Record<SegmentoSlug, string> = {
      vip:            `${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} = true`,
      con_credito:    `COALESCE(cr.saldo_credito,0)  > 0`,
      con_cashback:   `COALESCE(cr.saldo_cashback,0) > 0`,
      // Inactivo = YA fue cliente y hace 90+ días que no vuelve. Un cliente
      // recién cargado que nunca operó no está "inactivo": nunca estuvo activo.
      inactivos_90d:  `${ultimaTx} IS NOT NULL AND ${ultimaTx} < now() - interval '90 days'`,
      // Nuevo del mes = hizo su PRIMERA transacción este mes. Antes se usaba la
      // fecha de alta, así que aparecían clientes cargados a mano que nunca
      // compraron ni trajeron nada, y faltaban los que estrenaron este mes.
      nuevos_mes:     `${primeraTx} >= date_trunc('month', now())`,
      en_riesgo:      `${txPrev90} >= 2 AND (${ultimaTx} IS NULL OR ${ultimaTx} < now() - interval '45 days')`,
    };

    // Baseline counts (por segmento, sin considerar filtros de segmento)
    // Scope de cartera se aplica igual, para que las tarjetas reflejen el
    // pool real que ve el usuario según su sucursal.
    const scopeFilter = (auth.scope_clientes && cliCols.has("scope_clientes"))
      ? "AND c.scope_clientes = $2"
      : "";
    const countsParams: unknown[] = [auth.empresa_id];
    if (auth.scope_clientes && cliCols.has("scope_clientes")) countsParams.push(auth.scope_clientes);
    const countsQ = await pool.query<Record<SegmentoSlug | "total", string>>(
      // recepCTE + su join hacen falta porque los segmentos miran la actividad
      // combinada (ventas + recepciones), no solo ventas.
      `WITH ${actividadCTE}, ${creditosCTE}, ${recepCTE}
       SELECT ${SEGMENTOS.map((s) => `COUNT(*) FILTER (WHERE ${expr[s.slug]})::text AS ${s.slug}`).join(",\n              ")},
              COUNT(*)::text AS total
         FROM ${cliT} c
         LEFT JOIN actividad a  ON a.cliente_id  = c.id
         LEFT JOIN creditos cr  ON cr.cliente_id = c.id
         LEFT JOIN recact       ON recact.cliente_id = c.id
        WHERE c.empresa_id = $1 ${scopeFilter}`,
      countsParams,
    );
    const cntRow = countsQ.rows[0] ?? {} as Record<string, string>;

    // Filtros activos → WHERE combinado con AND
    const activos = (Object.entries(flags) as [SegmentoSlug, boolean][]).filter(([, on]) => on).map(([k]) => k);

    // Última transacción = la más reciente entre última venta y última recepción.
    const ultimaTxFecha = `GREATEST(COALESCE(uv.uv_fecha, '-infinity'::timestamptz), COALESCE(ur.ur_fecha, '-infinity'::timestamptz))`;
    const selectBase = `
      c.id::text                                    AS id,
      COALESCE(c.empresa, c.nombre_contacto, c.nombre, 'Cliente') AS nombre,
      c.telefono                                    AS telefono,
      c.email                                       AS email,
      ${cliCols.has("ruc") ? "c.ruc" : "NULL::text"}  AS ruc,
      ${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} AS es_vip,
      a.ultima_venta_at                             AS ultima_venta_at,
      a.primera_venta_at                            AS primera_venta_at,
      COALESCE(a.total_comprado,0)::text            AS total_comprado,
      COALESCE(a.cnt_ventas,0)                      AS cnt_ventas,
      COALESCE(recact.total_vendido,0)::text        AS total_vendido,
      COALESCE(recact.cnt_recep,0)                  AS cnt_recep,
      (COALESCE(a.cnt_ventas,0) + COALESCE(recact.cnt_recep,0)) AS cnt_transacciones,
      COALESCE(cr.saldo_credito,0)::text            AS saldo_credito,
      COALESCE(cr.saldo_cashback,0)::text           AS saldo_cashback,
      COALESCE(cr.cashback_vencido,0)::text         AS cashback_vencido,
      cbexp.expira                                  AS cashback_expira,
      -- Status: vip > nuevo > dormido > frecuente > activo
      CASE
        WHEN ${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} THEN 'vip'
        WHEN a.ultima_venta_at IS NULL AND recact.ultima_recep_at IS NULL THEN 'nuevo'
        WHEN ${ultimaTxFecha} < now() - interval '90 days' THEN 'dormido'
        WHEN COALESCE(a.cnt_ventas,0) + COALESCE(recact.cnt_recep,0) >= 3 THEN 'frecuente'
        ELSE 'activo'
      END AS status,
      -- Última transacción (tipo / fecha / monto)
      CASE
        WHEN uv.uv_fecha IS NULL AND ur.ur_fecha IS NULL THEN NULL
        WHEN COALESCE(ur.ur_fecha,'-infinity'::timestamptz) > COALESCE(uv.uv_fecha,'-infinity'::timestamptz)
          THEN (CASE WHEN ur.ur_cambio THEN 'cambio' ELSE 'compra' END)
        ELSE (CASE WHEN uv.uv_cambio THEN 'cambio' ELSE 'venta' END)
      END AS ultima_tx_tipo,
      NULLIF(${ultimaTxFecha}, '-infinity'::timestamptz) AS ultima_tx_fecha,
      CASE
        WHEN uv.uv_fecha IS NULL AND ur.ur_fecha IS NULL THEN NULL
        WHEN COALESCE(ur.ur_fecha,'-infinity'::timestamptz) > COALESCE(uv.uv_fecha,'-infinity'::timestamptz)
          THEN ur.ur_monto::text
        ELSE uv.uv_monto::text
      END AS ultima_tx_monto
    `;

    const params: unknown[] = [auth.empresa_id];
    const whereParts: string[] = ["c.empresa_id = $1"];
    for (const slug of activos) whereParts.push(expr[slug]);
    // Scope de cartera por sucursal (best-effort: si la columna no existe,
    // la lectura del middleware devuelve null y no filtramos).
    if (auth.scope_clientes && cliCols.has("scope_clientes")) {
      params.push(auth.scope_clientes);
      whereParts.push(`c.scope_clientes = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      whereParts.push(`(LOWER(COALESCE(c.empresa, c.nombre_contacto, c.nombre, '')) LIKE ${p}
                        OR LOWER(COALESCE(c.telefono, '')) LIKE ${p}
                        OR LOWER(COALESCE(c.email, '')) LIKE ${p})`);
    }
    // Filtro por rango de última compra (fecha).
    if (fechaOk(desde)) {
      params.push(desde);
      whereParts.push(`a.ultima_venta_at >= $${params.length}::timestamptz`);
    }
    if (fechaOk(hasta)) {
      params.push(hasta);
      whereParts.push(`a.ultima_venta_at < ($${params.length}::date + interval '1 day')`);
    }

    const listado = await pool.query<Record<string, unknown>>(
      `WITH ${actividadCTE}, ${creditosCTE}, ${recepCTE}, ${uvCTE}, ${cbexpCTE}
       SELECT ${selectBase}
         FROM ${cliT} c
         LEFT JOIN actividad a   ON a.cliente_id   = c.id
         LEFT JOIN creditos cr   ON cr.cliente_id  = c.id
         LEFT JOIN recact        ON recact.cliente_id = c.id
         LEFT JOIN uv            ON uv.cliente_id  = c.id
         LEFT JOIN ur            ON ur.cliente_id  = c.id
         LEFT JOIN cbexp         ON cbexp.cliente_id = c.id
        WHERE ${whereParts.join(" AND ")}
        ORDER BY COALESCE(a.total_comprado,0) DESC NULLS LAST,
                 a.ultima_venta_at DESC NULLS LAST,
                 c.created_at DESC
        LIMIT 2000`,
      params,
    );

    return NextResponse.json(successResponse({
      segmentos: SEGMENTOS.map((s) => ({ ...s, count: Number(cntRow[s.slug] ?? 0) })),
      total_clientes: Number(cntRow.total ?? 0),
      filtros_activos: activos,
      clientes: listado.rows,
      count: listado.rows.length,
    }));
  } catch (err) {
    console.error("[clientes/segmentos GET]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error"),
      { status: 500 },
    );
  }
}
