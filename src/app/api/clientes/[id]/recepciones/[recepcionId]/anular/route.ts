import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { anularRecepcionPg } from "@/lib/recepciones/server/recepciones-pg";

/** POST /api/clientes/[id]/recepciones/[recepcionId]/anular
 *  Solo super_admin puede anular (implica reversión de crédito y caja). */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; recepcionId: string }> },
) {
  try {
    const { recepcionId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo super_admin puede anular recepciones."),
        { status: 403 },
      );
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch { /* opcional */ }
    const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : null;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await anularRecepcionPg({
      schema,
      empresaId: auth.empresa_id,
      recepcionId,
      motivo,
      actorId: auth.user.id ?? null,
      actorNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse({ recepcion: r }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al anular.";
    console.error("[recepciones anular POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
