import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/sin-movimiento?dias=90
 * Productos con stock > 0 que NO tuvieron salidas en los últimos N días.
 * Devuelve el capital inmovilizado (stock × costo).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const dias = Math.max(1, Math.min(3650, Number(request.nextUrl.searchParams.get("dias")) || 90));

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tP = quoteSchemaTable(schema, "productos");
    const tM = quoteSchemaTable(schema, "movimientos_inventario");

    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='productos'`,
      [schema],
    );
    const cols = new Set(colQ.rows.map((r) => r.column_name));
    const marca = cols.has("marca_repuesto") ? "p.marca_repuesto" : "NULL::text";
    const oem = cols.has("codigo_oem") ? "p.codigo_oem" : "NULL::text";
    const activoCond = cols.has("activo") ? "AND COALESCE(p.activo,true) = true" : "";

    const rows = await pool.query<{
      id: string; nombre: string; sku: string | null; marca: string | null; oem: string | null;
      stock_actual: string; costo_promedio: string; ultima_salida: string | null;
    }>(
      `SELECT p.id::text, p.nombre, p.sku, ${marca} AS marca, ${oem} AS oem,
              COALESCE(p.stock_actual,0)::text AS stock_actual,
              COALESCE(p.costo_promedio,0)::text AS costo_promedio,
              us.ultima_salida
         FROM ${tP} p
         LEFT JOIN (
           SELECT producto_id, MAX(fecha) AS ultima_salida
             FROM ${tM} WHERE empresa_id = $1 AND tipo = 'SALIDA'
            GROUP BY producto_id
         ) us ON us.producto_id = p.id
        WHERE p.empresa_id = $1 ${activoCond}
          AND COALESCE(p.stock_actual,0) > 0
          AND (us.ultima_salida IS NULL OR us.ultima_salida < now() - ($2 * interval '1 day'))
        ORDER BY (COALESCE(p.stock_actual,0) * COALESCE(p.costo_promedio,0)) DESC
        LIMIT 2000`,
      [auth.empresa_id, dias],
    );

    const now = Date.now();
    const items = rows.rows.map((r) => {
      const stock = Number(r.stock_actual) || 0;
      const costo = Number(r.costo_promedio) || 0;
      const dsm = r.ultima_salida ? Math.floor((now - new Date(r.ultima_salida).getTime()) / 86400000) : null;
      return {
        id: r.id, nombre: r.nombre, sku: r.sku ?? "",
        marca_repuesto: r.marca, codigo_oem: r.oem,
        stock_actual: stock, costo_promedio: costo,
        valor_inmovilizado: Math.round(stock * costo),
        ultima_salida_fecha: r.ultima_salida,
        dias_sin_movimiento: dsm,
      };
    });
    const valor_total_inmovilizado = items.reduce((s, i) => s + i.valor_inmovilizado, 0);

    return NextResponse.json(successResponse({ items, valor_total_inmovilizado }));
  } catch (err) {
    console.error("[/api/reportes/sin-movimiento GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
