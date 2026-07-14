import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  crearRecepcionPg,
  type RecepcionItemInput,
  type RecepcionPagoInput,
} from "@/lib/recepciones/server/recepciones-pg";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

const RECEP_COLS =
  "id,numero_control,fecha,total_credito,observaciones,estado,sucursal_id," +
  "cambio_id,ingresada_at,ingresada_by_nombre,anulada_at,anulada_by_nombre,anulacion_motivo," +
  "created_by,usuario_nombre";
const RECEP_ITEMS_COLS =
  "id,recepcion_id,producto_id,producto_nombre,sku,cantidad," +
  "precio_compra_unitario,precio_venta_snapshot,subtotal,margen_bruto_pct," +
  "costo_historico_incompleto";

function parseItems(body: unknown): RecepcionItemInput[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RecepcionItemInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const cantidad = Number(r.cantidad);
    const precioCompra = Number(r.precio_compra_unitario);
    const precioVenta = Number(r.precio_venta_snapshot);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
    if (!Number.isFinite(precioCompra) || precioCompra < 0) return null;
    if (!Number.isFinite(precioVenta) || precioVenta <= 0) return null;
    out.push({
      producto_id: String(r.producto_id ?? ""),
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad,
      precio_compra_unitario: precioCompra,
      precio_venta_snapshot: precioVenta,
    });
  }
  if (out.some((i) => !i.producto_id)) return null;
  return out;
}

function parsePagos(body: unknown): RecepcionPagoInput[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { pagos?: unknown }).pagos;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RecepcionPagoInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const metodo = String(r.metodo ?? "");
    if (!["credito", "efectivo", "transferencia"].includes(metodo)) return null;
    const monto = Number(r.monto);
    if (!Number.isFinite(monto) || monto <= 0) return null;
    out.push({
      metodo: metodo as RecepcionPagoInput["metodo"],
      monto,
      entidad_bancaria_id:
        typeof r.entidad_bancaria_id === "string" ? r.entidad_bancaria_id : null,
      entidad_nombre_snapshot:
        typeof r.entidad_nombre_snapshot === "string" ? r.entidad_nombre_snapshot : null,
      referencia: typeof r.referencia === "string" ? r.referencia : null,
      observacion: typeof r.observacion === "string" ? r.observacion : null,
    });
  }
  return out;
}

/**
 * Resuelve la sucursal de forma ESTRICTA en pronimerp:
 *   1) Si el usuario tiene sucursal fija, esa es. Si viene otra en el
 *      body, DEBE coincidir.
 *   2) Si el usuario es admin/global (sin sucursal fija), toma la del
 *      body. Si no viene body.sucursal_id, buscar caja abierta.
 *   3) Si nada resuelve, rechazar.
 */
async function resolverSucursalEstricta(
  empresaId: string,
  sucursalUsuario: string | null,
  sucursalBody: string | null,
  schema: string,
): Promise<string> {
  if (sucursalUsuario) {
    if (sucursalBody && sucursalBody !== sucursalUsuario) {
      throw new Error(
        "Tu usuario está asignado a una sucursal específica; no podés registrar recepciones para otra.",
      );
    }
    return sucursalUsuario;
  }
  if (sucursalBody) return sucursalBody;

  // Fallback controlado: caja abierta (una sola)
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const cajasT = quoteSchemaTable(schema, "cajas");
  const client = await pool.connect();
  try {
    const r = await client.query<{ sucursal_id: string }>(
      `SELECT sucursal_id FROM ${cajasT}
       WHERE empresa_id = $1 AND estado = 'abierta' AND sucursal_id IS NOT NULL
       ORDER BY fecha_apertura DESC LIMIT 2`,
      [empresaId],
    );
    if (r.rows.length === 0) {
      throw new Error(
        "Sucursal requerida: no tenés sucursal asignada y no hay una caja abierta que la determine. Elegí explícitamente sucursal_id en el body.",
      );
    }
    if (r.rows.length > 1) {
      throw new Error(
        "Hay más de una caja abierta; especificá sucursal_id en el body para desambiguar.",
      );
    }
    return r.rows[0].sucursal_id;
  } finally {
    client.release();
  }
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const qs = new URLSearchParams({
      select: RECEP_COLS,
      empresa_id: `eq.${empresaId}`,
      cliente_id: `eq.${clienteId}`,
      order: "fecha.desc",
      limit: "200",
    });
    const rc = await postgrestGet<Record<string, unknown>>(
      "cliente_recepciones",
      qs.toString(),
      { role: "jwt", jwt, noStore: true },
    );
    if (!rc.ok) {
      return NextResponse.json(errorResponse("No se pudieron cargar las recepciones."), { status: 502 });
    }
    const recepciones = rc.rows;
    const ids = recepciones.map((r) => String((r as { id: string }).id));
    let items: Record<string, unknown>[] = [];
    if (ids.length) {
      const qsi = new URLSearchParams({
        select: RECEP_ITEMS_COLS,
        recepcion_id: `in.(${ids.join(",")})`,
      });
      const ri = await postgrestGet<Record<string, unknown>>(
        "cliente_recepciones_items",
        qsi.toString(),
        { role: "jwt", jwt, noStore: true },
      );
      if (ri.ok) items = ri.rows;
    }
    return NextResponse.json(successResponse({ recepciones, items }));
  } catch (err) {
    console.error("[/api/clientes/[id]/recepciones GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const items = parseItems(body);
    if (!items) {
      return NextResponse.json(
        errorResponse("Payload inválido: items requeridos con cantidad, precio_compra_unitario y precio_venta_snapshot."),
        { status: 400 },
      );
    }
    const pagos = parsePagos(body);
    if (!pagos) {
      return NextResponse.json(
        errorResponse("Payload inválido: pagos requeridos con metodo ('credito'|'efectivo'|'transferencia') y monto > 0."),
        { status: 400 },
      );
    }

    const o = body as Record<string, unknown>;
    const observaciones =
      typeof o.observaciones === "string" ? o.observaciones.slice(0, 4000) : null;
    const totalDeclarado = Number(o.total_compra) || items.reduce((s, i) => s + i.cantidad * i.precio_compra_unitario, 0);
    const ingresarAhora = o.ingresar_ahora === true;
    const cambioId = typeof o.cambio_id === "string" ? o.cambio_id : null;
    const sucursalBody = typeof o.sucursal_id === "string" ? o.sucursal_id : null;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const sucursalId = await resolverSucursalEstricta(
      auth.empresa_id,
      auth.sucursal_id ?? null,
      sucursalBody,
      schema,
    );

    const result = await crearRecepcionPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      sucursalId,
      items,
      pagos,
      totalDeclarado,
      observaciones,
      createdBy: auth.user.id ?? null,
      usuarioNombre: null,
      ingresarAhora,
      cambioId,
    });

    return NextResponse.json(successResponse({ recepcion: result }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al registrar la recepción.";
    console.error("[/api/clientes/[id]/recepciones POST]", msg);
    const status =
      msg.includes("Cliente no encontrado") ||
      msg.includes("Sucursal") ||
      msg.includes("total") ||
      msg.includes("pago") ||
      msg.includes("caja")
        ? 400
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
