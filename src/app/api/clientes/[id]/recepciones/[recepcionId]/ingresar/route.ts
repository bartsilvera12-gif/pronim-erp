import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ingresarRecepcionPg } from "@/lib/recepciones/server/recepciones-pg";

/** POST /api/clientes/[id]/recepciones/[recepcionId]/ingresar */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; recepcionId: string }> },
) {
  try {
    const { recepcionId } = await ctxParams.params;
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await ingresarRecepcionPg({
      schema,
      empresaId: auth.empresa_id,
      recepcionId,
      actorId: auth.user.id ?? null,
      actorNombre: null,
    });
    return NextResponse.json(successResponse({ recepcion: r }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al ingresar.";
    console.error("[recepciones ingresar POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
