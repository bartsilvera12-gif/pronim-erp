/**
 * Operación de CAMBIO para pronimerp (rediseño 20260811):
 *
 *   1) Validaciones de consistencia:
 *      - Recepción, venta y cambio deben pertenecer al MISMO cliente,
 *        empresa y sucursal.
 *      - Al iniciar: recepción no puede estar anulada ni tener cambio.
 *      - Al confirmar: cambio debe estar en 'borrador'.
 *
 *   2) Cálculo desde consumos FIFO reales:
 *      - credito_generado = total_credito de la recepción (crédito nuevo).
 *      - credito_previo_usado = SUM(consumos aplicados a entradas
 *        distintas a la de esta recepción). Es lo que el cliente
 *        traía como saldo previo y usó en esta venta.
 *      - diferencia_pagada = saldo_restante que pagó fuera del crédito
 *        (pagos_inmediatos en la venta).
 *      - credito_restante = saldo del cliente DESPUÉS de la venta
 *        (SUM sobre todo el ledger).
 *
 *   3) Si se anula la venta vinculada: el confirmarCambioPg NO se llama;
 *      pero si ya fue confirmado y luego se anula la venta, el cambio
 *      queda vinculado a una venta 'anulada' (el estado del cambio no
 *      cambia automáticamente; se puede consultar el estado agregado).
 *
 *   4) Si se anula la recepción vinculada: la anulación de recepción
 *      NO chequea `cambio_id` (append-only); pero el cambio queda con
 *      referencia a una recepción anulada, lo que se refleja en el
 *      historial. La política de bloquear anulación de recepción con
 *      crédito consumido cubre el caso importante.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export interface CambioIniciarInput {
  schema: string;
  empresaId: string;
  clienteId: string;
  sucursalId: string;
  recepcionId: string;
  actorId: string | null;
  actorNombre: string | null;
}

export interface CambioIniciado {
  id: string;
  numero_control: string;
  estado: "borrador";
  redirect_url: string;
}

export async function iniciarCambioPg(p: CambioIniciarInput): Promise<CambioIniciado> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const cambiosT = quoteSchemaTable(schema, "cambios");
  const cliT = quoteSchemaTable(schema, "clientes");
  const sucT = quoteSchemaTable(schema, "sucursales");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validaciones de consistencia (FOR UPDATE para evitar races)
    const rc = await client.query<{
      id: string; cliente_id: string; sucursal_id: string;
      cambio_id: string | null; estado: string;
    }>(
      `SELECT id, cliente_id, sucursal_id, cambio_id, estado
       FROM ${recepT}
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    if (!rc.rows.length) throw new Error("Recepción no encontrada.");
    const rec = rc.rows[0];
    if (rec.estado === "anulada") {
      throw new Error("La recepción está anulada; no se puede continuar como cambio.");
    }
    if (rec.cliente_id !== p.clienteId) {
      throw new Error("El cliente no coincide con el de la recepción.");
    }
    if (rec.sucursal_id !== p.sucursalId) {
      throw new Error("La sucursal no coincide con la de la recepción.");
    }
    if (rec.cambio_id) {
      const q = await client.query<{ id: string; numero_control: string; estado: string }>(
        `SELECT id, numero_control, estado FROM ${cambiosT} WHERE id = $1`,
        [rec.cambio_id],
      );
      const existing = q.rows[0];
      await client.query("COMMIT");
      return {
        id: existing.id,
        numero_control: existing.numero_control,
        estado: existing.estado as "borrador",
        redirect_url: `/ventas/nueva?cambio_id=${existing.id}&cliente_id=${rec.cliente_id}`,
      };
    }

    // Cliente + sucursal pertenecen a empresa
    const ck = await client.query(`SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2`, [p.clienteId, p.empresaId]);
    if (!ck.rows.length) throw new Error("Cliente inválido.");
    const sk = await client.query(`SELECT 1 FROM ${sucT} WHERE id = $1 AND empresa_id = $2`, [p.sucursalId, p.empresaId]);
    if (!sk.rows.length) throw new Error("Sucursal inválida.");

    // numero_control atómico
    const nc = await client.query<{ n: string }>(
      `SELECT pronimerp.siguiente_numero_control($1::uuid, 'cambio') AS n`,
      [p.empresaId],
    );
    const numero = nc.rows[0].n;

    const ins = await client.query<{ id: string }>(
      `INSERT INTO ${cambiosT} (
         empresa_id, cliente_id, sucursal_id, numero_control,
         recepcion_id, estado, created_by, created_by_nombre
       ) VALUES ($1,$2,$3,$4,$5,'borrador',$6,$7)
       RETURNING id`,
      [
        p.empresaId, p.clienteId, p.sucursalId, numero,
        p.recepcionId, p.actorId, p.actorNombre,
      ],
    );
    const cambioId = ins.rows[0].id;

    await client.query(
      `UPDATE ${recepT} SET cambio_id = $1, updated_at = now() WHERE id = $2`,
      [cambioId, p.recepcionId],
    );

    await client.query("COMMIT");
    return {
      id: cambioId,
      numero_control: numero,
      estado: "borrador",
      redirect_url: `/ventas/nueva?cambio_id=${cambioId}&cliente_id=${p.clienteId}`,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Cerrar el cambio (llamado desde create-venta-pg al confirmar la venta).
 * Calcula los totales desde consumos FIFO reales, no desde total_credito.
 */
