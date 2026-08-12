import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Vistas guardadas de /clientes/segmentos.
 *
 * GET    /api/clientes/segmentos/vistas          → lista del usuario
 * POST   /api/clientes/segmentos/vistas          → upsert por (usuario, nombre)
 * DELETE /api/clientes/segmentos/vistas?id=…     → borra una vista
 */

const FLAGS = ["vip","con_credito","con_cashback","inactivos_90d","nuevos_mes","en_riesgo"] as const;

function sanitizarFiltros(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of FLAGS) if (r[k] === true) out[k] = true;
  if (typeof r.q === "string" && r.q.trim()) out.q = r.q.trim().slice(0, 200);
  return out;
}

async function tablaVistas(empresaId: string): Promise<{ pool: NonNullable<ReturnType<typeof getChatPostgresPool>>; t: string } | null> {
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const pool = getChatPostgresPool();
  if (!pool) return null;
  return { pool, t: quoteSchemaTable(schema, "cliente_segmento_vistas") };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const ctx = await tablaVistas(auth.empresa_id);
    if (!ctx) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const uid = auth.user.id;
    const r = await ctx.pool.query<{ id: string; nombre: string; filtros: Record<string, unknown>; updated_at: string }>(
      `SELECT id::text, nombre, filtros, updated_at
         FROM ${ctx.t}
        WHERE empresa_id = $1 AND usuario_id = $2
        ORDER BY nombre`,
      [auth.empresa_id, uid],
    ).catch((e) => {
      if (e?.code === "42P01") return { rows: [] as Array<{ id: string; nombre: string; filtros: Record<string, unknown>; updated_at: string }> };
      throw e;
    });
    return NextResponse.json(successResponse({ vistas: r.rows }));
  } catch (err) {
    console.error("[/api/clientes/segmentos/vistas GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    let body: { nombre?: unknown; filtros?: unknown } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 80) : "";
    if (!nombre) return NextResponse.json(errorResponse("Nombre requerido."), { status: 400 });
    const filtros = sanitizarFiltros(body.filtros);
    if (Object.keys(filtros).length === 0) {
      return NextResponse.json(errorResponse("Guardá al menos un filtro."), { status: 400 });
    }
    const ctx = await tablaVistas(auth.empresa_id);
    if (!ctx) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const uid = auth.user.id;
    const r = await ctx.pool.query<{ id: string; nombre: string; filtros: Record<string, unknown>; updated_at: string }>(
      `INSERT INTO ${ctx.t} (empresa_id, usuario_id, nombre, filtros, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (usuario_id, nombre) DO UPDATE
         SET filtros = EXCLUDED.filtros, updated_at = now()
       RETURNING id::text, nombre, filtros, updated_at`,
      [auth.empresa_id, uid, nombre, JSON.stringify(filtros)],
    );
    return NextResponse.json(successResponse({ vista: r.rows[0] }));
  } catch (err) {
    console.error("[/api/clientes/segmentos/vistas POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json(errorResponse("id requerido."), { status: 400 });
    const ctx = await tablaVistas(auth.empresa_id);
    if (!ctx) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const uid = auth.user.id;
    const r = await ctx.pool.query(
      `DELETE FROM ${ctx.t} WHERE id = $1::uuid AND empresa_id = $2 AND usuario_id = $3`,
      [id, auth.empresa_id, uid],
    );
    return NextResponse.json(successResponse({ deleted: r.rowCount ?? 0 }));
  } catch (err) {
    console.error("[/api/clientes/segmentos/vistas DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
