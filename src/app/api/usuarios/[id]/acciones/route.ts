import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { logAuditoria } from "@/lib/auditoria/log";

/**
 * GET  /api/usuarios/[id]/acciones
 * PATCH /api/usuarios/[id]/acciones  (admin only)
 *
 * Usa el pool de PG directo apuntando a public.usuario_modulos y public.modulos
 * porque el cliente Supabase-JS del proyecto va a `pronimerp` por default y la
 * tabla usuario_modulos vive en `public` (catalog schema).
 */

const DEFAULT_ACC = { ver: true, crear: true, editar: true, eliminar: true } as const;

async function verificarEmpresaUsuario(usuarioId: string, empresaAdmin: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("usuarios").select("empresa_id").eq("id", usuarioId).maybeSingle();
  return !!data && (data as { empresa_id: string }).empresa_id === empresaAdmin;
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: usuarioId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const ok = await verificarEmpresaUsuario(usuarioId, auth.empresa_id);
    if (!ok) return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    // Chequear si la columna acciones existe en public.usuario_modulos
    const colsQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='usuario_modulos'`,
    );
    const cols = new Set(colsQ.rows.map((r) => r.column_name));
    const tieneAcciones = cols.has("acciones");

    const selectAcc = tieneAcciones ? "um.acciones" : "NULL::jsonb AS acciones";
    const q = await pool.query<{
      modulo_id: string; slug: string; nombre: string; acciones: Record<string, unknown> | null;
    }>(
      `SELECT um.modulo_id::text, m.slug, m.nombre, ${selectAcc}
         FROM public.usuario_modulos um
         JOIN public.modulos m ON m.id = um.modulo_id
        WHERE um.usuario_id = $1::uuid`,
      [usuarioId],
    );

    return NextResponse.json(successResponse({
      acciones: q.rows.map((r) => ({
        modulo_id: r.modulo_id,
        slug: r.slug ?? "",
        nombre: r.nombre ?? "",
        acciones: { ...DEFAULT_ACC, ...(r.acciones ?? {}) },
      })),
      warning: tieneAcciones ? null : "Migración pendiente: aplicá 20260916_usuario_modulos_acciones para persistir.",
    }));
  } catch (err) {
    console.error("[usuarios/[id]/acciones GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: usuarioId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });

    let body: { modulo_id?: string; acciones?: Record<string, unknown> } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const modId = String(body.modulo_id ?? "").trim();
    const parche = (body.acciones && typeof body.acciones === "object") ? body.acciones : null;
    if (!modId || !parche) {
      return NextResponse.json(errorResponse("modulo_id y acciones son requeridos."), { status: 400 });
    }

    const ok = await verificarEmpresaUsuario(usuarioId, auth.empresa_id);
    if (!ok) return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    // Chequear columna acciones
    const colsQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='usuario_modulos'`,
    );
    const cols = new Set(colsQ.rows.map((r) => r.column_name));
    if (!cols.has("acciones")) {
      return NextResponse.json(
        errorResponse("Aplicá la migración 20260916_usuario_modulos_acciones para poder editar permisos por acción."),
        { status: 400 },
      );
    }

    // Fetch current + merge + update
    const cur = await pool.query<{ id: string; acciones: Record<string, unknown> | null }>(
      `SELECT id, acciones FROM public.usuario_modulos
        WHERE usuario_id = $1::uuid AND modulo_id = $2::uuid LIMIT 1`,
      [usuarioId, modId],
    );
    if (!cur.rows.length) {
      return NextResponse.json(
        errorResponse("El usuario no tiene acceso al módulo. Otorgale acceso primero."),
        { status: 400 },
      );
    }

    const nuevas = { ...(cur.rows[0].acciones ?? {}), ...parche };
    const norm: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(nuevas)) norm[k] = v === true;

    await pool.query(
      `UPDATE public.usuario_modulos SET acciones = $1::jsonb WHERE id = $2::uuid`,
      [JSON.stringify(norm), cur.rows[0].id],
    );

    await logAuditoria({
      empresaId: auth.empresa_id,
      usuarioId: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      sucursalId: auth.sucursal_id ?? null,
      tipo: "permisos_actualizados",
      entidad: "usuario",
      entidadId: usuarioId,
      datoAnterior: cur.rows[0].acciones ?? null,
      datoNuevo: norm,
    });

    return NextResponse.json(successResponse({ acciones: norm }));
  } catch (err) {
    console.error("[usuarios/[id]/acciones PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
