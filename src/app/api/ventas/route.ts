import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { Venta, LineaVenta, TipoIvaVenta } from "@/lib/ventas/types";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

interface VentaRow {
  id: string;
  empresa_id: string;
  cliente_id?: string | null;
  numero_control: string;
  moneda: string;
  tipo_cambio: number | string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  tipo_venta: string;
  plazo_dias: number | null;
  fecha: string;
  estado?: string | null;
  anulada_at?: string | null;
  anulacion_motivo?: string | null;
  metodo_pago?: string | null;
  descuento_general?: number | string | null;
  descuento_motivo?: string | null;
  sucursal_id?: string | null;
  sucursal?: { nombre?: string | null } | null;
}

interface VentaItemRow {
  venta_id: string;
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number | string;
  precio_venta_original: number | string;
  precio_venta: number | string;
  tipo_iva: string;
  subtotal: number | string;
  monto_iva: number | string;
  total_linea: number | string;
  es_sin_cargo: boolean | null;
  motivo_sin_cargo: string | null;
  costo_promocional_total: number | string | null;
}

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

function mapItems(rows: VentaItemRow[]): LineaVenta[] {
  return rows.map((r) => ({
    producto_id: r.producto_id,
    producto_nombre: r.producto_nombre,
    sku: r.sku,
    cantidad: num(r.cantidad),
    precio_venta_original: num(r.precio_venta_original),
    precio_venta: num(r.precio_venta),
    tipo_iva: r.tipo_iva as TipoIvaVenta,
    subtotal: num(r.subtotal),
    monto_iva: num(r.monto_iva),
    total_linea: num(r.total_linea),
    es_sin_cargo: r.es_sin_cargo === true,
    motivo_sin_cargo: r.motivo_sin_cargo ?? null,
    costo_promocional_total:
      r.costo_promocional_total == null ? null : num(r.costo_promocional_total),
  }));
}

/**
 * GET /api/ventas — listado vía PostgREST HTTPS (JWT). 2 queries
 * secuenciales (ventas + items) y join en app, igual contrato que antes.
 */
