/**
 * Núcleo transaccional de RECEPCIONES (compras al cliente) para pronimerp.
 *
 * Rediseño 20260810:
 *   - Cada línea lleva precio_compra_unitario (lo que pagamos al cliente) y
 *     precio_venta_snapshot (precio de la franja al momento). El margen bruto
 *     se calcula por línea y se guarda como referencia.
 *   - La recepción se paga con una combinación de: crédito a favor,
 *     efectivo (egreso de caja), y transferencia. La suma de las formas de
 *     pago debe coincidir exactamente con el total_compra.
 *   - Estados: pendiente_ingreso → ingresada | anulada.
 *   - Sucursal obligatoria. La caja abierta usada para el egreso efectivo
 *     debe ser de la misma sucursal.
 *   - Advisory lock por (empresa_id, cliente_id) cuando se registra crédito.
 *   - Registra evento en cliente_eventos para el historial.
 *   - "Ingresar ahora" corre ingresarRecepcionPg en la misma transacción.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

const TOL = 2; // guaraníes — tolerancia de redondeo

// ═════════════════════════════════════════════════════════════════════
// Tipos
// ═════════════════════════════════════════════════════════════════════

export interface RecepcionItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  /** Lo que la tienda paga al cliente por cada unidad. */
  precio_compra_unitario: number;
  /** Snapshot del precio de venta de la franja al momento (para margen). */
  precio_venta_snapshot: number;
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
  totalDeclarado: number;
  observaciones: string | null;
  createdBy: string | null;
  usuarioNombre: string | null;
  /** Si true, dentro de la misma tx llama a ingresarRecepcionPg. */
  ingresarAhora?: boolean;
  /** Opcional: vincula la recepción a un cambio existente. */
  cambioId?: string | null;
}

export interface RecepcionCreated {
  id: string;
  numero_control: string;
  fecha: string;
  total_compra: number;
  credito_generado: number;
  estado: "pendiente_ingreso" | "ingresada";
  ingresada_at: string | null;
}

// ═════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════

async function nextRecepcionNumero(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string,
): Promise<string> {
  const t = quoteSchemaTable(schema, "cliente_recepciones");
  const { rows } = await client.query<{ maxn: number | null }>(
    `SELECT COALESCE(MAX(
       CASE WHEN numero_control ~ '^REC-[0-9]+$'
            THEN (substring(numero_control from 5))::int
            ELSE 0 END
     ), 0) AS maxn
     FROM ${t} WHERE empresa_id = $1::uuid`,
    [empresaId],
  );
  const next = Number(rows[0]?.maxn ?? 0) + 1;
  return `REC-${String(next).padStart(6, "0")}`;
}

function margenBrutoPct(precioCompra: number, precioVenta: number): number | null {
  if (!Number.isFinite(precioVenta) || precioVenta <= 0) return null;
  return ((precioVenta - precioCompra) / precioVenta) * 100;
}

/** Valida que la sucursal exista y pertenezca a la empresa. */
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
    throw new Error(
      "Sucursal inválida: no existe o no pertenece a la empresa autenticada.",
    );
  }
}

/** Retorna id de la caja abierta en la sucursal. Null si no hay. */
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
// CREAR recepción (pendiente_ingreso por default)
// ═════════════════════════════════════════════════════════════════════

