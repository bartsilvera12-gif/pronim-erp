import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/tipos-prenda        — lista completa (cualquier usuario de empresa)
 * POST /api/tipos-prenda       — crea (solo admin)
 * PATCH /api/tipos-prenda/:id  — edita (solo admin, ver [id]/route.ts)
 */

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const url = new URL(request.url);
    const soloActivos = url.searchParams.get("solo_activos") === "true";
    const t = quoteSchemaTable(schema, "tipos_prenda");
    const client = await pool.connect();
    try {
      const r = await client.query<{
        id: string; nombre: string; orden: number; activo: boolean;
      }>(
        `SELECT id, nombre, orden, activo
         FROM ${t}
         WHERE empresa_id = $1 ${soloActivos ? "AND activo = true" : ""}
         ORDER BY orden, nombre`,
        [ctx.auth.empresa_id],
      );
      return NextResponse.json(successResponse({ tipos: r.rows }));
    } finally {
      client.release();
    }
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo un administrador puede crear tipos de prenda."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json(errorResponse("nombre requerido."), { status: 400 });
    const orden = Number.isFinite(Number(body.orden)) ? Math.round(Number(body.orden)) : 100;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "tipos_prenda");
    const client = await pool.connect();
    try {
      const r = await client.query<{ id: string }>(
        `INSERT INTO ${t} (empresa_id, nombre, orden, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (empresa_id, nombre) DO UPDATE SET
           activo = true, orden = EXCLUDED.orden, updated_at = now()
         RETURNING id`,
        [ctx.auth.empresa_id, nombre, orden, ctx.auth.user.id ?? null],
      );
      return NextResponse.json(successResponse({ id: r.rows[0].id, nombre, orden, activo: true }));
    } finally {
      client.release();
    }
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
