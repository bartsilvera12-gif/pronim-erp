/**
 * Corrige la distribución de medios de pago de una evaluación (recepción)
 * ya registrada. Es una operación administrativa:
 *
 *   - Permite cambiar método (efectivo/transferencia/crédito) Y monto por
 *     fila. También permite agregar o quitar filas, siempre que la suma
 *     siga siendo igual al total_final de la recepción.
 *   - NO cambia el total de la evaluación.
 *   - NO edita en lugar las filas existentes: inserta reversas (append-only)
 *     y nuevas filas, siguiendo el mismo patrón que `anularRecepcionPg`.
 *     Si la caja original está cerrada, la reversión va a la caja vigente.
 *   - Si una fila original era 'credito', revierte la ENTRADA con una
 *     SALIDA compensatoria en `cliente_creditos_movimientos` (append-only).
 *     Bloquea si ese crédito ya se consumió en una venta posterior.
 *   - Si una fila nueva es 'credito', genera una ENTRADA con las mismas
 *     referencias que la recepción original.
 *   - Deja asiento en `cliente_eventos` con motivo, actor y snapshot
 *     antes/después (JSON serializado en descripción).
 *   - Bloquea si la recepción está anulada o forma parte de un cambio
 *     (cambio_id IS NOT NULL): esos escenarios tienen flujos propios.
 *
 * Reglas del PDF técnico (reunión 23/11/2026): total inmutable, trazabilidad,
 * motivo obligatorio, no edición destructiva de caja cerrada / crédito /
 * documento fiscal.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type pg from "pg";

/** Métodos aceptados por el CHECK de `cliente_recepciones_pagos.metodo`. */
const METODOS_VALIDOS = new Set(["efectivo", "transferencia", "credito"]);

export interface PagoActualFila {
  id: string;
  metodo_pago: string;
  monto: number;
  entidad_bancaria_id: string | null;
  entidad_nombre_snapshot: string | null;
  caja_id: string | null;
}

export interface ListarPagosResultado {
  pagos: PagoActualFila[];
  totalFinal: number;
  clienteId: string | null;
  numeroControl: string;
  sucursalId: string | null;
  estado: string;
  cambioId: string | null;
  /** Los métodos que la UI puede ofrecer para las filas nuevas. */
  metodosPermitidos: string[];
}

