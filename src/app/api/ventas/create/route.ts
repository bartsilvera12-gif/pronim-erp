import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { SIN_SUCURSAL_MENSAJE } from "@/lib/sucursales/enforce";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { createVentaTransaccionalPg } from "@/lib/ventas/server/create-venta-pg";
import type { CreateVentaItemInput } from "@/lib/ventas/server/create-venta-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { marcarPedidoFacturado } from "@/lib/pedidos-caja/server";
import type { Venta, LineaVenta } from "@/lib/ventas/types";

/**
 * Wire format del ítem que envía el cliente. El server IGNORA los
 * campos autoritativos (nombre, sku, precios, subtotales, IVA calculado)
 * y los resuelve desde la DB. Solo respeta producto_id, cantidad,
 * es_sin_cargo y motivo_sin_cargo.
 */
interface ItemWire {
  producto_id: string;
  cantidad: number;
  tipo_iva?: "EXENTA" | "5%" | "10%";
  es_sin_cargo?: boolean;
  motivo_sin_cargo?: string | null;
}

function asItems(body: unknown): ItemWire[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ItemWire[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const producto_id = String(r.producto_id ?? "");
    const cantidad = Number(r.cantidad);
    if (!producto_id || !(cantidad > 0)) return null;
    const tipoIva = r.tipo_iva;
    const tipoIvaValido =
      tipoIva === "EXENTA" || tipoIva === "5%" || tipoIva === "10%"
        ? tipoIva
        : undefined;
    const esSinCargo = r.es_sin_cargo === true;
    const motivoRaw = r.motivo_sin_cargo;
    const motivoSinCargo =
      esSinCargo && typeof motivoRaw === "string" && motivoRaw.trim()
        ? motivoRaw.trim().slice(0, 120)
        : esSinCargo ? "decant_obsequio" : null;
    out.push({
      producto_id,
      cantidad,
      tipo_iva: tipoIvaValido,
      es_sin_cargo: esSinCargo,
      motivo_sin_cargo: motivoSinCargo,
    });
  }
  return out;
}

/**
 * Construye la respuesta mínima para el cliente. Los datos autoritativos
 * (precios, subtotales, nombre) se ignoraron del input y no se devuelven
 * en esta versión — el cliente debe re-consultar la venta si los necesita.
 */
function toVentaResponse(
  items: ItemWire[],
  meta: {
    id: string;
    numero_control: string;
    fechaIso: string;
    moneda: Venta["moneda"];
    tipo_cambio: number;
    tipo_venta: Venta["tipo_venta"];
    plazo_dias?: number;
    subtotal: number;
    monto_iva: number;
    total: number;
  }
): Venta {
  const lineas: LineaVenta[] = items.map((i) => ({
    producto_id: i.producto_id,
    producto_nombre: "",  // resuelto server-side, no viaja de vuelta acá
    sku: "",
    cantidad: i.cantidad,
    precio_venta_original: 0,
    precio_venta: 0,
    tipo_iva: i.tipo_iva ?? "EXENTA",
    subtotal: 0,
    monto_iva: 0,
    total_linea: 0,
    es_sin_cargo: i.es_sin_cargo === true,
    motivo_sin_cargo: i.motivo_sin_cargo ?? null,
  }));
  return {
    id: meta.id,
    numero_control: meta.numero_control,
    items: lineas,
    moneda: meta.moneda,
    tipo_cambio: meta.tipo_cambio,
    subtotal: meta.subtotal,
    monto_iva: meta.monto_iva,
    total: meta.total,
    tipo_venta: meta.tipo_venta,
    plazo_dias: meta.plazo_dias,
    fecha: meta.fechaIso,
  };
}

