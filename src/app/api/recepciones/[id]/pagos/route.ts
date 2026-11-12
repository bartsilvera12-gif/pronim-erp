import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import {
  cambiarPagosRecepcionPg,
  listarPagosRecepcionPg,
} from "@/lib/recepciones/server/cambiar-pagos-recepcion-pg";

export const dynamic = "force-dynamic";

/** GET /api/recepciones/[id]/pagos — solo administrador. Lista los pagos de la evaluación. */
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
    const { id } = await params;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pagos = await listarPagosRecepcionPg(schema, auth.empresa_id, id);
    return NextResponse.json(successResponse({ pagos }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[recepciones/pagos GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}

/** POST /api/recepciones/[id]/pagos — solo administrador. Cambia la forma de pago. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(auth.rol)) {
      return NextResponse.json(
        errorResponse("Solo el administrador puede cambiar la forma de pago de una evaluación."),
        { status: 403 },
      );
    }
    const { id } = await params;
    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const cambios = (Array.isArray(body.pagos) ? body.pagos : []).map((x) => {
      const o = x as Record<string, unknown>;
      return { id: String(o.id ?? ""), metodo_pago: String(o.metodo_pago ?? "") };
    });
    const motivo = typeof body.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await cambiarPagosRecepcionPg({
      schema,
      empresaId: auth.empresa_id,
      recepcionId: id,
      cambios,
      motivo,
      actorNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse(r));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[recepciones/pagos POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