// VENTAS_COLS_MIN = columnas garantizadas en todos los tenants (schema base
// original). VENTAS_COLS_ANULACION agrega columnas de anulación que solo
// existen si corrió la migración correspondiente. VENTAS_COLS_CON_SUCURSAL
// suma la relación a sucursales (solo Joyería / deploys que la tengan).
// La consulta intenta lo más completo primero y va degradando si PostgREST
// falla por columna inexistente — así funciona en todos los deploys.
const VENTAS_COLS_MIN = "id,empresa_id,cliente_id,numero_control,moneda,tipo_cambio,subtotal,monto_iva,total,tipo_venta,plazo_dias,fecha,estado,metodo_pago";
const VENTAS_COLS_ANULACION = `${VENTAS_COLS_MIN},anulada_at,anulacion_motivo`;
const VENTAS_COLS_CON_DESCUENTO = `${VENTAS_COLS_ANULACION},descuento_general,descuento_motivo`;
const VENTAS_COLS_CON_SUCURSAL = `${VENTAS_COLS_CON_DESCUENTO},sucursal_id,sucursal:sucursal_id(nombre)`;
const VENTAS_ITEMS_COLS = "venta_id,producto_id,producto_nombre,sku,cantidad,precio_venta_original,precio_venta,tipo_iva,subtotal,monto_iva,total_linea,es_sin_cargo,motivo_sin_cargo,costo_promocional_total";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    // Sucursal scoping: Karen quiere que cada sucursal tenga su propia
    // caja independiente. Los cajeros solo ven las ventas de SU sucursal
    // (auth.sucursal_id). Los administradores pueden ver todas, y pueden
    // opcionalmente restringir con ?sucursal_id=... desde el frontend.
    const url = new URL(request.url);
    const querySucursalId = url.searchParams.get("sucursal_id");
    const authRol = await getAuthWithRol(request);
    const esAdmin = isAdmin(authRol);
    const sucursalFiltro = esAdmin
      ? (querySucursalId && querySucursalId.trim() ? querySucursalId.trim() : null)
      : (ctx.auth.sucursal_id ?? null);

    // Cadena de fallback: sucursal+anulacion → solo anulacion → mínimo.
    // Si sucursalFiltro es null, no aplicamos ningun filtro extra (ver todo).
    // Cuando el usuario NO es admin y NO tiene sucursal_id (ambos null),
    // conservamos el comportamiento historico de ver todas — hay tenants
    // como Joyeria donde los usuarios sin sucursal fija ven la empresa
    // entera.
    const attempts = [VENTAS_COLS_CON_SUCURSAL, VENTAS_COLS_CON_DESCUENTO, VENTAS_COLS_ANULACION, VENTAS_COLS_MIN];
    let ventasRes: Awaited<ReturnType<typeof postgrestGet<VentaRow>>> | null = null;
    let lastError: unknown = null;
    for (const cols of attempts) {
      const qs = new URLSearchParams({
        select: cols,
        empresa_id: `eq.${empresaId}`,
        order: "fecha.desc",
        limit: "500",
      });
      if (sucursalFiltro) qs.set("sucursal_id", `eq.${sucursalFiltro}`);
      const res = await postgrestGet<VentaRow>("ventas", qs.toString(), { role: "jwt", jwt, noStore: true });
      if (res.ok) { ventasRes = res; break; }
      // Si el fallback es al MIN (sin sucursal_id) y estabamos filtrando,
      // no podemos filtrar => devolvemos vacio en vez de mezclar sucursales.
      lastError = res.error;
    }
    if (!ventasRes) {
      console.error("[/api/ventas GET] ventas", lastError);
      return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 502 });
    }

    const itemsQ = new URLSearchParams({
      select: VENTAS_ITEMS_COLS,
      empresa_id: `eq.${empresaId}`,
    });
    const itemsRes = await postgrestGet<VentaItemRow>("ventas_items", itemsQ.toString(), { role: "jwt", jwt, noStore: true });
    if (!itemsRes.ok) {
      console.error("[/api/ventas GET] items", itemsRes.error);
      return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 502 });
    }

    const byVenta = new Map<string, VentaItemRow[]>();
    for (const row of itemsRes.rows) {
      const list = byVenta.get(row.venta_id) ?? [];
      list.push(row);
      byVenta.set(row.venta_id, list);
    }

    // Resolver nombres de cliente por cliente_id (query aparte para no
    // depender del join en la cadena de fallback de columnas).
    const clienteIds = [...new Set(
      ventasRes.rows.map((r) => r.cliente_id).filter((x): x is string => typeof x === "string" && x.length > 0),
    )];
    const nombreByCliente = new Map<string, string>();
    if (clienteIds.length > 0) {
      const cq = new URLSearchParams({
        select: "id,empresa,nombre_contacto,nombre",
        empresa_id: `eq.${empresaId}`,
        id: `in.(${clienteIds.join(",")})`,
      });
      const cRes = await postgrestGet<{ id: string; empresa: string | null; nombre_contacto: string | null; nombre: string | null }>(
        "clientes", cq.toString(), { role: "jwt", jwt, noStore: true },
      );
      if (cRes.ok) {
        for (const c of cRes.rows) {
          const nom = (c.empresa && c.empresa.trim())
            || (c.nombre_contacto && c.nombre_contacto.trim())
            || (c.nombre && c.nombre.trim())
            || "";
          if (nom) nombreByCliente.set(c.id, nom);
        }
      }
    }

    const ventas: Venta[] = ventasRes.rows.map((r) => {
      const lineRows = byVenta.get(r.id) ?? [];
      return {
        id: r.id,
        numero_control: r.numero_control,
        cliente_id: r.cliente_id ?? null,
        cliente_nombre: r.cliente_id ? (nombreByCliente.get(r.cliente_id) ?? null) : null,
        items: mapItems(lineRows),
        moneda: r.moneda === "USD" ? "USD" : "GS",
        tipo_cambio: num(r.tipo_cambio),
        subtotal: num(r.subtotal),
        monto_iva: num(r.monto_iva),
        total: num(r.total),
        tipo_venta: r.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        plazo_dias: r.plazo_dias ?? undefined,
        fecha: r.fecha,
        estado: (r.estado ?? "completada") as "pendiente" | "completada" | "anulada",
        anulada_at: r.anulada_at ?? null,
        anulacion_motivo: r.anulacion_motivo ?? null,
        metodo_pago: (r.metodo_pago ?? undefined) as import("@/lib/ventas/types").MetodoPago | undefined,
        descuento_general: r.descuento_general != null ? num(r.descuento_general) : null,
        descuento_motivo: r.descuento_motivo ?? null,
        sucursal_id: r.sucursal_id ?? null,
        sucursal_nombre: r.sucursal?.nombre ?? null,
      };
    });

    return NextResponse.json(successResponse({ ventas }));
  } catch (err) {
    console.error("[/api/ventas GET] uncaught", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 500 });
  }
}
