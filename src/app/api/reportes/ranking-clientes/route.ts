import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/ranking-clientes?desde=&hasta=&limit=20
 *
 * Devuelve dos rankings del período:
 *   - top_compradores: los que MÁS gastaron en la tienda (ventas.total).
 *   - top_vendedores:  los que MÁS aportaron mercadería (recepciones.total_compra).
 *   - inactivos:       clientes SIN compras en los últimos 90 días
 *                       pero con historial previo.
 *
 * Scope por empresa; si el usuario tiene sucursal fija, filtra por esa.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const url = new URL(request.url);
  const desde = url.searchParams.get("desde") ?? null;   // yyyy-mm-dd
  const hasta = url.searchParams.get("hasta") ?? null;
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? "20") || 20));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(successResponse({ top_compradores: [], top_vendedores: [], inactivos: [] }));

    const tVentas = quoteSchemaTable(schema, "ventas");
    const tRecep = quoteSchemaTable(schema, "cliente_recepciones");
    const tClientes = quoteSchemaTable(schema, "clientes");

    const sucursalFiltro = auth.sucursal_id ? `AND sucursal_id = '${auth.sucursal_id}'` : "";
    const fechaFiltroV = `${desde ? `AND fecha >= '${desde}'` : ""} ${hasta ? `AND fecha <= '${hasta}'` : ""}`;
    const fechaFiltroR = fechaFiltroV;

    const client = await pool.connect();
    try {
      // Top compradores
      const rc = await client.query<{ cliente_id: string; nombre: string; total: string; cantidad: string }>(
        `SELECT v.cliente_id,
                COALESCE(NULLIF(c.empresa,''), NULLIF(c.nombre_contacto,''), NULLIF(c.nombre,'')) AS nombre,
                SUM(v.total)::text AS total,
                COUNT(*)::text AS cantidad
         FROM ${tVentas} v
         LEFT JOIN ${tClientes} c ON c.id = v.cliente_id
         WHERE v.empresa_id = $1
           AND v.estado != 'anulada'
           ${sucursalFiltro}
           ${fechaFiltroV}
         GROUP BY v.cliente_id, c.empresa, c.nombre_contacto, c.nombre
         ORDER BY SUM(v.total) DESC
         LIMIT $2`,
        [auth.empresa_id, limit],
      );

      // Top vendedores a la tienda (recepciones)
      const rv = await client.query<{ cliente_id: string; nombre: string; total: string; cantidad: string }>(
        `SELECT r.cliente_id,
                COALESCE(NULLIF(c.empresa,''), NULLIF(c.nombre_contacto,''), NULLIF(c.nombre,'')) AS nombre,
                SUM(r.total_compra)::text AS total,
                COUNT(*)::text AS cantidad
         FROM ${tRecep} r
         LEFT JOIN ${tClientes} c ON c.id = r.cliente_id
         WHERE r.empresa_id = $1
           AND r.estado != 'anulada'
           ${sucursalFiltro}
           ${fechaFiltroR}
         GROUP BY r.cliente_id, c.empresa, c.nombre_contacto, c.nombre
         ORDER BY SUM(r.total_compra) DESC
         LIMIT $2`,
        [auth.empresa_id, limit],
      );

      // Inactivos: clientes con última compra hace más de 90 días
      const ri = await client.query<{ cliente_id: string; nombre: string; ultima_compra: string; dias: string }>(
        `SELECT v.cliente_id,
                COALESCE(NULLIF(c.empresa,''), NULLIF(c.nombre_contacto,''), NULLIF(c.nombre,'')) AS nombre,
                MAX(v.fecha)::text AS ultima_compra,
                EXTRACT(EPOCH FROM (now() - MAX(v.fecha)))::int / 86400 AS dias
         FROM ${tVentas} v
         LEFT JOIN ${tClientes} c ON c.id = v.cliente_id
         WHERE v.empresa_id = $1
           AND v.estado != 'anulada'
           ${sucursalFiltro}
         GROUP BY v.cliente_id, c.empresa, c.nombre_contacto, c.nombre
         HAVING MAX(v.fecha) < (now() - interval '90 days')
         ORDER BY MAX(v.fecha) ASC
         LIMIT $2`,
        [auth.empresa_id, limit],
      );

      return NextResponse.json(successResponse({
        top_compradores: rc.rows.map((r) => ({ ...r, total: Number(r.total), cantidad: Number(r.cantidad) })),
        top_vendedores:  rv.rows.map((r) => ({ ...r, total: Number(r.total), cantidad: Number(r.cantidad) })),
        inactivos:       ri.rows.map((r) => ({ ...r, dias: Number(r.dias) })),
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json(successResponse({ top_compradores: [], top_vendedores: [], inactivos: [] }));
    }
    console.error("[reportes/ranking-clientes]", msg);
    return NextResponse.json(errorResponse("No se pudo generar el ranking."), { status: 500 });
  }
}
