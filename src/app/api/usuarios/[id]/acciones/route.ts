import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { logAuditoria } from "@/lib/auditoria/log";

/**
 * GET  /api/usuarios/[id]/acciones
 *   → { acciones: [{ modulo_id, slug, nombre, acciones: {ver, crear, editar, eliminar, …} }] }
 *
 * PATCH /api/usuarios/[id]/acciones (admin only)
 *   Body: { modulo_id, acciones: { ver?, crear?, editar?, eliminar?, ... } }
 *   → merge del objeto acciones (no reemplaza).
 *
 * Requiere migración 20260916_usuario_modulos_acciones para persistir.
 * Si la columna no existe, PATCH devuelve error explícito.
 */

const DEFAULT_ACC = { ver: true, crear: true, editar: true, eliminar: true } as const;

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: usuarioId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const supabase = createServiceRoleClient();
    // Verificar empresa
    const { data: u } = await supabase
      .from("usuarios")
      .select("id, empresa_id")
      .eq("id", usuarioId).maybeSingle();
    if (!u || (u as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });
    }

    const { data, error } = await supabase
      .from("usuario_modulos")
      .select("modulo_id, acciones, modulos(id, slug, nombre)")
      .eq("usuario_id", usuarioId);
    if (error) {
      // Si la columna acciones no existe, la caemos gracefully
      if ((error.message || "").includes("acciones")) {
        const { data: sinAcc } = await supabase
          .from("usuario_modulos")
          .select("modulo_id, modulos(id, slug, nombre)")
          .eq("usuario_id", usuarioId);
        return NextResponse.json(successResponse({
          acciones: (sinAcc ?? []).map((r) => ({
            modulo_id: (r as { modulo_id: string }).modulo_id,
            slug: (r as unknown as { modulos: { slug: string; nombre: string } }).modulos?.slug ?? "",
            nombre: (r as unknown as { modulos: { slug: string; nombre: string } }).modulos?.nombre ?? "",
            acciones: { ...DEFAULT_ACC },
          })),
          warning: "Migración pendiente: aplicá 20260916_usuario_modulos_acciones para persistir.",
        }));
      }
      return NextResponse.json(errorResponse(error.message), { status: 500 });
    }

    return NextResponse.json(successResponse({
      acciones: (data ?? []).map((r) => {
        const mod = (r as { modulos: { id?: string; slug?: string; nombre?: string } | null }).modulos;
        return {
          modulo_id: (r as { modulo_id: string }).modulo_id,
          slug: mod?.slug ?? "",
          nombre: mod?.nombre ?? "",
          acciones: { ...DEFAULT_ACC, ...((r as { acciones?: Record<string, unknown> }).acciones ?? {}) },
        };
      }),
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

    const supabase = createServiceRoleClient();
    // Verificar empresa
    const { data: u } = await supabase
      .from("usuarios").select("id, empresa_id, nombre, email")
      .eq("id", usuarioId).maybeSingle();
    if (!u || (u as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });
    }

    // Fetch actual + merge + update
    const { data: cur, error: eCur } = await supabase
      .from("usuario_modulos")
      .select("id, acciones")
      .eq("usuario_id", usuarioId).eq("modulo_id", modId).maybeSingle();
    if (eCur) return NextResponse.json(errorResponse(eCur.message), { status: 500 });
    if (!cur) {
      return NextResponse.json(errorResponse("El usuario no tiene acceso al módulo. Otorgale acceso primero."), { status: 400 });
    }
    const nuevas = { ...(cur as { acciones?: Record<string, unknown> }).acciones ?? {}, ...parche };
    // Normalizar a boolean.
    const norm: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(nuevas)) norm[k] = v === true;

    const { error: eUpd } = await supabase
      .from("usuario_modulos")
      .update({ acciones: norm })
      .eq("id", (cur as { id: string }).id);
    if (eUpd) {
      if ((eUpd.message || "").includes("acciones")) {
        return NextResponse.json(errorResponse("Aplicá la migración 20260916_usuario_modulos_acciones para poder editar permisos por acción."), { status: 400 });
      }
      return NextResponse.json(errorResponse(eUpd.message), { status: 500 });
    }

    await logAuditoria({
      empresaId: auth.empresa_id,
      usuarioId: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      sucursalId: auth.sucursal_id ?? null,
      tipo: "permisos_actualizados",
      entidad: "usuario",
      entidadId: usuarioId,
      referencia: (u as { email?: string }).email ?? null,
      datoAnterior: (cur as { acciones?: Record<string, unknown> }).acciones ?? null,
      datoNuevo: norm,
    });

    return NextResponse.json(successResponse({ acciones: norm }));
  } catch (err) {
    console.error("[usuarios/[id]/acciones PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
