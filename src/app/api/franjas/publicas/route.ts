import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/franjas/publicas
 *
 * Variante NO-admin del listado de franjas de precio: cualquier usuario
 * autenticado de la empresa recibe el catálogo activo para armar el POS
 * "Nueva atención". Devuelve id, precio, nombre y (best-effort) stock
 * agregado. Sin filtros de super_admin; no expone datos sensibles.
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  try {
    // Aislar franjas por sucursal: si el usuario tiene sucursal_id fija,
    // solo devolvemos las franjas de su sucursal. Admin (sin sucursal) ve
    // todas las de la empresa. Las franjas con sucursal_id IS NULL se
    // consideran globales/legacy y aparecen para todos.
    let q = ctx.supabase
      .from("productos")
      .select("id, nombre, sku, precio_venta, stock_actual, activo, sucursal_id")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("es_franja_precio", true)
      .eq("activo", true)
      .order("precio_venta", { ascending: true });
    if (ctx.auth.sucursal_id) {
      q = q.or(`sucursal_id.eq.${ctx.auth.sucursal_id},sucursal_id.is.null`);
    }
    const { data, error } = await q;
    if (error) {
      console.error("[/api/franjas/publicas] query", error.message);
      return NextResponse.json(successResponse({ franjas: [] }));
    }
    return NextResponse.json(successResponse({ franjas: data ?? [] }));
  } catch (e) {
    console.error("[/api/franjas/publicas] catch", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ franjas: [] }));
  }
}