export async function listarPagosRecepcionPg(
  schemaRaw: string,
  empresaId: string,
  recepcionId: string,
): Promise<ListarPagosResultado> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const pagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const rec = await pool.query<{
    numero_control: string; estado: string; total_final: string;
    cliente_id: string | null; sucursal_id: string | null; cambio_id: string | null;
  }>(
    `SELECT numero_control, estado, total_final::text,
            cliente_id::text, sucursal_id::text, cambio_id::text
       FROM ${recepT}
      WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [recepcionId, empresaId],
  );
  const r = rec.rows[0];
  if (!r) throw new Error("No encontré esa evaluación.");
  const pq = await pool.query<{
    id: string; metodo: string; monto: string;
    entidad_bancaria_id: string | null; entidad_nombre_snapshot: string | null;
    caja_id: string | null;
  }>(
    `SELECT id::text, metodo, monto::text,
            entidad_bancaria_id::text, entidad_nombre_snapshot, caja_id::text
       FROM ${pagosT}
      WHERE recepcion_id = $1::uuid AND empresa_id = $2::uuid
        AND direccion = 'egreso' AND reversa_de_id IS NULL
      ORDER BY created_at, id`,
    [recepcionId, empresaId],
  );
  return {
    pagos: pq.rows.map((x) => ({
      id: x.id,
      metodo_pago: x.metodo,
      monto: Number(x.monto),
      entidad_bancaria_id: x.entidad_bancaria_id,
      entidad_nombre_snapshot: x.entidad_nombre_snapshot,
      caja_id: x.caja_id,
    })),
    totalFinal: Number(r.total_final),
    clienteId: r.cliente_id,
    numeroControl: r.numero_control,
    sucursalId: r.sucursal_id,
    estado: r.estado,
    cambioId: r.cambio_id,
    metodosPermitidos: ["efectivo", "transferencia", "credito"],
  };
}

export interface PagoNuevoInput {
  metodo: string;
  monto: number;
  entidad_bancaria_id?: string | null;
}

export interface CambiarPagosRecepcionInput {
  schema: string;
  empresaId: string;
  recepcionId: string;
  pagosNuevos: PagoNuevoInput[];
  motivo: string | null;
  actorId: string | null;
  actorNombre: string | null;
}

export interface CambiarPagosRecepcionResultado {
  recepcionId: string;
  numeroControl: string;
  pagosReversados: number;
  pagosInsertados: number;
  reversosCredito: number;
  entradasCredito: number;
}

export async function cambiarPagosRecepcionPg(
  p: CambiarPagosRecepcionInput,
): Promise<CambiarPagosRecepcionResultado> {
  const schema = assertAllowedChatDataSchema(p.schema);

  // ── Validaciones de entrada ───────────────────────────────────────────
  const motivo = (p.motivo ?? "").trim();
  if (!motivo) {
    throw new Error("El motivo es obligatorio para editar la forma de pago.");
  }
  if (motivo.length > 500) {
    throw new Error("El motivo no puede superar 500 caracteres.");
  }
  if (!Array.isArray(p.pagosNuevos) || p.pagosNuevos.length === 0) {
    throw new Error("Tenés que dejar al menos un pago en la nueva distribución.");
  }
  if (p.pagosNuevos.length > 20) {
    throw new Error("Demasiados pagos en la nueva distribución.");
  }
  const nuevos = p.pagosNuevos.map((n, i) => {
    const metodo = String(n.metodo ?? "").trim().toLowerCase();
    const monto = Number(n.monto);
    if (!METODOS_VALIDOS.has(metodo)) {
      throw new Error(`Fila ${i + 1}: forma de pago inválida (${metodo || "vacía"}).`);
    }
    if (!(monto > 0)) {
      throw new Error(`Fila ${i + 1}: el monto tiene que ser mayor a cero.`);
    }
    const eb = typeof n.entidad_bancaria_id === "string" && n.entidad_bancaria_id.trim()
      ? n.entidad_bancaria_id.trim() : null;
    if (metodo === "transferencia" && !eb) {
      throw new Error(`Fila ${i + 1}: la transferencia necesita banco.`);
    }
    return { metodo, monto: Math.round(monto), entidad_bancaria_id: eb };
  });
  const totalNuevo = nuevos.reduce((acc, x) => acc + x.monto, 0);

  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const pagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const consumosT = quoteSchemaTable(schema, "cliente_creditos_consumos");
  const cajasT = quoteSchemaTable(schema, "cajas");
  const eventosT = quoteSchemaTable(schema, "cliente_eventos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const recQ = await client.query<{
      numero_control: string; estado: string; total_final: string;
      cliente_id: string | null; sucursal_id: string | null; cambio_id: string | null;
    }>(
      `SELECT numero_control, estado, total_final::text,
              cliente_id::text, sucursal_id::text, cambio_id::text
         FROM ${recepT}
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    const rec = recQ.rows[0];
    if (!rec) throw new Error("No encontré esa evaluación.");
    if (rec.estado === "anulada") {
      throw new Error("Esa evaluación está anulada: no se puede editar la forma de pago.");
    }
    if (rec.cambio_id) {
      throw new Error("Esa evaluación forma parte de un cambio: anulá el cambio y recargalo.");
    }
    if (!rec.cliente_id) {
      throw new Error("La evaluación no tiene cliente asignado.");
    }
    if (!rec.sucursal_id) {
      throw new Error("La evaluación no tiene sucursal asignada.");
    }
    const totalFinal = Math.round(Number(rec.total_final));
    if (Math.abs(totalNuevo - totalFinal) > 0) {
      throw new Error(
        `La suma de los nuevos pagos (Gs. ${totalNuevo.toLocaleString("es-PY")}) ` +
        `no coincide con el total de la evaluación (Gs. ${totalFinal.toLocaleString("es-PY")}). ` +
        `No se puede cambiar el total; ajustá la distribución.`,
      );
    }

    // Pagos actuales (solo los vivos: egreso sin reversar).
    const pagosQ = await client.query<{
      id: string; metodo: string; monto: string;
      entidad_bancaria_id: string | null; entidad_nombre_snapshot: string | null;
      caja_id: string | null;
    }>(
      `SELECT id::text, metodo, monto::text,
              entidad_bancaria_id::text, entidad_nombre_snapshot, caja_id::text
         FROM ${pagosT}
        WHERE recepcion_id = $1::uuid AND empresa_id = $2::uuid
          AND direccion = 'egreso' AND reversa_de_id IS NULL
        FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    const actuales = pagosQ.rows.map((x) => ({
      id: x.id,
      metodo: x.metodo,
      monto: Number(x.monto),
      entidad_bancaria_id: x.entidad_bancaria_id,
      entidad_nombre_snapshot: x.entidad_nombre_snapshot,
      caja_id: x.caja_id,
    }));

    // Si alguno era crédito, bloqueá si ya fue consumido.
    const entradasCreditoActuales = await (async () => {
      const necesita = actuales.some((a) => a.metodo === "credito");
      if (!necesita) return [] as { id: string; monto: number }[];
      const q = await client.query<{ id: string; monto: string }>(
        `SELECT id::text, monto::text
           FROM ${creditosT}
          WHERE empresa_id = $1::uuid AND cliente_id = $2::uuid
            AND tipo = 'ENTRADA' AND origen = 'recepcion'
            AND referencia_id = $3::uuid
          FOR UPDATE`,
        [p.empresaId, rec.cliente_id, p.recepcionId],
      );
      return q.rows.map((x) => ({ id: x.id, monto: Number(x.monto) }));
    })();
    if (entradasCreditoActuales.length > 0) {
      const ids = entradasCreditoActuales.map((e) => e.id);
      const cq = await client.query<{ entrada_id: string; aplicado: string }>(
        `SELECT entrada_id::text, SUM(monto_aplicado)::text AS aplicado
           FROM ${consumosT}
          WHERE entrada_id = ANY($1::uuid[])
          GROUP BY entrada_id
         HAVING SUM(monto_aplicado) > 0`,
        [ids],
      );
      if (cq.rows.length > 0) {
        throw new Error(
          "El crédito de esta evaluación ya fue consumido en una venta posterior: " +
          "no se puede editar la forma de pago sin anular primero esos consumos.",
        );
      }
      // Lock serializador de saldo del cliente.
      await client.query(
        `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
        [p.empresaId, rec.cliente_id],
      );
    } else if (nuevos.some((n) => n.metodo === "credito")) {
      await client.query(
        `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
        [p.empresaId, rec.cliente_id],
      );
    }

    // Caja vigente (si alguna fila nueva o actual requiere caja).
    const requiereCaja =
      actuales.some((a) => a.metodo === "efectivo" || a.metodo === "transferencia") ||
      nuevos.some((n) => n.metodo === "efectivo" || n.metodo === "transferencia");
    let cajaVigente: string | null = null;
    if (requiereCaja) {
      cajaVigente = await cajaAbiertaSucursal(client, cajasT, p.empresaId, rec.sucursal_id);
      if (!cajaVigente) {
        throw new Error(
          "No hay caja abierta en la sucursal de esta evaluación: abrí caja antes de editar la forma de pago.",
        );
      }
    }

    // ── 1) Reversar pagos actuales (append-only) ────────────────────────
    let reversosCredito = 0;
    for (const a of actuales) {
      // Fila reversa en cliente_recepciones_pagos.
      // Para efectivo/transferencia: va a la caja vigente (no a la original,
      // que puede estar cerrada). Para crédito: caja_id sigue siendo NULL.
      const cajaParaReversa = a.metodo === "credito" ? null : cajaVigente;
      await client.query(
        `INSERT INTO ${pagosT} (
           empresa_id, recepcion_id, metodo, monto,
           entidad_bancaria_id, entidad_nombre_snapshot,
           referencia, observacion, caja_id, sucursal_id,
           direccion, reversa_de_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ingreso',$11
         )`,
        [
          p.empresaId, p.recepcionId, a.metodo, a.monto,
          a.entidad_bancaria_id, a.entidad_nombre_snapshot,
          null, `Edición administrativa de pago: ${motivo.slice(0, 200)}`,
          cajaParaReversa, rec.sucursal_id, a.id,
        ],
      );
      if (a.metodo === "credito") {
        // SALIDA compensatoria del crédito. Reversa la ENTRADA correspondiente.
        // Como el total original puede haber estado repartido en varias filas
        // crédito, la SALIDA va por el monto de ESTA fila.
        await client.query(
          `INSERT INTO ${creditosT} (
             empresa_id, cliente_id, tipo, monto, origen, categoria,
             referencia_id, referencia_tipo, referencia_numero, observaciones,
             created_by, usuario_nombre
           ) VALUES ($1,$2,'SALIDA',$3,'ajuste_manual','credito',$4,'recepcion_pago_editado',$5,$6,$7,$8)`,
          [
            p.empresaId, rec.cliente_id, a.monto, p.recepcionId, rec.numero_control,
            `Reversión del crédito de la evaluación ${rec.numero_control} por edición administrativa de pago (${motivo.slice(0, 160)})`,
            p.actorId, p.actorNombre,
          ],
        );
        reversosCredito++;
      }
    }

    // ── 2) Insertar nuevos pagos ────────────────────────────────────────
    let entradasCredito = 0;
    for (const n of nuevos) {
      const cajaParaNuevo = n.metodo === "credito" ? null : cajaVigente;
      // Snapshot de nombre del banco (si viene entidad): se deja en NULL;
      // la ruta UI puede completarlo si lo necesita. Hoy se busca por FK.
      await client.query(
        `INSERT INTO ${pagosT} (
           empresa_id, recepcion_id, metodo, monto,
           entidad_bancaria_id, entidad_nombre_snapshot,
           referencia, observacion, caja_id, sucursal_id, direccion
         ) VALUES (
           $1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,'egreso'
         )`,
        [
          p.empresaId, p.recepcionId, n.metodo, n.monto,
          n.entidad_bancaria_id,
          `Pago generado por edición administrativa: ${motivo.slice(0, 200)}`,
          cajaParaNuevo, rec.sucursal_id,
        ],
      );
      if (n.metodo === "credito") {
        // ENTRADA nueva en el ledger con las mismas referencias que la
        // recepción original (origen='recepcion'). Observación que avisa
        // que vino por edición, para auditoría.
        await client.query(
          `INSERT INTO ${creditosT} (
             empresa_id, cliente_id, tipo, monto, origen, categoria,
             referencia_id, referencia_tipo, referencia_numero, observaciones,
             created_by, usuario_nombre
           ) VALUES ($1,$2,'ENTRADA',$3,'recepcion','credito',$4,'recepcion',$5,$6,$7,$8)`,
          [
            p.empresaId, rec.cliente_id, n.monto, p.recepcionId, rec.numero_control,
            `Crédito por evaluación ${rec.numero_control} (regenerado por edición administrativa: ${motivo.slice(0, 160)})`,
            p.actorId, p.actorNombre,
          ],
        );
        entradasCredito++;
      }
    }

    // ── 3) Auditoría: cliente_eventos + nota corta en observaciones ─────
    const antesResumen = actuales.map((a) => `${a.metodo}:${a.monto}`).join(" + ");
    const despuesResumen = nuevos.map((n) => `${n.metodo}:${n.monto}`).join(" + ");
    const descripcion = JSON.stringify({
      motivo,
      actor: p.actorNombre,
      antes: actuales.map((a) => ({
        pago_id: a.id, metodo: a.metodo, monto: a.monto,
        entidad_bancaria_id: a.entidad_bancaria_id,
      })),
      despues: nuevos,
    });
    // Evento del cliente (opcional: si falla no corta la operación).
    await client.query("SAVEPOINT sp_evento_pago");
    try {
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion, monto,
           referencia_tipo, referencia_id, referencia_numero, autor_id, autor_nombre
         ) VALUES ($1,$2,'otro',$3,$4,$5,'recepcion',$6,$7,$8,$9)`,
        [
          p.empresaId, rec.cliente_id,
          `Pago editado: ${antesResumen} → ${despuesResumen}`,
          descripcion, totalFinal,
          p.recepcionId, rec.numero_control, p.actorId, p.actorNombre,
        ],
      );
      await client.query("RELEASE SAVEPOINT sp_evento_pago");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT sp_evento_pago");
      await client.query("RELEASE SAVEPOINT sp_evento_pago");
      console.warn("[cambiar-pagos] evento historial falló:", e instanceof Error ? e.message : e);
    }

    const nota = `Pagos editados (${antesResumen} → ${despuesResumen}) motivo: ${motivo}` +
      (p.actorNombre ? ` por ${p.actorNombre}` : "");
    await client.query(
      `UPDATE ${recepT}
          SET observaciones = CASE WHEN COALESCE(observaciones,'') = '' THEN $3
                                   ELSE observaciones || ' · ' || $3 END
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [p.recepcionId, p.empresaId, nota.slice(0, 2000)],
    );

    await client.query("COMMIT");
    return {
      recepcionId: p.recepcionId,
      numeroControl: rec.numero_control,
      pagosReversados: actuales.length,
      pagosInsertados: nuevos.length,
      reversosCredito,
      entradasCredito,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

async function cajaAbiertaSucursal(
  client: pg.PoolClient,
  cajasTable: string,
  empresaId: string,
  sucursalId: string,
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM ${cajasTable}
      WHERE empresa_id = $1 AND sucursal_id = $2 AND estado = 'abierta'
      LIMIT 1`,
    [empresaId, sucursalId],
  );
  return r.rows[0]?.id ?? null;
}
