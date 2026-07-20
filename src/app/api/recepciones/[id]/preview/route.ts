import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/recepciones/[id]/preview
 *
 * Devuelve el detalle de items de una recepción PENDIENTE de ingresar
 * al stock, con:
 *   - por cada item: producto, cantidad, costo (precio_compra_unitario),
 *     precio venta esperado (snapshot al momento de recepción),
 *     margen unitario y margen total esperado.
 *   - totales: costo total, venta total esperada, margen bruto esperado,
 *     margen % esperado.
 *
 * Sirve para que la cajera confirme "sí, ingresar" con vista del margen
 * de ganancia esperado — o cancele si el precio no le cierra.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: recepcionId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const itT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const cliT = quoteSchemaTable(schema, "clientes");
    const sucT = quoteSchemaTable(schema, "sucursales");
    const tiposT = quoteSchemaTable(schema, "tipos_prenda");

    const client = await pool.connect();
    try {
      // Cabecera + validación tenant + scope de sucursal si el user tiene fija
      const cabQ = await client.query<{
        id: string; numero_control: string; fecha: string; estado: string;
        cliente_id: string; sucursal_id: string;
        subtotal_evaluado: string | null; ajuste_evaluacion: string | null; total_final: string | null;
        cliente_nombre: string | null; sucursal_nombre: string;
      }>(
        `SELECT r.id, r.numero_control, r.fecha::text, r.estado,
                r.cliente_id, r.sucursal_id,
                r.subtotal_evaluado::text, r.ajuste_evaluacion::text, r.total_final::text,
                COALESCE(c.nombre_contacto, c.empresa, c.nombre) AS cliente_nombre,
                s.nombre AS sucursal_nombre
         FROM ${recepT} r
         LEFT JOIN ${cliT} c ON c.id = r.cliente_id
         LEFT JOIN ${sucT} s ON s.id = r.sucursal_id
         WHERE r.id = $1 AND r.empresa_id = $2`,
        [recepcionId, auth.empresa_id],
      );
      const cab = cabQ.rows[0];
      if (!cab) return NextResponse.json(errorResponse("Recepción no encontrada."), { status: 404 });

      // Scope de sucursal para usuarios no-admin
      if (auth.sucursal_id && cab.sucursal_id !== auth.sucursal_id) {
        return NextResponse.json(errorResponse("Recepción de otra sucursal."), { status: 403 });
      }

      const itemsQ = await client.query<{
        id: string; producto_id: string; producto_nombre: string; sku: string | null;
        cantidad: string; precio_compra_unitario: string;
        precio_venta_snapshot: string; margen_bruto_pct: string | null;
        tipo_prenda_id: string | null; tipo_nombre: string | null;
      }>(
        `SELECT i.id, i.producto_id, i.producto_nombre, i.sku,
                i.cantidad::text,
                COALESCE(i.precio_compra_unitario, 0)::text AS precio_compra_unitario,
                COALESCE(i.precio_venta_snapshot, 0)::text AS precio_venta_snapshot,
                i.margen_bruto_pct::text,
                i.tipo_prenda_id, t.nombre AS tipo_nombre
         FROM ${itT} i
         LEFT JOIN ${tiposT} t ON t.id = i.tipo_prenda_id
         WHERE i.recepcion_id = $1
         ORDER BY i.precio_venta_snapshot DESC NULLS LAST`,
        [recepcionId],
      );

      const items = itemsQ.rows.map((r) => {
        const cantidad = Number(r.cantidad);
        const costo_unit = Number(r.precio_compra_unitario);
        const venta_unit = Number(r.precio_venta_snapshot);
        const margen_unit = venta_unit - costo_unit;
        const costo_total = cantidad * costo_unit;
        const venta_total = cantidad * venta_unit;
        const margen_total = venta_total - costo_total;
        const margen_pct = venta_unit > 0 ? Math.round((margen_unit / venta_unit) * 1000) / 10 : null;
        return {
          id: r.id,
          producto_id: r.producto_id,
          producto_nombre: r.producto_nombre,
          sku: r.sku,
          tipo_prenda_id: r.tipo_prenda_id,
          tipo_nombre: r.tipo_nombre,
          cantidad,
          costo_unit,
          venta_unit,
          margen_unit,
          margen_pct,
          costo_total,
          venta_total,
          margen_total,
        };
      });

      const totales = items.reduce(
        (acc, it) => ({
          costo: acc.costo + it.costo_total,
          venta: acc.venta + it.venta_total,
          margen: acc.margen + it.margen_total,
          prendas: acc.prendas + it.cantidad,
        }),
        { costo: 0, venta: 0, margen: 0, prendas: 0 },
      );
      const margen_pct = totales.venta > 0
        ? Math.round((totales.margen / totales.venta) * 1000) / 10
        : null;

      return NextResponse.json(successResponse({
        recepcion: {
          id: cab.id,
          numero_control: cab.numero_control,
          fecha: cab.fecha,
          estado: cab.estado,
          cliente_id: cab.cliente_id,
          cliente_nombre: cab.cliente_nombre ?? "(sin cliente)",
          sucursal_id: cab.sucursal_id,
          sucursal_nombre: cab.sucursal_nombre,
          subtotal_evaluado: cab.subtotal_evaluado ? Number(cab.subtotal_evaluado) : null,
          ajuste_evaluacion: cab.ajuste_evaluacion ? Number(cab.ajuste_evaluacion) : 0,
          total_final: cab.total_final ? Number(cab.total_final) : null,
        },
        items,
        totales: {
          prendas: totales.prendas,
          costo_total: Math.round(totales.costo),
          venta_total_esperada: Math.round(totales.venta),
          margen_bruto_esperado: Math.round(totales.margen),
          margen_pct_esperado: margen_pct,
        },
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[/api/recepciones/[id]/preview]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
