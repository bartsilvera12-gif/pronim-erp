import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { METODOS_EDITABLES_VENTA, cambiarPagosVentaPg, listarPagosVentaPg } from "@/lib/ventas/server/cambiar-pagos-venta-pg";

export const dynamic = "force-dynamic";

/** GET /api/ventas/[id]/pagos — solo administrador. Lista los cobros de la venta. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(auth.rol)) {
      return NextResponse.json(errorResponse("Solo el administrador puede ver esto."), { status: 403 });
    }
    const { id: ventaId } = await params;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pagos = (await listarPagosVentaPg(schema, auth.empresa_id, ventaId)).map((p) => ({
      ...p,
      opciones: [...METODOS_EDITABLES_VENTA] as string[],
    }));
    return NextResponse.json(successResponse({ pagos }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[ventas/pagos GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}

/** POST /api/ventas/[id]/pagos — solo administrador. Cambia la forma de pago. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(auth.rol)) {
      return NextResponse.json(
        errorResponse("Solo el administrador puede cambiar la forma de pago de una venta."),
        { status: 403 },
      );
    }
    const { id: ventaId } = await params;
    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const cambios = (Array.isArray(body.pagos) ? body.pagos : []).map((x) => {
      const o = x as Record<string, unknown>;
      return { id: String(o.id ?? ""), metodo_pago: String(o.metodo_pago ?? "") };
    });
    const motivo = typeof body.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await cambiarPagosVentaPg({
      schema,
      empresaId: auth.empresa_id,
      ventaId,
      cambios,
      motivo,
      actorNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse(r));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[ventas/pagos POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
