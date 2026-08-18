import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/transacciones-drill?desde=&hasta=
 *
 * Listado UNIFICADO de transacciones con el cliente:
 *   - VENTA   → valor +, cantidad − (salen productos), pagos + (recibimos)
 *   - COMPRA/EVALUACIÓN → valor −, cantidad + (ingresan), pagos − (pagamos)
 *   - CAMBIO  → la venta/recepción tiene cambio_id
 *
 * Columnas: fecha, cliente, teléfono, categoría (vip/nuevo/dormido/activo),
 *   tipo, valor, valor_stock, cantidad, markup%, tarjeta, efectivo,
 *   transferencia, crédito, descuento, beneficio (cashback).
 *
 * Degrada por columnas ausentes (subtotal_evaluado, cambio_id, direccion,
 * descuento_general, es_vip, categoria de creditos).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tVP = quoteSchemaTable(schema, "ventas_pagos_detalle");
    const tR = quoteSchemaTable(schema, "cliente_recepciones");
    const tRI = quoteSchemaTable(schema, "cliente_recepciones_items");
    const tRP = quoteSchemaTable(schema, "cliente_recepciones_pagos");
    const tC = quoteSchemaTable(schema, "clientes");
    const tCr = quoteSchemaTable(schema, "cliente_creditos_movimientos");

    // Detección de columnas opcionales.
    async function cols(table: string): Promise<Set<string>> {
      const r = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`,
        [schema, table],
      );
      return new Set(r.rows.map((x) => x.column_name));
    }
    const vc = await cols("ventas");
    const rc = await cols("cliente_recepciones");
    const vpc = await cols("ventas_pagos_detalle");
    const crc = await cols("cliente_creditos_movimientos");
    const cc = await cols("clientes");

    const vHasDesc = vc.has("descuento_general");
    const vHasCambio = vc.has("cambio_id");
    const rHasCambio = rc.has("cambio_id");
    const rHasSubtotalEv = rc.has("subtotal_evaluado");
    const rHasTotalFinal = rc.has("total_final");
    const vpHasDir = vpc.has("direccion");
    const crHasCat = crc.has("categoria");
    const cHasVip = cc.has("es_vip");

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const params: unknown[] = [auth.empresa_id];
    const dateCond = (col: string) => {
      const parts: string[] = [];
      if (desde) { params.push(desde); parts.push(`${col} >= $${params.length}::timestamptz`); }
      if (hasta) { params.push(hasta); parts.push(`${col} < ($${params.length}::date + interval '1 day')`); }
      return parts.length ? "AND " + parts.join(" AND ") : "";
    };
    // Reutilizamos $1 = empresa_id. Las fechas se agregan por cada rama (mismo array).
    // Como usamos el mismo array para ambas ramas del UNION, construimos las
    // condiciones de fecha una vez y las referenciamos con los índices ya push-eados.
    // Para simplificar: push desde/hasta UNA vez y referenciar.
    // (Reset: rehacemos con índices fijos.)
    params.length = 1;
    let idxDesde = 0, idxHasta = 0;
    if (desde) { params.push(desde); idxDesde = params.length; }
    if (hasta) { params.push(hasta); idxHasta = params.length; }
    const fVentas = [
      desde ? `v.fecha >= $${idxDesde}::timestamptz` : "",
      hasta ? `v.fecha < ($${idxHasta}::date + interval '1 day')` : "",
    ].filter(Boolean).map((s) => `AND ${s}`).join(" ");
    const fRecep = [
      desde ? `r.fecha >= $${idxDesde}::timestamptz` : "",
      hasta ? `r.fecha < ($${idxHasta}::date + interval '1 day')` : "",
    ].filter(Boolean).map((s) => `AND ${s}`).join(" ");
    void dateCond;

    // Signo de pagos de venta (reversas restan).
    const vpSign = vpHasDir ? "(CASE WHEN p.direccion = 'egreso' THEN -1 ELSE 1 END)" : "1";

    // Categoría de cliente (a nivel cliente).
    const catExpr = `
      CASE
        WHEN ${cHasVip ? "COALESCE(c.es_vip,false)" : "false"} THEN 'vip'
        WHEN ult.ultima IS NULL THEN 'nuevo'
        WHEN ult.ultima < now() - interval '90 days' THEN 'dormido'
        ELSE 'activo'
      END`;

    // Beneficio (cashback) por venta: ENTRADAs de cashback que referencian la venta.
    const cbJoinVenta = crHasCat
      ? `LEFT JOIN (
           SELECT referencia_id, SUM(monto) AS cashback
             FROM ${tCr}
            WHERE empresa_id = $1 AND tipo='ENTRADA' AND categoria='cashback' AND referencia_id IS NOT NULL
            GROUP BY referencia_id
         ) cb ON cb.referencia_id = v.id`
      : "";

    const totalFinalExpr = rHasTotalFinal ? "COALESCE(r.total_final, r.total_compra, 0)" : "COALESCE(r.total_compra, 0)";
    const subtotalEvExpr = rHasSubtotalEv ? "COALESCE(r.subtotal_evaluado, 0)" : "0";

    const sql = `
      WITH ult AS (
        SELECT cliente_id, MAX(fecha) AS ultima
          FROM ${tV}
         WHERE empresa_id = $1 AND (estado IS NULL OR estado <> 'anulada') AND cliente_id IS NOT NULL
         GROUP BY cliente_id
      ),
      vpay AS (
        SELECT p.venta_id,
               SUM(CASE WHEN p.metodo_pago='tarjeta'         THEN p.monto*${vpSign} ELSE 0 END) AS tarjeta,
               SUM(CASE WHEN p.metodo_pago='efectivo'        THEN p.monto*${vpSign} ELSE 0 END) AS efectivo,
               SUM(CASE WHEN p.metodo_pago='transferencia'   THEN p.monto*${vpSign} ELSE 0 END) AS transferencia,
               SUM(CASE WHEN p.metodo_pago='credito_cliente' THEN p.monto*${vpSign} ELSE 0 END) AS credito
          FROM ${tVP} p WHERE p.empresa_id = $1
         GROUP BY p.venta_id
      ),
      rpay AS (
        SELECT rp.recepcion_id,
               SUM(CASE WHEN rp.metodo='efectivo'      THEN rp.monto ELSE 0 END) AS efectivo,
               SUM(CASE WHEN rp.metodo='transferencia' THEN rp.monto ELSE 0 END) AS transferencia,
               SUM(CASE WHEN rp.metodo='credito'       THEN rp.monto ELSE 0 END) AS credito
          FROM ${tRP} rp WHERE rp.empresa_id = $1
         GROUP BY rp.recepcion_id
      )
      SELECT * FROM (
        -- ── VENTAS ──
        SELECT
          v.id::text AS id, v.fecha AS fecha,
          ${vHasCambio ? "CASE WHEN v.cambio_id IS NOT NULL THEN 'cambio' ELSE 'venta' END" : "'venta'"} AS tipo,
          v.cliente_id::text AS cliente_id,
          COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
          c.telefono AS telefono,
          ${catExpr} AS categoria,
          COALESCE(v.total,0)::float8 AS valor,
          0::float8 AS valor_stock,
          -COALESCE((SELECT SUM(it.cantidad) FROM ${tVI} it WHERE it.venta_id = v.id),0)::float8 AS cantidad,
          NULL::float8 AS markup,
          COALESCE(vpay.tarjeta,0)::float8 AS tarjeta,
          COALESCE(vpay.efectivo,0)::float8 AS efectivo,
          COALESCE(vpay.transferencia,0)::float8 AS transferencia,
          COALESCE(vpay.credito,0)::float8 AS credito,
          ${vHasDesc ? "-COALESCE(v.descuento_general,0)" : "0"}::float8 AS descuento,
          ${crHasCat ? "COALESCE(cb.cashback,0)" : "0"}::float8 AS beneficio,
          v.numero_control AS numero
        FROM ${tV} v
        LEFT JOIN ${tC} c   ON c.id = v.cliente_id
        LEFT JOIN ult       ON ult.cliente_id = v.cliente_id
        LEFT JOIN vpay      ON vpay.venta_id = v.id
        ${cbJoinVenta}
        WHERE v.empresa_id = $1 AND (v.estado IS NULL OR v.estado <> 'anulada') ${fVentas}

        UNION ALL

        -- ── COMPRAS / EVALUACIONES ──
        SELECT
          r.id::text AS id, r.fecha AS fecha,
          ${rHasCambio ? "CASE WHEN r.cambio_id IS NOT NULL THEN 'cambio' ELSE 'compra' END" : "'compra'"} AS tipo,
          r.cliente_id::text AS cliente_id,
          COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
          c.telefono AS telefono,
          ${catExpr} AS categoria,
          -${totalFinalExpr}::float8 AS valor,
          ${subtotalEvExpr}::float8 AS valor_stock,
          COALESCE((SELECT SUM(it.cantidad) FROM ${tRI} it WHERE it.recepcion_id = r.id),0)::float8 AS cantidad,
          (CASE WHEN ${totalFinalExpr} > 0 THEN round(((${subtotalEvExpr} - ${totalFinalExpr}) / ${totalFinalExpr} * 100)::numeric, 1) ELSE NULL END)::float8 AS markup,
          0::float8 AS tarjeta,
          -COALESCE(rpay.efectivo,0)::float8 AS efectivo,
          -COALESCE(rpay.transferencia,0)::float8 AS transferencia,
          -COALESCE(rpay.credito,0)::float8 AS credito,
          0::float8 AS descuento,
          0::float8 AS beneficio,
          r.numero_control AS numero
        FROM ${tR} r
        LEFT JOIN ${tC} c ON c.id = r.cliente_id
        LEFT JOIN ult     ON ult.cliente_id = r.cliente_id
        LEFT JOIN rpay    ON rpay.recepcion_id = r.id
        WHERE r.empresa_id = $1 AND (r.estado IS NULL OR r.estado <> 'anulada') ${fRecep}
      ) t
      ORDER BY fecha DESC
      LIMIT 4000`;

    const r = await pool.query<Record<string, unknown>>(sql, params);
    return NextResponse.json(successResponse({ transacciones: r.rows }));
  } catch (err) {
    console.error("[/api/reportes/transacciones-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
