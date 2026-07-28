import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

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
    .slice(0, 120);
}

/** PATCH /api/admin/web/blog/[id] */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_blog_posts");

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (b.titulo !== undefined) {
      const v = typeof b.titulo === "string" ? b.titulo.trim() : "";
      if (!v) return NextResponse.json(errorResponse("Título requerido."), { status: 400 });
      sets.push(`titulo = $${i++}`);
      values.push(v.slice(0, 300));
    }
    if (b.slug !== undefined) {
      const raw = typeof b.slug === "string" ? b.slug.trim() : "";
      const v = raw ? slugify(raw) : "";
      if (!v) return NextResponse.json(errorResponse("Slug inválido."), { status: 400 });
      sets.push(`slug = $${i++}`);
      values.push(v);
    }
    if (b.excerpt !== undefined) {
      const v = typeof b.excerpt === "string" && b.excerpt.trim() ? b.excerpt.trim().slice(0, 500) : null;
      sets.push(`excerpt = $${i++}`);
      values.push(v);
    }
    if (b.cover_url !== undefined) {
      const v = typeof b.cover_url === "string" && b.cover_url.trim() ? b.cover_url.trim().slice(0, 1000) : null;
      sets.push(`cover_url = $${i++}`);
      values.push(v);
    }
    if (b.cuerpo_html !== undefined) {
      const v = typeof b.cuerpo_html === "string" && b.cuerpo_html.trim() ? b.cuerpo_html.trim().slice(0, 200000) : null;
      sets.push(`cuerpo_html = $${i++}`);
      values.push(v);
    }
    if (b.categoria !== undefined) {
      const v = typeof b.categoria === "string" && b.categoria.trim() ? b.categoria.trim().slice(0, 120) : null;
      sets.push(`categoria = $${i++}`);
      values.push(v);
    }
    if (b.autor !== undefined) {
      const v = typeof b.autor === "string" && b.autor.trim() ? b.autor.trim().slice(0, 120) : null;
      sets.push(`autor = $${i++}`);
      values.push(v);
    }
    if (b.publicado !== undefined) {
      const v = b.publicado === true;
      sets.push(`publicado = $${i++}`);
      values.push(v);
      // Si pasa a publicado y no hay fecha, la seteamos ahora
      if (v && b.publicado_at === undefined) {
        sets.push(`publicado_at = COALESCE(publicado_at, now())`);
      }
    }
    if (b.publicado_at !== undefined) {
      if (b.publicado_at === null || b.publicado_at === "") {
        sets.push(`publicado_at = NULL`);
      } else {
        const d = new Date(String(b.publicado_at));
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(errorResponse("Fecha de publicación inválida."), { status: 400 });
        }
        sets.push(`publicado_at = $${i++}`);
        values.push(d);
      }
    }
    if (b.destacado !== undefined) {
      sets.push(`destacado = $${i++}`);
      values.push(b.destacado === true);
    }
    if (b.orden !== undefined) {
      const n = Number(b.orden);
      if (!Number.isFinite(n)) return NextResponse.json(errorResponse("Orden inválido."), { status: 400 });
      sets.push(`orden = $${i++}::int`);
      values.push(Math.trunc(n));
    }

    if (!sets.length) {
      return NextResponse.json(errorResponse("Nada para actualizar."), { status: 400 });
    }
    sets.push(`updated_at = now()`);

    const idIdx = i++;
    const empIdx = i++;
    values.push(id, auth.empresa_id);

    const sql =
      `UPDATE ${t} SET ${sets.join(", ")} ` +
      `WHERE id = $${idIdx}::uuid AND empresa_id = $${empIdx}::uuid ` +
      `RETURNING ${COLS}`;
    const { rows } = await pool().query(sql, values);
    if (!rows.length) {
      return NextResponse.json(errorResponse("Post no encontrado."), { status: 404 });
    }
    return NextResponse.json(successResponse({ item: rows[0] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo actualizar.";
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(errorResponse("Ya existe un post con ese slug."), { status: 409 });
    }
    console.error("[/api/admin/web/blog/[id] PATCH]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE /api/admin/web/blog/[id] — hard delete. */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }

    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_blog_posts");

    const sql = `DELETE FROM ${t} WHERE id = $1::uuid AND empresa_id = $2::uuid RETURNING id`;
    const { rows } = await pool().query(sql, [id, auth.empresa_id]);
    if (!rows.length) {
      return NextResponse.json(errorResponse("Post no encontrado."), { status: 404 });
    }
    return NextResponse.json(successResponse({ deleted: rows[0].id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo borrar.";
    console.error("[/api/admin/web/blog/[id] DELETE]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
