import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/compras
 * Filtros: ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD & sucursal_id=uuid
 *
 * Panel de compras y evaluaciones — responde:
 *   - resumen: {
 *       recepciones_count, prendas_total, valor_pagado,
 *       ingresadas_count, prendas_ingresadas, valor_ingresado,
 *       pendientes_count, prendas_pendientes, valor_pendiente,
 *       valor_venta_estimado, markup_promedio_pct,
 *       comparativa_periodo_anterior: { valor_pct, prendas_pct }
 *     }
 *   - por_sucursal: [{ sucursal_id, sucursal_nombre, recepciones, prendas, valor, pendientes }]
 *   - evaluaciones: hasta 200 con drill (cliente, fecha, valor, prendas, estado)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tR = quoteSchemaTable(schema, "cliente_recepciones");
    const tRI = quoteSchemaTable(schema, "cliente_recepciones_items");
    const tP = quoteSchemaTable(schema, "productos");
    const tS = quoteSchemaTable(schema, "sucursales");
    const tC = quoteSchemaTable(schema, "clientes");

    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const defaultDesde = new Date(now); defaultDesde.setDate(defaultDesde.getDate() - 30);
    const desde = sp.get("desde") ?? defaultDesde.toISOString().slice(0, 10);
    const hasta = sp.get("hasta") ?? now.toISOString().slice(0, 10);
    const sucursalIdParam = sp.get("sucursal_id");
    const sucursalId = auth.sucursal_id ?? sucursalIdParam;

    // Período anterior (mismo largo)
    const dLen = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    const desdePrev = new Date(Date.parse(desde) - (dLen + 1) * 86_400_000).toISOString().slice(0, 10);
    const hastaPrev = new Date(Date.parse(desde) - 86_400_000).toISOString().slice(0, 10);

    const sucFilter = sucursalId ? " AND r.sucursal_id = $4::uuid" : "";
    const params: unknown[] = [auth.empresa_id, desde, hasta];
    if (sucursalId) params.push(sucursalId);

    // Resumen agregado
    const resumen = await pool.query<{
      recepciones_count: string; prendas_total: string; valor_pagado: string;
      ingresadas_count: string; prendas_ingresadas: string; valor_ingresado: string;
      pendientes_count: string; prendas_pendientes: string; valor_pendiente: string;
      valor_venta_estimado: string;
    }>(
      `WITH rec AS (
         SELECT r.id, r.estado, r.total_credito, r.sucursal_id, r.fecha
           FROM ${tR} r
          WHERE r.empresa_id = $1
            AND r.fecha::date >= $2::date
            AND r.fecha::date <= $3::date
            AND r.estado <> 'anulada'
            ${sucFilter}
       ),
       items AS (
         SELECT ri.recepcion_id,
                COALESCE(SUM(ri.cantidad),0)                       AS cantidad,
                COALESCE(SUM(ri.cantidad * p.precio_venta),0)      AS valor_venta_estimado
           FROM ${tRI} ri
           LEFT JOIN ${tP} p ON p.id = ri.producto_id
          WHERE ri.empresa_id = $1
            AND ri.recepcion_id IN (SELECT id FROM rec)
          GROUP BY ri.recepcion_id
       )
       SELECT
         COUNT(DISTINCT rec.id)::text                                             AS recepciones_count,
         COALESCE(SUM(items.cantidad),0)::text                                    AS prendas_total,
         COALESCE(SUM(rec.total_credito),0)::text                                 AS valor_pagado,
         COUNT(DISTINCT CASE WHEN rec.estado='ingresada' THEN rec.id END)::text   AS ingresadas_count,
         COALESCE(SUM(CASE WHEN rec.estado='ingresada' THEN items.cantidad ELSE 0 END),0)::text
                                                                                  AS prendas_ingresadas,
         COALESCE(SUM(CASE WHEN rec.estado='ingresada' THEN rec.total_credito ELSE 0 END),0)::text
                                                                                  AS valor_ingresado,
         COUNT(DISTINCT CASE WHEN rec.estado='pendiente_ingreso' THEN rec.id END)::text
                                                                                  AS pendientes_count,
         COALESCE(SUM(CASE WHEN rec.estado='pendiente_ingreso' THEN items.cantidad ELSE 0 END),0)::text
                                                                                  AS prendas_pendientes,
         COALESCE(SUM(CASE WHEN rec.estado='pendiente_ingreso' THEN rec.total_credito ELSE 0 END),0)::text
                                                                                  AS valor_pendiente,
         COALESCE(SUM(items.valor_venta_estimado),0)::text                        AS valor_venta_estimado
       FROM rec
       LEFT JOIN items ON items.recepcion_id = rec.id`,
      params,
    ).catch(() => ({ rows: [{
      recepciones_count: "0", prendas_total: "0", valor_pagado: "0",
      ingresadas_count: "0", prendas_ingresadas: "0", valor_ingresado: "0",
      pendientes_count: "0", prendas_pendientes: "0", valor_pendiente: "0",
      valor_venta_estimado: "0",
    }] }));

    // Comparativa período anterior (solo valor + prendas — barato)
    const paramsPrev: unknown[] = [auth.empresa_id, desdePrev, hastaPrev];
    if (sucursalId) paramsPrev.push(sucursalId);
    const prev = await pool.query<{ valor: string; prendas: string }>(
      `SELECT
         COALESCE(SUM(r.total_credito),0)::text AS valor,
         COALESCE(SUM(ri.cantidad),0)::text     AS prendas
       FROM ${tR} r
       LEFT JOIN ${tRI} ri ON ri.recepcion_id = r.id AND ri.empresa_id = $1
       WHERE r.empresa_id = $1
         AND r.fecha::date >= $2::date AND r.fecha::date <= $3::date
         AND r.estado <> 'anulada'
         ${sucFilter}`,
      paramsPrev,
    ).catch(() => ({ rows: [{ valor: "0", prendas: "0" }] }));

    // Por sucursal
    const porSucursal = await pool.query<{
      sucursal_id: string | null; sucursal_nombre: string | null;
      recepciones: string; prendas: string; valor: string; pendientes: string;
    }>(
      `WITH rec AS (
         SELECT r.id, r.estado, r.total_credito, r.sucursal_id
           FROM ${tR} r
          WHERE r.empresa_id = $1
            AND r.fecha::date >= $2::date AND r.fecha::date <= $3::date
            AND r.estado <> 'anulada'
            ${sucFilter}
       ),
       items AS (
         SELECT ri.recepcion_id, SUM(ri.cantidad) AS cantidad
           FROM ${tRI} ri WHERE ri.empresa_id = $1 GROUP BY ri.recepcion_id
       )
       SELECT rec.sucursal_id::text, s.nombre AS sucursal_nombre,
              COUNT(DISTINCT rec.id)::text                                                  AS recepciones,
              COALESCE(SUM(items.cantidad),0)::text                                         AS prendas,
              COALESCE(SUM(rec.total_credito),0)::text                                      AS valor,
              COUNT(DISTINCT CASE WHEN rec.estado='pendiente_ingreso' THEN rec.id END)::text AS pendientes
         FROM rec
         LEFT JOIN items ON items.recepcion_id = rec.id
         LEFT JOIN ${tS} s ON s.id = rec.sucursal_id
        GROUP BY rec.sucursal_id, s.nombre
        ORDER BY valor DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ sucursal_id: string | null; sucursal_nombre: string | null; recepciones: string; prendas: string; valor: string; pendientes: string }> }));

    // Lista de evaluaciones (drill)
    const evaluaciones = await pool.query<{
      id: string; numero_control: string; fecha: string; estado: string;
      total_credito: string; cliente_id: string;
      cliente_nombre: string | null; empresa: string | null;
      sucursal_nombre: string | null; usuario_nombre: string | null;
      prendas: string;
    }>(
      `WITH rec AS (
         SELECT r.*
           FROM ${tR} r
          WHERE r.empresa_id = $1
            AND r.fecha::date >= $2::date AND r.fecha::date <= $3::date
            AND r.estado <> 'anulada'
            ${sucFilter}
       ),
       items AS (
         SELECT ri.recepcion_id, SUM(ri.cantidad) AS cantidad
           FROM ${tRI} ri WHERE ri.empresa_id = $1 GROUP BY ri.recepcion_id
       )
       SELECT rec.id, rec.numero_control, rec.fecha, rec.estado,
              rec.total_credito::text, rec.cliente_id::text,
              c.nombre_contacto AS cliente_nombre, c.empresa,
              s.nombre AS sucursal_nombre, rec.usuario_nombre,
              COALESCE(items.cantidad,0)::text AS prendas
         FROM rec
         LEFT JOIN items ON items.recepcion_id = rec.id
         LEFT JOIN ${tC} c ON c.id = rec.cliente_id
         LEFT JOIN ${tS} s ON s.id = rec.sucursal_id
        ORDER BY rec.fecha DESC
        LIMIT 200`,
      params,
    ).catch(() => ({ rows: [] as Array<{ id: string; numero_control: string; fecha: string; estado: string; total_credito: string; cliente_id: string; cliente_nombre: string | null; empresa: string | null; sucursal_nombre: string | null; usuario_nombre: string | null; prendas: string }> }));

    // Cálculos derivados
    const r = resumen.rows[0];
    const valorPagado = Number(r.valor_pagado);
    const valorVentaEst = Number(r.valor_venta_estimado);
    const markupPromedio = valorPagado > 0 ? ((valorVentaEst - valorPagado) / valorPagado) * 100 : 0;

    const valorPrev = Number(prev.rows[0]?.valor ?? 0);
    const prendasPrev = Number(prev.rows[0]?.prendas ?? 0);
    const valorPct = valorPrev > 0 ? Math.round(((valorPagado - valorPrev) / valorPrev) * 1000) / 10 : null;
    const prendasPct = prendasPrev > 0 ? Math.round(((Number(r.prendas_total) - prendasPrev) / prendasPrev) * 1000) / 10 : null;

    return NextResponse.json(successResponse({
      periodo: { desde, hasta },
      resumen: {
        recepciones_count: Number(r.recepciones_count),
        prendas_total: Number(r.prendas_total),
        valor_pagado: valorPagado,
        ingresadas_count: Number(r.ingresadas_count),
        prendas_ingresadas: Number(r.prendas_ingresadas),
        valor_ingresado: Number(r.valor_ingresado),
        pendientes_count: Number(r.pendientes_count),
        prendas_pendientes: Number(r.prendas_pendientes),
        valor_pendiente: Number(r.valor_pendiente),
        valor_venta_estimado: valorVentaEst,
        markup_promedio_pct: Math.round(markupPromedio * 10) / 10,
        comparativa_periodo_anterior: {
          valor_prev: valorPrev,
          prendas_prev: prendasPrev,
          valor_pct: valorPct,
          prendas_pct: prendasPct,
        },
      },
      por_sucursal: porSucursal.rows.map((s) => ({
        sucursal_id: s.sucursal_id,
        sucursal_nombre: s.sucursal_nombre ?? "Sin sucursal",
        recepciones: Number(s.recepciones),
        prendas: Number(s.prendas),
        valor: Number(s.valor),
        pendientes: Number(s.pendientes),
      })),
      evaluaciones: evaluaciones.rows.map((e) => ({
        id: e.id,
        numero_control: e.numero_control,
        fecha: e.fecha,
        estado: e.estado,
        total_credito: Number(e.total_credito),
        cliente_id: e.cliente_id,
        cliente_nombre: e.empresa || e.cliente_nombre || "Cliente",
        sucursal_nombre: e.sucursal_nombre,
        usuario_nombre: e.usuario_nombre,
        prendas: Number(e.prendas),
      })),
    }));
  } catch (err) {
    console.error("[/api/dashboard/compras GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
