import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/publico/catalogo-items
 *
 * Endpoint UNAUTHENTICATED que devuelve los items del catálogo curado
 * (public/akakuaa/pages/catalogo.html). NO confundir con /api/publico/catalogo
 * (franjas de Principal) ni con las Categorías de precio.
 *
 * Gating: solo Principal tiene web publica; para resolver `empresa_id`
 * seguimos el mismo criterio que /api/publico/tesoros — buscamos la
 * sucursal `es_principal=true` y usamos su `empresa_id`.
 *
 * Formato: { success:true, data:{ items:[{id,nombre,descripcion,precio,categoria,edad,imagen_url,sku_franja,destacado}] } }
 *
 * Cache: 60s.
 */
export async function GET() {
  try {
    const sb = createServiceRoleClient();

    const { data: principal, error: sErr } = await sb
      .from("sucursales")
      .select("empresa_id")
      .eq("es_principal", true)
      .limit(1)
      .maybeSingle();
    if (sErr) {
      console.error("[/api/publico/catalogo-items] sucursales", sErr.message);
      return jsonEmpty();
    }
    const empresaId = (principal as { empresa_id?: string } | null)?.empresa_id ?? null;
    if (!empresaId) return jsonEmpty();

    const { data: rows, error: cErr } = await sb
      .from("web_catalogo_items")
      .select(
        "id, nombre, descripcion, precio, categoria, edad, imagen_url, sku_franja, destacado, orden, created_at",
      )
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: false });
    if (cErr) {
      if (/does not exist|42P01/i.test(cErr.message)) return jsonEmpty();
      console.error("[/api/publico/catalogo-items] items", cErr.message);
      return jsonEmpty();
    }

    const items = (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        nombre: string;
        descripcion: string | null;
        precio: number | string | null;
        categoria: string | null;
        edad: string | null;
        imagen_url: string;
        sku_franja: string | null;
        destacado: boolean | null;
      };
      return {
        id: row.id,
        nombre: row.nombre,
        descripcion: row.descripcion,
        precio: row.precio == null ? null : Number(row.precio),
        categoria: row.categoria,
        edad: row.edad,
        imagen_url: row.imagen_url,
        sku_franja: row.sku_franja,
        destacado: row.destacado === true,
      };
    });

    const res = NextResponse.json(successResponse({ items }));
    res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
    return res;
  } catch (e) {
    console.error("[/api/publico/catalogo-items] catch", e instanceof Error ? e.message : e);
    return jsonEmpty();
  }
}

function jsonEmpty() {
  const res = NextResponse.json(successResponse({ items: [] }));
  res.headers.set("Cache-Control", "public, max-age=30");
  return res;
}
