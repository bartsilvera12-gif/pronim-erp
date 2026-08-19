import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/items-drill?desde=&hasta=
 *
 * Detalle a nivel ÍTEM (prenda) de ventas y compras/evaluaciones. Responde
 * "qué rango de precio / categoría se vendió/compró más, por sucursal".
 *   - producto = franja/rango de precio (ej. "Prenda Gs. 24.000")
 *   - VENTA → cantidad − (salió), valor +
 *   - COMPRA → cantidad + (ingresó), valor −
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tR = quoteSchemaTable(schema, "cliente_recepciones");
    const tRI = quoteSchemaTable(schema, "cliente_recepciones_items");
    const tC = quoteSchemaTable(schema, "clientes");
    const tS = quoteSchemaTable(schema, "sucursales");
    const tPC = quoteSchemaTable(schema, "producto_categorias");
    const tCP = quoteSchemaTable(schema, "categorias_productos");

    async function cols(t: string): Promise<Set<string>> {
      const r = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [schema, t]);
      return new Set(r.rows.map((x) => x.column_name));
    }
    async function tableExists(t: string): Promise<boolean> {
      const r = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2 LIMIT 1`, [schema, t]);
      return r.rows.length > 0;
    }
    const vc = await cols("ventas");
    const rc = await cols("cliente_recepciones");
    const vic = await cols("ventas_items");
    const ric = await cols("cliente_recepciones_items");
    const vHasSuc = vc.has("sucursal_id");
    const rHasSuc = rc.has("sucursal_id");
    const viPrecio = vic.has("precio_venta") ? "vi.precio_venta" : "0";
    const riPrecio = ric.has("precio_unitario") ? "ri.precio_unitario" : "0";
    const hasCat = (await tableExists("producto_categorias")) && (await tableExists("categorias_productos"));
    // Categoría: primera categoría del producto (subquery para no multiplicar filas).
    const catSub = hasCat
      ? `(SELECT cp.nombre FROM ${tPC} pc JOIN ${tCP} cp ON cp.id = pc.categoria_id WHERE pc.producto_id = %PID% LIMIT 1)`
      : "NULL::text";

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const params: unknown[] = [auth.empresa_id];
    let iDesde = 0, iHasta = 0;
    if (desde) { params.push(desde); iDesde = params.length; }
    if (hasta) { params.push(hasta); iHasta = params.length; }
    const fV = [desde ? `v.fecha >= $${iDesde}::timestamptz` : "", hasta ? `v.fecha < ($${iHasta}::date + interval '1 day')` : ""].filter(Boolean).map((s) => `AND ${s}`).join(" ");
    const fR = [desde ? `r.fecha >= $${iDesde}::timestamptz` : "", hasta ? `r.fecha < ($${iHasta}::date + interval '1 day')` : ""].filter(Boolean).map((s) => `AND ${s}`).join(" ");

    const sql = `
      SELECT * FROM (
        SELECT
          v.fecha AS fecha, 'venta' AS tipo,
          ${vHasSuc ? "sv.nombre" : "NULL::text"} AS sucursal,
          vi.producto_nombre AS producto, vi.sku AS sku,
          ${catSub.replace("%PID%", "vi.producto_id")} AS categoria,
          COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente,
          -COALESCE(vi.cantidad,0)::float8 AS cantidad,
          COALESCE(${viPrecio},0)::float8 AS precio_unitario,
          COALESCE(vi.subtotal,0)::float8 AS valor
        FROM ${tVI} vi
        JOIN ${tV} v ON v.id = vi.venta_id
        LEFT JOIN ${tC} c ON c.id = v.cliente_id
        ${vHasSuc ? `LEFT JOIN ${tS} sv ON sv.id = v.sucursal_id` : ""}
        WHERE v.empresa_id = $1 AND (v.estado IS NULL OR v.estado <> 'anulada') ${fV}

        UNION ALL

        SELECT
          r.fecha AS fecha, 'compra' AS tipo,
          ${rHasSuc ? "sr.nombre" : "NULL::text"} AS sucursal,
          ri.producto_nombre AS producto, ri.sku AS sku,
          ${catSub.replace("%PID%", "ri.producto_id")} AS categoria,
          COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente,
          COALESCE(ri.cantidad,0)::float8 AS cantidad,
          COALESCE(${riPrecio},0)::float8 AS precio_unitario,
          -COALESCE(ri.subtotal,0)::float8 AS valor
        FROM ${tRI} ri
        JOIN ${tR} r ON r.id = ri.recepcion_id
        LEFT JOIN ${tC} c ON c.id = r.cliente_id
        ${rHasSuc ? `LEFT JOIN ${tS} sr ON sr.id = r.sucursal_id` : ""}
        WHERE r.empresa_id = $1 AND (r.estado IS NULL OR r.estado <> 'anulada') ${fR}
      ) t
      ORDER BY fecha DESC
      LIMIT 6000`;

    const r = await pool.query<Record<string, unknown>>(sql, params);
    return NextResponse.json(successResponse({ items: r.rows }));
  } catch (err) {
    console.error("[/api/reportes/items-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
