/**
 * Anulación transaccional de venta para pronimerp.
 *
 * Reversión completa:
 *   - Estado venta → 'anulada'.
 *   - Restaura stock por sucursal (INSERT movimiento AJUSTE reversal).
 *   - Reversa consumo FIFO de crédito (SALIDA → contra-ENTRADA por asiento,
 *     preservando append-only en los movimientos originales).
 *   - Genera egreso de caja si la venta había registrado ingreso efectivo.
 *   - Marca CxC como 'anulado' si aplicaba.
 *   - Evento historial.
 * Todo dentro de una sola transacción.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export interface AnularVentaInput {
  schema: string;
  empresaId: string;
  ventaId: string;
  motivo: string | null;
  actorId: string | null;
  actorNombre: string | null;
}

export interface VentaAnulada {
  ventaId: string;
  numeroControl: string;
  estado: "anulada";
}

export async function anularVentaPg(p: AnularVentaInput): Promise<VentaAnulada> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const ventasT = quoteSchemaTable(schema, "ventas");
  const itemsT = quoteSchemaTable(schema, "ventas_items");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const cxcT = quoteSchemaTable(schema, "cuentas_por_cobrar");
  const cajaMovT = quoteSchemaTable(schema, "caja_movimientos");
  const cajasT = quoteSchemaTable(schema, "cajas");
  const eventosT = quoteSchemaTable(schema, "cliente_eventos");
  const pagosDetT = quoteSchemaTable(schema, "ventas_pagos_detalle");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cab = await client.query<{
      id: string;
      numero_control: string;
      estado: string;
      cliente_id: string;
      sucursal_id: string;
      total: string;
      caja_id: string | null;
    }>(
      `SELECT id, numero_control, estado, cliente_id, sucursal_id, total::text, caja_id
       FROM ${ventasT}
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    if (!cab.rows.length) throw new Error("Venta no encontrada.");
    const v = cab.rows[0];
    if (v.estado === "anulada") throw new Error("La venta ya está anulada.");

    // Advisory lock crédito si la venta usó crédito
    await client.query(
      `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
      [p.empresaId, v.cliente_id],
    );

    // Reversar consumo FIFO: buscar SALIDA de crédito ligada a esta venta
    const salida = await client.query<{ id: string; monto: string }>(
      `SELECT id, monto FROM ${creditosT}
        WHERE empresa_id = $1 AND cliente_id = $2
          AND origen = 'venta' AND referencia_id = $3 AND tipo = 'SALIDA'`,
      [p.empresaId, v.cliente_id, p.ventaId],
    );
    for (const row of salida.rows) {
      await client.query(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1, $2, 'ENTRADA', $3, 'ajuste_manual', $4,
                   'venta_anulacion', $5, $6, $7, $8)`,
        [
          p.empresaId,
          v.cliente_id,
          Number(row.monto),
          p.ventaId,
          v.numero_control,
          `Reversión de crédito por anulación de venta ${v.numero_control}` +
            (p.motivo ? ` — ${p.motivo}` : ""),
          p.actorId,
          p.actorNombre,
        ],
      );
    }

    // Reversar stock: por cada item, +cantidad en la sucursal + movimiento AJUSTE
    const its = await client.query<{
      producto_id: string;
      producto_nombre: string;
      sku: string;
      cantidad: string;
      costo_unitario_snapshot: string | null;
    }>(
      `SELECT producto_id, producto_nombre, sku, cantidad, costo_unitario_snapshot
       FROM ${itemsT}
       WHERE venta_id = $1 AND empresa_id = $2`,
      [p.ventaId, p.empresaId],
    );
    for (const it of its.rows) {
      const qty = Number(it.cantidad);
      await client.query(
        `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (producto_id, sucursal_id) DO UPDATE
           SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
               updated_at = now()`,
        [it.producto_id, v.sucursal_id, qty],
      );
      await client.query(
        `INSERT INTO ${movT} (
           empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, costo_unitario, origen, referencia, fecha,
           venta_id, created_by, usuario_nombre
         ) VALUES ($1, $2, $3, $4, 'AJUSTE', $5, $6, 'ajuste_manual', $7, now(),
                   $8, $9, $10)`,
        [
          p.empresaId,
          it.producto_id,
          it.producto_nombre,
          it.sku,
          qty,
          Number(it.costo_unitario_snapshot ?? 0),
          `Anulación venta ${v.numero_control}`,
          p.ventaId,
          p.actorId,
          p.actorNombre,
        ],
      );
    }

    // Reversar caja: si hubo pagos en efectivo en esta venta, egreso compensatorio
    const efectivoTotalQ = await client.query<{ tot: string | null }>(
      `SELECT COALESCE(SUM(monto), 0)::text AS tot
       FROM ${pagosDetT}
       WHERE venta_id = $1 AND metodo_pago = 'efectivo'`,
      [p.ventaId],
    );
    const efectivoTotal = Number(efectivoTotalQ.rows[0]?.tot ?? 0);
    if (efectivoTotal > 0) {
      // Buscar caja abierta en la sucursal; si la original sigue abierta, usarla
      let cajaTarget = v.caja_id;
      const abierta = await client.query<{ id: string }>(
        `SELECT id FROM ${cajasT} WHERE id = $1 AND estado = 'abierta'`,
        [v.caja_id],
      );
      if (!abierta.rows.length) {
        const otra = await client.query<{ id: string }>(
          `SELECT id FROM ${cajasT}
           WHERE empresa_id = $1 AND sucursal_id = $2 AND estado = 'abierta'
           LIMIT 1`,
          [p.empresaId, v.sucursal_id],
        );
        cajaTarget = otra.rows[0]?.id ?? null;
      }
      if (!cajaTarget) {
        throw new Error(
          "No hay caja abierta en la sucursal para revertir el ingreso efectivo. Abrí una caja antes de anular.",
        );
      }
      await client.query(
        `INSERT INTO ${cajaMovT} (
           empresa_id, caja_id, tipo, concepto, monto, medio_pago,
           usuario_id, observacion
         ) VALUES ($1, $2, 'egreso', $3, $4, 'efectivo', $5, $6)`,
        [
          p.empresaId,
          cajaTarget,
          `Reversión anulación venta ${v.numero_control}`,
          efectivoTotal,
          p.actorId,
          p.motivo ?? null,
        ],
      );
    }

    // Anular CxC si existía
    await client.query(
      `UPDATE ${cxcT}
          SET estado = 'anulado', saldo = 0, updated_at = now()
        WHERE venta_id = $1 AND empresa_id = $2 AND estado <> 'anulado'`,
      [p.ventaId, p.empresaId],
    );

    // Cambio estado venta
    await client.query(
      `UPDATE ${ventasT}
          SET estado = 'anulada',
              observaciones = COALESCE(observaciones,'') ||
                ' [ANULADA ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ']' ||
                COALESCE(' motivo: ' || $3, '')
        WHERE id = $1 AND empresa_id = $2`,
      [p.ventaId, p.empresaId, p.motivo],
    );

    // Evento
    try {
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1, $2, 'otro', 'Venta anulada', $3,
                   'venta', $4, $5, $6, $7)`,
        [
          p.empresaId,
          v.cliente_id,
          `Venta ${v.numero_control} anulada.` + (p.motivo ? ` Motivo: ${p.motivo}` : ""),
          p.ventaId,
          v.numero_control,
          p.actorId,
          p.actorNombre,
        ],
      );
    } catch {
      /* opcional */
    }

    await client.query("COMMIT");
    return {
      ventaId: v.id,
      numeroControl: v.numero_control,
      estado: "anulada",
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
