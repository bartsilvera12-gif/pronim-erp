/**
 * Orquestador transaccional de "Confirmar atención" para pronimerp.
 *
 * Agrupa en UNA SOLA transacción Postgres las operaciones que hoy hacen
 * dos endpoints separados (recepciones + venta) más:
 *   - creación/cierre de `pronimerp.cambios` cuando hay trae+lleva,
 *   - aplicación de promociones (descuento + cashback → crédito),
 *   - registro idempotente en `pronimerp.atencion_operaciones`.
 *
 * Si CUALQUIER parte falla ⇒ ROLLBACK total. Ni recepción ni venta ni
 * crédito promocional quedan persistidos parcialmente.
 *
 * Reglas duras:
 *   - `caja_id` OBLIGATORIA en el body (nunca autoselección oculta).
 *   - Idempotencia por (empresa_id, idempotency_key). Mismo hash → 200
 *     cacheado; distinto hash → 409.
 *   - Si trae Y lleva ⇒ se crea fila en `cambios` y se linkea vía
 *     `cambio_id` en recepción y venta.
 */

import { createHash } from "node:crypto";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import {
  crearRecepcionEnClientePg,
  type RecepcionItemInput,
} from "@/lib/recepciones/server/recepciones-pg";
import {
  createVentaEnClientePg,
  type CreateVentaItemInput,
  type PagoDetalleVentaInput,
} from "@/lib/ventas/server/create-venta-pg";

export interface ConfirmarAtencionInput {
  schema: string;
  empresaId: string;
  clienteId: string;
  sucursalId: string;
  cajaId: string;
  createdBy: string | null;
  usuarioNombre: string | null;
  idempotencyKey: string;
  requestPayloadForHash: unknown;
  observaciones: string | null;

  // TRAE (opcional; si viene y items > 0, se crea recepción)
  trae?: {
    items: RecepcionItemInput[];
    /** Monto final de la evaluación (puede diferir del subtotal). > 0. */
    totalFinalEvaluado: number;
    ingresarAlStock?: boolean;
  } | null;

  // LLEVA (opcional; si viene y items > 0, se crea venta)
  lleva?: {
    items: CreateVentaItemInput[];
    creditoUsado: number;
    pagosInmediatos: PagoDetalleVentaInput[];
    moneda?: "GS" | "USD";
    tipoCambio?: number;
  } | null;

  // Promoción (opcional). Se aplica DENTRO de la misma transacción.
  promocion?: {
    promocionId: string;
    descuento: number;
    cashback: number;
    cuponCodigo?: string | null;
    /** Si el frontend ya "convirtió" el descuento a crédito y lo pasó
     *  como creditoUsado en lleva, marcá `descuentoYaAplicado=true` para
     *  no duplicar la ENTRADA de crédito. */
    descuentoYaAplicadoComoCredito?: boolean;
  } | null;
}

export interface ConfirmarAtencionResult {
  recepcion: { id: string; numero_control: string; total_final: number } | null;
  venta: { id: string; numero_control: string; total: number } | null;
  cambio: { id: string; credito_generado: number; credito_previo_usado: number;
            diferencia_pagada: number; credito_restante: number } | null;
  reutilizado: boolean; // true si fue una respuesta cacheada por idempotency
}

/**
 * Canonicaliza el payload (orden estable de claves) y devuelve SHA-256 hex.
 * Cambiar cualquier campo (ítem, monto, ajuste, promoción, caja) produce
 * un hash distinto — así el frontend detecta "esto ya no es el mismo submit".
 */
function computeRequestHash(payload: unknown): string {
  const stable = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash("sha256").update(stable).digest("hex");
}

