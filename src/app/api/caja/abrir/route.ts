import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { abrirCajaPg } from "@/lib/caja/server/caja-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { enforceSucursalForOperation } from "@/lib/sucursales/enforce";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** POST /api/caja/abrir — abre una caja con monto inicial. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const o = (body ?? {}) as Record<string, unknown>;
    const montoApertura = Number(o.monto_apertura);
    if (!Number.isFinite(montoApertura) || montoApertura < 0) {
      return NextResponse.json(errorResponse("Monto de apertura inválido."), { status: 400 });
    }
    const observacion =
      o.observacion == null || o.observacion === "" ? null : String(o.observacion).slice(0, 2000);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    // Sucursal estricta:
    //  - Usuario con sucursal fija (usuario/supervisor/admin) → esa sucursal manda.
    //    Rechazamos si el body pide otra distinta.
    //  - Admin global (sucursal_id null) → puede indicar sucursal en el body.
    //  - Sin body y admin global → cae a Principal (compatibilidad).
    //  - Usuario NO admin sin sucursal → 403 con mensaje claro.
    const enforce = enforceSucursalForOperation({
      authSucursalId: auth.sucursal_id ?? null,
      rol: auth.rol ?? null,
      bodySucursalId: typeof o.sucursal_id === "string" ? (o.sucursal_id as string) : null,
      allowNullForAdmin: true,
    });
    if (!enforce.ok) {
      return NextResponse.json(errorResponse(enforce.error), { status: enforce.status });
    }
    const sucursalId =
      enforce.sucursal_id ??
      (await resolveSucursalIdForUserPg(schema, auth.empresa_id, null));
    const caja = await abrirCajaPg({
      schema,
      empresaId: auth.empresa_id,
      montoApertura,
      observacion,
      usuarioId: auth.usuarioCatalogId ?? null,
      sucursalId,
    });
    return NextResponse.json(successResponse({ caja }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo abrir la caja.";
    const status = msg.includes("Ya hay una caja abierta") ? 409 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
