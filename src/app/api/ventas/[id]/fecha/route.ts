import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { cambiarFechaVentaPg } from "@/lib/ventas/server/cambiar-fecha-venta-pg";

export const dynamic = "force-dynamic";

/** POST /api/ventas/[id]/fecha — solo administrador. Cambia solo la fecha. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(auth.rol)) {
      return NextResponse.json(
        errorResponse("Solo el administrador puede cambiar la fecha de una venta."),
        { status: 403 },
      );
    }
    const { id: ventaId } = await params;
    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const fecha = typeof body.fecha === "string" ? body.fecha.trim() : "";
    const motivo = typeof body.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await cambiarFechaVentaPg({
      schema,
      empresaId: auth.empresa_id,
      ventaId,
      fecha,
      motivo,
      actorNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse(r));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[ventas/fecha]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