export async function confirmarAtencionPg(
  p: ConfirmarAtencionInput,
): Promise<ConfirmarAtencionResult> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  // Validaciones sintácticas duras (fuera de la tx, para fallar rápido).
  if (!p.cajaId) throw new Error("caja_id es obligatorio (nunca autoseleccionamos caja).");
  if (!p.clienteId) throw new Error("cliente_id es obligatorio.");
  if (!p.sucursalId) throw new Error("sucursal_id es obligatorio.");
  if (!p.idempotencyKey || p.idempotencyKey.length < 8) {
    throw new Error("idempotency_key requerido (min 8 chars).");
  }
  const hayTrae = !!(p.trae && p.trae.items.length > 0);
  const hayLleva = !!(p.lleva && p.lleva.items.length > 0);
  if (!hayTrae && !hayLleva) {
    throw new Error("La atención requiere al menos una prenda que el cliente traiga o lleve.");
  }
  if (hayTrae && !(Number(p.trae!.totalFinalEvaluado) > 0)) {
    throw new Error("total_final de la evaluación debe ser > 0.");
  }

  const requestHash = computeRequestHash(p.requestPayloadForHash);

  const opsT = quoteSchemaTable(schema, "atencion_operaciones");
  const cajasT = quoteSchemaTable(schema, "cajas");
  const cambiosT = quoteSchemaTable(schema, "cambios");
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const ventasT = quoteSchemaTable(schema, "ventas");
  const promoAplT = quoteSchemaTable(schema, "promocion_aplicaciones");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1) Idempotencia ────────────────────────────────────────────────
    // Intento insertar la key; si ya existe, leo la fila (con lock para
    // esperar a otro proceso que la esté ejecutando en paralelo) y devuelvo
    // el resultado cacheado. Si el hash difiere ⇒ 409 lógico (throw).
    const ins = await client.query<{ id: string }>(
      `INSERT INTO ${opsT} (empresa_id, idempotency_key, request_hash, estado)
       VALUES ($1,$2,$3,'ok')
       ON CONFLICT (empresa_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [p.empresaId, p.idempotencyKey, requestHash],
    );
    if (ins.rows.length === 0) {
      // Ya existe — bloqueo la fila para esperar a la tx en curso (si hay)
      // y leo el hash + resultado. Si el hash difiere lo rechazo.
      const existing = await client.query<{
        request_hash: string;
        resultado: unknown;
        estado: string;
      }>(
        `SELECT request_hash, resultado, estado
         FROM ${opsT}
         WHERE empresa_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [p.empresaId, p.idempotencyKey],
      );
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) {
        throw new Error(
          "IDEMPOTENCY_CONFLICT: la misma idempotency_key llegó con un payload distinto. Generá una key nueva.",
        );
      }
      if (row.estado === "ok" && row.resultado) {
        await client.query("COMMIT");
        return { ...(row.resultado as Omit<ConfirmarAtencionResult, "reutilizado">), reutilizado: true };
      }
      // estado='error' o resultado null: dejamos que reintente creando un
      // registro nuevo (borramos el fallido de esta key para no bloquear).
      await client.query(
        `DELETE FROM ${opsT} WHERE empresa_id = $1 AND idempotency_key = $2`,
        [p.empresaId, p.idempotencyKey],
      );
      await client.query(
        `INSERT INTO ${opsT} (empresa_id, idempotency_key, request_hash, estado)
         VALUES ($1,$2,$3,'ok')`,
        [p.empresaId, p.idempotencyKey, requestHash],
      );
    }

    // ── 2) Caja explícita: validar existencia + sucursal + estado ─────
    const cq = await client.query<{ id: string; sucursal_id: string | null; estado: string }>(
      `SELECT id, sucursal_id, estado FROM ${cajasT}
        WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
      [p.empresaId, p.cajaId],
    );
    if (!cq.rows.length) throw new Error("La caja indicada no existe en esta empresa.");
    if (cq.rows[0].estado !== "abierta") throw new Error("La caja indicada está cerrada.");
    if (cq.rows[0].sucursal_id !== p.sucursalId) {
      throw new Error("La caja indicada no pertenece a la sucursal de la atención.");
    }

    // ── 3) Si hay trae + lleva, creamos primero la fila de `cambios` ──
    let cambioId: string | null = null;
    let cambioNumero: string | null = null;
    if (hayTrae && hayLleva) {
      const nc = await client.query<{ n: string }>(
        `SELECT pronimerp.siguiente_numero_control($1::uuid, 'cambio') AS n`,
        [p.empresaId],
      );
      cambioNumero = nc.rows[0].n;
      const cIns = await client.query<{ id: string }>(
        `INSERT INTO ${cambiosT} (
           empresa_id, cliente_id, sucursal_id, numero_control,
           estado, created_by, created_by_nombre
         ) VALUES ($1,$2,$3,$4,'borrador',$5,$6)
         RETURNING id`,
        [
          p.empresaId, p.clienteId, p.sucursalId, cambioNumero,
          p.createdBy, p.usuarioNombre,
        ],
      );
      cambioId = cIns.rows[0].id;
    }

    // ── 4) RECEPCIÓN ──────────────────────────────────────────────────
    let recepcionOut: ConfirmarAtencionResult["recepcion"] = null;
    if (hayTrae) {
      const t = p.trae!;
      const totalFinal = Math.round(Number(t.totalFinalEvaluado) || 0);
      const r = await crearRecepcionEnClientePg(client, {
        schema,
        empresaId: p.empresaId,
        clienteId: p.clienteId,
        sucursalId: p.sucursalId,
        items: t.items,
        // Método = crédito 100% por el total_final. Si el cliente también
        // lleva, ese crédito se aplica automáticamente en la venta.
        pagos: [{ metodo: "credito", monto: totalFinal }],
        observaciones: p.observaciones,
        createdBy: p.createdBy,
        usuarioNombre: p.usuarioNombre,
        ingresarAhora: t.ingresarAlStock !== false,
        cambioId,
        totalFinalEvaluado: totalFinal,
      });
      // Si hay cambio, linkeamos la recepción también:
      if (cambioId) {
        await client.query(
          `UPDATE ${cambiosT} SET recepcion_id = $1 WHERE id = $2`,
          [r.id, cambioId],
        );
      }
      recepcionOut = { id: r.id, numero_control: r.numero_control, total_final: totalFinal };
    }

    // ── 5) VENTA ──────────────────────────────────────────────────────
    let ventaOut: ConfirmarAtencionResult["venta"] = null;
    if (hayLleva) {
      const v = p.lleva!;
      const r = await createVentaEnClientePg(client, {
        schema,
        empresaId: p.empresaId,
        clienteId: p.clienteId,
        observaciones: p.observaciones,
        moneda: v.moneda ?? "GS",
        tipoCambio: v.tipoCambio ?? 1,
        tipoVenta: "CONTADO",
        plazoDias: null,
        items: v.items,
        sucursalId: p.sucursalId,
        cajaId: p.cajaId,
        creditoClienteUsado: v.creditoUsado,
        pagosInmediatos: v.pagosInmediatos,
        createdBy: p.createdBy,
        usuarioNombre: p.usuarioNombre,
        cambioId,
      });
      ventaOut = { id: r.ventaId, numero_control: r.numeroControl, total: r.total };
    }

    // ── 6) Promoción DENTRO de la misma tx ────────────────────────────
    // Reemplaza el POST /api/promociones/aplicacion best-effort del frontend.
    // Si la venta o cualquier paso falló, no hay commit ⇒ ni aplicación ni crédito.
    // Anti-duplicación: constraint unique (promocion_id, venta_id) ideal, o
    // en su defecto no re-insertar si ya existe.
    if (p.promocion && ventaOut) {
      const promo = p.promocion;
      // Anti-duplicación: si ya hay una aplicación para esta (promocion, venta), no insertamos.
      const dupQ = await client.query<{ id: string }>(
        `SELECT id FROM ${promoAplT}
         WHERE empresa_id = $1 AND promocion_id = $2 AND venta_id = $3
         LIMIT 1`,
        [p.empresaId, promo.promocionId, ventaOut.id],
      );
      if (!dupQ.rows.length) {
        await client.query(
          `INSERT INTO ${promoAplT} (
             empresa_id, promocion_id, venta_id, cliente_id, sucursal_id,
             descuento_aplicado, cashback_generado, cupon_codigo_usado
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            p.empresaId, promo.promocionId, ventaOut.id, p.clienteId,
            p.sucursalId, Math.max(0, Math.round(promo.descuento || 0)),
            Math.max(0, Math.round(promo.cashback || 0)),
            promo.cuponCodigo ? String(promo.cuponCodigo).toUpperCase() : null,
          ],
        );

        // Cashback → crédito al cliente (ENTRADA).
        // Si el frontend materializó el descuento como crédito y ya lo pasó
        // como `creditoUsado` en la venta, NO lo duplicamos acá.
        if (promo.cashback > 0) {
          await client.query(
            `INSERT INTO ${creditosT} (
               empresa_id, cliente_id, tipo, monto, origen,
               referencia_id, referencia_tipo, referencia_numero,
               observaciones, created_by, usuario_nombre
             ) VALUES ($1,$2,'ENTRADA',$3,'cashback',$4,'venta',$5,$6,$7,$8)`,
            [
              p.empresaId, p.clienteId, Math.round(promo.cashback),
              ventaOut.id, ventaOut.numero_control,
              "Cashback aplicado por promoción",
              p.createdBy, p.usuarioNombre,
            ],
          );
        }
      }
    }

    // ── 7) Cierre del cambio (montos derivados) ───────────────────────
    let cambioOut: ConfirmarAtencionResult["cambio"] = null;
    if (cambioId && recepcionOut && ventaOut) {
      // credito_generado = total_final de la recepción.
      // credito_previo_usado = SALIDAs de crédito de la venta sobre ENTRADAs
      //   distintas a la de esta recepción.
      // diferencia_pagada = pagos inmediatos en la venta (efectivo/tarjeta/etc).
      // credito_restante = saldo actual del cliente.
      const creditoGenerado = recepcionOut.total_final;
      const consumosVentaQ = await client.query<{ ajena_total: string }>(
        `WITH salida_venta AS (
           SELECT id FROM ${creditosT}
           WHERE empresa_id=$1 AND cliente_id=$2 AND tipo='SALIDA'
             AND origen='venta' AND referencia_id=$3
         ),
         entrada_recep AS (
           SELECT id FROM ${creditosT}
           WHERE empresa_id=$1 AND cliente_id=$2 AND tipo='ENTRADA'
             AND origen='recepcion' AND referencia_id=$4
         )
         SELECT COALESCE(SUM(c.monto_aplicado),0)::text AS ajena_total
         FROM ${quoteSchemaTable(schema, "cliente_creditos_consumos")} c
         WHERE c.empresa_id = $1
           AND c.salida_id IN (SELECT id FROM salida_venta)
           AND c.entrada_id NOT IN (SELECT id FROM entrada_recep)`,
        [p.empresaId, p.clienteId, ventaOut.id, recepcionOut.id],
      );
      const creditoPrevioUsado = Number(consumosVentaQ.rows[0]?.ajena_total ?? 0);
      const diferenciaPagada = (p.lleva?.pagosInmediatos ?? [])
        .reduce((s, pg) => s + Number(pg.monto), 0);
      const saldoQ = await client.query<{ saldo: string }>(
        `SELECT COALESCE(SUM(
           CASE WHEN tipo='ENTRADA' THEN monto
                WHEN tipo='SALIDA' THEN -monto
                WHEN tipo='AJUSTE' THEN monto ELSE 0 END
         ),0)::text AS saldo
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [p.empresaId, p.clienteId],
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
          ventaOut.id, creditoGenerado, creditoPrevioUsado, diferenciaPagada,
          creditoRestante, cambioId,
        ],
      );
      cambioOut = {
        id: cambioId,
        credito_generado: creditoGenerado,
        credito_previo_usado: creditoPrevioUsado,
        diferencia_pagada: diferenciaPagada,
        credito_restante: creditoRestante,
      };
    }
    // Si solo hubo trae (sin lleva), no hay cambio ni pago inmediato.
    // Si solo hubo lleva (sin trae), tampoco — el cambio nace del intercambio.

    // Alineaciones invisibles con el flujo standalone:
    //   recepT/ventasT sirven de ancla para futuros SELECT de auditoría.
    void recepT; void ventasT;

    // ── 8) Persistir resultado en la fila idempotente ─────────────────
    const resultado: Omit<ConfirmarAtencionResult, "reutilizado"> = {
      recepcion: recepcionOut,
      venta: ventaOut,
      cambio: cambioOut,
    };
    await client.query(
      `UPDATE ${opsT} SET resultado = $1
        WHERE empresa_id = $2 AND idempotency_key = $3`,
      [JSON.stringify(resultado), p.empresaId, p.idempotencyKey],
    );

    await client.query("COMMIT");
    return { ...resultado, reutilizado: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
