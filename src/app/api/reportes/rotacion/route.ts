import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/rotacion?dias=90
 * Rotación de inventario: unidades vendidas (SALIDA) en N días / stock actual.
 * Banda: alta / media / baja / nula.
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
      stock_actual: string; costo_promedio: string; precio_venta: string; unidades_vendidas: string;
    }>(
      `SELECT p.id::text, p.nombre, p.sku, ${marca} AS marca, ${oem} AS oem,
              COALESCE(p.stock_actual,0)::text AS stock_actual,
              COALESCE(p.costo_promedio,0)::text AS costo_promedio,
              COALESCE(p.precio_venta,0)::text AS precio_venta,
              COALESCE(sv.unidades,0)::text AS unidades_vendidas
         FROM ${tP} p
         LEFT JOIN (
           SELECT producto_id, SUM(cantidad) AS unidades
             FROM ${tM}
            WHERE empresa_id = $1 AND tipo = 'SALIDA' AND fecha >= now() - ($2 * interval '1 day')
            GROUP BY producto_id
         ) sv ON sv.producto_id = p.id
        WHERE p.empresa_id = $1 ${activoCond}
        ORDER BY COALESCE(sv.unidades,0) DESC
        LIMIT 5000`,
      [auth.empresa_id, dias],
    );

    type Banda = "alta" | "media" | "baja" | "nula";
    const items = rows.rows.map((r) => {
      const stock = Number(r.stock_actual) || 0;
      const costo = Number(r.costo_promedio) || 0;
      const precio = Number(r.precio_venta) || 0;
      const vendidas = Number(r.unidades_vendidas) || 0;
      // Rotación = unidades vendidas / stock disponible promedio (usamos stock actual).
      const base = stock > 0 ? stock : (vendidas > 0 ? vendidas : 1);
      const rotacion = Math.round((vendidas / base) * 100) / 100;
      let banda: Banda = "nula";
      if (vendidas <= 0) banda = "nula";
      else if (rotacion >= 1) banda = "alta";
      else if (rotacion >= 0.4) banda = "media";
      else banda = "baja";
      return {
        id: r.id, nombre: r.nombre, sku: r.sku ?? "",
        marca_repuesto: r.marca, codigo_oem: r.oem,
        stock_actual: stock, costo_promedio: costo, precio_venta: precio,
        unidades_vendidas: vendidas, rotacion, banda,
        ingreso_estimado: Math.round(vendidas * precio),
      };
    });

    const con_movimiento = items.filter((i) => i.unidades_vendidas > 0).length;
    const resumen = {
      total_productos: items.length,
      con_movimiento,
      sin_movimiento: items.length - con_movimiento,
      unidades_vendidas_total: items.reduce((s, i) => s + i.unidades_vendidas, 0),
      ingreso_total: items.reduce((s, i) => s + i.ingreso_estimado, 0),
    };

    return NextResponse.json(successResponse({ items, resumen }));
  } catch (err) {
    console.error("[/api/reportes/rotacion GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
