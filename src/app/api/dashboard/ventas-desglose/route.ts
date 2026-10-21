import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/ventas-desglose?desde&hasta
 *
 * Devuelve `sucursales[]` con el mismo detalle de la sección "Ventas —
 * detalle" que antes vivía globalmente en el dash de Sucursales, pero
 * dividido POR SUCURSAL:
 *
 *   - ventas (total), cantidad, prendas, ticket_promedio, prendas_por_venta
 *   - costo_total, margen_bruto, margen_pct
 *   - promociones, cashback_total, descuento_total, beneficios_entregados
 *   - cambios, anulaciones_venta, anulaciones_recep
 *   - pagos: [{ metodo, ops, total }]
 *
 * Rango por defecto: últimos 30 días. Respeta sucursal fija del usuario.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || todayMinus(30);
    const hasta = url.searchParams.get("hasta") || todayISO();

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const sucScope = esAdmin ? null : (auth.sucursal_id ?? null);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const sucT = quoteSchemaTable(schema, "sucursales");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const ventasItT = quoteSchemaTable(schema, "ventas_items");
    const pagoDetT = quoteSchemaTable(schema, "ventas_pagos_detalle");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const cambiosT = quoteSchemaTable(schema, "cambios");
    const promoAplT = quoteSchemaTable(schema, "promocion_aplicaciones");
    const eventosT = quoteSchemaTable(schema, "cliente_eventos");

    const client = await pool.connect();
    try {
      const scopeArgs: unknown[] = [auth.empresa_id];
      const sucCond = sucScope ? "AND s.id = $2" : "";
      if (sucScope) scopeArgs.push(sucScope);

      // Sucursales base. Incluye moneda (PYG/BRL/USD/ARS) para que el
      // frontend formatee cada card con su símbolo/locale. La columna
      // puede no existir en schemas viejos → COALESCE + fallback.
      const sucQ = await client.query<{ id: string; nombre: string; moneda: string }>(
        `SELECT s.id::text AS id, s.nombre, COALESCE(s.moneda, 'PYG') AS moneda
         FROM ${sucT} s
         WHERE s.empresa_id = $1 AND COALESCE(s.activo, true) = true ${sucCond}
         ORDER BY s.nombre`,
        scopeArgs,
      ).catch(async () => {
        // Fallback: schema sin columna 'moneda' → devolver 'PYG' fijo.
        const r = await client.query<{ id: string; nombre: string }>(
          `SELECT s.id::text AS id, s.nombre
           FROM ${sucT} s
           WHERE s.empresa_id = $1 AND COALESCE(s.activo, true) = true ${sucCond}
           ORDER BY s.nombre`,
          scopeArgs,
        );
        return { ...r, rows: r.rows.map(x => ({ ...x, moneda: 'PYG' })) };
      });

      const args: unknown[] = [auth.empresa_id, desde, hasta];

      // Ventas base + costo + margen por sucursal.
      const ventasQ = await client.query<{
        sucursal_id: string;
        cantidad: string; total: string; prendas: string;
        costo_total: string; anuladas: string;
        total_con_detalle: string; sin_detalle: string;
      }>(
        `WITH v AS (
           SELECT ve.*,
                  (SELECT COALESCE(SUM(vi.cantidad),0)
                     FROM ${ventasItT} vi WHERE vi.venta_id = ve.id) AS u_prendas,
                  (SELECT COALESCE(SUM(vi.cantidad * vi.costo_unitario_snapshot),0)
                     FROM ${ventasItT} vi WHERE vi.venta_id = ve.id) AS u_costo,
                  EXISTS (SELECT 1 FROM ${ventasItT} vi WHERE vi.venta_id = ve.id) AS u_tiene_detalle
             FROM ${ventasT} ve
            WHERE ve.empresa_id = $1
              AND ve.fecha::date BETWEEN $2 AND $3
         )
         SELECT
           v.sucursal_id::text AS sucursal_id,
           COUNT(*)::text AS cantidad,
           COALESCE(SUM(CASE WHEN v.estado IN ('pendiente','completada') THEN v.total ELSE 0 END), 0)::text AS total,
           COALESCE(SUM(v.u_prendas), 0)::text AS prendas,
           COALESCE(SUM(v.u_costo), 0)::text AS costo_total,
           COUNT(*) FILTER (WHERE v.estado = 'anulada')::text AS anuladas,
           -- Base comparable del margen: solo lo que tiene detalle cargado.
           COALESCE(SUM(CASE WHEN v.u_tiene_detalle AND v.estado IN ('pendiente','completada')
                             THEN v.total ELSE 0 END), 0)::text AS total_con_detalle,
           COUNT(*) FILTER (WHERE NOT v.u_tiene_detalle)::text AS sin_detalle
         FROM v
         GROUP BY v.sucursal_id`,
        args,
      );

      // Promociones aplicadas.
      const promoQ = await client.query<{
        sucursal_id: string; cantidad: string; cashback: string; descuento: string;
      }>(
        `SELECT
           pa.sucursal_id::text AS sucursal_id,
           COUNT(*)::text AS cantidad,
           COALESCE(SUM(pa.cashback_generado), 0)::text AS cashback,
           COALESCE(SUM(pa.descuento_aplicado), 0)::text AS descuento
         FROM ${promoAplT} pa
         WHERE pa.empresa_id = $1
           AND pa.created_at::date BETWEEN $2 AND $3
         GROUP BY pa.sucursal_id`,
        args,
      );

      // Cambios (por si maneja cambios). El schema puede no tener sucursal
      // en cambios; usamos venta_original_id para inferir.
      const cambiosQ = await client.query<{ sucursal_id: string; cantidad: string }>(
        `SELECT v.sucursal_id::text AS sucursal_id, COUNT(*)::text AS cantidad
         FROM ${cambiosT} c
         JOIN ${ventasT} v ON v.id = c.venta_original_id
         WHERE c.empresa_id = $1
           AND c.fecha::date BETWEEN $2 AND $3
         GROUP BY v.sucursal_id`,
        args,
      ).catch(() => ({ rows: [] as { sucursal_id: string; cantidad: string }[] }));

      // Recepciones anuladas.
      const recAnulQ = await client.query<{ sucursal_id: string; cantidad: string }>(
        `SELECT sucursal_id::text AS sucursal_id, COUNT(*)::text AS cantidad
         FROM ${recepT}
         WHERE empresa_id = $1
           AND fecha::date BETWEEN $2 AND $3
           AND estado = 'anulada'
         GROUP BY sucursal_id`,
        args,
      );

      // Beneficios entregados (eventos vinculados a venta).
      const benefQ = await client.query<{ sucursal_id: string; cantidad: string }>(
        `SELECT v.sucursal_id::text AS sucursal_id, COUNT(*)::text AS cantidad
         FROM ${eventosT} e
         JOIN ${ventasT} v ON v.id = e.referencia_id
         WHERE e.empresa_id = $1
           AND e.referencia_tipo = 'venta'
           AND e.created_at::date BETWEEN $2 AND $3
         GROUP BY v.sucursal_id`,
        args,
      ).catch(() => ({ rows: [] as { sucursal_id: string; cantidad: string }[] }));

      // Formas de pago por sucursal. La tabla usa metodo_pago (no metodo)
      // y ya tiene sucursal_id, así que preferimos ese al de la venta.
      const pagosQ = await client.query<{
        sucursal_id: string; metodo: string; ops: string; total: string;
      }>(
        `SELECT
           pd.sucursal_id::text AS sucursal_id,
           COALESCE(pd.metodo_pago, 'sin_metodo') AS metodo,
           COUNT(*)::text AS ops,
           COALESCE(SUM(pd.monto), 0)::text AS total
         FROM ${pagoDetT} pd
         JOIN ${ventasT} v ON v.id = pd.venta_id
         WHERE pd.empresa_id = $1
           AND v.fecha::date BETWEEN $2 AND $3
           AND v.estado IN ('pendiente','completada')
         GROUP BY pd.sucursal_id, pd.metodo_pago
         ORDER BY pd.sucursal_id, SUM(pd.monto) DESC`,
        args,
      );

      // Ensamblado
      type VentaRow = { sucursal_id: string; cantidad: string; total: string; prendas: string; costo_total: string; anuladas: string; total_con_detalle: string; sin_detalle: string };
      type PromoRow = { sucursal_id: string; cantidad: string; cashback: string; descuento: string };
      type CountRow = { sucursal_id: string; cantidad: string };
      type PagoRow = { sucursal_id: string; metodo: string; ops: string; total: string };
      const ventasMap = new Map<string, VentaRow>(ventasQ.rows.map(r => [r.sucursal_id, r]));
      const promoMap = new Map<string, PromoRow>(promoQ.rows.map(r => [r.sucursal_id, r]));
      const cambiosMap = new Map<string, CountRow>(cambiosQ.rows.map(r => [r.sucursal_id, r]));
      const recAnulMap = new Map<string, CountRow>(recAnulQ.rows.map(r => [r.sucursal_id, r]));
      const benefMap = new Map<string, CountRow>(benefQ.rows.map(r => [r.sucursal_id, r]));
      const pagosMap = new Map<string, PagoRow[]>();
      for (const p of pagosQ.rows) {
        const list = pagosMap.get(p.sucursal_id) ?? [];
        list.push(p);
        pagosMap.set(p.sucursal_id, list);
      }

      const sucursales = sucQ.rows.map(s => {
        const v = ventasMap.get(s.id);
        const p = promoMap.get(s.id);
        const total = Number(v?.total ?? 0);
        const cantidad = Number(v?.cantidad ?? 0);
        const prendas = Number(v?.prendas ?? 0);
        const costo = Number(v?.costo_total ?? 0);
        // El margen se mide SOLO sobre las ventas que tienen detalle de
        // líneas. Las importadas (cabecera sin ítems) no tienen costo, y
        // metidas en la cuenta daban "margen 100%": el total entero parecía
        // ganancia. Si no hay ninguna venta con detalle, el margen es null
        // (la pantalla muestra —) en vez de un número inventado.
        const totalConDetalle = Number(v?.total_con_detalle ?? 0);
        const sinDetalle = Number(v?.sin_detalle ?? 0);
        const margen = totalConDetalle - costo;
        const margenPct = totalConDetalle > 0
          ? Math.round((margen / totalConDetalle) * 1000) / 10
          : null;
        const ticketProm = cantidad > 0 ? Math.round(total / cantidad) : 0;
        const prendasPorVenta = cantidad > 0 ? Math.round((prendas / cantidad) * 10) / 10 : null;
        return {
          sucursal_id: s.id,
          nombre: s.nombre,
          moneda: s.moneda,
          ventas: {
            cantidad,
            total,
            prendas,
            ticket_promedio: ticketProm,
            prendas_por_venta: prendasPorVenta,
            costo_total: costo,
            margen_bruto: margen,
            margen_pct: margenPct,
            /** Ventas del período sin líneas cargadas (importadas). */
            ventas_sin_detalle: sinDetalle,
            /** Base sobre la que se calculó el margen. */
            total_con_detalle: totalConDetalle,
            promociones_aplicadas: Number(p?.cantidad ?? 0),
            cashback_total: Number(p?.cashback ?? 0),
            descuento_total: Number(p?.descuento ?? 0),
            beneficios_entregados: Number(benefMap.get(s.id)?.cantidad ?? 0),
            cambios: Number(cambiosMap.get(s.id)?.cantidad ?? 0),
            anulaciones_venta: Number(v?.anuladas ?? 0),
            anulaciones_recep: Number(recAnulMap.get(s.id)?.cantidad ?? 0),
            pagos: (pagosMap.get(s.id) ?? []).map(x => ({
              metodo: x.metodo,
              ops: Number(x.ops),
              total: Number(x.total),
            })),
          },
        };
      });

      return NextResponse.json(successResponse({ desde, hasta, sucursales }));
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function todayMinus(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
