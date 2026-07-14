/**
 * Núcleo transaccional de VENTAS para pronimerp.
 *
 * Rediseño 20260810:
 *   - Todo dentro de UNA transacción PostgreSQL: venta + items + stock +
 *     movimientos_inventario + consumo FIFO de crédito + pago_detalle +
 *     movimiento de caja (solo por efectivo) + CxC (si aplica) + evento
 *     historial del cliente.
 *   - Advisory lock por (empresa_id, cliente_id) antes de tocar el saldo
 *     de crédito. Serializa ventas concurrentes al mismo cliente.
 *   - El crédito aplicado NUNCA cuenta como ingreso de caja.
 *   - Stock insuficiente ⇒ ERROR (sin fallback "permitir_sin_stock").
 *   - Sucursal obligatoria, validada contra empresa.
 *   - CxC se crea SOLO por el saldo_restante en ventas a crédito.
 *   - Suma de crédito + efectivo + tarjeta + transferencia + otros DEBE
 *     ser igual al total.
 *   - Ninguna operación es best-effort: si algo falla, ROLLBACK completo.
 */
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { confirmarCambioPg } from "@/lib/cambios/server/cambio-pg";

const TOL = 2; // guaraníes — tolerancia redondeo

// ═════════════════════════════════════════════════════════════════════
// Tipos
// ═════════════════════════════════════════════════════════════════════

export interface CreateVentaItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
  subtotal: number;
  monto_iva: number;
  total_linea: number;
  /** Fase Decants: si true, el ítem se entrega como obsequio. */
  es_sin_cargo?: boolean;
  motivo_sin_cargo?: string | null;
}

export type MetodoPagoVenta =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "qr"
  | "billetera"
  | "otro";

export interface PagoDetalleVentaInput {
  metodo_pago: MetodoPagoVenta;
  monto: number;
  entidad_bancaria_id?: string | null;
  entidad_nombre_snapshot?: string | null;
  referencia?: string | null;
  titular?: string | null;
  fecha_acreditacion?: string | null;
  observacion?: string | null;
}

export interface CreateVentaPgParams {
  schema: string;
  empresaId: string;
  clienteId: string;
  observaciones: string | null;
  moneda: "GS" | "USD";
  tipoCambio: number;
  tipoVenta: "CONTADO" | "CREDITO";
  plazoDias: number | null;
  items: CreateVentaItemInput[];
  subtotalDeclarado: number;
  montoIvaDeclarado: number;
  totalDeclarado: number;
  /** Sucursal donde se materializa la venta (OBLIGATORIA en pronimerp). */
  sucursalId: string;
  /** Monto aplicado del saldo a favor del cliente. Descuenta FIFO. */
  creditoClienteUsado?: number | null;
  /** Formas de pago no-crédito. La suma + creditoClienteUsado debe = total. */
  pagosDetalle?: PagoDetalleVentaInput[];
  /** Actor. */
  createdBy?: string | null;
  usuarioNombre?: string | null;
  /** Vincula a operación de cambio, si aplica. */
  cambioId?: string | null;
}

function qTable(schema: string, table: string): string {
  return quoteSchemaTable(schema, table);
}

function recalcTotals(items: CreateVentaItemInput[]) {
  let subtotal = 0;
  let montoIva = 0;
  let total = 0;
  for (const it of items) {
    if (it.es_sin_cargo === true) continue;
    subtotal += it.subtotal;
    montoIva += it.monto_iva;
    total += it.total_linea;
  }
  return { subtotal, montoIva, total };
}

// ═════════════════════════════════════════════════════════════════════
// CREAR VENTA
// ═════════════════════════════════════════════════════════════════════

