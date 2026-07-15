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
    const { data, error } = await ctx.supabase
      .from("productos")
      .select("id, nombre, sku, precio_venta, stock_actual, activo")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("es_franja_precio", true)
      .eq("activo", true)
      .order("precio_venta", { ascending: true });
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
