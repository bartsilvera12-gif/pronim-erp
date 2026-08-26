import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventario/stock-por-sucursal?sucursal_id=...
 *
 * Devuelve el stock de TODOS los productos EN esa sucursal, como un mapa
 * { producto_id: stock }. Complementa a /api/inventario/stock-sucursal, que
 * responde el caso inverso (un producto → todas las sucursales).
 *
 * Se usa en Transferencias entre sucursales: la lista de franjas debe mostrar
 * lo que hay en la sucursal ORIGEN, no el total de la empresa
 * (productos.stock_actual es la suma de todas las sucursales).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });

  const sucursalId = (new URL(request.url).searchParams.get("sucursal_id") ?? "").trim();
  if (!sucursalId) {
    return NextResponse.json(errorResponse("Falta sucursal_id."), { status: 400 });
  }

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ stocks: {} }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
    const tS = quoteSchemaTable(schema, "sucursales");

    // La sucursal debe pertenecer a la empresa del usuario.
    const own = await pool.query<{ id: string }>(
      `SELECT id FROM ${tS} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [sucursalId, auth.empresa_id],
    );
    if (own.rows.length === 0) {
      return NextResponse.json(errorResponse("Sucursal inválida."), { status: 400 });
    }

    const r = await pool.query<{ producto_id: string; stock_actual: number | string }>(
      `SELECT pss.producto_id, pss.stock_actual::float8 AS stock_actual
         FROM ${tPSS} pss
        WHERE pss.sucursal_id = $1::uuid`,
      [sucursalId],
    );

    const stocks: Record<string, number> = {};
    for (const row of r.rows) stocks[row.producto_id] = Number(row.stock_actual ?? 0);

    return NextResponse.json(successResponse({ sucursal_id: sucursalId, stocks }));
  } catch (e) {
    console.error("[stock-por-sucursal GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ stocks: {} }));
  }
}
