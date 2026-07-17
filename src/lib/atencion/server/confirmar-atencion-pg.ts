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
import {
  evaluarPromocionEnClientePg,
  type PromoEvaluada,
} from "@/lib/promociones/server/evaluar-promocion-pg";
import {
  ValidationError,
  IdempotencyConflictError,
} from "@/lib/atencion/server/errors";

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

  // Promoción (opcional). El server RE-CALCULA descuento/cashback contra
  // pronimerp.promociones — los valores enviados por el frontend se ignoran.
  // Se pasa solo la referencia (id y/o cupón) más las líneas del carrito.
  promocion?: {
    promocionId?: string | null;
    cuponCodigo?: string | null;
  } | null;

  // Beneficios que se marcaron como entregados. El server los resuelve
  // contra la config de la empresa (`pronimerp.empresas.alertas_atencion_config
  // .beneficios[]`) — label, tipo_evento y genera_credito se leen de ahí,
  // NO de lo que envía el frontend. Solo los que tengan `genera_credito=true`
  // producen ENTRADA en cliente_creditos_movimientos DENTRO de la tx; el
  // resto no debería llegar acá (el frontend los persiste post-commit).
  // Si la venta falla ⇒ ROLLBACK ⇒ nada se persiste.
  beneficiosCredito?: Array<{
    id: string;             // slug del beneficio (fuente única = config server-side)
    monto: number;          // > 0
  }>;
}

/**
 * Shape de un beneficio en pronimerp.empresas.alertas_atencion_config.
 * Definido en src/lib/atencion/alertas-config.ts (frontend) — replicado
 * acá para no importar código cliente desde código server.
 */
interface BeneficioConfigServer {
  id: string;
  label: string;
  tipo_evento: "cashback" | "descuento" | "beneficio" | "otro";
  pide_monto: boolean;
  genera_credito?: boolean;
  /** Monto máximo permitido por operación (opcional, default sin límite). */
  monto_max?: number;
}

export interface ConfirmarAtencionResult {
  recepcion: { id: string; numero_control: string; total_final: number } | null;
  venta: { id: string; numero_control: string; total: number } | null;
  cambio: { id: string; credito_generado: number; credito_previo_usado: number;
            diferencia_pagada: number; credito_restante: number } | null;
  reutilizado: boolean; // true si fue una respuesta cacheada por idempotency
}

/**
 * Canonicaliza el payload de forma RECURSIVA (orden estable de claves en
 * todo nivel; arrays preservan orden porque son semánticamente ordenados)
 * y devuelve SHA-256 hex.
 *
 * Cambiar cualquier campo — cantidad, precio, pago, referencia, observación,
 * promoción, caja o sucursal — a cualquier profundidad, produce un hash
 * distinto. Así el orquestador puede rechazar con 409 los reintentos con
 * mismo key pero payload diferente.
 */
export function canonicalStringify(v: unknown): string {
  if (v === null || v === undefined) return "null";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalStringify).join(",") + "]";
  if (t === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(String(v));
}

function computeRequestHash(payload: unknown): string {
  return createHash("sha256").update(canonicalStringify(payload)).digest("hex");
}

export async function confirmarAtencionPg(
  p: ConfirmarAtencionInput,
): Promise<ConfirmarAtencionResult> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await confirmarAtencionEnClientePg(client, p);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Variante interna: usa el `client` recibido y NO abre/comitea. Se expone
 * para poder ejercitar el orquestador desde tests con SAVEPOINT/ROLLBACK
 * sin persistir datos en la base.
 */
