import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/middleware/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

/**
 * GET  → múltiplo actual de redondeo de recepciones (0 = sin redondeo).
 * PATCH → actualizar (solo administradores).
 *
 * Se aplica a la columna "El cliente trae" del POS de atención: el
 * subtotal estimado se redondea hacia arriba al múltiplo, y ese es el
 * monto que efectivamente se acredita al cliente. Default 5000.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("empresas")
      .select("redondeo_recepcion_multiplo")
      .eq("id", ctx.auth.empresa_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const multiplo = Number(
      (data as { redondeo_recepcion_multiplo?: number } | null)?.redondeo_recepcion_multiplo ?? 5000,
    );
    return NextResponse.json(successResponse({ redondeo_recepcion_multiplo: multiplo }));
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo un administrador puede modificar esta opción"), { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const v = Number(body.redondeo_recepcion_multiplo);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
      return NextResponse.json(errorResponse("redondeo_recepcion_multiplo debe ser un entero entre 0 y 1.000.000"), { status: 400 });
    }
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from("empresas")
      .update({ redondeo_recepcion_multiplo: Math.floor(v) })
      .eq("id", ctx.auth.empresa_id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ redondeo_recepcion_multiplo: Math.floor(v) }));
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
