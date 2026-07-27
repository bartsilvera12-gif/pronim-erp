import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/publico/catalogo
 *
 * Endpoint UNAUTHENTICATED que devuelve las franjas de precio activas de la
 * sucursal Principal. Se usa desde el sitio público de Akakua'a
 * (public/akakuaa/pages/catalogo.html) — el catálogo web no muestra
 * inventario ni SKUs, solo tramos de precio con nombre.
 *
 * Gating: sólo Principal — las demás sucursales (Sucursal 2, BH, Betim,
 * El Dorado) no tienen web. Karen: "Wire to Principal admin".
 *
 * Formato de respuesta:
 *   { ok:true, data:{ franjas: [{ id, nombre, precio_venta, sku }, ...] } }
 *
 * Cache: 60s para amortiguar picos y evitar carga innecesaria.
 */
export async function GET() {
  try {
    const sb = createServiceRoleClient();

    // 1) Buscar la sucursal Principal.
    const { data: principal, error: sErr } = await sb
      .from("sucursales")
      .select("id")
      .eq("es_principal", true)
      .limit(1)
      .maybeSingle();
    if (sErr) {
      console.error("[/api/publico/catalogo] sucursales", sErr.message);
      return jsonEmpty();
    }
    const principalId = (principal as { id?: string } | null)?.id ?? null;
    if (!principalId) return jsonEmpty();

    // 2) Franjas activas de Principal.
    const { data: rows, error: fErr } = await sb
      .from("productos")
      .select("id, nombre, sku, precio_venta")
      .eq("es_franja_precio", true)
      .eq("activo", true)
      .eq("sucursal_id", principalId)
      .order("precio_venta", { ascending: true });
    if (fErr) {
      console.error("[/api/publico/catalogo] franjas", fErr.message);
      return jsonEmpty();
    }

    const franjas = (rows ?? []).map((r) => ({
      id: (r as { id: string }).id,
      nombre: (r as { nombre: string }).nombre,
      sku: (r as { sku: string | null }).sku ?? null,
      precio_venta: Number((r as { precio_venta: number }).precio_venta ?? 0),
    }));

    const res = NextResponse.json(successResponse({ franjas }));
    res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
    return res;
  } catch (e) {
    console.error("[/api/publico/catalogo] catch", e instanceof Error ? e.message : e);
    return jsonEmpty();
  }
}

function jsonEmpty() {
  const res = NextResponse.json(successResponse({ franjas: [] }));
  res.headers.set("Cache-Control", "public, max-age=30");
  return res;
}
