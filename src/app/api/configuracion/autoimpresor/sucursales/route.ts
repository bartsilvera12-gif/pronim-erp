import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getAuthWithRol } from "@/lib/middleware/auth";
import {
  listarAutoimpresorSucursales,
  listarSucursalesParaAutoimpresor,
  guardarConfigSucursal,
  borrarConfigSucursal,
  validarConfigSucursal,
} from "@/lib/facturacion/server/autoimpresor-sucursal-pg";

export const dynamic = "force-dynamic";

/**
 * Configuración de autoimpresor POR SUCURSAL.
 *
 * GET    → { sucursales: [...], configuradas: [...] }
 * PUT    → guarda/crea la config de UNA sucursal
 * DELETE → ?sucursal_id=… quita la config (esa sucursal deja de facturar)
 *
 * Solo administrador: el timbrado y la numeración son datos fiscales.
 */

async function soloAdmin(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return { error: NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 }) };
  if (!esRolAdminEmpresaOGlobal(auth.rol)) {
    return {
      error: NextResponse.json(
        errorResponse("Solo el administrador puede configurar la facturación."),
        { status: 403 },
      ),
    };
  }
  return { auth };
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const guard = await soloAdmin(request);
  if (guard.error) return guard.error;
  try {
    const empresaId = ctx.auth.empresa_id;
    const [configuradas, sucursales] = await Promise.all([
      listarAutoimpresorSucursales(empresaId),
      listarSucursalesParaAutoimpresor(empresaId),
    ]);
    return NextResponse.json(successResponse({ configuradas, sucursales }));
  } catch (e) {
    console.error("[autoimpresor/sucursales GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo leer la configuración."), { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const guard = await soloAdmin(request);
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

  const sucursalId = typeof body.sucursal_id === "string" ? body.sucursal_id.trim() : "";
  if (!sucursalId) {
    return NextResponse.json(errorResponse("Falta la sucursal."), { status: 400 });
  }
  const entrada = {
    sucursal_id: sucursalId,
    activo: body.activo === true,
    establecimiento_codigo: String(body.establecimiento_codigo ?? "").trim(),
    punto_expedicion_codigo: String(body.punto_expedicion_codigo ?? "001").trim(),
    numero_inicial: parseInt(String(body.numero_inicial ?? ""), 10),
    numero_final: parseInt(String(body.numero_final ?? ""), 10),
  };

  const errores = validarConfigSucursal(entrada);
  if (errores.length > 0) {
    return NextResponse.json(errorResponse(errores.join(" ")), { status: 400 });
  }

  try {
    await guardarConfigSucursal(ctx.auth.empresa_id, entrada);
    const configuradas = await listarAutoimpresorSucursales(ctx.auth.empresa_id);
    return NextResponse.json(successResponse({ configuradas }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Índice único: dos sucursales no pueden compartir establecimiento + punto.
    if (/sucursal_autoimpresor_punto_unico/.test(msg)) {
      return NextResponse.json(
        errorResponse("Ya hay otra sucursal usando ese establecimiento y punto de expedición."),
        { status: 400 },
      );
    }
    console.error("[autoimpresor/sucursales PUT]", msg);
    return NextResponse.json(errorResponse("No se pudo guardar."), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const guard = await soloAdmin(request);
  if (guard.error) return guard.error;
  const sucursalId = request.nextUrl.searchParams.get("sucursal_id");
  if (!sucursalId) {
    return NextResponse.json(errorResponse("Falta la sucursal."), { status: 400 });
  }
  try {
    await borrarConfigSucursal(ctx.auth.empresa_id, sucursalId);
    const configuradas = await listarAutoimpresorSucursales(ctx.auth.empresa_id);
    return NextResponse.json(successResponse({ configuradas }));
  } catch (e) {
    console.error("[autoimpresor/sucursales DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo quitar la configuración."), { status: 500 });
  }
}
