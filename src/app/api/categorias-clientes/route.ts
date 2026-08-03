import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { logAuditoria } from "@/lib/auditoria/log";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  dias_nuevo: 30, dias_semana: 7, dias_sin_volver: 60, dias_dormido: 90,
  vip_min_compras: 5, vip_top_pct: 15,
};

/**
 * GET  /api/categorias-clientes → config actual (o defaults si tabla no existe)
 * PATCH admin → actualiza los umbrales, auditado.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "categorias_clientes_config");
    try {
      const { rows } = await pool.query<typeof DEFAULTS>(
        `SELECT dias_nuevo, dias_semana, dias_sin_volver, dias_dormido,
                vip_min_compras, vip_top_pct
           FROM ${t} WHERE empresa_id = $1 LIMIT 1`,
        [auth.empresa_id],
      );
      return NextResponse.json(successResponse({ config: rows[0] ?? DEFAULTS }));
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "42P01") {
        return NextResponse.json(successResponse({
          config: DEFAULTS,
          warning: "Migración pendiente: aplicá 20260917_pronimerp_categorias_clientes_config.",
        }));
      }
      throw e;
    }
  } catch (err) {
    console.error("[/api/categorias-clientes GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });

    let body: Partial<typeof DEFAULTS> = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const norm: typeof DEFAULTS = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      const v = Number(body[k]);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (k === "vip_top_pct" && (v < 1 || v > 100)) continue;
      norm[k] = Math.floor(v);
    }

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "categorias_clientes_config");

    // Obtener actual para diff en auditoría
    const antes = await pool.query<typeof DEFAULTS>(
      `SELECT dias_nuevo, dias_semana, dias_sin_volver, dias_dormido,
              vip_min_compras, vip_top_pct
         FROM ${t} WHERE empresa_id = $1 LIMIT 1`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as (typeof DEFAULTS)[] }));

    await pool.query(
      `INSERT INTO ${t} (empresa_id, dias_nuevo, dias_semana, dias_sin_volver,
                          dias_dormido, vip_min_compras, vip_top_pct,
                          updated_by, updated_by_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (empresa_id) DO UPDATE
         SET dias_nuevo = EXCLUDED.dias_nuevo,
             dias_semana = EXCLUDED.dias_semana,
             dias_sin_volver = EXCLUDED.dias_sin_volver,
             dias_dormido = EXCLUDED.dias_dormido,
             vip_min_compras = EXCLUDED.vip_min_compras,
             vip_top_pct = EXCLUDED.vip_top_pct,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by,
             updated_by_nombre = EXCLUDED.updated_by_nombre`,
      [auth.empresa_id, norm.dias_nuevo, norm.dias_semana, norm.dias_sin_volver,
        norm.dias_dormido, norm.vip_min_compras, norm.vip_top_pct,
        auth.user.id ?? null, auth.nombre ?? null],
    );

    await logAuditoria({
      empresaId: auth.empresa_id,
      usuarioId: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      sucursalId: auth.sucursal_id ?? null,
      tipo: "categorias_clientes_actualizadas",
      entidad: "configuracion",
      datoAnterior: antes.rows[0] ?? null,
      datoNuevo: norm,
    });

    return NextResponse.json(successResponse({ config: norm }));
  } catch (err) {
    console.error("[/api/categorias-clientes PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
