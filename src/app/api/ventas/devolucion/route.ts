import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { enforceSucursalForOperation } from "@/lib/sucursales/enforce";
import {
  buscarVentasDevoluciblesPg,
  crearDevolucionPg,
} from "@/lib/ventas/server/devolucion-pg";

/**
 * GET /api/ventas/devolucion?cliente_id=…&q=…
 * Ventas que se pueden devolver (por cliente o por número de venta), con las
 * prendas que todavía no fueron devueltas y si están dentro del plazo.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = request.nextUrl.searchParams;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const ventas = await buscarVentasDevoluciblesPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId: sp.get("cliente_id") || null,
      q: sp.get("q"),
    });
    return NextResponse.json(successResponse({ ventas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al buscar ventas.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/ventas/devolucion — devolución SIN compra nueva: el valor queda
 * como crédito a favor del cliente (sin vencimiento).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const enforce = enforceSucursalForOperation({
      authSucursalId: auth.sucursal_id ?? null,
      rol: auth.rol ?? null,
      bodySucursalId: typeof body.sucursal_id === "string" ? body.sucursal_id : null,
      allowNullForAdmin: true,
    });
    if (!enforce.ok) {
      return NextResponse.json(errorResponse(enforce.error), { status: enforce.status });
    }
    if (!enforce.sucursal_id) {
      return NextResponse.json(
        errorResponse("Elegí la sucursal que recibe las prendas (selector de sucursal del menú superior)."),
        { status: 400 },
      );
    }
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        return { venta_item_id: String(r.venta_item_id ?? ""), cantidad: Number(r.cantidad) };
      });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const r = await crearDevolucionPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId: typeof body.cliente_id === "string" && body.cliente_id ? body.cliente_id : null,
      sucursalId: enforce.sucursal_id,
      ventaOriginalId: typeof body.venta_original_id === "string" ? body.venta_original_id : "",
      items,
      observaciones: typeof body.observaciones === "string" ? body.observaciones.slice(0, 4000) : null,
      createdBy: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
    });
    return NextResponse.json(successResponse({ devolucion: r }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al registrar la devolución.";
    console.error("[ventas devolucion POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
