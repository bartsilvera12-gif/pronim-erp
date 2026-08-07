import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { logAuditoria } from "@/lib/auditoria/log";

const LANG_OK = new Set(["es", "pt-BR", "en"]);

/**
 * PATCH /api/usuarios/[id]/idioma  admin only
 * Body: { lang: "es" | "pt-BR" | "en" }
 *
 * Setea `usuarios.lang` para el usuario. El resto de la app lo consume
 * vía useUserCfg para elegir diccionario y locale.
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: usuarioId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });

    let body: { lang?: string } = {};
    try { body = (await request.json()) as { lang?: string }; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const lang = String(body.lang ?? "").trim();
    if (!LANG_OK.has(lang)) return NextResponse.json(errorResponse("lang inválido (es | pt-BR | en)."), { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: u, error: eU } = await supabase
      .from("usuarios")
      .select("id, empresa_id, email, lang")
      .eq("id", usuarioId).maybeSingle();
    if (eU || !u) return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });
    if ((u as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("El usuario no pertenece a tu empresa."), { status: 403 });
    }

    const previo = (u as { lang?: string | null }).lang ?? "es";
    const { error } = await supabase.from("usuarios").update({ lang }).eq("id", usuarioId);
    if (error) {
      // Si la columna no existe, error claro (no rompemos silencioso — sí queremos que la clienta sepa que le falta la migración).
      const msg = (error.message || "").toLowerCase().includes("lang")
        ? "Falta aplicar la migración 20260827_pronimerp_moneda_lang para poder cambiar idiomas."
        : error.message;
      return NextResponse.json(errorResponse(msg), { status: 400 });
    }

    await logAuditoria({
      empresaId: auth.empresa_id,
      usuarioId: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      sucursalId: auth.sucursal_id ?? null,
      tipo: "usuario_idioma_cambiado",
      entidad: "usuario",
      entidadId: usuarioId,
      referencia: (u as { email?: string }).email ?? null,
      datoAnterior: { lang: previo },
      datoNuevo: { lang },
    });

    return NextResponse.json(successResponse({ lang }));
  } catch (err) {
    console.error("[usuarios/[id]/idioma PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: usuarioId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("usuarios").select("lang, empresa_id")
      .eq("id", usuarioId).maybeSingle();
    if (!data || (data as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("No encontrado."), { status: 404 });
    }
    return NextResponse.json(successResponse({ lang: (data as { lang?: string | null }).lang ?? "es" }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