/**
 * POST /api/ventas/create — venta + ítems + stock + movimientos (una transacción Postgres).
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const bearerPresent = !!request.headers.get("authorization");
  try {
    console.log(`[diag-venta] POST start bearer=${bearerPresent}`);
    const auth = await getAuthWithRol(request);
    if (!auth) {
      console.log(`[diag-venta] auth=null bearer=${bearerPresent} ms=${Date.now() - t0}`);
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    console.log(`[diag-venta] auth_ok empresa=${auth.empresa_id} bearer=${bearerPresent}`);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const items = asItems(body);
    if (!items) {
      return NextResponse.json(errorResponse("Payload inválido: items requeridos."), { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const moneda = o.moneda === "USD" ? "USD" : "GS";
    const tipoCambio = Number(o.tipo_cambio) || 1;
    const tipoVenta = o.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO";
    const plazoDias =
      tipoVenta === "CREDITO" && o.plazo_dias != null && String(o.plazo_dias).trim() !== ""
        ? parseInt(String(o.plazo_dias), 10)
        : null;
    const clienteRaw = o.cliente_id;
    const clienteId =
      clienteRaw === null || clienteRaw === undefined || clienteRaw === ""
        ? null
        : String(clienteRaw);
    if (!clienteId) {
      return NextResponse.json(
        errorResponse("Cliente requerido: no se pueden registrar ventas sin cliente."),
        { status: 400 },
      );
    }
    const observaciones =
      o.observaciones === null || o.observaciones === undefined
        ? null
        : String(o.observaciones).slice(0, 4000);

    const metodoPagoRaw = o.metodo_pago;
    const metodoPago =
      metodoPagoRaw === "efectivo" || metodoPagoRaw === "tarjeta" || metodoPagoRaw === "transferencia"
        ? metodoPagoRaw
        : null;

    const creditoUsadoRaw = o.credito_cliente_usado;
    const creditoClienteUsado =
      creditoUsadoRaw == null || creditoUsadoRaw === ""
        ? 0
        : Math.max(0, Math.round(Number(creditoUsadoRaw) || 0));

    const subtotalDeclarado = Number(o.subtotal);
    const montoIvaDeclarado = Number(o.monto_iva);
    const totalDeclarado = Number(o.total);

    if ([subtotalDeclarado, montoIvaDeclarado, totalDeclarado].some((n) => Number.isNaN(n))) {
      return NextResponse.json(errorResponse("Totales inválidos."), { status: 400 });
    }

    if (moneda === "USD" && tipoCambio <= 0) {
      return NextResponse.json(errorResponse("Tipo de cambio inválido para USD."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    // Sucursal ESTRICTA (pronimerp):
    //   1) usuario con sucursal fija → esa manda; body no puede pedir otra.
    //   2) admin global → sucursal_id del body o la de la caja abierta única.
    //   3) si nada resuelve → 400 con mensaje claro.
    const sucursalBody = typeof o.sucursal_id === "string" ? o.sucursal_id : null;
    let sucursalId: string | null = null;
    if (auth.sucursal_id) {
      if (sucursalBody && sucursalBody !== auth.sucursal_id) {
        return NextResponse.json(
          errorResponse(
            "Tu usuario está asignado a una sucursal específica; no podés registrar ventas para otra.",
          ),
          { status: 400 },
        );
      }
      sucursalId = auth.sucursal_id;
    } else if (!esRolAdminEmpresaOGlobal(auth.rol ?? undefined)) {
      // Non-admin sin sucursal fija: no debería llegar acá. Bloqueamos con
      // mensaje claro para que el admin configure la sucursal del usuario.
      return NextResponse.json(errorResponse(SIN_SUCURSAL_MENSAJE), { status: 403 });
    } else if (sucursalBody) {
      sucursalId = sucursalBody;
    } else {
      const sb0 = createServiceRoleClientWithDbSchema(schema);
      const { data: cajasAbiertas } = await sb0
        .from("cajas")
        .select("sucursal_id, fecha_apertura")
        .eq("empresa_id", auth.empresa_id)
        .eq("estado", "abierta")
        .not("sucursal_id", "is", null)
        .order("fecha_apertura", { ascending: false })
        .limit(2);
      const arr = (cajasAbiertas ?? []) as { sucursal_id: string }[];
      if (arr.length === 1) sucursalId = arr[0].sucursal_id;
      else if (arr.length > 1) {
        return NextResponse.json(
          errorResponse(
            "Hay más de una caja abierta; especificá sucursal_id en el body.",
          ),
          { status: 400 },
        );
      }
    }
    if (!sucursalId) {
      return NextResponse.json(
        errorResponse(
          "Sucursal requerida: no se pudo determinar dónde se registra la venta. Especificá sucursal_id o abrí una caja.",
        ),
        { status: 400 },
      );
    }

    // pago_detalle: array de formas de pago no-crédito
    const pagosDetalleRaw = o.pago_detalle;
    const pagosDetalle: import("@/lib/ventas/server/create-venta-pg").PagoDetalleVentaInput[] = [];
    if (Array.isArray(pagosDetalleRaw)) {
      for (const raw of pagosDetalleRaw) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const metodo = String(r.metodo_pago ?? "");
        if (!["efectivo","transferencia","tarjeta","qr","billetera","otro"].includes(metodo)) continue;
        const monto = Number(r.monto);
        if (!Number.isFinite(monto) || monto <= 0) continue;
        pagosDetalle.push({
          metodo_pago: metodo as import("@/lib/ventas/server/create-venta-pg").MetodoPagoVenta,
          monto,
          entidad_bancaria_id: typeof r.entidad_bancaria_id === "string" ? r.entidad_bancaria_id : null,
          entidad_nombre_snapshot: typeof r.entidad_nombre_snapshot === "string" ? r.entidad_nombre_snapshot : null,
          referencia: typeof r.referencia === "string" ? r.referencia : null,
          titular: typeof r.titular === "string" ? r.titular : null,
          fecha_acreditacion: typeof r.fecha_acreditacion === "string" ? r.fecha_acreditacion : null,
          observacion: typeof r.observacion === "string" ? r.observacion : null,
        });
      }
    }
    // CONTADO: si no vino array de pagos pero vino metodoPago legacy y hay
    // saldo restante no cubierto por crédito, armar 1 línea de pago.
    // CREDITO: NO se auto-genera pago inmediato — el saldo va a CxC.
    if (
      pagosDetalle.length === 0
      && metodoPago
      && tipoVenta === "CONTADO"
      && totalDeclarado > 0
    ) {
      const saldoRestante = Math.max(0, totalDeclarado - creditoClienteUsado);
      if (saldoRestante > 0) {
        pagosDetalle.push({
          metodo_pago: metodoPago as import("@/lib/ventas/server/create-venta-pg").MetodoPagoVenta,
          monto: saldoRestante,
        });
      }
    }

    const cambioIdRaw = o.cambio_id;
    const cambioId = typeof cambioIdRaw === "string" && cambioIdRaw ? cambioIdRaw : null;

    const resultVenta = await createVentaTransaccionalPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      observaciones,
      moneda,
      tipoCambio,
      tipoVenta,
      plazoDias: Number.isFinite(plazoDias as number) ? plazoDias : null,
      // Solo pasamos producto_id + cantidad; el server resuelve el resto.
      items: items.map((it) => ({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        es_sin_cargo: it.es_sin_cargo === true,
        motivo_sin_cargo: it.motivo_sin_cargo ?? null,
        tipo_iva: it.tipo_iva,
      })),
      sucursalId,
      cajaId: typeof o.caja_id === "string" && o.caja_id.trim() ? o.caja_id.trim() : null,
      creditoClienteUsado,
      pagosInmediatos: pagosDetalle,
      createdBy: auth.user.id ?? null,
      cambioId,
    });

    const { ventaId, numeroControl, fechaIso, total: totServer } = resultVenta;
    const venta = toVentaResponse(items, {
      id: ventaId,
      numero_control: numeroControl,
      fechaIso,
      moneda,
      tipo_cambio: tipoCambio,
      tipo_venta: tipoVenta,
      plazo_dias: tipoVenta === "CREDITO" ? plazoDias ?? undefined : undefined,
      subtotal: totServer,
      monto_iva: 0,  // el server calcula IVA informativo por línea
      total: totServer,
    });

    // Si la venta facturó un pedido del salón (módulo Consulta), marcarlo como
    // facturado. Best-effort: si falla, la venta ya está creada — solo logueamos.
    const pedidoCajaIdRaw = o.pedido_caja_id;
    const pedidoCajaId =
      pedidoCajaIdRaw == null || pedidoCajaIdRaw === "" ? null : String(pedidoCajaIdRaw);
    if (pedidoCajaId) {
      try {
        const sb = createServiceRoleClientWithDbSchema(schema);
        await marcarPedidoFacturado(sb, auth.empresa_id, pedidoCajaId, ventaId, numeroControl);
      } catch (e) {
        console.error("[diag-venta] marcarPedidoFacturado falló", e);
      }
    }

    console.log(`[diag-venta] success numero=${numeroControl} total=${totServer} ms=${Date.now() - t0}`);
    return NextResponse.json(successResponse({ venta }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear la venta.";
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : "";
    console.error(`[diag-venta] FAIL msg="${msg}" stack=${stack} ms=${Date.now() - t0}`);
    const status =
      msg.includes("Stock insuficiente") ||
      msg.includes("no existen") ||
      msg.includes("Cliente no encontrado") ||
      msg.includes("Cliente requerido") ||
      msg.includes("Saldo insuficiente") ||
      msg.includes("crédito aplicado supera") ||
      msg.includes("Totales no coinciden") ||
      msg.includes("al menos un")
        ? 400
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
