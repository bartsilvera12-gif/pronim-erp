import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * PATCH /api/tipos-prenda/:id — actualiza nombre/orden/activo (admin).
 * DELETE /api/tipos-prenda/:id — soft-delete (activo=false).
 */

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo un administrador puede editar tipos de prenda."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "tipos_prenda");
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (typeof body.nombre === "string" && body.nombre.trim()) {
      sets.push(`nombre = $${i++}`); vals.push(body.nombre.trim());
    }
    if (Number.isFinite(Number(body.orden))) {
      sets.push(`orden = $${i++}`); vals.push(Math.round(Number(body.orden)));
    }
    if (typeof body.activo === "boolean") {
      sets.push(`activo = $${i++}`); vals.push(body.activo);
    }
    if (sets.length === 0) return NextResponse.json(errorResponse("Sin campos a actualizar."), { status: 400 });
    sets.push(`updated_at = now()`);
    vals.push(ctx.auth.empresa_id, id);
    const client = await pool.connect();
    try {
      const r = await client.query(
        `UPDATE ${t} SET ${sets.join(", ")} WHERE empresa_id = $${i++} AND id = $${i}
         RETURNING id, nombre, orden, activo`,
        vals,
      );
      if (!r.rows.length) return NextResponse.json(errorResponse("Tipo no encontrado."), { status: 404 });
      return NextResponse.json(successResponse({ tipo: r.rows[0] }));
    } finally {
      client.release();
    }
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo un administrador puede desactivar tipos."), { status: 403 });
    }
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "tipos_prenda");
    const client = await pool.connect();
    try {
      const r = await client.query(
        `UPDATE ${t} SET activo = false, updated_at = now()
         WHERE empresa_id = $1 AND id = $2 RETURNING id`,
        [ctx.auth.empresa_id, id],
      );
      if (!r.rows.length) return NextResponse.json(errorResponse("Tipo no encontrado."), { status: 404 });
      return NextResponse.json(successResponse({ id }));
    } finally {
      client.release();
    }
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
