import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/sucursales/dia?fecha=YYYY-MM-DD&sucursal_id=...
 *
 * Vista OPERATIVA DIARIA — inspirada en la planilla "YO CRECI DIARIO" de
 * Karen. Muestra la bitácora completa del día de UNA sucursal.
 *
 * Devuelve:
 *   - resumen: KPIs del día (visitas, evaluaciones, ventas, prendas
 *              recibidas, vendidas, stock inicial y final)
 *   - caja_del_dia: desglose por forma de pago (efectivo, transferencia,
 *              tarjeta, qr, billetera, otro) + créditos usados
 *   - operaciones: lista cronológica de todas las operaciones del día
 *              (recepciones + ventas), cada una con hora, cliente, tipo,
 *              monto, cantidad y stock acumulado hasta ese momento
 *
 * Excluye estados anulados.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const fecha = url.searchParams.get("fecha") || todayISO();
    const sucursalRaw = url.searchParams.get("sucursal_id");

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const scopedSucursal = auth.sucursal_id ?? null;
    const sucursalId = esAdmin ? sucursalRaw : scopedSucursal;
    if (!sucursalId) {
      return NextResponse.json(errorResponse("sucursal_id requerido."), { status: 400 });
    }
    // Si tiene sucursal fija, no puede pedir otra.
    if (!esAdmin && sucursalRaw && sucursalRaw !== scopedSucursal) {
      return NextResponse.json(errorResponse("No podés consultar otra sucursal."), { status: 403 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const ventasT = quoteSchemaTable(schema, "ventas");
    const ventasItT = quoteSchemaTable(schema, "ventas_items");
    const pagoDetT = quoteSchemaTable(schema, "ventas_pagos_detalle");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const recepPagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
    const cliT = quoteSchemaTable(schema, "clientes");
    const sucT = quoteSchemaTable(schema, "sucursales");
    const stockT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

    const client = await pool.connect();
    try {
      const args = [auth.empresa_id, sucursalId, fecha];

      // Nombre de la sucursal
      const sucQ = await client.query<{ nombre: string }>(
        `SELECT nombre FROM ${sucT} WHERE id = $1 AND empresa_id = $2`,
        [sucursalId, auth.empresa_id],
      );
      if (!sucQ.rows[0]) return NextResponse.json(errorResponse("Sucursal no encontrada."), { status: 404 });
      const sucursalNombre = sucQ.rows[0].nombre;

      // Operaciones del día (cronológico), con stock running window function
      const opsQ = await client.query<{
        id: string; fecha: string; tipo: string; cliente_nombre: string | null;
        metodo_pago: string | null; forma_pg: string | null;
        monto: string; qtde: string; cambio: string | null;
        stock_running: string;
      }>(
        `WITH ops AS (
           SELECT
             r.id, r.fecha, 'trae'::text AS tipo,
             r.cliente_id,
             COALESCE(c.nombre_contacto, c.empresa, c.nombre) AS cliente_nombre,
             NULL::text AS metodo_pago,
             (SELECT string_agg(DISTINCT p.metodo, '/') FROM ${recepPagosT} p WHERE p.recepcion_id = r.id) AS forma_pg,
             r.total_final::text AS monto,
             COALESCE((SELECT SUM(i.cantidad) FROM ${recepItT} i WHERE i.recepcion_id = r.id), 0)::text AS qtde,
             NULL::text AS cambio,
             r.numero_control
           FROM ${recepT} r
           LEFT JOIN ${cliT} c ON c.id = r.cliente_id
           WHERE r.empresa_id = $1 AND r.sucursal_id = $2
             AND r.estado <> 'anulada'
             AND r.fecha::date = $3
             AND r.cambio_id IS NULL  -- excluye los que vienen con venta linkeada (los cuento con la venta)
           UNION ALL
           SELECT
             v.id, v.fecha,
             CASE WHEN v.cambio_id IS NOT NULL THEN 'trae+lleva' ELSE 'lleva' END AS tipo,
             v.cliente_id,
             COALESCE(c.nombre_contacto, c.empresa, c.nombre) AS cliente_nombre,
             v.metodo_pago,
             (SELECT string_agg(DISTINCT pd.metodo_pago, '/') FROM ${pagoDetT} pd WHERE pd.venta_id = v.id) AS forma_pg,
             v.total::text AS monto,
             COALESCE(-(SELECT SUM(vi.cantidad) FROM ${ventasItT} vi WHERE vi.venta_id = v.id), 0)::text AS qtde,
             CASE WHEN v.cambio_id IS NOT NULL THEN (
               SELECT total_final::text FROM ${recepT} rr WHERE rr.cambio_id = v.cambio_id LIMIT 1
             ) ELSE NULL END AS cambio,
             v.numero_control
           FROM ${ventasT} v
           LEFT JOIN ${cliT} c ON c.id = v.cliente_id
           WHERE v.empresa_id = $1 AND v.sucursal_id = $2
             AND v.estado IN ('pendiente','completada')
             AND v.fecha::date = $3
         )
         SELECT
           ops.id, ops.fecha::text, ops.tipo,
           ops.cliente_nombre,
           ops.metodo_pago, ops.forma_pg,
           ops.monto, ops.qtde, ops.cambio,
           SUM(qtde::numeric) OVER (ORDER BY ops.fecha ASC, ops.id
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::text AS stock_running
         FROM ops
         ORDER BY ops.fecha ASC`,
        args,
      );

      // Caja del día — formas de pago de ventas (ingresos)
      const cajaQ = await client.query<{ metodo: string; total: string; ops: string }>(
        `SELECT pd.metodo_pago AS metodo,
                COALESCE(SUM(pd.monto), 0)::text AS total,
                COUNT(*)::text AS ops
         FROM ${pagoDetT} pd
         JOIN ${ventasT} v ON v.id = pd.venta_id
         WHERE v.empresa_id = $1 AND v.sucursal_id = $2
           AND v.estado IN ('pendiente','completada')
           AND pd.direccion = 'ingreso'
           AND v.fecha::date = $3
         GROUP BY pd.metodo_pago
         ORDER BY SUM(pd.monto) DESC`,
        args,
      );

      // Egresos por recepciones (efectivo/transferencia que se le paga al cliente por su evaluación)
      const egresosQ = await client.query<{ metodo: string; total: string; ops: string }>(
        `SELECT pg.metodo,
                COALESCE(SUM(pg.monto), 0)::text AS total,
                COUNT(*)::text AS ops
         FROM ${recepPagosT} pg
         JOIN ${recepT} r ON r.id = pg.recepcion_id
         WHERE r.empresa_id = $1 AND r.sucursal_id = $2
           AND r.estado <> 'anulada'
           AND pg.direccion = 'egreso'
           AND pg.metodo IN ('efectivo','transferencia')
           AND r.fecha::date = $3
         GROUP BY pg.metodo`,
        args,
      );

      // Créditos usados en ventas del día (SUM SALIDAs origen=venta)
      const credUsadoQ = await client.query<{ total: string; ops: string }>(
        `SELECT COALESCE(SUM(monto), 0)::text AS total, COUNT(*)::text AS ops
         FROM ${credT} m
         WHERE m.empresa_id = $1
           AND m.tipo = 'SALIDA' AND m.origen = 'venta'
           AND m.fecha::date = $3
           AND EXISTS (
             SELECT 1 FROM ${ventasT} v WHERE v.id = m.referencia_id
               AND v.sucursal_id = $2 AND v.estado IN ('pendiente','completada')
           )`,
        args,
      );

      // Créditos generados (ENTRADAs de recepción del día)
      const credGenQ = await client.query<{ total: string; ops: string }>(
        `SELECT COALESCE(SUM(monto), 0)::text AS total, COUNT(*)::text AS ops
         FROM ${credT} m
         WHERE m.empresa_id = $1
           AND m.tipo = 'ENTRADA' AND m.origen = 'recepcion'
           AND m.fecha::date = $3
           AND EXISTS (
             SELECT 1 FROM ${recepT} r WHERE r.id = m.referencia_id
               AND r.sucursal_id = $2 AND r.estado <> 'anulada'
           )`,
        args,
      );

      // Stock final del día = stock actual de la sucursal (los mov de HOY ya están reflejados si fueron ingresados)
      const stockFinalQ = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(stock_actual), 0)::text AS total
         FROM ${stockT} WHERE sucursal_id = $1`,
        [sucursalId],
      );
      // Stock inicial del día = final - (entradas_hoy - salidas_hoy) por items de recep + venta
      const entradasHoyQ = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(i.cantidad), 0)::text AS total
         FROM ${recepItT} i
         JOIN ${recepT} r ON r.id = i.recepcion_id
         WHERE r.empresa_id = $1 AND r.sucursal_id = $2
           AND r.estado = 'ingresada'
           AND r.fecha::date = $3`,
        args,
      );
      const salidasHoyQ = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(vi.cantidad), 0)::text AS total
         FROM ${ventasItT} vi
         JOIN ${ventasT} v ON v.id = vi.venta_id
         WHERE v.empresa_id = $1 AND v.sucursal_id = $2
           AND v.estado IN ('pendiente','completada')
           AND v.fecha::date = $3`,
        args,
      );

      const operaciones = opsQ.rows.map(r => ({
        id: r.id, fecha: r.fecha, tipo: r.tipo,
        cliente: r.cliente_nombre ?? "(sin cliente)",
        forma_pago: r.forma_pg || r.metodo_pago || "—",
        monto: Number(r.monto),
        qtde: Number(r.qtde),
        cambio: r.cambio ? Number(r.cambio) : null,
        stock_running: Number(r.stock_running),
      }));

      const evaluaciones = operaciones.filter(o => o.tipo === "trae" || o.tipo === "trae+lleva").length;
      const ventasSolas = operaciones.filter(o => o.tipo === "lleva").length;
      const trae_lleva = operaciones.filter(o => o.tipo === "trae+lleva").length;
      const prendas_recibidas = operaciones.filter(o => o.tipo === "trae" || o.tipo === "trae+lleva")
        .reduce((s, o) => s + Math.max(0, o.qtde), 0);
      const prendas_vendidas = operaciones.filter(o => o.tipo === "lleva" || o.tipo === "trae+lleva")
        .reduce((s, o) => s + Math.max(0, -o.qtde), 0);
      const ventasTotal = operaciones.filter(o => o.tipo === "lleva" || o.tipo === "trae+lleva")
        .reduce((s, o) => s + o.monto, 0);
      const evaluadoTotal = operaciones.filter(o => o.tipo === "trae")
        .reduce((s, o) => s + o.monto, 0)
        + operaciones.filter(o => o.tipo === "trae+lleva").reduce((s, o) => s + (o.cambio ?? 0), 0);

      const entradasHoy = Number(entradasHoyQ.rows[0]?.total ?? 0);
      const salidasHoy = Number(salidasHoyQ.rows[0]?.total ?? 0);
      const stockFinal = Number(stockFinalQ.rows[0]?.total ?? 0);
      const stockInicial = stockFinal - (entradasHoy - salidasHoy);

      return NextResponse.json(successResponse({
        fecha, sucursal_id: sucursalId, sucursal_nombre: sucursalNombre,
        resumen: {
          operaciones: operaciones.length,
          evaluaciones,
          ventas: ventasSolas + trae_lleva,
          trae_lleva,
          prendas_recibidas,
          prendas_vendidas,
          stock_inicial: stockInicial,
          stock_final: stockFinal,
          ventas_total: ventasTotal,
          evaluado_total: evaluadoTotal,
        },
        caja_del_dia: {
          ingresos: cajaQ.rows.map(r => ({ metodo: r.metodo, total: Number(r.total), ops: Number(r.ops) })),
          egresos: egresosQ.rows.map(r => ({ metodo: r.metodo, total: Number(r.total), ops: Number(r.ops) })),
          credito_generado: Number(credGenQ.rows[0]?.total ?? 0),
          credito_usado: Number(credUsadoQ.rows[0]?.total ?? 0),
        },
        operaciones,
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[dashboard/sucursales/dia]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
