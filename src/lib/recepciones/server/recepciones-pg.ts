/**
 * Núcleo transaccional de RECEPCIONES (compras al cliente) para pronimerp.
 *
 * Rediseño 20260811 (correcciones críticas):
 *
 *   1) total_compra ≠ total_credito.
 *      - total_compra = SUM(cantidad * precio_compra_unitario) por líneas.
 *      - total_credito = SUM(pagos WHERE metodo='credito'). SOLO la parte
 *        entregada como crédito genera ENTRADA en el ledger del cliente.
 *      - suma de pagos = total_compra (crédito + efectivo + transferencia).
 *
 *   2) Fuente única de pagos = cliente_recepciones_pagos.
 *      - Los pagos en efectivo llevan caja_id + sucursal_id.
 *      - NO se inserta en caja_movimientos (esa tabla es solo para
 *        ajustes/apertura/cierre manuales).
 *      - computeResumen de caja calcula egresos por efectivo desde acá.
 *
 *   3) No se confía en nombres/SKU/precio_venta_snapshot del cliente.
 *      Se resuelve server-side desde `productos`.
 *
 *   4) Sucursal obligatoria; se valida contra empresa.
 *
 *   5) numero_control vía pronimerp.siguiente_numero_control RPC.
 *
 *   6) Al INGRESAR: se calcula costo_promedio ponderado (WACP) por
 *      producto usando stock previo + entrada nueva.
 *
 *   7) ANULAR: dentro de la misma tx con FOR UPDATE.
 *      - Bloquea si el crédito generado ya fue consumido (parcial o total).
 *      - Reversa saldo, movimientos y stock (si ya estaba ingresada).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

const TOL = 2;

// ═════════════════════════════════════════════════════════════════════
// Tipos
// ═════════════════════════════════════════════════════════════════════

export interface RecepcionItemInput {
  producto_id: string;
  cantidad: number;
  /** Lo que la tienda paga al cliente por cada unidad. Autoritativo. */
  precio_compra_unitario: number;
}

export type MetodoPagoRecepcion = "credito" | "efectivo" | "transferencia";

export interface RecepcionPagoInput {
  metodo: MetodoPagoRecepcion;
  monto: number;
  entidad_bancaria_id?: string | null;
  entidad_nombre_snapshot?: string | null;
  referencia?: string | null;
  observacion?: string | null;
}

export interface RecepcionCreateInput {
  schema: string;
  empresaId: string;
  clienteId: string;
  sucursalId: string;
  items: RecepcionItemInput[];
  pagos: RecepcionPagoInput[];
  observaciones: string | null;
  createdBy: string | null;
  usuarioNombre: string | null;
  ingresarAhora?: boolean;
  cambioId?: string | null;
  /**
   * Monto FINAL evaluado por la cajera. Si viene, es la fuente de verdad
   * para el crédito generado y para prorratear el costo por línea.
   * Debe ser > 0. Puede diferir del subtotal crudo (ajuste manual).
   * Si no viene, el server usa el subtotal crudo (comportamiento legacy).
   */
  totalFinalEvaluado?: number | null;
}

export interface RecepcionCreated {
  id: string;
  numero_control: string;
  fecha: string;
  total_compra: number;
  total_credito: number;
  total_efectivo: number;
  total_transferencia: number;
  estado: "pendiente_ingreso" | "ingresada";
  ingresada_at: string | null;
}

// ═════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════

async function lockProductosRecep(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string,
  productoIds: string[],
): Promise<Map<string, {
  nombre: string;
  sku: string;
  precio_venta: number;
  activo: boolean;
  es_franja_precio: boolean;
}>> {
  if (productoIds.length === 0) return new Map();
  const prodT = quoteSchemaTable(schema, "productos");
  const r = await client.query<{
    id: string; nombre: string; sku: string; precio_venta: string;
    activo: boolean; es_franja_precio: boolean;
  }>(
    `SELECT id, nombre, sku, precio_venta::text, activo, es_franja_precio
     FROM ${prodT}
     WHERE empresa_id = $1 AND id = ANY($2::uuid[])
     FOR UPDATE`,
    [empresaId, productoIds],
  );
  if (r.rows.length !== productoIds.length) {
    throw new Error("Uno o más productos no existen en la empresa.");
  }
  const out = new Map<string, {
    nombre: string;
    sku: string;
    precio_venta: number;
    activo: boolean;
    es_franja_precio: boolean;
  }>();
  for (const p of r.rows) {
    if (!p.activo) {
      throw new Error(`El producto ${p.nombre} (${p.sku}) está inactivo.`);
    }
    if (!p.es_franja_precio) {
      throw new Error(
        `El producto ${p.nombre} (${p.sku}) no es una categoría de precio válida para Pronim.`,
      );
    }
    out.set(p.id, {
      nombre: p.nombre,
      sku: p.sku,
      precio_venta: Number(p.precio_venta),
      activo: p.activo,
      es_franja_precio: p.es_franja_precio === true,
    });
  }
  return out;
}

