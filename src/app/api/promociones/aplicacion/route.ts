import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/promociones/aplicacion
 *
 * Se llama DESPUÉS de que la venta se creó exitosamente. Persiste:
 *   1) Fila en pronimerp.promocion_aplicaciones (auditoría / reportes).
 *   2) Si cashback > 0 y hay cliente → ENTRADA en cliente_creditos_movimientos
 *      con origen='cashback' y referencia_id = venta_id.
 *
 * Body:
 *   { promocion_id, venta_id?, cliente_id?, descuento, cashback, cupon_codigo? }
 */
export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  let body: {
    promocion_id?: string;
    venta_id?: string | null;
    cliente_id?: string | null;
    descuento?: number;
    cashback?: number;
    cupon_codigo?: string | null;
    /**
     * Origen del crédito a acreditar cuando cashback > 0. Default 'cashback';
     * también se usa 'descuento_promo' cuando el frontend materializa el
     * descuento como crédito para pasarlo por la venta.
     */
    origen?: "cashback" | "descuento_promo";
  };
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const promocionId = String(body.promocion_id ?? "").trim();
  if (!promocionId) return NextResponse.json(errorResponse("Falta promocion_id."), { status: 400 });

  const descuento = Math.max(0, Math.round(Number(body.descuento) || 0));
  const cashback = Math.max(0, Math.round(Number(body.cashback) || 0));
  const ventaId = typeof body.venta_id === "string" ? body.venta_id : null;
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : null;
  const cuponUsado = body.cupon_codigo ? String(body.cupon_codigo).toUpperCase() : null;
  const origen = body.origen === "descuento_promo" ? "descuento_promo" : "cashback";
  const observacion = origen === "descuento_promo"
    ? "Descuento por promoción (aplicado en la venta)"
    : "Cashback aplicado por promoción";

  try {
    // 1) Audit row
    const { error: errApl } = await ctx.supabase
      .from("promocion_aplicaciones")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        promocion_id: promocionId,
        venta_id: ventaId,
        cliente_id: clienteId,
        sucursal_id: ctx.auth.sucursal_id ?? null,
        descuento_aplicado: descuento,
        cashback_generado: cashback,
        cupon_codigo_usado: cuponUsado,
      });
    if (errApl) {
      // No es fatal si la tabla no existe: dejamos que el cashback se
      // acredite igual y avisamos.
      console.error("[/api/promociones/aplicacion] audit", errApl.message);
    }

    // 2) Cashback → crédito del cliente
    if (cashback > 0 && clienteId) {
      const { error: errCred } = await ctx.supabase
        .from("cliente_creditos_movimientos")
        .insert({
          empresa_id: ctx.auth.empresa_id,
          cliente_id: clienteId,
          tipo: "ENTRADA",
          monto: cashback,
          origen,
          referencia_id: ventaId,
          referencia_tipo: "venta",
          referencia_numero: null,
          observaciones: observacion,
          created_by: ctx.auth.usuarioCatalogId ?? null,
          usuario_nombre: ctx.auth.nombre ?? null,
        });
      if (errCred) {
        return NextResponse.json(
          errorResponse(`Aplicación registrada, pero no se pudo acreditar cashback: ${errCred.message}`),
          { status: 400 },
        );
      }
    }

    return NextResponse.json(successResponse({ ok: true, descuento, cashback }));
  } catch (e) {
    console.error("[/api/promociones/aplicacion]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo registrar la aplicación."), { status: 500 });
  }
}