export async function confirmarAtencionEnClientePg(
  client: import("pg").PoolClient,
  p: ConfirmarAtencionInput,
): Promise<ConfirmarAtencionResult> {
  const schema = assertAllowedChatDataSchema(p.schema);

  // Validaciones sintácticas duras (fuera de la tx, para fallar rápido).
  if (!p.cajaId) throw new ValidationError("CAJA_REQUERIDA", "caja_id es obligatorio (nunca autoseleccionamos caja).");
  if (!p.clienteId) throw new ValidationError("CLIENTE_REQUERIDO", "cliente_id es obligatorio.");
  if (!p.sucursalId) throw new ValidationError("SUCURSAL_REQUERIDA", "sucursal_id es obligatorio.");
  if (!p.idempotencyKey || p.idempotencyKey.length < 8) {
    throw new ValidationError("IDEMPOTENCY_KEY_REQUERIDA", "idempotency_key requerido (min 8 chars).");
  }
  const hayTrae = !!(p.trae && p.trae.items.length > 0);
  const hayLleva = !!(p.lleva && p.lleva.items.length > 0);
  if (!hayTrae && !hayLleva) {
    throw new ValidationError("ATENCION_VACIA", "La atención requiere al menos una prenda que el cliente traiga o lleve.");
  }
  if (hayTrae && !(Number(p.trae!.totalFinalEvaluado) > 0)) {
    throw new ValidationError("TOTAL_FINAL_INVALIDO", "total_final de la evaluación debe ser > 0.");
  }

  const requestHash = computeRequestHash(p.requestPayloadForHash);

  const opsT = quoteSchemaTable(schema, "atencion_operaciones");
  const cajasT = quoteSchemaTable(schema, "cajas");
  const cambiosT = quoteSchemaTable(schema, "cambios");
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const ventasT = quoteSchemaTable(schema, "ventas");
  const promoAplT = quoteSchemaTable(schema, "promocion_aplicaciones");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

  {

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
        throw new IdempotencyConflictError();
      }
      if (row.estado === "ok" && row.resultado) {
        // Sin COMMIT propio: el wrapper (o la tx externa) commitea.
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
    if (!cq.rows.length) throw new ValidationError("CAJA_INEXISTENTE", "La caja indicada no existe en esta empresa.");
    if (cq.rows[0].estado !== "abierta") throw new ValidationError("CAJA_CERRADA", "La caja indicada está cerrada.");
    if (cq.rows[0].sucursal_id !== p.sucursalId) {
      throw new ValidationError("CAJA_SUCURSAL_MISMATCH", "La caja indicada no pertenece a la sucursal de la atención.");
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

    // ── 4.5) Promoción: evaluación server-side ANTES de la venta ──────
    // Los descuento/cashback del frontend se ignoran. Si viene id o cupón,
    // reevaluamos server-side contra pronimerp.promociones sobre el mismo
    // carrito. Si aplica, materializamos el descuento como una ENTRADA de
    // crédito con origen='descuento_promo' que se suma a creditoUsado de la
    // venta. El cashback se acredita DESPUÉS de crear la venta.
    let promoEvaluada: PromoEvaluada | null = null;
    if (p.promocion && (p.promocion.promocionId || p.promocion.cuponCodigo) && hayLleva) {
      promoEvaluada = await evaluarPromocionEnClientePg(client, {
        schema, empresaId: p.empresaId,
        clienteId: p.clienteId, sucursalId: p.sucursalId,
        promocionId: p.promocion.promocionId ?? null,
        cuponCodigo: p.promocion.cuponCodigo ?? null,
        // Convertimos los items de venta a la forma que espera el evaluador,
        // resolviendo precio server-side desde `productos` (lock rápido).
        items: await (async () => {
          const ids = p.lleva!.items.map(i => i.producto_id);
          const q = await client.query<{ id: string; precio_venta: string }>(
            `SELECT id, precio_venta::text FROM ${quoteSchemaTable(schema, "productos")}
             WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
            [p.empresaId, ids],
          );
          const priceById = new Map(q.rows.map(r => [r.id, Number(r.precio_venta)]));
          return p.lleva!.items.map(i => ({
            franja_id: i.producto_id,
            cantidad: Number(i.cantidad),
            precio_unitario: priceById.get(i.producto_id) ?? 0,
          }));
        })(),
      });
    }

    // Si hay descuento server-side, lo materializamos como ENTRADA de crédito
    // ANTES de la venta y lo sumamos a `creditoUsado`. La ENTRADA usa
    // origen='descuento_promo' (no confundir con crédito "real" del cliente).
    // Capturamos su id para poder excluirla luego del cálculo de
    // `credito_previo_usado` (la promo no debe contarse como saldo previo).
    let creditoUsadoVenta = hayLleva ? p.lleva!.creditoUsado : 0;
    let entradaDescuentoPromoId: string | null = null;
    if (promoEvaluada && promoEvaluada.descuento > 0) {
      const dpIns = await client.query<{ id: string }>(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1,$2,'ENTRADA',$3,'descuento_promo',
                   'promocion',$4,$5,$6,$7)
         RETURNING id`,
        [
          p.empresaId, p.clienteId, promoEvaluada.descuento,
          promoEvaluada.cuponCodigo ?? promoEvaluada.promocionId,
          `Descuento por promoción "${promoEvaluada.nombre}" (materializado como crédito)`,
          p.createdBy, p.usuarioNombre,
        ],
      );
      entradaDescuentoPromoId = dpIns.rows[0].id;
      creditoUsadoVenta += promoEvaluada.descuento;
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
        creditoClienteUsado: creditoUsadoVenta,
        pagosInmediatos: v.pagosInmediatos,
        createdBy: p.createdBy,
        usuarioNombre: p.usuarioNombre,
        cambioId,
      });
      ventaOut = { id: r.ventaId, numero_control: r.numeroControl, total: r.total };
    }

    // ── 6) Registro de aplicación + cashback (DESPUÉS de la venta) ───
    if (promoEvaluada && ventaOut) {
      const dupQ = await client.query<{ id: string }>(
        `SELECT id FROM ${promoAplT}
         WHERE empresa_id = $1 AND promocion_id = $2 AND venta_id = $3
         LIMIT 1`,
        [p.empresaId, promoEvaluada.promocionId, ventaOut.id],
      );
      if (!dupQ.rows.length) {
        await client.query(
          `INSERT INTO ${promoAplT} (
             empresa_id, promocion_id, venta_id, cliente_id, sucursal_id,
             descuento_aplicado, cashback_generado, cupon_codigo_usado
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            p.empresaId, promoEvaluada.promocionId, ventaOut.id, p.clienteId,
            p.sucursalId, promoEvaluada.descuento, promoEvaluada.cashback,
            promoEvaluada.cuponCodigo ? promoEvaluada.cuponCodigo.toUpperCase() : null,
          ],
        );
        if (promoEvaluada.cashback > 0) {
          await client.query(
            `INSERT INTO ${creditosT} (
               empresa_id, cliente_id, tipo, monto, origen,
               referencia_id, referencia_tipo, referencia_numero,
               observaciones, created_by, usuario_nombre
             ) VALUES ($1,$2,'ENTRADA',$3,'cashback',$4,'venta',$5,$6,$7,$8)`,
            [
              p.empresaId, p.clienteId, promoEvaluada.cashback,
              ventaOut.id, ventaOut.numero_control,
              `Cashback aplicado por promoción "${promoEvaluada.nombre}"`,
              p.createdBy, p.usuarioNombre,
            ],
          );
        }
      }
    }

    // ── 6.5) Beneficios que GENERAN crédito, dentro de la tx ─────────
    // El server NO confía en label/tipo_evento/monto máximo del frontend.
    // Carga la lista canónica de `pronimerp.empresas.alertas_atencion_config
    // .beneficios[]`, resuelve cada beneficio por ID, y solo procesa los
    // que tengan `genera_credito === true`. Cualquier ID inexistente o
    // con genera_credito != true ⇒ throw (400) — rollback total.
    if (p.beneficiosCredito && p.beneficiosCredito.length > 0) {
      const empresasT = quoteSchemaTable(schema, "empresas");
      const cfgQ = await client.query<{ alertas_atencion_config: unknown }>(
        `SELECT alertas_atencion_config FROM ${empresasT}
          WHERE id = $1 LIMIT 1`,
        [p.empresaId],
      );
      const cfg = cfgQ.rows[0]?.alertas_atencion_config as
        | { beneficios?: BeneficioConfigServer[] } | null;
      const beneficiosCfg = Array.isArray(cfg?.beneficios) ? cfg!.beneficios! : [];
      const byId = new Map(beneficiosCfg.map((b) => [String(b.id), b]));

      const eventosT = quoteSchemaTable(schema, "cliente_eventos");
      for (const b of p.beneficiosCredito) {
        const monto = Math.round(Number(b.monto) || 0);
        if (!(monto > 0)) {
          throw new ValidationError(
            "BENEFICIO_MONTO_INVALIDO",
            `Beneficio "${b.id}": monto inválido (${b.monto}).`,
          );
        }
        const cfgB = byId.get(String(b.id));
        if (!cfgB) {
          throw new ValidationError(
            "BENEFICIO_INEXISTENTE",
            `Beneficio "${b.id}" no está configurado para la empresa. Revisá /configuracion/caja.`,
          );
        }
        if (cfgB.genera_credito !== true) {
          throw new ValidationError(
            "BENEFICIO_NO_AUTORIZADO",
            `Beneficio "${cfgB.label}" no está autorizado para generar crédito (genera_credito=false).`,
          );
        }
        // monto_max OBLIGATORIO cuando genera_credito=true. Sin default silencioso:
        // si el admin no configuró el tope, el server rechaza — así impedimos que
        // una cajera pueda emitir crédito arbitrario cambiando el body.
        const montoMax = Number(cfgB.monto_max);
        if (!Number.isFinite(montoMax) || montoMax <= 0) {
          throw new ValidationError(
            "BENEFICIO_MONTO_MAX_FALTANTE",
            `Beneficio "${cfgB.label}": falta configurar monto_max. Un administrador debe fijarlo en /configuracion/caja antes de poder entregarlo.`,
          );
        }
        if (monto > montoMax) {
          throw new ValidationError(
            "BENEFICIO_MONTO_SOBRE_MAX",
            `Beneficio "${cfgB.label}": monto (${monto}) supera el máximo permitido (${montoMax}).`,
          );
        }
        // label + tipo_evento vienen de la config server, NO del frontend.
        const label = cfgB.label;
        const tipoEvento = cfgB.tipo_evento;
        await client.query(
          `INSERT INTO ${creditosT} (
             empresa_id, cliente_id, tipo, monto, origen,
             referencia_tipo, referencia_numero, observaciones,
             created_by, usuario_nombre
           ) VALUES ($1,$2,'ENTRADA',$3,'ajuste_manual',$4,$5,$6,$7,$8)`,
          [
            p.empresaId, p.clienteId, monto,
            tipoEvento, cfgB.id,
            `${label} (beneficio entregado en atención)`,
            p.createdBy, p.usuarioNombre,
          ],
        );
        await client.query(
          `INSERT INTO ${eventosT} (
             empresa_id, cliente_id, tipo, titulo, descripcion, monto,
             referencia_tipo, referencia_id, referencia_numero,
             autor_id, autor_nombre
           ) VALUES ($1,$2,$3,$4,$5,$6,'venta',$7,$8,$9,$10)`,
          [
            p.empresaId, p.clienteId, tipoEvento, label,
            `Entregado en atención · ${label} — Gs. ${monto.toLocaleString("es-PY")}`,
            monto, ventaOut?.id ?? null, ventaOut?.numero_control ?? null,
            p.createdBy, p.usuarioNombre,
          ],
        );
      }
    }

    // ── 7) Cierre del cambio (montos derivados) ───────────────────────
    let cambioOut: ConfirmarAtencionResult["cambio"] = null;
    if (cambioId && recepcionOut && ventaOut) {
      // credito_generado = total_final de la recepción.
      // credito_previo_usado = SALIDAs de crédito de la venta sobre ENTRADAs
      //   distintas a la de esta recepción Y distintas a la entrada
      //   descuento_promo materializada al inicio (el descuento no es
      //   saldo previo del cliente; es materializado por la promo).
      // diferencia_pagada = pagos inmediatos en la venta.
      // credito_restante = saldo actual del cliente.
      const creditoGenerado = recepcionOut.total_final;
      // IDs a excluir del cálculo de "previo": la ENTRADA de esta recepción
      // + la ENTRADA de descuento_promo (si hubo).
      const excluirEntradaIds: string[] = [];
      if (entradaDescuentoPromoId) excluirEntradaIds.push(entradaDescuentoPromoId);
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
           AND c.entrada_id NOT IN (SELECT id FROM entrada_recep)
           AND c.entrada_id <> ALL($5::uuid[])`,
        [p.empresaId, p.clienteId, ventaOut.id, recepcionOut.id, excluirEntradaIds],
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

    return { ...resultado, reutilizado: false };
  }
}
