/**
 * Anulación transaccional de venta para pronimerp.
 *
 * Reglas (20260811):
 *   - BLOQUEA si la CxC de la venta tiene cobros aplicados y activos.
 *     El bloqueo se hace DENTRO de la misma tx con FOR UPDATE, para que
 *     no pueda aparecer un cobro entre la validación y el UPDATE.
 *   - Reversión completa de:
 *       * Crédito consumido (SALIDA → ENTRADA reversal).
 *       * Stock (movimientos AJUSTE + stock_sucursal).
 *       * Ventas_pagos_detalle: NO se borran (append-only); en su lugar
 *         se registra un pago negativo compensatorio, atribuido a la
 *         MISMA caja abierta si aplica (o error si no hay caja).
 *       * CxC → estado 'anulado', saldo=0.
 *   - NO toca caja_movimientos (esa tabla es solo para ajustes manuales).
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
  const cobrosT = quoteSchemaTable(schema, "cobros_clientes");
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

    // Advisory lock crédito (para serializar con otras operaciones del mismo cliente)
    await client.query(
      `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
      [p.empresaId, v.cliente_id],
    );

    // ── BLOQUEO: si hay cobros_clientes activos, no se puede anular ─
    // FOR UPDATE sobre las CxC de esta venta para evitar carrera con
    // un cobro que se aplique justo entre esta validación y el UPDATE.
    const cxcRows = await client.query<{ id: string; saldo: string }>(
      `SELECT id, saldo::text FROM ${cxcT}
        WHERE venta_id = $1 AND empresa_id = $2
        FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    if (cxcRows.rows.length) {
      const cxcIds = cxcRows.rows.map((r) => r.id);
      const cobrosQ = await client.query<{ c: string; suma: string }>(
        `SELECT COUNT(*)::text AS c, COALESCE(SUM(monto),0)::text AS suma
         FROM ${cobrosT}
         WHERE cuenta_por_cobrar_id = ANY($1::uuid[])`,
        [cxcIds],
      );
      const cantCobros = Number(cobrosQ.rows[0]?.c ?? 0);
      const sumaCobros = Number(cobrosQ.rows[0]?.suma ?? 0);
      if (cantCobros > 0) {
        throw new Error(
          `Esta venta tiene ${cantCobros} cobro(s) aplicado(s) por Gs. ${Math.round(sumaCobros)}. Revierta primero los cobros mediante una operación formal y luego intente anular nuevamente.`,
        );
      }
    }

    // ── Reversar consumo FIFO de crédito ─────────────────────────────
    const salida = await client.query<{ id: string; monto: string }>(
      `SELECT id, monto::text FROM ${creditosT}
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
         ) VALUES ($1,$2,'ENTRADA',$3,'ajuste_manual',$4,'venta_anulacion',$5,$6,$7,$8)`,
        [
          p.empresaId, v.cliente_id, Number(row.monto), p.ventaId,
          v.numero_control,
          `Reversión anulación de venta ${v.numero_control}` + (p.motivo ? ` — ${p.motivo}` : ""),
          p.actorId, p.actorNombre,
        ],
      );
    }

    // ── Reversar stock ───────────────────────────────────────────────
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
         ) VALUES ($1,$2,$3,$4,'AJUSTE',$5,$6,'ajuste_manual',$7,now(),$8,$9,$10)`,
        [
          p.empresaId, it.producto_id, it.producto_nombre, it.sku,
          qty, Number(it.costo_unitario_snapshot ?? 0),
          `Anulación venta ${v.numero_control}`, p.ventaId,
          p.actorId, p.actorNombre,
        ],
      );
    }

    // ── Reversar pagos originales (append-only con direccion) ─────
    // La caja HISTÓRICA no se toca: el pago original queda con
    // direccion='ingreso' en su caja original.
    // Se inserta una fila nueva con direccion='egreso', reversa_de_id
    // apuntando al original, monto positivo, en la CAJA ABIERTA ACTUAL.
    //
    // Validaciones invariantes:
    //   - Solo se revierten pagos originales (direccion='ingreso').
    //   - No se puede revertir dos veces (UNIQUE parcial sobre reversa_de_id).
    //   - No se puede apuntar a una reversión (reversa_de_id.reversa_de_id IS NULL).
    //   - La reversión debe ser de la MISMA venta.
    //   - empresa_id de reversión = empresa_id del original.
    const pagosOriginales = await client.query<{
      id: string; metodo_pago: string; monto: string; caja_id: string | null;
      sucursal_id: string | null; entidad_bancaria_id: string | null;
      entidad_nombre_snapshot: string | null; direccion: string | null;
      reversa_de_id: string | null; venta_id: string; empresa_id: string;
    }>(
      `SELECT id, metodo_pago, monto::text, caja_id, sucursal_id,
              entidad_bancaria_id, entidad_nombre_snapshot,
              direccion, reversa_de_id, venta_id, empresa_id
       FROM ${pagosDetT}
       WHERE venta_id = $1 AND empresa_id = $2
         AND direccion = 'ingreso'
         AND reversa_de_id IS NULL
       FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    if (pagosOriginales.rows.length > 0) {
      // Buscar caja abierta ACTUAL en la sucursal de la venta.
      const cajaActualQ = await client.query<{ id: string }>(
        `SELECT id FROM ${cajasT}
         WHERE empresa_id = $1 AND sucursal_id = $2 AND estado = 'abierta'
         LIMIT 1`,
        [p.empresaId, v.sucursal_id],
      );
      const cajaTarget = cajaActualQ.rows[0]?.id;
      if (!cajaTarget) {
        throw new Error(
          "No hay caja abierta en la sucursal para registrar la reversión. Abrí una caja antes de anular.",
        );
      }
      for (const orig of pagosOriginales.rows) {
        // Sanity checks (defense-in-depth):
        if (orig.venta_id !== p.ventaId) throw new Error("Pago no corresponde a esta venta.");
        if (orig.empresa_id !== p.empresaId) throw new Error("Empresa mismatch en pago.");
        if (orig.direccion !== "ingreso") continue;
        if (orig.reversa_de_id) continue; // ya es una reversión

        // Verificar que no exista ya una reversión (append-only real)
        const existeQ = await client.query<{ id: string }>(
          `SELECT id FROM ${pagosDetT} WHERE reversa_de_id = $1 LIMIT 1`,
          [orig.id],
        );
        if (existeQ.rows.length > 0) {
          throw new Error(
            `El pago ${orig.id} ya tiene una reversión (${existeQ.rows[0].id}); no se puede revertir dos veces.`,
          );
        }

        await client.query(
          `INSERT INTO ${pagosDetT} (
             empresa_id, venta_id, sucursal_id, caja_id, metodo_pago,
             entidad_bancaria_id, entidad_nombre_snapshot,
             monto, direccion, reversa_de_id, observacion
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'egreso',$9,$10)`,
          [
            p.empresaId, p.ventaId, v.sucursal_id, cajaTarget,
            orig.metodo_pago,
            orig.entidad_bancaria_id, orig.entidad_nombre_snapshot,
            Number(orig.monto), orig.id,
            `Reversión de pago ${orig.metodo_pago} de venta ${v.numero_control}` +
              (p.motivo ? ` — ${p.motivo}` : ""),
          ],
        );
      }
    }

    // ── CxC → anulada ────────────────────────────────────────────────
    await client.query(
      `UPDATE ${cxcT}
          SET estado = 'anulado', saldo = 0, updated_at = now()
        WHERE venta_id = $1 AND empresa_id = $2 AND estado <> 'anulado'`,
      [p.ventaId, p.empresaId],
    );

    // Estado venta
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
         ) VALUES ($1,$2,'otro','Venta anulada',$3,'venta',$4,$5,$6,$7)`,
        [
          p.empresaId, v.cliente_id,
          `Venta ${v.numero_control} anulada.` + (p.motivo ? ` Motivo: ${p.motivo}` : ""),
          p.ventaId, v.numero_control, p.actorId, p.actorNombre,
        ],
      );
    } catch { /* opcional */ }

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
