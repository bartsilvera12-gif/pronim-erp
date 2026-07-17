import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { procesarConfirmarAtencion } from "@/lib/atencion/server/procesar-confirmar-atencion";

/**
 * POST /api/atencion/confirmar
 *
 * Orquestador transaccional único del flujo "Cliente trae + Cliente lleva"
 * de /caja. Este route es un thin wrapper: valida auth y delega a
 * `procesarConfirmarAtencion` (helper puro, testeable sin HTTP).
 *
 * Contrato de errores:
 *   400 { success:false, error, code }  — validación (cupón, beneficio, etc)
 *   409 { success:false, error, code:"IDEMPOTENCY_CONFLICT" } — misma key, payload distinto
 *   500 fallo interno
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const resp = await procesarConfirmarAtencion(body, {
      empresa_id: auth.empresa_id,
      sucursal_id: auth.sucursal_id ?? null,
      user_id: auth.user.id ?? null,
      nombre: auth.nombre ?? null,
    });
    console.log(`[atencion/confirmar] status=${resp.status} ms=${Date.now() - t0}`);
    return NextResponse.json(resp.body, { status: resp.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error(`[atencion/confirmar] FATAL msg="${msg}" ms=${Date.now() - t0}`);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
