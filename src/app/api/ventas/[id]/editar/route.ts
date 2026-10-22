import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { editarVentaPg } from "@/lib/ventas/server/editar-venta-pg";

export const dynamic = "force-dynamic";

/**
 * POST /api/ventas/[id]/editar — solo administrador.
 *
 * Corrige una venta ya registrada. Por dentro anula la original y crea una
 * nueva con los datos corregidos, en una sola transacción; la vieja queda
 * como `anulada` apuntando a la nueva.
 *
 * Reservado al admin porque rehace stock, crédito del cliente y cobros.
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
        errorResponse("Solo el administrador puede editar ventas registradas."),
        { status: 403 },
      );
    }

    const { id: ventaId } = await params;
    if (!ventaId) return NextResponse.json(errorResponse("Falta la venta."), { status: 400 });

    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        errorResponse("La venta corregida tiene que llevar al menos un producto."),
        { status: 400 },
      );
    }

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    const r = await editarVentaPg({
      schema,
      empresaId: auth.empresa_id,
      ventaId,
      motivo: str(body.motivo),
      actorId: auth.user.id ?? null,
      actorNombre: auth.nombre ?? null,
      nueva: {
        clienteId: String(body.cliente_id ?? ""),
        observaciones: str(body.observaciones),
        moneda: body.moneda === "USD" ? "USD" : "GS",
        tipoCambio: num(body.tipo_cambio) || 1,
        tipoVenta: body.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        plazoDias: body.plazo_dias == null ? null : num(body.plazo_dias),
        items: items as never,
        sucursalId: String(body.sucursal_id ?? ""),
        cajaId: str(body.caja_id),
        creditoClienteUsado: num(body.credito_cliente_usado),
        pagosInmediatos: (Array.isArray(body.pagos) ? body.pagos : []) as never,
        descuentoGeneral: num(body.descuento_general),
        descuentoMotivo: str(body.descuento_motivo),
        fechaVenta: str(body.fecha),
      },
    });

    return NextResponse.json(successResponse(r));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[ventas/editar]", msg);
    // Los mensajes del motor ya están en castellano y explican el motivo
    // (venta anulada, cobros aplicados, stock insuficiente…).
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