async function validarSucursalEmpresa(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string,
  sucursalId: string,
): Promise<void> {
  const t = quoteSchemaTable(schema, "sucursales");
  const r = await client.query(
    `SELECT 1 FROM ${t} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
    [sucursalId, empresaId],
  );
  if (!r.rows.length) {
    throw new Error("Sucursal inválida: no pertenece a la empresa autenticada.");
  }
}

async function cajaAbiertaSucursal(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string,
  sucursalId: string,
): Promise<string | null> {
  const t = quoteSchemaTable(schema, "cajas");
  const r = await client.query<{ id: string }>(
    `SELECT id FROM ${t}
     WHERE empresa_id = $1 AND sucursal_id = $2 AND estado = 'abierta'
     LIMIT 1`,
    [empresaId, sucursalId],
  );
  return r.rows[0]?.id ?? null;
}

// ═════════════════════════════════════════════════════════════════════
// CREAR recepción
// ═════════════════════════════════════════════════════════════════════

export async function crearRecepcionPg(
  p: RecepcionCreateInput,
): Promise<RecepcionCreated> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await crearRecepcionEnClientePg(client, p);
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
 * Variante interna: recibe el `PoolClient` de una transacción externa y
 * NO abre/comitea su propio BEGIN. Diseñado para orquestadores que
 * agrupan varias operaciones en una sola tx (ej. /api/atencion/confirmar).
 */
export async function crearRecepcionEnClientePg(
  client: import("pg").PoolClient,
  p: RecepcionCreateInput,
): Promise<RecepcionCreated> {
  const schema = assertAllowedChatDataSchema(p.schema);

  if (!p.items.length) throw new Error("La recepción debe tener al menos una prenda.");
  if (!p.pagos.length) throw new Error("La recepción debe tener al menos una forma de pago.");
  if (!p.sucursalId) {
    throw new Error("Sucursal requerida: no se pudo determinar la sucursal.");
  }

  // Validación básica de líneas
  for (const it of p.items) {
    if (!(Number(it.cantidad) > 0)) throw new Error("Cantidad de línea inválida.");
    if (!(Number(it.precio_compra_unitario) >= 0)) {
      throw new Error("precio_compra_unitario inválido (>= 0).");
    }
  }

  // Métodos únicos + montos > 0
  const metodosVistos = new Set<string>();
  for (const pg of p.pagos) {
    if (metodosVistos.has(pg.metodo)) {
      throw new Error(`Método de pago duplicado: ${pg.metodo}.`);
    }
    metodosVistos.add(pg.metodo);
    if (!(Number(pg.monto) > 0)) throw new Error(`Monto inválido para ${pg.metodo}.`);
  }

  const creditoInput = p.pagos.find((x) => x.metodo === "credito");
  const efectivoInput = p.pagos.find((x) => x.metodo === "efectivo");
  const transfInput = p.pagos.find((x) => x.metodo === "transferencia");

  const cliT = quoteSchemaTable(schema, "clientes");
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const recepPagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const eventosT = quoteSchemaTable(schema, "cliente_eventos");
  const entidadesT = quoteSchemaTable(schema, "entidades_bancarias");

  {

    // Cliente + sucursal
    const cl = await client.query(
      `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
      [p.clienteId, p.empresaId],
    );
    if (!cl.rows.length) throw new Error("Cliente no encontrado en esta empresa.");
    await validarSucursalEmpresa(client, schema, p.empresaId, p.sucursalId);

    // Validación tenant-safe de entidades bancarias.
    const entidadIds = [
      ...new Set(
        p.pagos
          .map((pg) => pg.entidad_bancaria_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (entidadIds.length > 0) {
      const eq = await client.query<{ id: string }>(
        `SELECT id FROM ${entidadesT}
         WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
        [p.empresaId, entidadIds],
      );
      if (eq.rows.length !== entidadIds.length) {
        throw new Error("Una o más entidades bancarias no pertenecen a esta empresa.");
      }
    }

    // Lock productos server-side
    const uniqueIds = [...new Set(p.items.map((i) => i.producto_id))];
    const productosInfo = await lockProductosRecep(client, schema, p.empresaId, uniqueIds);

    // ── Subtotal crudo (antes de ajuste) ─────────────────────────────
    // Lo guardamos como subtotal_evaluado para auditoría. Si la cajera
    // ingresó un totalFinalEvaluado distinto, prorrateamos el ajuste
    // proporcionalmente entre las líneas para que el WACP se calcule con
    // el costo real pagado y `SUM(cantidad × precio_ajustado) = total_final`.
    let subtotalEvaluado = 0;
    const itemsCrudo = p.items.map((it) => {
      const info = productosInfo.get(it.producto_id)!;
      const cantidad = Number(it.cantidad);
      const precioCompra = Number(it.precio_compra_unitario);
      const subtotalLinea = cantidad * precioCompra;
      subtotalEvaluado += subtotalLinea;
      return { it, info, cantidad, precioCompra, subtotalLinea };
    });

    const totalFinalRaw = p.totalFinalEvaluado != null ? Number(p.totalFinalEvaluado) : null;
    const totalFinal = totalFinalRaw != null && Number.isFinite(totalFinalRaw)
      ? Math.round(totalFinalRaw)
      : subtotalEvaluado;
    if (!(totalFinal > 0)) {
      throw new Error("El monto final de la evaluación debe ser mayor a 0.");
    }
    if (subtotalEvaluado <= 0 && totalFinal > 0) {
      throw new Error(
        "No se puede prorratear el monto final: el subtotal de líneas es 0 (todas las prendas tienen precio 0).",
      );
    }
    const ajusteEvaluacion = totalFinal - subtotalEvaluado;

    // Prorrateo: precio_ajustado_linea_i = round(subtotal_linea_i × total_final / subtotal_evaluado / cantidad_i).
    // El residuo por redondeo se corrige en la última línea para garantizar
    // SUM(cantidad_i × precio_ajustado_i) = total_final exactamente.
    // Si no hay ajuste, precio_ajustado_i = precio_compra_unitario_i.
    let acumCosto = 0;
    const itemsResueltos = itemsCrudo.map((x, idx) => {
      const info = x.info;
      let precioAjustado = x.precioCompra;
      if (ajusteEvaluacion !== 0) {
        const factor = totalFinal / subtotalEvaluado;
        precioAjustado = x.cantidad > 0
          ? Math.round((x.subtotalLinea * factor) / x.cantidad)
          : 0;
      }
      let subtotalAjustadoLinea = x.cantidad * precioAjustado;
      if (idx === itemsCrudo.length - 1) {
        // corregir residuo en la última línea
        const dif = totalFinal - (acumCosto + subtotalAjustadoLinea);
        if (dif !== 0 && x.cantidad > 0) {
          precioAjustado = Math.round((subtotalAjustadoLinea + dif) / x.cantidad);
          subtotalAjustadoLinea = x.cantidad * precioAjustado;
        }
      }
      acumCosto += subtotalAjustadoLinea;
      const precioVenta = info.precio_venta;
      const margen = precioVenta > 0
        ? ((precioVenta - precioAjustado) / precioVenta) * 100
        : null;
      return {
        producto_id: x.it.producto_id,
        producto_nombre: info.nombre,
        sku: info.sku,
        cantidad: x.cantidad,
        precio_compra_unitario: precioAjustado,
        precio_venta_snapshot: precioVenta,
        subtotal: subtotalAjustadoLinea,
        margen_bruto_pct: margen,
      };
    });
    // Consolidamos: el total_compra que se persiste es igual al total_final
    // para no romper la ecuación pagos = total_compra en el bloque siguiente.
    const totalCompra = acumCosto;
    if (Math.abs(totalCompra - totalFinal) > TOL) {
      throw new Error(
        `Prorrateo interno inconsistente (${totalCompra} vs total_final ${totalFinal}). Reportá este bug.`,
      );
    }

    // Ecuación: suma pagos = total_compra (= total_final)
    const totalPagos = p.pagos.reduce((s, pg) => s + Number(pg.monto), 0);
    if (Math.abs(totalPagos - totalCompra) > TOL) {
      throw new Error(
        `La suma de las formas de pago (${totalPagos}) no coincide con el total final de la evaluación (${totalCompra}).`,
      );
    }

    // Advisory lock crédito si hay porción crédito
    if (creditoInput) {
      await client.query(
        `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
        [p.empresaId, p.clienteId],
      );
    }

    // Caja abierta si hay pagos que no sean crédito
    // (efectivo y transferencia se asocian al turno para el arqueo).
    let cajaIdEfectivo: string | null = null;
    const necesitaCaja = efectivoInput || transfInput;
    if (necesitaCaja) {
      cajaIdEfectivo = await cajaAbiertaSucursal(client, schema, p.empresaId, p.sucursalId);
      if (!cajaIdEfectivo) {
        throw new Error(
          "No hay caja abierta en la sucursal para registrar el pago; todos los pagos que no sean crédito deben asociarse a una caja/turno.",
        );
      }
    }

    // numero_control atómico
    const nc = await client.query<{ n: string }>(
      `SELECT pronimerp.siguiente_numero_control($1::uuid, 'recepcion') AS n`,
      [p.empresaId],
    );
    const numero = nc.rows[0].n;

    // Cabecera — guarda subtotal_evaluado, ajuste_evaluacion y total_final
    // para auditoría. `total_compra` queda igual al total_final para
    // preservar la semántica del resto de reportes.
    const ins = await client.query<{ id: string; fecha: string }>(
      `INSERT INTO ${recepT} (
         empresa_id, cliente_id, sucursal_id, numero_control,
         total_compra, total_credito, observaciones, estado, cambio_id,
         origen_datos, created_by, usuario_nombre,
         subtotal_evaluado, ajuste_evaluacion, total_final
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente_ingreso',$8,'nuevo_modelo',$9,$10,
                 $11,$12,$13)
       RETURNING id, fecha`,
      [
        p.empresaId, p.clienteId, p.sucursalId, numero,
        totalCompra, creditoInput ? Number(creditoInput.monto) : 0,
        p.observaciones, p.cambioId ?? null, p.createdBy, p.usuarioNombre,
        subtotalEvaluado, ajusteEvaluacion, totalFinal,
      ],
    );
    const recepcionId = ins.rows[0].id;
    const fecha = ins.rows[0].fecha;

    // Items (con datos resueltos server-side)
    for (const it of itemsResueltos) {
      await client.query(
        `INSERT INTO ${recepItemsT} (
           empresa_id, recepcion_id, producto_id, producto_nombre, sku,
           cantidad, precio_compra_unitario, precio_venta_snapshot,
           subtotal, margen_bruto_pct, costo_historico_incompleto
         ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8, $9,$10,false)`,
        [
          p.empresaId, recepcionId, it.producto_id, it.producto_nombre, it.sku,
          it.cantidad, it.precio_compra_unitario, it.precio_venta_snapshot,
          it.subtotal, it.margen_bruto_pct,
        ],
      );
    }

    // Pagos — fuente única de verdad. Todos los pagos "reales" de la
    // recepción (efectivo y transferencia) se asocian a caja/turno; el
    // "crédito" es un asiento contable interno (no toca dinero físico)
    // por eso no exige caja_id.
    // direccion='egreso' porque en una recepción la tienda paga al cliente.
    for (const pg of p.pagos) {
      const cajaParaPago = pg.metodo === "credito" ? null : cajaIdEfectivo;
      await client.query(
        `INSERT INTO ${recepPagosT} (
           empresa_id, recepcion_id, metodo, monto,
           entidad_bancaria_id, entidad_nombre_snapshot, referencia, observacion,
           caja_id, sucursal_id, direccion
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'egreso')`,
        [
          p.empresaId, recepcionId, pg.metodo, Number(pg.monto),
          pg.entidad_bancaria_id ?? null, pg.entidad_nombre_snapshot ?? null,
          pg.referencia ?? null, pg.observacion ?? null,
          cajaParaPago, p.sucursalId,
        ],
      );
    }

    // Solo el crédito genera ENTRADA en el ledger del cliente
    if (creditoInput) {
      await client.query(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1,$2,'ENTRADA',$3,'recepcion',$4,'recepcion',$5,$6,$7,$8)`,
        [
          p.empresaId, p.clienteId, Number(creditoInput.monto), recepcionId, numero,
          `Recepción ${numero}: crédito a favor`,
          p.createdBy, p.usuarioNombre,
        ],
      );
    }

    // Evento historial
    try {
      const desc = [
        `Recepción ${numero} — total Gs. ${Math.round(totalCompra)}.`,
        creditoInput ? `Crédito generado: Gs. ${Math.round(creditoInput.monto)}.` : "",
        efectivoInput ? `Efectivo pagado: Gs. ${Math.round(efectivoInput.monto)}.` : "",
        transfInput ? `Transferencia: Gs. ${Math.round(transfInput.monto)}.` : "",
      ].filter(Boolean).join(" ");
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion, monto,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1,$2,'otro',$3,$4,$5,'recepcion',$6,$7,$8,$9)`,
        [
          p.empresaId, p.clienteId, "Compra al cliente", desc,
          totalCompra, recepcionId, numero, p.createdBy, p.usuarioNombre,
        ],
      );
    } catch { /* opcional */ }

    let estadoFinal: "pendiente_ingreso" | "ingresada" = "pendiente_ingreso";
    let ingresadaAt: string | null = null;

    if (p.ingresarAhora) {
      const r = await ingresarRecepcionPgInternal(client, {
        schema, empresaId: p.empresaId, recepcionId,
        actorId: p.createdBy, actorNombre: p.usuarioNombre,
      });
      estadoFinal = "ingresada";
      ingresadaAt = r.ingresada_at;
    }

    return {
      id: recepcionId,
      numero_control: numero,
      fecha,
      total_compra: totalCompra,
      total_credito: creditoInput ? Number(creditoInput.monto) : 0,
      total_efectivo: efectivoInput ? Number(efectivoInput.monto) : 0,
      total_transferencia: transfInput ? Number(transfInput.monto) : 0,
      estado: estadoFinal,
      ingresada_at: ingresadaAt,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// INGRESAR recepción — actualiza WACP (costo promedio ponderado)
// ═════════════════════════════════════════════════════════════════════

export interface RecepcionIngresarInput {
  schema: string;
  empresaId: string;
  recepcionId: string;
  actorId: string | null;
  actorNombre: string | null;
}

export interface RecepcionIngresada {
  id: string;
  numero_control: string;
  estado: "ingresada";
  ingresada_at: string;
}

export async function ingresarRecepcionPg(p: RecepcionIngresarInput): Promise<RecepcionIngresada> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await ingresarRecepcionPgInternal(client, { ...p, schema });
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

async function ingresarRecepcionPgInternal(
  client: import("pg").PoolClient,
  p: RecepcionIngresarInput,
): Promise<RecepcionIngresada> {
  const schema = p.schema;
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const prodT = quoteSchemaTable(schema, "productos");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");

  const cab = await client.query<{
    id: string;
    numero_control: string;
    estado: string;
    sucursal_id: string;
  }>(
    `SELECT id, numero_control, estado, sucursal_id
     FROM ${recepT}
     WHERE id = $1 AND empresa_id = $2
     FOR UPDATE`,
    [p.recepcionId, p.empresaId],
  );
  if (!cab.rows.length) throw new Error("Recepción no encontrada.");
  const rec = cab.rows[0];

  if (rec.estado === "ingresada") {
    const q = await client.query<{ ingresada_at: string }>(
      `SELECT ingresada_at FROM ${recepT} WHERE id = $1`,
      [p.recepcionId],
    );
    return {
      id: rec.id,
      numero_control: rec.numero_control,
      estado: "ingresada",
      ingresada_at: q.rows[0].ingresada_at,
    };
  }
  if (rec.estado !== "pendiente_ingreso") {
    throw new Error(`No se puede ingresar una recepción en estado '${rec.estado}'.`);
  }

  const items = await client.query<{
    producto_id: string;
    producto_nombre: string;
    sku: string;
    cantidad: string;
    precio_compra_unitario: string | null;
  }>(
    `SELECT producto_id, producto_nombre, sku, cantidad, precio_compra_unitario
     FROM ${recepItemsT}
     WHERE recepcion_id = $1`,
    [p.recepcionId],
  );

  for (const it of items.rows) {
    const qty = Number(it.cantidad);
    const costo = Number(it.precio_compra_unitario ?? 0);

    // ── WACP: costo promedio ponderado ──────────────────────────────
    // stock_prev * costo_prev + qty * costo_nuevo = (stock_prev + qty) * WACP
    // WACP = (stock_prev*costo_prev + qty*costo) / (stock_prev + qty)
    // Se lockea productos.stock_actual + costo_promedio con FOR UPDATE.
    const prevQ = await client.query<{ stock_actual: string; costo_promedio: string }>(
      `SELECT stock_actual::text, costo_promedio::text
       FROM ${prodT} WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [it.producto_id, p.empresaId],
    );
    const stockPrev = Number(prevQ.rows[0]?.stock_actual ?? 0);
    const costoPrev = Number(prevQ.rows[0]?.costo_promedio ?? 0);
    const stockNew = stockPrev + qty;
    const wacp = stockNew > 0
      ? Math.round(((stockPrev * costoPrev) + (qty * costo)) / stockNew)
      : costo;

    await client.query(
      `UPDATE ${prodT}
          SET costo_promedio = $1, updated_at = now()
        WHERE id = $2 AND empresa_id = $3`,
      [wacp, it.producto_id, p.empresaId],
    );

    // Aumentar stock por sucursal (trigger sincroniza productos.stock_actual)
    await client.query(
      `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (producto_id, sucursal_id) DO UPDATE
         SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
             updated_at = now()`,
      [it.producto_id, rec.sucursal_id, qty],
    );

    // Movimiento ENTRADA con costo unitario real
    await client.query(
      `INSERT INTO ${movT} (
         empresa_id, producto_id, producto_nombre, producto_sku,
         tipo, cantidad, costo_unitario, origen, referencia, fecha,
         created_by, usuario_nombre
       ) VALUES ($1,$2,$3,$4,'ENTRADA',$5,$6,'compra',$7,now(),$8,$9)`,
      [
        p.empresaId, it.producto_id, it.producto_nombre, it.sku,
        qty, costo, rec.numero_control, p.actorId, p.actorNombre,
      ],
    );
  }

  const upd = await client.query<{ ingresada_at: string }>(
    `UPDATE ${recepT}
        SET estado = 'ingresada',
            ingresada_at = now(),
            ingresada_by = $1,
            ingresada_by_nombre = $2,
            updated_at = now()
      WHERE id = $3 AND empresa_id = $4
      RETURNING ingresada_at`,
    [p.actorId, p.actorNombre, p.recepcionId, p.empresaId],
  );

  return {
    id: rec.id,
    numero_control: rec.numero_control,
    estado: "ingresada",
    ingresada_at: upd.rows[0].ingresada_at,
  };
}

// ═════════════════════════════════════════════════════════════════════
// ANULAR recepción — BLOQUEA si crédito consumido
// ═════════════════════════════════════════════════════════════════════

export interface RecepcionAnularInput {
  schema: string;
  empresaId: string;
  recepcionId: string;
  motivo: string | null;
  actorId: string | null;
  actorNombre: string | null;
}

export interface RecepcionAnulada {
  id: string;
  numero_control: string;
  estado: "anulada";
  anulada_at: string;
}

export async function anularRecepcionPg(p: RecepcionAnularInput): Promise<RecepcionAnulada> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const recepPagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const prodT = quoteSchemaTable(schema, "productos");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const consumosT = quoteSchemaTable(schema, "cliente_creditos_consumos");
  const eventosT = quoteSchemaTable(schema, "cliente_eventos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock cabecera
    const cab = await client.query<{
      id: string;
      numero_control: string;
      estado: string;
      cliente_id: string;
      sucursal_id: string;
      total_credito: string;
    }>(
      `SELECT id, numero_control, estado, cliente_id, sucursal_id, total_credito::text
       FROM ${recepT}
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    if (!cab.rows.length) throw new Error("Recepción no encontrada.");
    const rec = cab.rows[0];
    if (rec.estado === "anulada") throw new Error("La recepción ya está anulada.");
    const estadoPrev = rec.estado;

    // Advisory lock crédito antes de leer/tocar consumos
    await client.query(
      `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
      [p.empresaId, rec.cliente_id],
    );

    // ── Chequear si el crédito de esta recepción fue consumido ──────
    // Buscar la(s) ENTRADA de crédito por origen=recepcion + referencia_id=recepcion
    const entradas = await client.query<{ id: string; monto: string }>(
      `SELECT id, monto::text FROM ${creditosT}
        WHERE empresa_id = $1 AND cliente_id = $2
          AND tipo = 'ENTRADA' AND origen = 'recepcion' AND referencia_id = $3
        FOR UPDATE`,
      [p.empresaId, rec.cliente_id, p.recepcionId],
    );
    if (entradas.rows.length) {
      const entradaIds = entradas.rows.map((r) => r.id);
      const consumidoQ = await client.query<{
        entrada_id: string;
        monto_consumido: string;
        ventas: string;
      }>(
        `SELECT c.entrada_id,
                SUM(c.monto_aplicado)::text AS monto_consumido,
                COALESCE(string_agg(DISTINCT s.referencia_numero, ', '), '') AS ventas
         FROM ${consumosT} c
         LEFT JOIN ${creditosT} s ON s.id = c.salida_id
         WHERE c.entrada_id = ANY($1::uuid[])
         GROUP BY c.entrada_id
         HAVING SUM(c.monto_aplicado) > 0`,
        [entradaIds],
      );
      if (consumidoQ.rows.length) {
        const totalConsumido = consumidoQ.rows.reduce(
          (s, r) => s + Number(r.monto_consumido), 0);
        const ventas = consumidoQ.rows.map((r) => r.ventas).filter(Boolean).join(", ");
        throw new Error(
          `No se puede anular la recepción ${rec.numero_control}: el crédito ya fue consumido (Gs. ${Math.round(totalConsumido)}${ventas ? ` en ventas ${ventas}` : ""}). Reversá primero esas ventas.`,
        );
      }
    }

    // ── Reversión de crédito: SALIDA por el mismo monto ──────────────
    for (const row of entradas.rows) {
      await client.query(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1,$2,'SALIDA',$3,'ajuste_manual',$4,'recepcion_anulacion',$5,$6,$7,$8)`,
        [
          p.empresaId, rec.cliente_id, Number(row.monto), p.recepcionId,
          rec.numero_control,
          `Reversión anulación de ${rec.numero_control}` + (p.motivo ? ` — ${p.motivo}` : ""),
          p.actorId, p.actorNombre,
        ],
      );
    }

    // ── Reversión de stock + WACP inverso ────────────────────────────
    // Al anular una recepción ingresada:
    //   1) Retirar stock por sucursal (validando que hay suficiente).
    //   2) Recalcular costo_promedio bajo lock transaccional:
    //        valor_actual = stock_actual * costo_promedio
    //        valor_nuevo  = valor_actual - qty * precio_compra_original
    //        stock_nuevo  = stock_actual - qty
    //        costo_nuevo  = valor_nuevo / stock_nuevo  (si stock_nuevo > 0)
    //        costo_nuevo  = 0                          (si stock_nuevo == 0)
    //   3) Si valor_nuevo < 0 (raro; puede pasar por ajustes o compras
    //      posteriores a menor costo), lo clampeamos a 0 y logueamos.
    //   4) Movimiento AJUSTE en movimientos_inventario para trazabilidad.
    if (estadoPrev === "ingresada") {
      const items = await client.query<{
        producto_id: string;
        producto_nombre: string;
        sku: string;
        cantidad: string;
        precio_compra_unitario: string | null;
      }>(
        `SELECT producto_id, producto_nombre, sku, cantidad, precio_compra_unitario
         FROM ${recepItemsT} WHERE recepcion_id = $1`,
        [p.recepcionId],
      );
      for (const it of items.rows) {
        const qty = Number(it.cantidad);
        const costoOriginal = Number(it.precio_compra_unitario ?? 0);

        // Lock stock de sucursal + productos global
        const stockActualQ = await client.query<{ stock_actual: string }>(
          `SELECT stock_actual::text FROM ${stockSucT}
            WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
          [it.producto_id, rec.sucursal_id],
        );
        const stockSucursal = Number(stockActualQ.rows[0]?.stock_actual ?? 0);
        if (stockSucursal < qty) {
          throw new Error(
            `No se puede anular: producto ${it.producto_nombre} no tiene stock suficiente en la sucursal (disp ${stockSucursal}, necesita ${qty}).`,
          );
        }

        // Lock global productos (para WACP)
        const prodQ = await client.query<{ stock_actual: string; costo_promedio: string }>(
          `SELECT stock_actual::text, costo_promedio::text FROM ${prodT}
            WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
          [it.producto_id, p.empresaId],
        );
        const stockGlobal = Number(prodQ.rows[0]?.stock_actual ?? 0);
        const costoGlobal = Number(prodQ.rows[0]?.costo_promedio ?? 0);

        // WACP inverso
        const valorActual = stockGlobal * costoGlobal;
        const valorReducido = valorActual - qty * costoOriginal;
        const stockNuevo = stockGlobal - qty;
        let costoNuevo: number;
        if (stockNuevo <= 0) {
          costoNuevo = 0;
        } else if (valorReducido < 0) {
          throw new Error(
            `No se puede anular la recepción: el WACP inverso de ${it.sku} ` +
              `produciría una valuación negativa. Requiere un ajuste de inventario previo.`,
          );
        } else {
          costoNuevo = Math.round(valorReducido / stockNuevo);
        }

        // Aplicar cambio de costo (el stock global se actualiza por el
        // trigger de sync desde producto_stock_sucursal).
        await client.query(
          `UPDATE ${prodT}
              SET costo_promedio = $1, updated_at = now()
            WHERE id = $2 AND empresa_id = $3`,
          [costoNuevo, it.producto_id, p.empresaId],
        );

        // Retirar stock de la sucursal (el trigger sincroniza el global).
        await client.query(
          `UPDATE ${stockSucT}
              SET stock_actual = stock_actual - $1, updated_at = now()
            WHERE producto_id = $2 AND sucursal_id = $3`,
          [qty, it.producto_id, rec.sucursal_id],
        );

        // Movimiento AJUSTE
        await client.query(
          `INSERT INTO ${movT} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, costo_unitario, origen, referencia, fecha,
             created_by, usuario_nombre
           ) VALUES ($1,$2,$3,$4,'AJUSTE',$5,$6,'ajuste_manual',$7,now(),$8,$9)`,
          [
            p.empresaId, it.producto_id, it.producto_nombre, it.sku,
            -qty, costoOriginal,
            `Anulación ${rec.numero_control} (WACP ${costoGlobal} → ${costoNuevo})`,
            p.actorId, p.actorNombre,
          ],
        );
      }
    }

    // ── Reversión de pagos originales (append-only, direccion opuesta) ──
    // Los pagos originales de la recepción son direccion='egreso' (sale
    // dinero al cliente). La reversión inserta filas nuevas con
    // direccion='ingreso' y reversa_de_id apuntando al original.
    // La reversión va a la caja abierta ACTUAL de la sucursal.
    const pagosOriginales = await client.query<{
      id: string; metodo: string; monto: string; caja_id: string | null;
      sucursal_id: string | null; entidad_bancaria_id: string | null;
      entidad_nombre_snapshot: string | null; direccion: string | null;
      reversa_de_id: string | null; recepcion_id: string; empresa_id: string;
    }>(
      `SELECT id, metodo, monto::text, caja_id, sucursal_id,
              entidad_bancaria_id, entidad_nombre_snapshot,
              direccion, reversa_de_id, recepcion_id, empresa_id
       FROM ${recepPagosT}
       WHERE recepcion_id = $1 AND empresa_id = $2
         AND direccion = 'egreso'
         AND reversa_de_id IS NULL
         AND metodo IN ('efectivo','transferencia')  -- crédito ya se reversó arriba
       FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    if (pagosOriginales.rows.length > 0) {
      // Buscar caja abierta ACTUAL para atribuir la reversión
      const cajasT = quoteSchemaTable(schema, "cajas");
      const cajaActualQ = await client.query<{ id: string }>(
        `SELECT id FROM ${cajasT}
         WHERE empresa_id = $1 AND sucursal_id = $2 AND estado = 'abierta'
         LIMIT 1`,
        [p.empresaId, rec.sucursal_id],
      );
      const cajaTarget = cajaActualQ.rows[0]?.id ?? null;
      if (!cajaTarget) {
        throw new Error(
          "No hay caja abierta en la sucursal para registrar la reversión de pagos de la recepción.",
        );
      }
      for (const orig of pagosOriginales.rows) {
        if (orig.recepcion_id !== p.recepcionId) {
          throw new Error("Pago no corresponde a esta recepción.");
        }
        if (orig.empresa_id !== p.empresaId) throw new Error("Empresa mismatch en pago.");

        const existeQ = await client.query<{ id: string }>(
          `SELECT id FROM ${recepPagosT} WHERE reversa_de_id = $1 LIMIT 1`,
          [orig.id],
        );
        if (existeQ.rows.length > 0) {
          throw new Error(
            `El pago ${orig.id} ya tiene una reversión; no se puede revertir dos veces.`,
          );
        }

        await client.query(
          `INSERT INTO ${recepPagosT} (
             empresa_id, recepcion_id, metodo, monto,
             entidad_bancaria_id, entidad_nombre_snapshot,
             observacion, caja_id, sucursal_id, direccion, reversa_de_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ingreso',$10)`,
          [
            p.empresaId, p.recepcionId, orig.metodo, Number(orig.monto),
            orig.entidad_bancaria_id, orig.entidad_nombre_snapshot,
            `Reversión de pago ${orig.metodo} en anulación de ${rec.numero_control}` +
              (p.motivo ? ` — ${p.motivo}` : ""),
            cajaTarget, rec.sucursal_id, orig.id,
          ],
        );
      }
    }

    // Marcar anulada
    const upd = await client.query<{ anulada_at: string }>(
      `UPDATE ${recepT}
          SET estado = 'anulada',
              anulada_at = now(),
              anulada_by = $1,
              anulada_by_nombre = $2,
              anulacion_motivo = $3,
              updated_at = now()
        WHERE id = $4 AND empresa_id = $5
        RETURNING anulada_at`,
      [p.actorId, p.actorNombre, p.motivo, p.recepcionId, p.empresaId],
    );

    // Evento
    try {
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1,$2,'otro','Recepción anulada',$3,'recepcion',$4,$5,$6,$7)`,
        [
          p.empresaId, rec.cliente_id,
          `Recepción ${rec.numero_control} anulada.` + (p.motivo ? ` Motivo: ${p.motivo}` : ""),
          p.recepcionId, rec.numero_control, p.actorId, p.actorNombre,
        ],
      );
    } catch { /* opcional */ }

    void recepPagosT; // append-only, no borramos filas

    await client.query("COMMIT");
    return {
      id: rec.id,
      numero_control: rec.numero_control,
      estado: "anulada",
      anulada_at: upd.rows[0].anulada_at,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
