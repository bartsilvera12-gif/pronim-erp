import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/publico/blog-posts
 *
 * Endpoint UNAUTHENTICATED que devuelve los posts publicados del blog
 * (blog.html + post.html del sitio Akakua'a). CORS abierto para poder
 * consumirse desde el sitio estático en otro dominio.
 *
 * Query opcional:
 *   - slug=xxx → devuelve un único post (para post.html?slug=xxx).
 *   - categoria=xxx → filtra por categoría.
 *
 * Gating: mismo criterio que /api/publico/catalogo-items — resolvemos
 * `empresa_id` por la sucursal `es_principal=true`.
 *
 * Cache: 60s.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim().toLowerCase() || null;
    const categoria = url.searchParams.get("categoria")?.trim() || null;

    const sb = createServiceRoleClient();

    const { data: principal, error: sErr } = await sb
      .from("sucursales")
      .select("empresa_id")
      .eq("es_principal", true)
      .limit(1)
      .maybeSingle();
    if (sErr) {
      console.error("[/api/publico/blog-posts] sucursales", sErr.message);
      return jsonEmpty(slug);
    }
    const empresaId = (principal as { empresa_id?: string } | null)?.empresa_id ?? null;
    if (!empresaId) return jsonEmpty(slug);

    let q = sb
      .from("web_blog_posts")
      .select(
        "id, slug, titulo, excerpt, cover_url, cuerpo_html, categoria, autor, publicado_at, destacado, orden, created_at",
      )
      .eq("empresa_id", empresaId)
      .eq("publicado", true);

    if (slug) q = q.eq("slug", slug).limit(1);
    if (categoria) q = q.eq("categoria", categoria);

    const { data: rows, error: cErr } = await q
      .order("destacado", { ascending: false })
      .order("orden", { ascending: true })
      .order("publicado_at", { ascending: false });

    if (cErr) {
      if (/does not exist|42P01/i.test(cErr.message)) return jsonEmpty(slug);
      console.error("[/api/publico/blog-posts] posts", cErr.message);
      return jsonEmpty(slug);
    }

    const items = (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        slug: string;
        titulo: string;
        excerpt: string | null;
        cover_url: string | null;
        cuerpo_html: string | null;
        categoria: string | null;
        autor: string | null;
        publicado_at: string | null;
        destacado: boolean | null;
        orden: number | null;
      };
      return {
        id: row.id,
        slug: row.slug,
        titulo: row.titulo,
        excerpt: row.excerpt,
        cover_url: row.cover_url,
        cuerpo_html: row.cuerpo_html,
        categoria: row.categoria,
        autor: row.autor,
        publicado_at: row.publicado_at,
        destacado: row.destacado === true,
        orden: row.orden ?? 0,
      };
    });

    if (slug) {
      const post = items[0] ?? null;
      const res = NextResponse.json(successResponse({ post }));
      setPublicHeaders(res);
      return res;
    }

    const res = NextResponse.json(successResponse({ items }));
    setPublicHeaders(res);
    return res;
  } catch (e) {
    console.error("[/api/publico/blog-posts] catch", e instanceof Error ? e.message : e);
    return jsonEmpty(null);
  }
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  setPublicHeaders(res);
  return res;
}

function setPublicHeaders(res: NextResponse) {
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "content-type");
}

function jsonEmpty(slug: string | null) {
  const body = slug ? { post: null } : { items: [] };
  const res = NextResponse.json(successResponse(body));
  res.headers.set("Cache-Control", "public, max-age=30");
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}
