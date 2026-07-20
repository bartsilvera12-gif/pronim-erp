import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/clientes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal_id=...&segmento=...&q=...
 *
 * Consulta agregada por queries planos con GROUP BY (más eficiente que
 * subqueries correlacionadas). Todo se calcula server-side; el frontend
 * solo pinta lo que llega.
 *
 * Reglas:
 *   - No cuenta ventas ni recepciones anuladas.
 *   - Segmento = mismos umbrales que /api/clientes/[id]/segmento
 *     (vip: ≥ 5M historicos o ≥ 6 compras 90d; dormido: >120d sin visitar;
 *     nuevo: sin compras; habitual: resto).
 *   - Trae+lleva del orquestador quedan como una sola visita porque el
 *     DISTINCT por cliente dedupa naturalmente al agregar por cliente.
 */
export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || todayMinus(90);
    const hasta = url.searchParams.get("hasta") || todayISO();
    const sucursalFiltroRaw = url.searchParams.get("sucursal_id");
    const segmento = url.searchParams.get("segmento");
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 100)));

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const scopedSucursal = auth.sucursal_id ?? null;
    const sucursalFiltro = esAdmin
      ? (sucursalFiltroRaw && sucursalFiltroRaw.trim() !== "" ? sucursalFiltroRaw : null)
      : scopedSucursal;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const cliT = quoteSchemaTable(schema, "clientes");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const sucT = quoteSchemaTable(schema, "sucursales");
    const client = await pool.connect();
    try {
      // Args comunes. Filtros de sucursal se aplican SOLO donde tiene sentido
      // (ventas + recepciones); el catálogo de clientes no.
      const params: unknown[] = [auth.empresa_id, desde, hasta];
      const sucClause = sucursalFiltro ? "AND sucursal_id = $4" : "";
      if (sucursalFiltro) params.push(sucursalFiltro);

      // 1) Lista de clientes (nombres). Pasa SOLO los params que el SQL
      // realmente referencia (Postgres exige match exacto — bind vs prep).
      const cliArgs: unknown[] = [auth.empresa_id];
      let qClause = "";
      if (q) {
        cliArgs.push(`%${q.toLowerCase()}%`);
        qClause = `AND LOWER(COALESCE(nombre_contacto, empresa, nombre, '')) LIKE $${cliArgs.length}`;
      }
      const clientesQ = await client.query<{ id: string; nombre: string | null }>(
        `SELECT id, COALESCE(nombre_contacto, empresa, nombre) AS nombre
         FROM ${cliT}
         WHERE empresa_id = $1
           ${qClause}
         ORDER BY nombre ASC
         LIMIT 2000`,
        cliArgs,
      );
      const clientes = clientesQ.rows;
      if (clientes.length === 0) {
        return NextResponse.json(successResponse({
          periodo: { desde, hasta },
          alcance: { es_admin: esAdmin, sucursal_forzada: !esAdmin ? scopedSucursal : null },
          kpis: emptyKpis(),
          filas: [],
          rankings: { por_compras: [], por_prendas: [], por_visitas: [] },
        }));
      }

      // 2) Ventas agregadas por cliente — histórico + período.
      const ventasAggQ = await client.query<{
        cliente_id: string;
        total_hist: string; compras_90d: string;
        compras_periodo: string; ultima_venta: string | null;
        tiene_venta: boolean;
      }>(
        `SELECT cliente_id,
                COALESCE(SUM(total),0)::text AS total_hist,
                COUNT(*) FILTER (WHERE fecha >= now() - interval '90 days')::text AS compras_90d,
                COUNT(*) FILTER (WHERE fecha::date BETWEEN $2 AND $3)::text AS compras_periodo,
                MAX(fecha)::text AS ultima_venta,
                true AS tiene_venta
         FROM ${ventasT}
         WHERE empresa_id = $1
           AND estado IN ('pendiente','completada')
           AND cliente_id IS NOT NULL
           ${sucClause}
         GROUP BY cliente_id`,
        params,
      );

      // 3) Recepciones agregadas por cliente — última + prendas período.
      const recepAggQ = await client.query<{
        cliente_id: string;
        ultima_recep: string | null;
        prendas_periodo: string;
        tiene_recep: boolean;
      }>(
        `SELECT r.cliente_id,
                MAX(r.fecha)::text AS ultima_recep,
                COALESCE(SUM(
                  CASE WHEN r.fecha::date BETWEEN $2 AND $3 THEN ri_c.cant ELSE 0 END
                ), 0)::text AS prendas_periodo,
                true AS tiene_recep
         FROM ${recepT} r
         LEFT JOIN LATERAL (
           SELECT SUM(cantidad) AS cant FROM ${recepItT} WHERE recepcion_id = r.id
         ) ri_c ON true
         WHERE r.empresa_id = $1
           AND r.estado IN ('pendiente_ingreso','ingresada')
           AND r.cliente_id IS NOT NULL
           ${sucClause.replace(/sucursal_id/g, "r.sucursal_id")}
         GROUP BY r.cliente_id`,
        params,
      );

      // 4) Sucursal preferida — max visitas por (cliente, sucursal) uniendo
      //    ventas + recepciones. Se hace en 1 query con DISTINCT ON.
      const sucPrefQ = await client.query<{
        cliente_id: string; sucursal_id: string; nombre: string;
      }>(
        `WITH uni AS (
           SELECT cliente_id, sucursal_id FROM ${ventasT}
            WHERE empresa_id = $1 AND estado IN ('pendiente','completada')
              AND cliente_id IS NOT NULL AND sucursal_id IS NOT NULL
           UNION ALL
           SELECT cliente_id, sucursal_id FROM ${recepT}
            WHERE empresa_id = $1 AND estado IN ('pendiente_ingreso','ingresada')
              AND cliente_id IS NOT NULL AND sucursal_id IS NOT NULL
         ),
         pref AS (
           SELECT cliente_id, sucursal_id, COUNT(*) AS visitas
           FROM uni GROUP BY cliente_id, sucursal_id
         ),
         top AS (
           SELECT DISTINCT ON (cliente_id) cliente_id, sucursal_id
           FROM pref ORDER BY cliente_id, visitas DESC
         )
         SELECT top.cliente_id, top.sucursal_id, s.nombre
         FROM top
         JOIN ${sucT} s ON s.id = top.sucursal_id`,
        [auth.empresa_id],
      );

      // 5) Saldo de crédito por cliente.
      const saldoQ = await client.query<{ cliente_id: string; saldo: string }>(
        `SELECT cliente_id, COALESCE(SUM(
           CASE WHEN tipo='ENTRADA' THEN monto
                WHEN tipo='SALIDA' THEN -monto
                WHEN tipo='AJUSTE' THEN monto ELSE 0 END
         ), 0)::text AS saldo
         FROM ${credT}
         WHERE empresa_id = $1 AND cliente_id IS NOT NULL
         GROUP BY cliente_id`,
        [auth.empresa_id],
      );

      // Merge en JS (arrays pequeños, típicamente decenas / cientos).
      const ventasByCli = new Map(ventasAggQ.rows.map((r) => [r.cliente_id, r]));
      const recepByCli  = new Map(recepAggQ.rows.map((r) => [r.cliente_id, r]));
      const sucPrefByCli = new Map(sucPrefQ.rows.map((r) => [r.cliente_id, r]));
      const saldoByCli  = new Map(saldoQ.rows.map((r) => [r.cliente_id, Number(r.saldo)]));

      const now = Date.now();
      type FilaOut = {
        cliente_id: string; nombre: string;
        segmento: "vip" | "habitual" | "nuevo" | "dormido";
        total_historico: number; compras_90d: number;
        ultima_visita: string | null; dias_desde_ultima: number | null;
        prendas_traidas_periodo: number; compras_periodo: number;
        saldo_credito: number;
        sucursal_preferida_id: string | null; sucursal_preferida_nombre: string | null;
        actividad: "solo_trae" | "solo_lleva" | "ambos" | "sin_actividad";
      };
      const enriquecidos: FilaOut[] = clientes.map((c) => {
        const v = ventasByCli.get(c.id);
        const rc = recepByCli.get(c.id);
        const totalHist = Number(v?.total_hist ?? 0);
        const c90 = Number(v?.compras_90d ?? 0);
        const ultimaVentaMs = v?.ultima_venta ? new Date(v.ultima_venta).getTime() : 0;
        const ultimaRecepMs = rc?.ultima_recep ? new Date(rc.ultima_recep).getTime() : 0;
        const ultimaMs = Math.max(ultimaVentaMs, ultimaRecepMs);
        const diasUlt = ultimaMs > 0
          ? Math.max(0, Math.floor((now - ultimaMs) / 86400000))
          : null;
        const cat: FilaOut["segmento"] =
          totalHist >= 5_000_000 || c90 >= 6 ? "vip"
          : totalHist <= 0 ? "nuevo"
          : (diasUlt != null && diasUlt > 120) ? "dormido"
          : "habitual";
        const suc = sucPrefByCli.get(c.id) ?? null;
        const tieneV = Boolean(v?.tiene_venta);
        const tieneR = Boolean(rc?.tiene_recep);
        const actividad: FilaOut["actividad"] =
          tieneV && tieneR ? "ambos"
          : tieneV ? "solo_lleva"
          : tieneR ? "solo_trae"
          : "sin_actividad";
        return {
          cliente_id: c.id,
          nombre: c.nombre ?? "Cliente sin nombre",
          segmento: cat,
          total_historico: totalHist,
          compras_90d: c90,
          ultima_visita: ultimaMs > 0 ? new Date(ultimaMs).toISOString() : null,
          dias_desde_ultima: diasUlt,
          prendas_traidas_periodo: Number(rc?.prendas_periodo ?? 0),
          compras_periodo: Number(v?.compras_periodo ?? 0),
          saldo_credito: saldoByCli.get(c.id) ?? 0,
          sucursal_preferida_id: suc?.sucursal_id ?? null,
          sucursal_preferida_nombre: suc?.nombre ?? null,
          actividad,
        };
      });

      const filtrados = enriquecidos.filter((c) => !segmento || c.segmento === segmento);
      const kpis = {
        total: filtrados.length,
        vip: filtrados.filter((c) => c.segmento === "vip").length,
        habitual: filtrados.filter((c) => c.segmento === "habitual").length,
        nuevo: filtrados.filter((c) => c.segmento === "nuevo").length,
        dormido: filtrados.filter((c) => c.segmento === "dormido").length,
        solo_trae: filtrados.filter((c) => c.actividad === "solo_trae").length,
        solo_lleva: filtrados.filter((c) => c.actividad === "solo_lleva").length,
        ambos: filtrados.filter((c) => c.actividad === "ambos").length,
        credito_disponible_total: filtrados.reduce((s, c) => s + Math.max(0, c.saldo_credito), 0),
        prom_dias_entre_visitas: null as number | null,
      };
      const conVisita = filtrados.filter((c) => c.dias_desde_ultima != null);
      kpis.prom_dias_entre_visitas = conVisita.length > 0
        ? Math.round(conVisita.reduce((s, c) => s + (c.dias_desde_ultima ?? 0), 0) / conVisita.length)
        : null;

      const rankVisitas = [...filtrados]
        .sort((a, b) => (b.compras_periodo) - (a.compras_periodo))
        .slice(0, 10);
      const rankCompras = [...filtrados].sort((a, b) => b.total_historico - a.total_historico).slice(0, 10);
      const rankPrendas = [...filtrados].sort((a, b) => b.prendas_traidas_periodo - a.prendas_traidas_periodo).slice(0, 10);
      const filas = [...filtrados]
        .sort((a, b) => {
          if (b.ultima_visita && !a.ultima_visita) return 1;
          if (!b.ultima_visita && a.ultima_visita) return -1;
          if (!a.ultima_visita || !b.ultima_visita) return 0;
          return new Date(b.ultima_visita).getTime() - new Date(a.ultima_visita).getTime();
        })
        .slice(0, limit);

      console.log(`[dashboard/clientes] ok clientes=${filtrados.length} ms=${Date.now() - t0}`);
      return NextResponse.json(successResponse({
        periodo: { desde, hasta },
        alcance: { es_admin: esAdmin, sucursal_forzada: !esAdmin ? scopedSucursal : null },
        kpis,
        filas,
        rankings: { por_compras: rankCompras, por_prendas: rankPrendas, por_visitas: rankVisitas },
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(`[dashboard/clientes] FAIL ms=${Date.now() - t0}`, e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function emptyKpis() {
  return {
    total: 0, vip: 0, habitual: 0, nuevo: 0, dormido: 0,
    solo_trae: 0, solo_lleva: 0, ambos: 0,
    credito_disponible_total: 0, prom_dias_entre_visitas: null as number | null,
  };
}