export async function confirmarCambioPg(
  client: import("pg").PoolClient,
  args: {
    schema: string;
    empresaId: string;
    cambioId: string;
    ventaId: string;
    ventaTotal: number;
    creditoAplicado: number;
    saldoRestantePagado: number;
  },
): Promise<void> {
  const cambiosT = quoteSchemaTable(args.schema, "cambios");
  const recepT = quoteSchemaTable(args.schema, "cliente_recepciones");
  const creditosT = quoteSchemaTable(args.schema, "cliente_creditos_movimientos");
  const consumosT = quoteSchemaTable(args.schema, "cliente_creditos_consumos");
  const ventasT = quoteSchemaTable(args.schema, "ventas");

  const cq = await client.query<{
    id: string; estado: string;
    recepcion_id: string | null; cliente_id: string;
    sucursal_id: string; empresa_id: string;
  }>(
    `SELECT id, estado, recepcion_id, cliente_id, sucursal_id, empresa_id
     FROM ${cambiosT}
     WHERE id = $1 AND empresa_id = $2
     FOR UPDATE`,
    [args.cambioId, args.empresaId],
  );
  if (!cq.rows.length) throw new Error("Cambio no encontrado.");
  const cambio = cq.rows[0];
  if (cambio.estado !== "borrador") {
    throw new Error(`No se puede confirmar cambio en estado '${cambio.estado}'.`);
  }
  if (!cambio.recepcion_id) {
    throw new Error("El cambio no tiene recepción asociada.");
  }

  // Consistencia con la venta que se acaba de crear
  const vq = await client.query<{ cliente_id: string; sucursal_id: string }>(
    `SELECT cliente_id, sucursal_id FROM ${ventasT} WHERE id = $1 AND empresa_id = $2`,
    [args.ventaId, args.empresaId],
  );
  if (!vq.rows.length) throw new Error("Venta no encontrada.");
  if (vq.rows[0].cliente_id !== cambio.cliente_id) {
    throw new Error("El cliente de la venta no coincide con el del cambio.");
  }
  if (vq.rows[0].sucursal_id !== cambio.sucursal_id) {
    throw new Error("La sucursal de la venta no coincide con la del cambio.");
  }

  // credito_generado: total_credito de la recepción
  const rq = await client.query<{ total_credito: string }>(
    `SELECT total_credito::text FROM ${recepT} WHERE id = $1`,
    [cambio.recepcion_id],
  );
  const creditoGenerado = Number(rq.rows[0]?.total_credito ?? 0);

  // ── credito_previo_usado ──
  // De todos los consumos aplicados a la SALIDA de crédito de esta venta,
  // separar cuánto vino de la ENTRADA de ESTA recepción (=crédito nuevo,
  // no cuenta como "previo") y cuánto vino de OTRAS entradas (=previo).
  const consumosVenta = await client.query<{ entrada_id: string; monto: string }>(
    `SELECT c.entrada_id, c.monto_aplicado::text AS monto
     FROM ${consumosT} c
     JOIN ${creditosT} s ON s.id = c.salida_id
     WHERE s.origen = 'venta' AND s.referencia_id = $1
       AND s.empresa_id = $2`,
    [args.ventaId, args.empresaId],
  );
  const entradaRecep = await client.query<{ id: string }>(
    `SELECT id FROM ${creditosT}
      WHERE empresa_id = $1 AND cliente_id = $2
        AND tipo = 'ENTRADA' AND origen = 'recepcion' AND referencia_id = $3`,
    [args.empresaId, cambio.cliente_id, cambio.recepcion_id],
  );
  const entradaRecepIds = new Set(entradaRecep.rows.map((r) => r.id));
  let creditoPrevioUsado = 0;
  for (const c of consumosVenta.rows) {
    if (!entradaRecepIds.has(c.entrada_id)) {
      creditoPrevioUsado += Number(c.monto);
    }
  }

  // Saldo restante del cliente DESPUÉS de la venta
  const saldoQ = await client.query<{ saldo: string }>(
    `SELECT COALESCE(SUM(
       CASE WHEN tipo='ENTRADA' THEN monto
            WHEN tipo='SALIDA' THEN -monto
            WHEN tipo='AJUSTE' THEN monto ELSE 0 END
     ), 0)::text AS saldo
     FROM ${creditosT}
     WHERE empresa_id = $1 AND cliente_id = $2`,
    [args.empresaId, cambio.cliente_id],
  );
  const creditoRestante = Number(saldoQ.rows[0]?.saldo ?? 0);

  await client.query(
    `UPDATE ${cambiosT}
        SET venta_id = $1,
            credito_generado = $2,
            credito_previo_usado = $3,
            diferencia_pagada = $4,
            credito_restante = $5,
            estado = 'confirmado'
      WHERE id = $6`,
    [
      args.ventaId,
      creditoGenerado,
      creditoPrevioUsado,
      args.saldoRestantePagado,
      creditoRestante,
      args.cambioId,
    ],
  );
}
