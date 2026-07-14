import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { anularVentaPg } from "@/lib/ventas/server/anular-venta-pg";

/** POST /api/ventas/[id]/anular — solo super_admin. */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ventaId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo super_admin puede anular ventas."),
        { status: 403 },
      );
    }
    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; } catch { /* opcional */ }
    const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : null;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await anularVentaPg({
      schema,
      empresaId: auth.empresa_id,
      ventaId,
      motivo,
      actorId: auth.user.id ?? null,
      actorNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse({ venta: r }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al anular venta.";
    console.error("[ventas anular POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
