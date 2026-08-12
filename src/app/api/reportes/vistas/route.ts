import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Vistas guardadas genéricas para cualquier reporte con drill-down.
 *
 * GET    /api/reportes/vistas?reporte=<key>
 * POST   /api/reportes/vistas    body: { reporte, nombre, filtros }
 * DELETE /api/reportes/vistas?id=…
 *
 * Scope: per-usuario (cada admin tiene sus propias vistas).
 */

const REPORTE_KEYS = new Set([
  "ventas","descuentos","creditos","evaluaciones","inventario",
  "metas","cajas","conciliacion","segmentos_clientes",
]);

async function tabla(empresaId: string): Promise<{ pool: NonNullable<ReturnType<typeof getChatPostgresPool>>; t: string } | null> {
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const pool = getChatPostgresPool();
  if (!pool) return null;
  return { pool, t: quoteSchemaTable(schema, "reporte_vistas") };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const key = (new URL(request.url).searchParams.get("reporte") ?? "").trim();
    if (!REPORTE_KEYS.has(key)) return NextResponse.json(errorResponse("reporte inválido."), { status: 400 });
    const ctx = await tabla(auth.empresa_id);
    if (!ctx) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const r = await ctx.pool.query<{ id: string; nombre: string; filtros: Record<string, unknown>; updated_at: string }>(
      `SELECT id::text, nombre, filtros, updated_at
         FROM ${ctx.t}
        WHERE empresa_id = $1 AND usuario_id = $2 AND reporte_key = $3
        ORDER BY nombre`,
      [auth.empresa_id, auth.user.id, key],
    ).catch((e) => {
      if (e?.code === "42P01") return { rows: [] as Array<{ id: string; nombre: string; filtros: Record<string, unknown>; updated_at: string }> };
      throw e;
    });
    return NextResponse.json(successResponse({ vistas: r.rows }));
  } catch (err) {
    console.error("[/api/reportes/vistas GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    let body: { reporte?: unknown; nombre?: unknown; filtros?: unknown } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const key = typeof body.reporte === "string" ? body.reporte.trim() : "";
    if (!REPORTE_KEYS.has(key)) return NextResponse.json(errorResponse("reporte inválido."), { status: 400 });
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 80) : "";
    if (!nombre) return NextResponse.json(errorResponse("Nombre requerido."), { status: 400 });
    // Sanitización simple: solo string / boolean / number en el jsonb.
    const filtros: Record<string, unknown> = {};
    if (body.filtros && typeof body.filtros === "object") {
      for (const [k, v] of Object.entries(body.filtros as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) filtros[k] = v.trim().slice(0, 300);
        else if (typeof v === "boolean" || typeof v === "number") filtros[k] = v;
      }
    }
    if (Object.keys(filtros).length === 0) {
      return NextResponse.json(errorResponse("Guardá al menos un filtro."), { status: 400 });
    }
    const ctx = await tabla(auth.empresa_id);
    if (!ctx) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const r = await ctx.pool.query<{ id: string; nombre: string; filtros: Record<string, unknown>; updated_at: string }>(
      `INSERT INTO ${ctx.t} (empresa_id, usuario_id, reporte_key, nombre, filtros, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())
       ON CONFLICT (usuario_id, reporte_key, nombre) DO UPDATE
         SET filtros = EXCLUDED.filtros, updated_at = now()
       RETURNING id::text, nombre, filtros, updated_at`,
      [auth.empresa_id, auth.user.id, key, nombre, JSON.stringify(filtros)],
    );
    return NextResponse.json(successResponse({ vista: r.rows[0] }));
  } catch (err) {
    console.error("[/api/reportes/vistas POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json(errorResponse("id requerido."), { status: 400 });
    const ctx = await tabla(auth.empresa_id);
    if (!ctx) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const r = await ctx.pool.query(
      `DELETE FROM ${ctx.t} WHERE id = $1::uuid AND empresa_id = $2 AND usuario_id = $3`,
      [id, auth.empresa_id, auth.user.id],
    );
    return NextResponse.json(successResponse({ deleted: r.rowCount ?? 0 }));
  } catch (err) {
    console.error("[/api/reportes/vistas DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
