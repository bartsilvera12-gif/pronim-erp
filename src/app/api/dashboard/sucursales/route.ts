import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/sucursales?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal_id=...
 *
 * Devuelve métricas agregadas server-side (una sola pasada SQL por métrica).
 * Todo se calcula desde estados NO anulados:
 *   - ventas.estado IN ('pendiente','completada')
 *   - cliente_recepciones.estado IN ('pendiente_ingreso','ingresada')
 *
 * Alcance:
 *   - admin (rol admin empresa o global) → ve todas las sucursales.
 *   - usuario con sucursal_id fija → solo la suya (se ignora ?sucursal_id).
 *
 * Reglas de visita:
 *   - Una atención (recepción + venta creadas en la misma tx del orquestador,
 *     linkeadas por `cambio_id`) cuenta UNA vez.
 *   - Una recepción sin venta cuenta como visita.
 *   - Una venta sin recepción cuenta como visita.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || todayMinus(30);
    const hasta = url.searchParams.get("hasta") || todayISO();
    const sucursalFiltroRaw = url.searchParams.get("sucursal_id");

    // Alcance: admin ve todo; usuario con sucursal fija solo la suya.
    // El body/param se ignora si el usuario no es admin.
    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const scopedSucursal = auth.sucursal_id ?? null;
    const sucursalFiltro = esAdmin
      ? (sucursalFiltroRaw && sucursalFiltroRaw.trim() !== "" ? sucursalFiltroRaw : null)
      : scopedSucursal;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const sucT = quoteSchemaTable(schema, "sucursales");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const stockT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const cajasT = quoteSchemaTable(schema, "cajas");
    const metasT = quoteSchemaTable(schema, "metas_sucursal");
    const tiposT = quoteSchemaTable(schema, "tipos_prenda");
    const client = await pool.connect();
    try {
      // Bind params: $1 empresa, $2 desde, $3 hasta, $4 sucursal filtro (nullable).
      const scopeSuc = sucursalFiltro ? "AND s.id = $4" : "";
      const scopeArgs: unknown[] = sucursalFiltro
        ? [auth.empresa_id, desde, hasta, sucursalFiltro]
        : [auth.empresa_id, desde, hasta];

      // Un fetch principal por sucursal con métricas agregadas + comparación
      // con el período anterior (mismo largo de días desplazado). Es 1
      // round-trip a la DB por dashboard load; nada se procesa client-side.
      const rowsQ = await client.query<{
        sucursal_id: string; nombre: string;
        ventas: string; operaciones: string; ticket_promedio: string;
        clientes_atendidos: string; prendas_vendidas: string;
        prendas_recibidas: string; stock: string;
        cajas_abiertas: string; cajas_cerradas: string;
        meta_diaria: string | null; vendido_periodo: string; dias_periodo: string;
        ventas_prev: string; operaciones_prev: string;
      }>(
        `WITH periodo AS (
           SELECT $2::date AS desde, $3::date AS hasta,
                  ($3::date - $2::date + 1) AS dias
         ),
         prev AS (
           SELECT (desde - dias)::date AS desde, (desde - 1)::date AS hasta
           FROM periodo
         ),
         ventas_periodo AS (
           SELECT v.sucursal_id, v.total, v.cliente_id, v.id
           FROM ${ventasT} v
           WHERE v.empresa_id = $1
             AND v.estado IN ('pendiente','completada')
             AND v.fecha::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
         ),
         ventas_prev AS (
           SELECT v.sucursal_id, v.total
           FROM ${ventasT} v
           WHERE v.empresa_id = $1
             AND v.estado IN ('pendiente','completada')
             AND v.fecha::date BETWEEN (SELECT desde FROM prev) AND (SELECT hasta FROM prev)
         ),
         recep_periodo AS (
           SELECT r.id, r.sucursal_id, r.cliente_id
           FROM ${recepT} r
           WHERE r.empresa_id = $1
             AND r.estado IN ('pendiente_ingreso','ingresada')
             AND r.fecha::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
         ),
         recep_items_periodo AS (
           SELECT ri.recepcion_id, ri.cantidad
           FROM ${recepItT} ri
           JOIN recep_periodo r ON r.id = ri.recepcion_id
         )
         SELECT
           s.id AS sucursal_id, s.nombre,
           COALESCE((SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id), 0)::text AS ventas,
           COALESCE((SELECT COUNT(*) FROM ventas_periodo WHERE sucursal_id = s.id), 0)::text AS operaciones,
           COALESCE(
             CASE WHEN (SELECT COUNT(*) FROM ventas_periodo WHERE sucursal_id = s.id) > 0
                  THEN (SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id)::numeric /
                       (SELECT COUNT(*) FROM ventas_periodo WHERE sucursal_id = s.id)
                  ELSE 0 END, 0
           )::text AS ticket_promedio,
           COALESCE((
             -- clientes atendidos = distinct(cliente_id) de ventas ∪ recepciones
             SELECT COUNT(*) FROM (
               SELECT cliente_id FROM ventas_periodo WHERE sucursal_id = s.id
               UNION
               SELECT cliente_id FROM recep_periodo   WHERE sucursal_id = s.id
             ) u WHERE cliente_id IS NOT NULL
           ), 0)::text AS clientes_atendidos,
           COALESCE((
             SELECT SUM(vi.cantidad) FROM ${quoteSchemaTable(schema, "ventas_items")} vi
             JOIN ventas_periodo v ON v.id = vi.venta_id AND v.sucursal_id = s.id
           ), 0)::text AS prendas_vendidas,
           COALESCE((
             SELECT SUM(rip.cantidad)
             FROM recep_items_periodo rip
             JOIN recep_periodo rp ON rp.id = rip.recepcion_id
             WHERE rp.sucursal_id = s.id
           ), 0)::text AS prendas_recibidas,
           COALESCE((
             SELECT SUM(stock_actual) FROM ${stockT} WHERE sucursal_id = s.id
           ), 0)::text AS stock,
           COALESCE((
             SELECT COUNT(*) FROM ${cajasT}
             WHERE empresa_id = $1 AND sucursal_id = s.id AND estado = 'abierta'
           ), 0)::text AS cajas_abiertas,
           COALESCE((
             SELECT COUNT(*) FROM ${cajasT}
             WHERE empresa_id = $1 AND sucursal_id = s.id AND estado = 'cerrada'
               AND fecha_cierre::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
           ), 0)::text AS cajas_cerradas,
           NULLIF((
             SELECT MAX(meta_diaria)::text FROM ${metasT}
             WHERE empresa_id = $1 AND sucursal_id = s.id
               AND vigente_desde <= (SELECT hasta FROM periodo)
               AND (vigente_hasta IS NULL OR vigente_hasta >= (SELECT desde FROM periodo))
           ), '')::text AS meta_diaria,
           COALESCE((
             SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id
           ), 0)::text AS vendido_periodo,
           (SELECT dias FROM periodo)::text AS dias_periodo,
           COALESCE((SELECT SUM(total) FROM ventas_prev WHERE sucursal_id = s.id), 0)::text AS ventas_prev,
           COALESCE((SELECT COUNT(*) FROM ventas_prev WHERE sucursal_id = s.id), 0)::text AS operaciones_prev
         FROM ${sucT} s
         WHERE s.empresa_id = $1
           ${scopeSuc}
         ORDER BY (SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id) DESC NULLS LAST,
                  s.nombre`,
        scopeArgs,
      );

      // Tipos de prenda más traídos (ranking) — por período, respetando el scope.
      const tiposScope = sucursalFiltro
        ? "AND r.sucursal_id = $4"
        : "";
      const tiposQ = await client.query<{
        tipo_id: string | null; tipo_nombre: string; cantidad: string;
      }>(
        `SELECT COALESCE(t.id::text, 'sin_tipo') AS tipo_id,
                COALESCE(t.nombre, '(sin tipo)') AS tipo_nombre,
                SUM(ri.cantidad)::text AS cantidad
         FROM ${recepItT} ri
         JOIN ${recepT} r ON r.id = ri.recepcion_id
         LEFT JOIN ${tiposT} t ON t.id = ri.tipo_prenda_id
         WHERE r.empresa_id = $1
           AND r.estado IN ('pendiente_ingreso','ingresada')
           AND r.fecha::date BETWEEN $2 AND $3
           ${tiposScope}
         GROUP BY t.id, t.nombre
         ORDER BY SUM(ri.cantidad) DESC
         LIMIT 20`,
        scopeArgs,
      );

      // Consolidado (totales del período + comparación).
      const rows = rowsQ.rows.map((r) => ({
        sucursal_id: r.sucursal_id,
        nombre: r.nombre,
        ventas: Number(r.ventas),
        operaciones: Number(r.operaciones),
        ticket_promedio: Math.round(Number(r.ticket_promedio)),
        clientes_atendidos: Number(r.clientes_atendidos),
        prendas_vendidas: Number(r.prendas_vendidas),
        prendas_recibidas: Number(r.prendas_recibidas),
        stock: Number(r.stock),
        cajas_abiertas: Number(r.cajas_abiertas),
        cajas_cerradas: Number(r.cajas_cerradas),
        meta_diaria: r.meta_diaria ? Number(r.meta_diaria) : null,
        vendido_periodo: Number(r.vendido_periodo),
        dias_periodo: Number(r.dias_periodo),
        pct_meta: r.meta_diaria && Number(r.meta_diaria) > 0
          ? Math.round((Number(r.vendido_periodo) / (Number(r.meta_diaria) * Number(r.dias_periodo))) * 100)
          : null,
        ventas_prev: Number(r.ventas_prev),
        operaciones_prev: Number(r.operaciones_prev),
        var_ventas_pct: Number(r.ventas_prev) > 0
          ? Math.round(((Number(r.ventas) - Number(r.ventas_prev)) / Number(r.ventas_prev)) * 100)
          : null,
      }));
      const totales = {
        ventas: rows.reduce((s, x) => s + x.ventas, 0),
        operaciones: rows.reduce((s, x) => s + x.operaciones, 0),
        prendas_vendidas: rows.reduce((s, x) => s + x.prendas_vendidas, 0),
        prendas_recibidas: rows.reduce((s, x) => s + x.prendas_recibidas, 0),
        stock: rows.reduce((s, x) => s + x.stock, 0),
        clientes_atendidos_aprox: rows.reduce((s, x) => s + x.clientes_atendidos, 0), // suma por sucursal — un mismo cliente en dos sucursales cuenta 2
        cajas_abiertas: rows.reduce((s, x) => s + x.cajas_abiertas, 0),
        cajas_cerradas: rows.reduce((s, x) => s + x.cajas_cerradas, 0),
        ventas_prev: rows.reduce((s, x) => s + x.ventas_prev, 0),
      };
      const tipos = tiposQ.rows.map((t) => ({
        tipo_id: t.tipo_id,
        tipo_nombre: t.tipo_nombre,
        cantidad: Number(t.cantidad),
      }));
      return NextResponse.json(successResponse({
        periodo: { desde, hasta },
        alcance: { es_admin: esAdmin, sucursal_forzada: !esAdmin ? scopedSucursal : null },
        sucursales: rows,
        totales,
        tipos_prenda: tipos,
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[/api/dashboard/sucursales]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
