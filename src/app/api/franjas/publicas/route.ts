import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";

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
    // Aislar franjas por sucursal. Prioridad de resolución:
    //   1) ?sucursal_id=<uuid> del request — la usa el POS que sabe la
    //      caja activa (super_admin desde Principal solo debe ver
    //      franjas de Principal, no las de Sucursal 2).
    //   2) auth.sucursal_id del usuario — para usuarios con sucursal
    //      fija (BH, Betim, El Dorado, Sucursal 2).
    //   3) Sin filtro — solo si es super_admin sin sucursal y sin
    //      query param. En ese caso ve todo (uso admin puro).
    // Las franjas con sucursal_id IS NULL son globales/legacy y
    // siempre aparecen (junto a las de la sucursal filtrada).
    const url = new URL(request.url);
    const sucursalQuery = url.searchParams.get("sucursal_id");
    // Para super_admin sin sucursal_id fija y sin query param, resolvemos
    // Principal como fallback — así el POS del admin en Principal NO ve
    // las franjas de Sucursal 2 mezcladas. Solo el listado admin puro
    // (/api/franjas) ve todo cuando corresponde.
    let sucursalIdFiltro: string | null = sucursalQuery && sucursalQuery.length >= 32
      ? sucursalQuery
      : (ctx.auth.sucursal_id ?? null);
    if (!sucursalIdFiltro) {
      const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
      sucursalIdFiltro = await resolveSucursalIdForUserPg(schema, ctx.auth.empresa_id, null);
    }
    let q = ctx.supabase
      .from("productos")
      .select("id, nombre, sku, precio_venta, stock_actual, activo, sucursal_id")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("es_franja_precio", true)
      .eq("activo", true)
      .order("precio_venta", { ascending: true });
    if (sucursalIdFiltro) {
      q = q.or(`sucursal_id.eq.${sucursalIdFiltro},sucursal_id.is.null`);
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
