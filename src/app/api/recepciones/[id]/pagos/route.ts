import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import {
  cambiarPagosRecepcionPg,
  listarPagosRecepcionPg,
  type PagoNuevoInput,
} from "@/lib/recepciones/server/cambiar-pagos-recepcion-pg";

export const dynamic = "force-dynamic";

/**
 * GET /api/recepciones/[id]/pagos — solo administrador.
 * Devuelve los pagos vigentes de la evaluación + los datos que la UI
 * necesita para validar la nueva distribución (total objetivo, métodos
 * permitidos, estado de la recepción).
 */
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
    const r = await listarPagosRecepcionPg(schema, auth.empresa_id, id);
    return NextResponse.json(successResponse({
      pagos: r.pagos,
      total_final: r.totalFinal,
      cliente_id: r.clienteId,
      numero_control: r.numeroControl,
      sucursal_id: r.sucursalId,
      estado: r.estado,
      cambio_id: r.cambioId,
      metodos_permitidos: r.metodosPermitidos,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[recepciones/pagos GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}

/**
 * POST /api/recepciones/[id]/pagos — solo administrador.
 * Cuerpo esperado:
 *   { pagos_nuevos: [{metodo, monto, entidad_bancaria_id?}, ...],
 *     motivo: string }
 *
 * Reversa las filas actuales (append-only) y crea las nuevas.
 * El total no cambia (lo valida el backend). Compensa el crédito en el
 * ledger con SALIDAs/ENTRADAs según corresponda.
 */
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

    const motivo = typeof body.motivo === "string" ? body.motivo : null;
    const pagosNuevosRaw = Array.isArray(body.pagos_nuevos) ? body.pagos_nuevos : [];
    const pagosNuevos: PagoNuevoInput[] = pagosNuevosRaw.map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        metodo: String(o.metodo ?? "").trim(),
        monto: Number(o.monto),
        entidad_bancaria_id:
          typeof o.entidad_bancaria_id === "string" && o.entidad_bancaria_id.trim()
            ? o.entidad_bancaria_id.trim()
            : null,
      };
    });

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await cambiarPagosRecepcionPg({
      schema,
      empresaId: auth.empresa_id,
      recepcionId: id,
      pagosNuevos,
      motivo,
      actorId: auth.user?.id ?? null,
      actorNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse(r));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[recepciones/pagos POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