export async function crearRecepcionPg(
  p: RecepcionCreateInput,
): Promise<RecepcionCreated> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  if (!p.items.length) throw new Error("La recepción debe tener al menos una prenda.");
  if (!p.pagos.length) throw new Error("La recepción debe tener al menos una forma de pago.");
  if (!p.sucursalId) {
    throw new Error(
      "Sucursal requerida: no se pudo determinar dónde se registra la compra.",
    );
  }

  // Validar montos > 0 y sumas coherentes.
  for (const it of p.items) {
    if (!(it.cantidad > 0)) throw new Error("Cantidad de línea inválida (debe ser > 0).");
    if (!(it.precio_compra_unitario >= 0)) {
      throw new Error("precio_compra_unitario inválido (debe ser >= 0).");
    }
    if (!(it.precio_venta_snapshot > 0)) {
      throw new Error("precio_venta_snapshot inválido (debe ser > 0).");
    }
  }

  const totalCompraCalc = p.items.reduce(
    (s, it) => s + it.cantidad * it.precio_compra_unitario,
    0,
  );
  if (Math.abs(totalCompraCalc - p.totalDeclarado) > TOL) {
    throw new Error(
      `El total de compra no coincide con las líneas: esperado ${totalCompraCalc}, recibido ${p.totalDeclarado}.`,
    );
  }

  const totalPagosCalc = p.pagos.reduce((s, pg) => s + pg.monto, 0);
  if (Math.abs(totalPagosCalc - totalCompraCalc) > TOL) {
    throw new Error(
      `La suma de las formas de pago (${totalPagosCalc}) no coincide con el total de compra (${totalCompraCalc}).`,
    );
  }

  // Validar que cada método sea único (no se permiten dos "crédito" o dos "efectivo").
  const metodosVistos = new Set<string>();
  for (const pg of p.pagos) {
    if (metodosVistos.has(pg.metodo)) {
      throw new Error(`Método de pago duplicado: ${pg.metodo}. Consolidalo en una sola línea.`);
    }
    metodosVistos.add(pg.metodo);
    if (!(pg.monto > 0)) throw new Error(`Monto de pago inválido para ${pg.metodo}.`);
  }

  const creditoInput = p.pagos.find((x) => x.metodo === "credito");
  const efectivoInput = p.pagos.find((x) => x.metodo === "efectivo");
  const transfInput = p.pagos.find((x) => x.metodo === "transferencia");

  const cliT = quoteSchemaTable(schema, "clientes");
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const recepPagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const cajaMovT = quoteSchemaTable(schema, "caja_movimientos");
  const eventosT = quoteSchemaTable(schema, "cliente_eventos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cliente pertenece a la empresa
    const cl = await client.query(
      `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
      [p.clienteId, p.empresaId],
    );
    if (!cl.rows.length) throw new Error("Cliente no encontrado en esta empresa.");

    // Sucursal pertenece a la empresa
    await validarSucursalEmpresa(client, schema, p.empresaId, p.sucursalId);

    // Advisory lock sobre el crédito del cliente (aunque no haya crédito acá,
    // futuras concurrencias con ventas/otras recepciones se serializan).
    if (creditoInput) {
      await client.query(
        `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
        [p.empresaId, p.clienteId],
      );
    }

    // Caja abierta si hay pago en efectivo
    let cajaIdEfectivo: string | null = null;
    if (efectivoInput) {
      cajaIdEfectivo = await cajaAbiertaSucursal(client, schema, p.empresaId, p.sucursalId);
      if (!cajaIdEfectivo) {
        throw new Error(
          "No hay caja abierta en la sucursal para registrar el egreso en efectivo.",
        );
      }
    }

    const numero = await nextRecepcionNumero(client, schema, p.empresaId);

    // Cabecera
    const ins = await client.query<{ id: string; fecha: string; estado: string }>(
      `INSERT INTO ${recepT} (
         empresa_id, cliente_id, sucursal_id, numero_control,
         total_credito, observaciones, estado, cambio_id, origen_datos,
         created_by, usuario_nombre
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pendiente_ingreso', $7, 'nuevo_modelo', $8, $9)
       RETURNING id, fecha, estado`,
      [
        p.empresaId,
        p.clienteId,
        p.sucursalId,
        numero,
        totalCompraCalc,
        p.observaciones,
        p.cambioId ?? null,
        p.createdBy,
        p.usuarioNombre,
      ],
    );
    const recepcionId = ins.rows[0].id;
    const fecha = ins.rows[0].fecha;

    // Items
    for (const it of p.items) {
      const subtotal = it.cantidad * it.precio_compra_unitario;
      const margen = margenBrutoPct(it.precio_compra_unitario, it.precio_venta_snapshot);
      await client.query(
        `INSERT INTO ${recepItemsT} (
           empresa_id, recepcion_id, producto_id, producto_nombre, sku,
           cantidad, precio_compra_unitario, precio_venta_snapshot, subtotal,
           margen_bruto_pct, costo_historico_incompleto
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)`,
        [
          p.empresaId,
          recepcionId,
          it.producto_id,
          it.producto_nombre,
          it.sku,
          it.cantidad,
          it.precio_compra_unitario,
          it.precio_venta_snapshot,
          subtotal,
          margen,
        ],
      );
    }

    // Pagos: 1..N filas en cliente_recepciones_pagos
    for (const pg of p.pagos) {
      await client.query(
        `INSERT INTO ${recepPagosT} (
           empresa_id, recepcion_id, metodo, monto,
           entidad_bancaria_id, entidad_nombre_snapshot, referencia, observacion
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          p.empresaId,
          recepcionId,
          pg.metodo,
          pg.monto,
          pg.entidad_bancaria_id ?? null,
          pg.entidad_nombre_snapshot ?? null,
          pg.referencia ?? null,
          pg.observacion ?? null,
        ],
      );
    }

    // Efecto financiero: crédito ENTRADA por la porción "crédito"
    if (creditoInput) {
      await client.query(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1, $2, 'ENTRADA', $3, 'recepcion', $4, 'recepcion', $5, $6, $7, $8)`,
        [
          p.empresaId,
          p.clienteId,
          creditoInput.monto,
          recepcionId,
          numero,
          `Recepción ${numero}: crédito a favor por compra`,
          p.createdBy,
          p.usuarioNombre,
        ],
      );
    }

    // Efecto financiero: egreso de caja por la porción "efectivo"
    if (efectivoInput && cajaIdEfectivo) {
      await client.query(
        `INSERT INTO ${cajaMovT} (
           empresa_id, caja_id, tipo, concepto, monto, medio_pago,
           usuario_id, observacion
         ) VALUES ($1, $2, 'egreso', $3, $4, 'efectivo', $5, $6)`,
        [
          p.empresaId,
          cajaIdEfectivo,
          `Compra a cliente ${numero}`,
          efectivoInput.monto,
          p.createdBy,
          efectivoInput.observacion ?? null,
        ],
      );
    }

    // Transferencia: solo registro (no toca caja efectivo)
    // Ya quedó en cliente_recepciones_pagos con referencia/entidad.

    // Evento en historial del cliente (tipo=otro, para que aparezca en timeline)
    try {
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion, monto,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1, $2, 'otro', $3, $4, $5, 'recepcion', $6, $7, $8, $9)`,
        [
          p.empresaId,
          p.clienteId,
          "Compra al cliente",
          `Recepción ${numero} — total Gs. ${Math.round(totalCompraCalc)}.` +
            (creditoInput ? ` Crédito generado: Gs. ${Math.round(creditoInput.monto)}.` : "") +
            (efectivoInput ? ` Efectivo pagado: Gs. ${Math.round(efectivoInput.monto)}.` : "") +
            (transfInput ? ` Transferencia: Gs. ${Math.round(transfInput.monto)}.` : ""),
          totalCompraCalc,
          recepcionId,
          numero,
          p.createdBy,
          p.usuarioNombre,
        ],
      );
    } catch {
      // tabla cliente_eventos puede no existir en instancias viejas — no bloquea
    }

    let estadoFinal: "pendiente_ingreso" | "ingresada" = "pendiente_ingreso";
    let ingresadaAt: string | null = null;

    // Opción: ingresar ahora (mismo request → misma tx)
    if (p.ingresarAhora) {
      const r = await ingresarRecepcionPgInternal(client, {
        schema,
        empresaId: p.empresaId,
        recepcionId,
        actorId: p.createdBy,
        actorNombre: p.usuarioNombre,
      });
      estadoFinal = "ingresada";
      ingresadaAt = r.ingresada_at;
    }

    await client.query("COMMIT");
    return {
      id: recepcionId,
      numero_control: numero,
      fecha,
      total_compra: totalCompraCalc,
      credito_generado: creditoInput?.monto ?? 0,
      estado: estadoFinal,
      ingresada_at: ingresadaAt,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ═════════════════════════════════════════════════════════════════════
// INGRESAR recepción (pendiente_ingreso → ingresada)
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

/** Wrapper transaccional. Llamable desde API. */
export async function ingresarRecepcionPg(
  p: RecepcionIngresarInput,
): Promise<RecepcionIngresada> {
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
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Lógica interna reutilizable — asume que ya estás en una transacción. */
async function ingresarRecepcionPgInternal(
  client: import("pg").PoolClient,
  p: RecepcionIngresarInput,
): Promise<RecepcionIngresada> {
  const schema = p.schema;
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");

  // Bloqueo optimista sobre la cabecera
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
  if (!cab.rows.length) {
    throw new Error("Recepción no encontrada.");
  }
  const rec = cab.rows[0];

  if (rec.estado === "ingresada") {
    // idempotente: si ya está ingresada, no hacemos nada
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

  // Items de la recepción
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

    // Aumentar stock por sucursal (trigger sincroniza productos.stock_actual)
    await client.query(
      `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (producto_id, sucursal_id) DO UPDATE
         SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
             updated_at = now()`,
      [it.producto_id, rec.sucursal_id, qty],
    );

    // Movimiento de inventario ENTRADA con costo unitario real (nunca cero
    // si tenemos precio_compra_unitario; si es null histórico, va 0 con marca)
    await client.query(
      `INSERT INTO ${movT} (
         empresa_id, producto_id, producto_nombre, producto_sku,
         tipo, cantidad, costo_unitario, origen, referencia, fecha,
         created_by, usuario_nombre
       ) VALUES ($1, $2, $3, $4, 'ENTRADA', $5, $6, 'compra', $7, now(), $8, $9)`,
      [
        p.empresaId,
        it.producto_id,
        it.producto_nombre,
        it.sku,
        qty,
        costo,
        rec.numero_control,
        p.actorId,
        p.actorNombre,
      ],
    );
  }

  // Marcar estado ingresada
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
// ANULAR recepción (reversión transaccional)
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

export async function anularRecepcionPg(
  p: RecepcionAnularInput,
): Promise<RecepcionAnulada> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const recepPagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const cajaMovT = quoteSchemaTable(schema, "caja_movimientos");
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
      `SELECT id, numero_control, estado, cliente_id, sucursal_id, total_credito
       FROM ${recepT}
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    if (!cab.rows.length) throw new Error("Recepción no encontrada.");
    const rec = cab.rows[0];
    if (rec.estado === "anulada") throw new Error("La recepción ya está anulada.");

    // Lock advisory sobre crédito del cliente antes de agregar la SALIDA reversal
    await client.query(
      `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
      [p.empresaId, rec.cliente_id],
    );

    // Reversión de crédito: si hubo ENTRADA de crédito por esta recepción,
    // registramos SALIDA reversal por el mismo monto (asiento append-only).
    const cred = await client.query<{ id: string; monto: string }>(
      `SELECT id, monto FROM ${creditosT}
        WHERE empresa_id = $1 AND cliente_id = $2
          AND origen = 'recepcion' AND referencia_id = $3
          AND tipo = 'ENTRADA'
        ORDER BY created_at ASC`,
      [p.empresaId, rec.cliente_id, p.recepcionId],
    );
    for (const row of cred.rows) {
      // Verificar que el saldo del cliente no quede negativo tras la reversión.
      // Si ya se consumió parte del crédito, la reversión sigue siendo válida
      // pero el saldo puede quedar negativo — permitido acá porque es un
      // asiento contable de anulación. El operativo debe reconciliar aparte.
      await client.query(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1, $2, 'SALIDA', $3, 'ajuste_manual', $4,
                   'recepcion_anulacion', $5, $6, $7, $8)`,
        [
          p.empresaId,
          rec.cliente_id,
          Number(row.monto),
          p.recepcionId,
          rec.numero_control,
          `Reversión de crédito por anulación de ${rec.numero_control}` +
            (p.motivo ? ` — ${p.motivo}` : ""),
          p.actorId,
          p.actorNombre,
        ],
      );
    }

    // Reversión de caja: si hubo egreso efectivo por esta recepción,
    // registrar un ingreso compensatorio en la MISMA caja abierta.
    const cajaMovs = await client.query<{ caja_id: string; monto: string }>(
      `SELECT caja_id, monto FROM ${cajaMovT}
        WHERE empresa_id = $1 AND tipo = 'egreso'
          AND concepto = $2`,
      [p.empresaId, `Compra a cliente ${rec.numero_control}`],
    );
    for (const row of cajaMovs.rows) {
      // Buscar si la caja original sigue abierta; si no, usar la abierta actual
      // de la sucursal.
      const cajaAbierta = await client.query<{ id: string }>(
        `SELECT id FROM ${quoteSchemaTable(schema, "cajas")}
          WHERE id = $1 AND estado = 'abierta'`,
        [row.caja_id],
      );
      let cajaTarget = cajaAbierta.rows[0]?.id;
      if (!cajaTarget) {
        cajaTarget = (await cajaAbiertaSucursal(client, schema, p.empresaId, rec.sucursal_id))
          ?? undefined as unknown as string;
      }
      if (!cajaTarget) {
        throw new Error(
          "No hay caja abierta para revertir el egreso en efectivo. Abrí una caja en la sucursal antes de anular.",
        );
      }
      await client.query(
        `INSERT INTO ${cajaMovT} (
           empresa_id, caja_id, tipo, concepto, monto, medio_pago,
           usuario_id, observacion
         ) VALUES ($1, $2, 'ingreso', $3, $4, 'efectivo', $5, $6)`,
        [
          p.empresaId,
          cajaTarget,
          `Reversión anulación ${rec.numero_control}`,
          Number(row.monto),
          p.actorId,
          p.motivo ?? null,
        ],
      );
    }

    // Reversión de stock: solo si la recepción estaba INGRESADA.
    if (rec.estado === "ingresada") {
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
        // Verificar que no queda stock negativo tras la reversión
        const stockActual = await client.query<{ stock_actual: string }>(
          `SELECT stock_actual FROM ${stockSucT}
            WHERE producto_id = $1 AND sucursal_id = $2
            FOR UPDATE`,
          [it.producto_id, rec.sucursal_id],
        );
        const disponible = Number(stockActual.rows[0]?.stock_actual ?? 0);
        if (disponible < qty) {
          throw new Error(
            `No se puede anular: el producto ${it.producto_nombre} ya no tiene stock suficiente para revertir (disponible ${disponible}, necesario ${qty}). Reponer stock primero o anular manualmente.`,
          );
        }
        await client.query(
          `UPDATE ${stockSucT}
              SET stock_actual = stock_actual - $1, updated_at = now()
            WHERE producto_id = $2 AND sucursal_id = $3`,
          [qty, it.producto_id, rec.sucursal_id],
        );
        await client.query(
          `INSERT INTO ${movT} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, costo_unitario, origen, referencia, fecha,
             created_by, usuario_nombre
           ) VALUES ($1, $2, $3, $4, 'AJUSTE', $5, $6, 'ajuste_manual', $7, now(), $8, $9)`,
          [
            p.empresaId,
            it.producto_id,
            it.producto_nombre,
            it.sku,
            -qty,
            Number(it.precio_compra_unitario ?? 0),
            `Anulación ${rec.numero_control}`,
            p.actorId,
            p.actorNombre,
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

    // Evento en historial
    try {
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1, $2, 'otro', 'Recepción anulada', $3,
                   'recepcion', $4, $5, $6, $7)`,
        [
          p.empresaId,
          rec.cliente_id,
          `Recepción ${rec.numero_control} anulada.` +
            (p.motivo ? ` Motivo: ${p.motivo}` : ""),
          p.recepcionId,
          rec.numero_control,
          p.actorId,
          p.actorNombre,
        ],
      );
    } catch {
      /* opcional */
    }

    // Pagos: quedan como registro histórico, NO se borran (append-only).
    // (Referencia informativa: se pueden marcar mediante update, pero no es
    // necesario porque el estado de la cabecera es la fuente de verdad.)
    void recepPagosT;

    await client.query("COMMIT");
    return {
      id: rec.id,
      numero_control: rec.numero_control,
      estado: "anulada",
      anulada_at: upd.rows[0].anulada_at,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
