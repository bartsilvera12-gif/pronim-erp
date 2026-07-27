import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/publico/tesoros
 *
 * Endpoint UNAUTHENTICATED que devuelve los tesoros activos que se
 * muestran en el carrusel "Tesoros que acaban de llegar" del sitio
 * publico de Akakua'a (public/akakuaa/pages/index.html).
 *
 * Gating: solo Principal tiene web publica; para resolver `empresa_id`
 * seguimos el mismo criterio que /api/publico/catalogo — buscamos la
 * sucursal `es_principal=true` y usamos su `empresa_id`.
 *
 * Formato: { success:true, data:{ tesoros: [{id, tipo, url, titulo, subtitulo, precio, sku_franja}] } }
 *
 * Cache: 60s.
 */
export async function GET() {
  try {
    const sb = createServiceRoleClient();

    // 1) Sucursal principal → empresa_id
    const { data: principal, error: sErr } = await sb
      .from("sucursales")
      .select("empresa_id")
      .eq("es_principal", true)
      .limit(1)
      .maybeSingle();
    if (sErr) {
      console.error("[/api/publico/tesoros] sucursales", sErr.message);
      return jsonEmpty();
    }
    const empresaId = (principal as { empresa_id?: string } | null)?.empresa_id ?? null;
    if (!empresaId) return jsonEmpty();

    // 2) Tesoros activos
    const { data: rows, error: tErr } = await sb
      .from("web_tesoros")
      .select("id, tipo, url, titulo, subtitulo, precio, sku_franja, orden, created_at")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (tErr) {
      // Tabla puede no existir todavia si la migracion no corrio
      if (/does not exist|42P01/i.test(tErr.message)) return jsonEmpty();
      console.error("[/api/publico/tesoros] tesoros", tErr.message);
      return jsonEmpty();
    }

    const tesoros = (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        tipo: string;
        url: string;
        titulo: string | null;
        subtitulo: string | null;
        precio: number | string | null;
        sku_franja: string | null;
      };
      return {
        id: row.id,
        tipo: row.tipo,
        url: row.url,
        titulo: row.titulo,
        subtitulo: row.subtitulo,
        precio: row.precio == null ? null : Number(row.precio),
        sku_franja: row.sku_franja,
      };
    });

    const res = NextResponse.json(successResponse({ tesoros }));
    res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
    return res;
  } catch (e) {
    console.error("[/api/publico/tesoros] catch", e instanceof Error ? e.message : e);
    return jsonEmpty();
  }
}

function jsonEmpty() {
  const res = NextResponse.json(successResponse({ tesoros: [] }));
  res.headers.set("Cache-Control", "public, max-age=30");
  return res;
}