export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams,
): Promise<{
  ventaId: string;
  numeroControl: string;
  fechaIso: string;
  saldoRestante: number;
  creditoAplicado: number;
  cxcId: string | null;
}> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión directa a Postgres (SUPABASE_DB_URL).");

  // ── Validaciones básicas ──────────────────────────────────────────
  if (!params.clienteId) {
    throw new Error("Cliente requerido: no se pueden registrar ventas sin cliente.");
  }
  if (!params.sucursalId) {
    throw new Error(
      "Sucursal requerida: no se pudo determinar la sucursal para la venta.",
    );
  }
  if (!params.items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }

  const calc = recalcTotals(params.items);
  if (
    Math.abs(calc.subtotal - params.subtotalDeclarado) > TOL ||
    Math.abs(calc.montoIva - params.montoIvaDeclarado) > TOL ||
    Math.abs(calc.total - params.totalDeclarado) > TOL
  ) {
    throw new Error("Los totales no coinciden con los ítems; revisá el carrito.");
  }

  const creditoUsado = Math.max(0, Number(params.creditoClienteUsado ?? 0));
  const saldoRestanteEsperado = Math.max(0, calc.total - creditoUsado);

  // Suma de pagos_detalle DEBE cubrir el saldo restante exactamente.
  const pagos = params.pagosDetalle ?? [];
  if (saldoRestanteEsperado > TOL) {
    const totalPagos = pagos.reduce((s, pg) => s + Number(pg.monto), 0);
    if (Math.abs(totalPagos - saldoRestanteEsperado) > TOL) {
      throw new Error(
        `La suma de las formas de pago (${totalPagos}) no coincide con el saldo restante (${saldoRestanteEsperado}). Total ${calc.total}, crédito aplicado ${creditoUsado}.`,
      );
    }
  } else if (pagos.length > 0) {
    const totalPagos = pagos.reduce((s, pg) => s + Number(pg.monto), 0);
    if (totalPagos > TOL) {
      throw new Error(
        "La venta está cubierta 100% con crédito del cliente; no se aceptan pagos adicionales.",
      );
    }
  }

  // Cuánto de los pagos es EFECTIVO (para movimiento de caja)
  const totalEfectivo = pagos
    .filter((pg) => pg.metodo_pago === "efectivo")
    .reduce((s, pg) => s + Number(pg.monto), 0);

  const qtyByProduct = new Map<string, number>();
  for (const it of params.items) {
    const prev = qtyByProduct.get(it.producto_id) ?? 0;
    qtyByProduct.set(it.producto_id, prev + it.cantidad);
  }

  const ventasT = qTable(params.schema, "ventas");
  const cajasT = qTable(params.schema, "cajas");
  const cajaMovT = qTable(params.schema, "caja_movimientos");
  const itemsT = qTable(params.schema, "ventas_items");
  const movT = qTable(params.schema, "movimientos_inventario");
  const prodT = qTable(params.schema, "productos");
  const stockSucT = qTable(params.schema, "producto_stock_sucursal");
  const cliT = qTable(params.schema, "clientes");
  const sucT = qTable(params.schema, "sucursales");
  const creditosT = qTable(params.schema, "cliente_creditos_movimientos");
  const consumosT = qTable(params.schema, "cliente_creditos_consumos");
  const cxcT = qTable(params.schema, "cuentas_por_cobrar");
  const pagosDetT = qTable(params.schema, "ventas_pagos_detalle");
  const eventosT = qTable(params.schema, "cliente_eventos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Cliente + sucursal pertenecen a la empresa ──────────────────
    const ck = await client.query(
      `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
      [params.clienteId, params.empresaId],
    );
    if (!ck.rows.length) throw new Error("Cliente no encontrado en esta empresa.");

    const sc = await client.query(
      `SELECT 1 FROM ${sucT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
      [params.sucursalId, params.empresaId],
    );
    if (!sc.rows.length) {
      throw new Error(
        "Sucursal inválida: no existe o no pertenece a la empresa autenticada.",
      );
    }

    // ── Advisory lock sobre crédito del cliente ─────────────────────
    if (creditoUsado > 0) {
      await client.query(
        `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
        [params.empresaId, params.clienteId],
      );

      // Recalcular saldo real DESPUÉS de tomar el lock (importante para
      // concurrencia: dos ventas simultáneas al mismo cliente esperan
      // acá; la segunda ve el saldo actualizado).
      const saldoQ = await client.query<{ saldo: string }>(
        `SELECT COALESCE(SUM(
           CASE WHEN tipo = 'ENTRADA' THEN monto
                WHEN tipo = 'SALIDA' THEN -monto
                WHEN tipo = 'AJUSTE' THEN monto
                ELSE 0 END
         ), 0)::text AS saldo
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [params.empresaId, params.clienteId],
      );
      const saldoActual = Number(saldoQ.rows[0]?.saldo ?? 0);
      if (creditoUsado > saldoActual + TOL) {
        throw new Error(
          `El crédito disponible del cliente cambió porque fue utilizado en otra operación. Saldo actual: Gs. ${Math.round(saldoActual)}.`,
        );
      }
    }

    // ── Caja abierta si hay efectivo ────────────────────────────────
    let cajaIdActual: string | null = null;
    if (totalEfectivo > TOL) {
      const cajaQ = await client.query<{ id: string }>(
        `SELECT id FROM ${cajasT}
         WHERE empresa_id = $1 AND sucursal_id = $2 AND estado = 'abierta'
         LIMIT 1`,
        [params.empresaId, params.sucursalId],
      );
      cajaIdActual = cajaQ.rows[0]?.id ?? null;
      if (!cajaIdActual) {
        throw new Error(
          "No hay caja abierta en la sucursal para registrar el ingreso en efectivo.",
        );
      }
    }

    // ── Lock + descuento de stock por sucursal ──────────────────────
    const ids = [...qtyByProduct.keys()];
    const locked = await client.query<{
      id: string;
      stock_actual: string;
      costo_promedio: string;
      nombre: string;
      sku: string;
      es_decant: boolean;
    }>(
      `SELECT id, stock_actual, costo_promedio, nombre, sku, es_decant
       FROM ${prodT}
       WHERE empresa_id = $1 AND id = ANY($2::uuid[])
       FOR UPDATE`,
      [params.empresaId, ids],
    );
    if (locked.rows.length !== ids.length) {
      throw new Error("Algún producto de la venta ya no existe.");
    }

    // Stock de la sucursal
    const stockSuc = await client.query<{ producto_id: string; stock_actual: string }>(
      `SELECT producto_id, stock_actual FROM ${stockSucT}
        WHERE sucursal_id = $1 AND producto_id = ANY($2::uuid[])
        FOR UPDATE`,
      [params.sucursalId, ids],
    );
    const stockByProd = new Map(stockSuc.rows.map((r) => [r.producto_id, Number(r.stock_actual)]));

    const productoInfo = new Map<
      string,
      { nombre: string; sku: string; costo_promedio: number; es_decant: boolean }
    >();
    for (const p of locked.rows) {
      productoInfo.set(p.id, {
        nombre: p.nombre,
        sku: p.sku,
        costo_promedio: Number(p.costo_promedio),
        es_decant: p.es_decant === true,
      });
    }

    // Validar stock suficiente por producto (pronimerp: NO se permite negativo)
    for (const [prodId, qty] of qtyByProduct) {
      const disp = stockByProd.get(prodId) ?? 0;
      if (qty > disp) {
        const inf = productoInfo.get(prodId);
        throw new Error(
          `Stock insuficiente para ${inf?.nombre ?? prodId} (SKU ${inf?.sku ?? "?"}): disponible ${disp} en la sucursal, solicitado ${qty}.`,
        );
      }
    }

    // ── Insertar cabecera de venta ──────────────────────────────────
    // numero_control
    const numQ = await client.query<{ maxn: number | null }>(
      `SELECT COALESCE(MAX(
         CASE WHEN numero_control ~ '^V-[0-9]+$'
              THEN (substring(numero_control from 3))::int
              ELSE 0 END
       ), 0) AS maxn
       FROM ${ventasT} WHERE empresa_id = $1`,
      [params.empresaId],
    );
    const numeroControl = `V-${String(Number(numQ.rows[0]?.maxn ?? 0) + 1).padStart(6, "0")}`;

    const insVenta = await client.query<{ id: string; fecha: string }>(
      `INSERT INTO ${ventasT} (
         empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
         subtotal, monto_iva, total, estado, tipo_venta, plazo_dias, fecha,
         observaciones, caja_id, metodo_pago, sucursal_id, cambio_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, 'completada', $9, $10, now(),
         $11, $12, $13, $14, $15
       )
       RETURNING id, fecha`,
      [
        params.empresaId,
        params.clienteId,
        numeroControl,
        params.moneda,
        params.tipoCambio,
        calc.subtotal,
        calc.montoIva,
        calc.total,
        params.tipoVenta,
        params.plazoDias,
        params.observaciones,
        cajaIdActual,
        // metodo_pago legacy en la fila: el primer método distinto o 'efectivo'
        pagos[0]?.metodo_pago ?? (creditoUsado > 0 ? "efectivo" : "efectivo"),
        params.sucursalId,
        params.cambioId ?? null,
      ],
    );
    const ventaId = insVenta.rows[0].id;
    const fechaIso = insVenta.rows[0].fecha;

    // ── Insertar items + descontar stock + movimientos SALIDA ──────
    for (const it of params.items) {
      const info = productoInfo.get(it.producto_id);
      const costoUnit = info?.costo_promedio ?? 0;
      await client.query(
        `INSERT INTO ${itemsT} (
           empresa_id, venta_id, producto_id, producto_nombre, sku,
           cantidad, precio_venta_original, precio_venta, tipo_iva,
           subtotal, monto_iva, total_linea, es_sin_cargo, motivo_sin_cargo,
           costo_unitario_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          params.empresaId,
          ventaId,
          it.producto_id,
          it.producto_nombre,
          it.sku,
          it.cantidad,
          it.precio_venta_original,
          it.precio_venta,
          it.tipo_iva,
          it.subtotal,
          it.monto_iva,
          it.total_linea,
          it.es_sin_cargo === true,
          it.motivo_sin_cargo ?? null,
          costoUnit,
        ],
      );
    }

    // Descuento agrupado por producto
    for (const [prodId, qty] of qtyByProduct) {
      await client.query(
        `UPDATE ${stockSucT}
            SET stock_actual = stock_actual - $1, updated_at = now()
          WHERE producto_id = $2 AND sucursal_id = $3`,
        [qty, prodId, params.sucursalId],
      );
      const inf = productoInfo.get(prodId);
      await client.query(
        `INSERT INTO ${movT} (
           empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, costo_unitario, origen, referencia, fecha,
           venta_id, created_by, usuario_nombre
         ) VALUES ($1, $2, $3, $4, 'SALIDA', $5, $6, 'venta', $7, now(),
                   $8, $9, $10)`,
        [
          params.empresaId,
          prodId,
          inf?.nombre ?? "",
          inf?.sku ?? "",
          qty,
          inf?.costo_promedio ?? 0,
          numeroControl,
          ventaId,
          params.createdBy ?? null,
          params.usuarioNombre ?? null,
        ],
      );
    }

    // ── Crédito aplicado FIFO ───────────────────────────────────────
    let salidaCredId: string | null = null;
    if (creditoUsado > 0) {
      const salidaIns = await client.query<{ id: string }>(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1, $2, 'SALIDA', $3, 'venta', $4, 'venta', $5, $6, $7, $8)
         RETURNING id`,
        [
          params.empresaId,
          params.clienteId,
          creditoUsado,
          ventaId,
          numeroControl,
          `Aplicado como pago en venta ${numeroControl}`,
          params.createdBy ?? null,
          params.usuarioNombre ?? null,
        ],
      );
      salidaCredId = salidaIns.rows[0].id;

      // FIFO
      const lotesQ = await client.query<{ id: string; saldo: string }>(
        `SELECT e.id,
                (e.monto - COALESCE((
                  SELECT SUM(c.monto_aplicado)
                  FROM ${consumosT} c
                  WHERE c.entrada_id = e.id
                ), 0))::text AS saldo
         FROM ${creditosT} e
         WHERE e.empresa_id = $1 AND e.cliente_id = $2
           AND e.tipo IN ('ENTRADA','AJUSTE')
         ORDER BY e.fecha ASC, e.created_at ASC
         FOR UPDATE`,
        [params.empresaId, params.clienteId],
      );
      let restante = creditoUsado;
      for (const lote of lotesQ.rows) {
        if (restante <= 0) break;
        const saldo = Number(lote.saldo);
        if (saldo <= 0) continue;
        const aplicar = Math.min(saldo, restante);
        await client.query(
          `INSERT INTO ${consumosT} (empresa_id, entrada_id, salida_id, monto_aplicado)
           VALUES ($1, $2, $3, $4)`,
          [params.empresaId, lote.id, salidaCredId, aplicar],
        );
        restante -= aplicar;
      }
      if (restante > TOL) {
        throw new Error(
          `El crédito disponible del cliente cambió porque fue utilizado en otra operación. Faltaron Gs. ${Math.round(restante)}.`,
        );
      }
    }

    // ── Pago detalle (todos los métodos no-crédito) ─────────────────
    for (const pg of pagos) {
      await client.query(
        `INSERT INTO ${pagosDetT} (
           empresa_id, venta_id, sucursal_id, metodo_pago,
           entidad_bancaria_id, entidad_nombre_snapshot, monto, referencia,
           titular, fecha_acreditacion, observacion
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          params.empresaId,
          ventaId,
          params.sucursalId,
          pg.metodo_pago,
          pg.entidad_bancaria_id ?? null,
          pg.entidad_nombre_snapshot ?? null,
          pg.monto,
          pg.referencia ?? null,
          pg.titular ?? null,
          pg.fecha_acreditacion ?? null,
          pg.observacion ?? null,
        ],
      );
    }

    // Registro del crédito aplicado como una línea de pago detalle (para
    // conciliación posterior). No afecta caja.
    if (creditoUsado > 0) {
      await client.query(
        `INSERT INTO ${pagosDetT} (
           empresa_id, venta_id, sucursal_id, metodo_pago, monto, observacion
         ) VALUES ($1, $2, $3, 'credito_cliente', $4, $5)`,
        [
          params.empresaId,
          ventaId,
          params.sucursalId,
          creditoUsado,
          `Crédito a favor aplicado (SALIDA ${salidaCredId ?? ""})`,
        ],
      );
    }

    // ── Movimiento de caja (SOLO efectivo — nunca crédito) ─────────
    if (totalEfectivo > TOL && cajaIdActual) {
      await client.query(
        `INSERT INTO ${cajaMovT} (
           empresa_id, caja_id, tipo, concepto, monto, medio_pago,
           usuario_id, observacion
         ) VALUES ($1, $2, 'ingreso', $3, $4, 'efectivo', $5, $6)`,
        [
          params.empresaId,
          cajaIdActual,
          `Venta ${numeroControl}`,
          totalEfectivo,
          params.createdBy ?? null,
          null,
        ],
      );
    }

    // ── CxC solo por saldo_restante en venta a CREDITO ─────────────
    let cxcId: string | null = null;
    if (params.tipoVenta === "CREDITO" && saldoRestanteEsperado > TOL) {
      const vencimiento = params.plazoDias && params.plazoDias > 0
        ? new Date(Date.now() + params.plazoDias * 86400000)
            .toISOString()
            .slice(0, 10)
        : null;
      const cxcIns = await client.query<{ id: string }>(
        `INSERT INTO ${cxcT} (
           empresa_id, cliente_id, venta_id, sucursal_id, numero_venta,
           moneda, total, saldo, estado, fecha_emision, fecha_vencimiento
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', now(), $9)
         RETURNING id`,
        [
          params.empresaId,
          params.clienteId,
          ventaId,
          params.sucursalId,
          numeroControl,
          params.moneda,
          saldoRestanteEsperado,
          saldoRestanteEsperado,
          vencimiento,
        ],
      );
      cxcId = cxcIns.rows[0].id;
    }

    // ── Evento historial cliente ────────────────────────────────────
    try {
      const tipoEv = creditoUsado > 0 && saldoRestanteEsperado <= TOL
        ? "credito_uso"
        : creditoUsado > 0
        ? "cambio"
        : "beneficio"; // fallback tipo genérico
      const titulo = params.tipoVenta === "CREDITO"
        ? "Compró (crédito)"
        : "Compró";
      const detalle = [
        `Venta ${numeroControl} — total Gs. ${Math.round(calc.total)}.`,
        creditoUsado > 0 ? `Crédito aplicado: Gs. ${Math.round(creditoUsado)}.` : "",
        saldoRestanteEsperado > TOL ? `Saldo pagado: Gs. ${Math.round(saldoRestanteEsperado)}.` : "",
      ].filter(Boolean).join(" ");
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion, monto,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1, $2, $3, $4, $5, $6, 'venta', $7, $8, $9, $10)`,
        [
          params.empresaId,
          params.clienteId,
          tipoEv,
          titulo,
          detalle,
          calc.total,
          ventaId,
          numeroControl,
          params.createdBy ?? null,
          params.usuarioNombre ?? null,
        ],
      );
    } catch {
      /* tabla puede no existir en instancias viejas */
    }

    // ── Cerrar cambio si aplica ─────────────────────────────────────
    if (params.cambioId) {
      await confirmarCambioPg(client, {
        schema: params.schema,
        empresaId: params.empresaId,
        cambioId: params.cambioId,
        ventaId,
        ventaTotal: calc.total,
        creditoAplicado: creditoUsado,
        saldoRestantePagado: saldoRestanteEsperado,
      });
    }

    await client.query("COMMIT");

    return {
      ventaId,
      numeroControl,
      fechaIso,
      saldoRestante: saldoRestanteEsperado,
      creditoAplicado: creditoUsado,
      cxcId,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
