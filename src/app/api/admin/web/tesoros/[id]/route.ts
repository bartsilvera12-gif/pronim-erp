import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const COLS =
  "id, empresa_id, tipo, url, titulo, subtitulo, precio, sku_franja, orden, activo, created_at, updated_at";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

/** PATCH /api/admin/web/tesoros/[id] */
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
    const t = quoteSchemaTable(schema, "web_tesoros");

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (b.tipo !== undefined) {
      const tipoRaw = String(b.tipo ?? "").trim().toLowerCase();
      if (tipoRaw !== "foto" && tipoRaw !== "video") {
        return NextResponse.json(errorResponse("Tipo inválido."), { status: 400 });
      }
      sets.push(`tipo = $${i++}`);
      values.push(tipoRaw);
    }
    if (b.url !== undefined) {
      const url = typeof b.url === "string" ? b.url.trim() : "";
      if (!url) return NextResponse.json(errorResponse("URL requerida."), { status: 400 });
      sets.push(`url = $${i++}`);
      values.push(url.slice(0, 1000));
    }
    if (b.titulo !== undefined) {
      const v = typeof b.titulo === "string" && b.titulo.trim() ? b.titulo.trim().slice(0, 200) : null;
      sets.push(`titulo = $${i++}`);
      values.push(v);
    }
    if (b.subtitulo !== undefined) {
      const v = typeof b.subtitulo === "string" && b.subtitulo.trim() ? b.subtitulo.trim().slice(0, 200) : null;
      sets.push(`subtitulo = $${i++}`);
      values.push(v);
    }
    if (b.sku_franja !== undefined) {
      const v = typeof b.sku_franja === "string" && b.sku_franja.trim() ? b.sku_franja.trim().slice(0, 80) : null;
      sets.push(`sku_franja = $${i++}`);
      values.push(v);
    }
    if (b.precio !== undefined) {
      if (b.precio === null || b.precio === "") {
        sets.push(`precio = NULL`);
      } else {
        const n = Number(b.precio);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(errorResponse("Precio inválido."), { status: 400 });
        }
        sets.push(`precio = $${i++}::numeric`);
        values.push(n);
      }
    }
    if (b.orden !== undefined) {
      const n = Number(b.orden);
      if (!Number.isFinite(n)) {
        return NextResponse.json(errorResponse("Orden inválido."), { status: 400 });
      }
      sets.push(`orden = $${i++}::int`);
      values.push(Math.trunc(n));
    }
    if (b.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      values.push(b.activo === true);
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
      return NextResponse.json(errorResponse("Tesoro no encontrado."), { status: 404 });
    }
    return NextResponse.json(successResponse({ tesoro: rows[0] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo actualizar.";
    console.error("[/api/admin/web/tesoros/[id] PATCH]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** DELETE /api/admin/web/tesoros/[id] — hard delete. */
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
    const t = quoteSchemaTable(schema, "web_tesoros");

    const sql = `DELETE FROM ${t} WHERE id = $1::uuid AND empresa_id = $2::uuid RETURNING id`;
    const { rows } = await pool().query(sql, [id, auth.empresa_id]);
    if (!rows.length) {
      return NextResponse.json(errorResponse("Tesoro no encontrado."), { status: 404 });
    }
    return NextResponse.json(successResponse({ deleted: rows[0].id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo borrar.";
    console.error("[/api/admin/web/tesoros/[id] DELETE]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
