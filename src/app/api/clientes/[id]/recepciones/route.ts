import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { crearRecepcionPg, type RecepcionItemInput } from "@/lib/recepciones/server/recepciones-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";

const RECEP_COLS = "id,numero_control,fecha,total_credito,observaciones,estado,sucursal_id,created_by,usuario_nombre";
const RECEP_ITEMS_COLS = "id,recepcion_id,producto_id,producto_nombre,sku,cantidad,precio_unitario,subtotal";

function parseItems(body: unknown): RecepcionItemInput[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RecepcionItemInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const cantidad = Number(r.cantidad);
    const precio = Number(r.precio_unitario);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
    if (!Number.isFinite(precio) || precio < 0) return null;
    out.push({
      producto_id: String(r.producto_id ?? ""),
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad,
      precio_unitario: precio,
      subtotal: Number(r.subtotal) || cantidad * precio,
    });
  }
  if (out.some((i) => !i.producto_id)) return null;
  return out;
}

/**
 * GET /api/clientes/[id]/recepciones — histórico de recepciones del cliente.
 */
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

/**
 * POST /api/clientes/[id]/recepciones — registra una recepción de prendas.
 */
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
        errorResponse("Payload inválido: items requeridos con cantidad y precio_unitario."),
        { status: 400 },
      );
    }

    const o = body as Record<string, unknown>;
    const observaciones =
      typeof o.observaciones === "string" ? o.observaciones.slice(0, 4000) : null;
    const totalDeclarado = Number(o.total_credito) || items.reduce((s, i) => s + i.subtotal, 0);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    let sucursalId = auth.sucursal_id ?? null;
    if (!sucursalId) {
      sucursalId = await resolveSucursalIdForUserPg(schema, auth.empresa_id, null);
    }

    const result = await crearRecepcionPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      sucursalId,
      items,
      totalDeclarado,
      observaciones,
      createdBy: auth.user.id ?? null,
      usuarioNombre: null,
    });

    return NextResponse.json(successResponse({ recepcion: result }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al registrar la recepción.";
    console.error("[/api/clientes/[id]/recepciones POST]", msg);
    const status =
      msg.includes("Cliente no encontrado") || msg.includes("items") || msg.includes("total no coincide")
        ? 400
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
