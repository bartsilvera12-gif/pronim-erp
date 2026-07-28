import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Admin CRUD para posts del blog web (Akakua'a). Solo super_admin.
 * Todo scopeado a `empresa_id = auth.empresa_id`.
 */

const COLS =
  "id, empresa_id, slug, titulo, excerpt, cover_url, cuerpo_html, categoria, autor, publicado, publicado_at, destacado, orden, created_at, updated_at";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || `post-${Date.now()}`;
}

/** GET /api/admin/web/blog — lista todos (incluye no publicados). */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_blog_posts");
    const sql =
      `SELECT ${COLS} FROM ${t} WHERE empresa_id = $1::uuid ` +
      `ORDER BY orden ASC, COALESCE(publicado_at, created_at) DESC`;
    const { rows } = await pool().query(sql, [auth.empresa_id]);
    return NextResponse.json(successResponse({ items: rows }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar.";
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json(successResponse({ items: [] }));
    }
    console.error("[/api/admin/web/blog GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/admin/web/blog — crea. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_blog_posts");

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const titulo = typeof b.titulo === "string" ? b.titulo.trim() : "";
    if (!titulo) return NextResponse.json(errorResponse("Título requerido."), { status: 400 });
    if (titulo.length > 300) return NextResponse.json(errorResponse("Título demasiado largo."), { status: 400 });

    const slugRaw = typeof b.slug === "string" && b.slug.trim() ? b.slug.trim() : titulo;
    const slug = slugify(slugRaw);

    const excerpt = typeof b.excerpt === "string" && b.excerpt.trim() ? b.excerpt.trim().slice(0, 500) : null;
    const coverUrl = typeof b.cover_url === "string" && b.cover_url.trim() ? b.cover_url.trim().slice(0, 1000) : null;
    const cuerpoHtml = typeof b.cuerpo_html === "string" && b.cuerpo_html.trim() ? b.cuerpo_html.trim().slice(0, 200000) : null;
    const categoria = typeof b.categoria === "string" && b.categoria.trim() ? b.categoria.trim().slice(0, 120) : null;
    const autor = typeof b.autor === "string" && b.autor.trim() ? b.autor.trim().slice(0, 120) : null;
    const publicado = b.publicado === true;
    const destacado = b.destacado === true;
    const ordenNum = b.orden == null || b.orden === "" ? 0 : Number(b.orden);
    if (!Number.isFinite(ordenNum)) return NextResponse.json(errorResponse("Orden inválido."), { status: 400 });

    const publicadoAt = publicado
      ? (typeof b.publicado_at === "string" && b.publicado_at ? new Date(b.publicado_at) : new Date())
      : null;

    const sql =
      `INSERT INTO ${t} (empresa_id, slug, titulo, excerpt, cover_url, cuerpo_html, categoria, autor, publicado, publicado_at, destacado, orden, created_by) ` +
      `VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::int, $13::uuid) ` +
      `RETURNING ${COLS}`;
    const { rows } = await pool().query(sql, [
      auth.empresa_id,
      slug,
      titulo,
      excerpt,
      coverUrl,
      cuerpoHtml,
      categoria,
      autor,
      publicado,
      publicadoAt,
      destacado,
      Math.trunc(ordenNum),
      auth.usuarioCatalogId ?? null,
    ]);
    return NextResponse.json(successResponse({ item: rows[0] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo crear.";
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(errorResponse("Ya existe un post con ese slug."), { status: 409 });
    }
    console.error("[/api/admin/web/blog POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
