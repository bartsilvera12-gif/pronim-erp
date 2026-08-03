import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { logAuditoria } from "@/lib/auditoria/log";

/**
 * POST /api/usuarios/[id]/reset-password
 * Body: { password: string }  (mínimo 8 caracteres)
 *
 * Admin de empresa (o super_admin) puede resetear la contraseña de otro
 * usuario de la misma empresa. Usa el admin API de Supabase Auth.
 * Registra evento en auditoría (SIN el password).
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: usuarioId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo administradores pueden resetear contraseñas."), { status: 403 });
    }

    let body: { password?: string } = {};
    try { body = (await request.json()) as { password?: string }; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8) {
      return NextResponse.json(errorResponse("La contraseña debe tener al menos 8 caracteres."), { status: 400 });
    }

    const supabase = createServiceRoleClient();
    // Validar que el usuario pertenezca a la empresa del admin.
    const { data: u, error: eU } = await supabase
      .from("usuarios")
      .select("id, email, empresa_id, nombre")
      .eq("id", usuarioId)
      .maybeSingle();
    if (eU || !u) {
      return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });
    }
    if ((u as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("El usuario no pertenece a tu empresa."), { status: 403 });
    }

    // Reset via admin API (requiere que auth_user_id exista; sino error).
    // Nota: el auth_user_id se guarda en usuarios.auth_user_id en algunos
    // deploys. Buscamos por email como fallback confiable.
    const email = (u as { email: string }).email;
    // Encuentra el user de auth por email.
    let authUserId: string | null = null;
    try {
      const listRes = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = listRes.data?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase());
      authUserId = found?.id ?? null;
    } catch { /* fallthrough */ }
    if (!authUserId) {
      return NextResponse.json(errorResponse("No se encontró el usuario en Auth."), { status: 404 });
    }
    const { error: eUpd } = await supabase.auth.admin.updateUserById(authUserId, { password });
    if (eUpd) {
      return NextResponse.json(errorResponse(eUpd.message || "No se pudo actualizar la contraseña."), { status: 500 });
    }

    await logAuditoria({
      empresaId: auth.empresa_id,
      usuarioId: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      sucursalId: auth.sucursal_id ?? null,
      tipo: "password_reset",
      entidad: "usuario",
      entidadId: usuarioId,
      referencia: email,
      // NUNCA loggear el password.
      datoNuevo: { reset: true },
      motivo: "Reseteo administrativo",
    });

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[usuarios/[id]/reset-password POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
