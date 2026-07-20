/**
 * Núcleo transaccional de VENTAS para pronimerp.
 *
 * Rediseño 20260811 (correcciones críticas):
 *
 *   1) Ecuación única:
 *        total = credito_aplicado + pagos_inmediatos + monto_financiado
 *      - CONTADO ⇒ monto_financiado = 0
 *      - CREDITO ⇒ CxC = monto_financiado (SOLO la parte no pagada)
 *      - Nunca se genera un pago efectivo ficticio por el total.
 *
 *   2) Fuente de verdad única para pagos = ventas_pagos_detalle.
 *      NO se inserta caja_movimientos (eso es solo para ajustes manuales).
 *      Cada pago en efectivo lleva caja_id + sucursal_id para atribución.
 *
 *   3) No se confía en precio_venta / nombre / sku / subtotales del cliente.
 *      Se resuelven server-side leyendo `productos` con FOR UPDATE.
 *
 *   4) Sucursal ESTRICTA (rechaza si no coincide con la del usuario).
 *
 *   5) numero_control vía pronimerp.siguiente_numero_control(RPC atómica).
 *
 *   6) Advisory lock por (empresa_id, cliente_id) para serializar
 *      operaciones concurrentes sobre el mismo saldo de crédito.
 *
 *   7) Stock insuficiente ⇒ rechazo (no hay flag "permitir_sin_stock").
 *
 *   8) Toda la operación es una sola transacción. Ninguna fase best-effort.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { confirmarCambioPg } from "@/lib/cambios/server/cambio-pg";

const TOL = 2; // guaraníes — tolerancia de redondeo

// ═════════════════════════════════════════════════════════════════════
// Tipos
// ═════════════════════════════════════════════════════════════════════

/** Ítem del cliente. Solo `producto_id` y `cantidad` son autoritativos;
 *  el resto se ignora en el server y se resuelve desde la DB. `tipo_iva`
 *  se acepta como sugerencia pero se recalcula si el producto tiene
 *  regla distinta. */
export interface CreateVentaItemInput {
  producto_id: string;
  cantidad: number;
  /** Solo para líneas es_sin_cargo=true (decants). */
  es_sin_cargo?: boolean;
  motivo_sin_cargo?: string | null;
  /** Sugerencia del cliente. Server valida y usa siempre EXENTA para franjas. */
  tipo_iva?: "EXENTA" | "5%" | "10%";
  /** Snapshot del carrito (informativo, se usa solo para validar coincidencia). */
  precio_venta_sugerido?: number;
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
  /** OBLIGATORIA. */
  sucursalId: string;
  /**
   * Caja/turno explícito. Si viene, la venta se registra en esa caja
   * (previa verificación de sucursal + estado abierta). Si es null, el
   * server intenta resolverla: falla si hay 0 abiertas en la sucursal o
   * si hay más de una (multi-punto: hay que elegir).
   */
  cajaId?: string | null;
  /** Monto aplicado del saldo a favor. Distribución FIFO server-side. */
  creditoClienteUsado?: number | null;
  /** Pagos inmediatos (no incluir crédito acá). */
  pagosInmediatos?: PagoDetalleVentaInput[];
  createdBy?: string | null;
  usuarioNombre?: string | null;
  /** Vincula a operación de cambio. */
  cambioId?: string | null;
}

export interface CreateVentaResult {
  ventaId: string;
  numeroControl: string;
  fechaIso: string;
  total: number;
  creditoAplicado: number;
  pagosInmediatosTotal: number;
  montoFinanciado: number;
  cxcId: string | null;
}

// ═════════════════════════════════════════════════════════════════════

function qTable(schema: string, table: string): string {
  return quoteSchemaTable(schema, table);
}

/**
 * Bloquea y devuelve info de productos desde la DB. Rechaza si:
 *   - producto no existe
 *   - no pertenece a la empresa
 *   - activo=false
 *   - no es una franja de precio (Pronim vende cantidades por categoría/precio)
 */
async function lockProductosServerSide(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string,
  productoIds: string[],
): Promise<
  Map<string, {
    id: string;
    nombre: string;
    sku: string;
    precio_venta: number;
    costo_promedio: number;
    es_decant: boolean;
    es_franja_precio: boolean;
    activo: boolean;
  }>
> {
  if (productoIds.length === 0) return new Map();
  const prodT = qTable(schema, "productos");
  const r = await client.query<{
    id: string;
    nombre: string;
    sku: string;
    precio_venta: string;
    costo_promedio: string;
    es_decant: boolean;
    es_franja_precio: boolean;
    activo: boolean;
  }>(
    `SELECT id, nombre, sku, precio_venta::text, costo_promedio::text,
            es_decant, es_franja_precio, activo
     FROM ${prodT}
     WHERE empresa_id = $1 AND id = ANY($2::uuid[])
     FOR UPDATE`,
    [empresaId, productoIds],
  );
  if (r.rows.length !== productoIds.length) {
    throw new Error("Uno o más productos no existen en la empresa.");
  }
  const out = new Map<string, {
    id: string; nombre: string; sku: string;
    precio_venta: number; costo_promedio: number;
    es_decant: boolean; es_franja_precio: boolean; activo: boolean;
  }>();
  for (const p of r.rows) {
    if (!p.activo) {
      throw new Error(`El producto ${p.nombre} (${p.sku}) está inactivo y no puede venderse.`);
    }
    if (!p.es_franja_precio) {
      throw new Error(
        `El producto ${p.nombre} (${p.sku}) no es una categoría de precio válida para Pronim.`,
      );
    }
    out.set(p.id, {
      id: p.id,
      nombre: p.nombre,
      sku: p.sku,
      precio_venta: Number(p.precio_venta),
      costo_promedio: Number(p.costo_promedio),
      es_decant: p.es_decant === true,
      es_franja_precio: p.es_franja_precio === true,
      activo: p.activo,
    });
  }
  return out;
}

function computeIva(tipoIva: "EXENTA" | "5%" | "10%", subtotal: number): number {
  if (tipoIva === "5%") return Math.round(subtotal / 21);   // 5/105 aproximado
  if (tipoIva === "10%") return Math.round(subtotal / 11);  // 10/110 aproximado
  return 0;
}

// ═════════════════════════════════════════════════════════════════════
// CREAR VENTA
// ═════════════════════════════════════════════════════════════════════

export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams,
): Promise<CreateVentaResult> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión directa a Postgres (SUPABASE_DB_URL).");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await createVentaEnClientePg(client, params);
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
export async function createVentaEnClientePg(
  client: import("pg").PoolClient,
  params: CreateVentaPgParams,
): Promise<CreateVentaResult> {
  // ── Validaciones sintácticas ────────────────────────────────────────
  if (!params.clienteId) {
    throw new Error("Cliente requerido: no se pueden registrar ventas sin cliente.");
  }
  if (!params.sucursalId) {
    throw new Error("Sucursal requerida: no se pudo determinar la sucursal.");
  }
  if (!params.items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }
  const creditoUsado = Math.max(0, Number(params.creditoClienteUsado ?? 0));
  const pagosInmediatos = (params.pagosInmediatos ?? []).filter(
    (pg) => Number(pg.monto) > 0,
  );

  const cliT = qTable(params.schema, "clientes");
  const sucT = qTable(params.schema, "sucursales");
  const cajasT = qTable(params.schema, "cajas");
  const ventasT = qTable(params.schema, "ventas");
  const itemsT = qTable(params.schema, "ventas_items");
  const movT = qTable(params.schema, "movimientos_inventario");
  const stockSucT = qTable(params.schema, "producto_stock_sucursal");
  const creditosT = qTable(params.schema, "cliente_creditos_movimientos");
  const consumosT = qTable(params.schema, "cliente_creditos_consumos");
  const cxcT = qTable(params.schema, "cuentas_por_cobrar");
  const pagosDetT = qTable(params.schema, "ventas_pagos_detalle");
  const eventosT = qTable(params.schema, "cliente_eventos");
  const entidadesT = qTable(params.schema, "entidades_bancarias");

  {

    // ── Cliente + sucursal pertenecen a la empresa ────────────────────
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
      throw new Error("Sucursal inválida: no pertenece a la empresa autenticada.");
    }

    // Toda entidad bancaria recibida desde la UI debe pertenecer al tenant.
    const entidadIds = [
      ...new Set(
        pagosInmediatos
          .map((pg) => pg.entidad_bancaria_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (entidadIds.length > 0) {
      const eq = await client.query<{ id: string }>(
        `SELECT id FROM ${entidadesT}
         WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
        [params.empresaId, entidadIds],
      );
      if (eq.rows.length !== entidadIds.length) {
        throw new Error("Una o más entidades bancarias no pertenecen a esta empresa.");
      }
    }

    // ── Lock productos server-side ────────────────────────────────────
    const uniqueIds = [...new Set(params.items.map((i) => i.producto_id))];
    const productosInfo = await lockProductosServerSide(
      client,
      params.schema,
      params.empresaId,
      uniqueIds,
    );

    // ── Recalcular subtotales / totals SERVER-SIDE ────────────────────
    // - producto_nombre, sku, precio_venta ← DB
    // - subtotal, monto_iva, total_linea ← calculados
    // - IVA: si el sugerido != al calculable se usa el server; para franjas → EXENTA
    interface ItemResuelto {
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
      es_sin_cargo: boolean;
      motivo_sin_cargo: string | null;
      costo_unitario_snapshot: number;
    }
    const itemsResueltos: ItemResuelto[] = [];
    for (const it of params.items) {
      const info = productosInfo.get(it.producto_id);
      if (!info) throw new Error(`Producto ${it.producto_id} no resuelto server-side.`);
      const cantidad = Number(it.cantidad);
      if (!(cantidad > 0)) {
        throw new Error(`Cantidad inválida en línea (${info.sku}): ${cantidad}.`);
      }
      const esSinCargo = it.es_sin_cargo === true;
      if (esSinCargo && !info.es_decant) {
        throw new Error(`El producto ${info.sku} no permite entrega sin cargo.`);
      }
      // Franjas siempre EXENTA. Para otros productos, aceptar sugerencia.
      const tipoIva: "EXENTA" | "5%" | "10%" = info.es_franja_precio
        ? "EXENTA"
        : (it.tipo_iva === "5%" || it.tipo_iva === "10%") ? it.tipo_iva : "EXENTA";
      const precioVenta = esSinCargo ? 0 : info.precio_venta;
      const subtotal = cantidad * precioVenta;
      const montoIva = esSinCargo ? 0 : computeIva(tipoIva, subtotal);
      const totalLinea = subtotal; // el IVA es informativo en el modelo Pronim
      itemsResueltos.push({
        producto_id: info.id,
        producto_nombre: info.nombre,
        sku: info.sku,
        cantidad,
        precio_venta_original: precioVenta,
        precio_venta: precioVenta,
        tipo_iva: tipoIva,
        subtotal,
        monto_iva: montoIva,
        total_linea: totalLinea,
        es_sin_cargo: esSinCargo,
        motivo_sin_cargo: esSinCargo ? (it.motivo_sin_cargo ?? "decant_obsequio") : null,
        costo_unitario_snapshot: info.costo_promedio,
      });
    }

    const subtotal = itemsResueltos.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = itemsResueltos.reduce((s, i) => s + i.monto_iva, 0);
    const total = itemsResueltos.reduce((s, i) => s + i.total_linea, 0);

    // ── Ecuación única ────────────────────────────────────────────────
    const totalPagosInmediatos = pagosInmediatos.reduce(
      (s, pg) => s + Number(pg.monto), 0);
    // monto_financiado = lo que queda pendiente (CxC en venta a CREDITO)
    const montoFinanciado = Math.max(0, total - creditoUsado - totalPagosInmediatos);

    // Validaciones semánticas
    if (creditoUsado > total + TOL) {
      throw new Error("El crédito aplicado supera el total de la venta.");
    }
    if (totalPagosInmediatos > total - creditoUsado + TOL) {
      throw new Error("Los pagos inmediatos superan el saldo restante de la venta.");
    }
    if (params.tipoVenta === "CONTADO" && montoFinanciado > TOL) {
      throw new Error(
        `Venta CONTADO no puede quedar con saldo financiado. Total ${total}, crédito ${creditoUsado}, pagos ${totalPagosInmediatos}, financiado ${montoFinanciado}.`,
      );
    }
    if (params.tipoVenta === "CREDITO" && montoFinanciado <= TOL) {
      throw new Error(
        "Venta CREDITO debe tener saldo financiado > 0; si no, usar CONTADO.",
      );
    }
    if (params.tipoVenta === "CREDITO" && (!params.plazoDias || params.plazoDias < 1)) {
      throw new Error("Venta a crédito requiere plazo de al menos 1 día.");
    }

    // ── Advisory lock crédito + validación de saldo ───────────────────
    if (creditoUsado > 0) {
      await client.query(
        `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
        [params.empresaId, params.clienteId],
      );
      const saldoQ = await client.query<{ saldo: string }>(
        `SELECT COALESCE(SUM(
           CASE WHEN tipo='ENTRADA' THEN monto
                WHEN tipo='SALIDA' THEN -monto
                WHEN tipo='AJUSTE' THEN monto ELSE 0 END
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

    // ── Caja abierta: se usa para TODOS los pagos inmediatos ────────
    // Todos los pagos inmediatos (efectivo, tarjeta, transferencia, etc)
    // se asocian a la caja/turno para que aparezcan en su resumen. Solo
    // efectivo modifica efectivo_esperado; los otros aparecen en su
    // total por método.
    // La venta misma también se asocia a la caja para que se cuente en
    // total_vendido del turno, incluso si es a crédito sin pago inmediato.
    const totalEfectivo = pagosInmediatos
      .filter((pg) => pg.metodo_pago === "efectivo")
      .reduce((s, pg) => s + Number(pg.monto), 0);
    // Toda venta pertenece a un turno de caja, incluso si se paga íntegramente
    // con crédito del cliente o queda financiada sin entrega inicial. Multi-
    // punto: si el cliente eligió `cajaId` en el body, se valida; si no, se
    // resuelve automáticamente cuando hay exactamente una abierta en la
    // sucursal.
    let cajaIdActual: string | null = null;
    if (params.cajaId) {
      const cq = await client.query<{ id: string; sucursal_id: string | null; estado: string }>(
        `SELECT id, sucursal_id, estado FROM ${cajasT}
          WHERE empresa_id=$1 AND id=$2 LIMIT 1`,
        [params.empresaId, params.cajaId],
      );
      const row = cq.rows[0];
      if (!row) throw new Error("La caja indicada no existe en esta empresa.");
      if (row.sucursal_id !== params.sucursalId) {
        throw new Error("La caja indicada no pertenece a la sucursal de la venta.");
      }
      if (row.estado !== "abierta") {
        throw new Error("La caja indicada está cerrada; abrí una nueva o elegí otra.");
      }
      cajaIdActual = row.id;
    } else {
      const cq = await client.query<{ id: string }>(
        `SELECT id FROM ${cajasT}
         WHERE empresa_id=$1 AND sucursal_id=$2 AND estado='abierta'
         ORDER BY fecha_apertura DESC
         LIMIT 2`,
        [params.empresaId, params.sucursalId],
      );
      if (cq.rows.length === 0) {
        throw new Error(
          "No hay caja abierta en la sucursal. Abrí un punto de caja antes de vender.",
        );
      }
      if (cq.rows.length > 1) {
        throw new Error(
          "Hay más de una caja abierta en la sucursal. Especificá caja_id para elegir el turno.",
        );
      }
      cajaIdActual = cq.rows[0].id;
    }

    // ── Lock stock por sucursal + validar suficiencia ─────────────────
    const qtyByProduct = new Map<string, number>();
    for (const it of itemsResueltos) {
      qtyByProduct.set(
        it.producto_id,
        (qtyByProduct.get(it.producto_id) ?? 0) + it.cantidad,
      );
    }
    const stockSuc = await client.query<{ producto_id: string; stock_actual: string }>(
      `SELECT producto_id, stock_actual::text
       FROM ${stockSucT}
       WHERE sucursal_id = $1 AND producto_id = ANY($2::uuid[])
       FOR UPDATE`,
      [params.sucursalId, [...qtyByProduct.keys()]],
    );
    const stockByProd = new Map(
      stockSuc.rows.map((r) => [r.producto_id, Number(r.stock_actual)]),
    );
    for (const [prodId, qty] of qtyByProduct) {
      const info = productosInfo.get(prodId);
      const disp = stockByProd.get(prodId) ?? 0;
      if (qty > disp + TOL) {
        // Mensaje pensado para la cajera: humano, con la franja bien
        // visible y los números al final para que se lea "sobra"/"falta"
        // sin releer. El SKU va entre paréntesis por si necesita buscar.
        const franja = info?.nombre ?? prodId;
        const sku = info?.sku ?? "?";
        const faltan = Math.max(0, qty - disp);
        throw new Error(
          `Sin stock suficiente en la franja ${franja}. `
          + `Faltan ${faltan} prenda${faltan === 1 ? "" : "s"} `
          + `(pediste ${qty} y hay ${disp} en esta sucursal). `
          + `Revisá el stock o quitá ${faltan} de la venta. `
          + `[SKU ${sku}]`,
        );
      }
    }

    // ── numero_control (RPC atómica) ──────────────────────────────────
    const nc = await client.query<{ n: string }>(
      `SELECT pronimerp.siguiente_numero_control($1::uuid, 'venta') AS n`,
      [params.empresaId],
    );
    const numeroControl = nc.rows[0].n;

    // ── Insertar cabecera ────────────────────────────────────────────
    // metodo_pago legacy: guardamos "efectivo" si hubo efectivo, sino el primero
    // (informativo; la fuente de verdad son ventas_pagos_detalle).
    const metodoPagoLegacy = totalEfectivo > 0 ? "efectivo"
      : (pagosInmediatos[0]?.metodo_pago ?? "efectivo");
    const insVenta = await client.query<{ id: string; fecha: string }>(
      `INSERT INTO ${ventasT} (
         empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
         subtotal, monto_iva, total, estado, tipo_venta, plazo_dias, fecha,
         observaciones, caja_id, metodo_pago, sucursal_id, cambio_id
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,'completada',$9,$10,now(),
                 $11,$12,$13,$14,$15)
       RETURNING id, fecha`,
      [
        params.empresaId,
        params.clienteId,
        numeroControl,
        params.moneda,
        params.tipoCambio,
        subtotal,
        montoIva,
        total,
        params.tipoVenta,
        params.plazoDias,
        params.observaciones,
        cajaIdActual,
        metodoPagoLegacy,
        params.sucursalId,
        params.cambioId ?? null,
      ],
    );
    const ventaId = insVenta.rows[0].id;
    const fechaIso = insVenta.rows[0].fecha;

    // ── Items ────────────────────────────────────────────────────────
    for (const it of itemsResueltos) {
      await client.query(
        `INSERT INTO ${itemsT} (
           empresa_id, venta_id, producto_id, producto_nombre, sku,
           cantidad, precio_venta_original, precio_venta, tipo_iva,
           subtotal, monto_iva, total_linea, es_sin_cargo, motivo_sin_cargo,
           costo_unitario_snapshot
         ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14, $15)`,
        [
          params.empresaId, ventaId, it.producto_id, it.producto_nombre, it.sku,
          it.cantidad, it.precio_venta_original, it.precio_venta, it.tipo_iva,
          it.subtotal, it.monto_iva, it.total_linea, it.es_sin_cargo, it.motivo_sin_cargo,
          it.costo_unitario_snapshot,
        ],
      );
    }

    // ── Descontar stock + movimientos SALIDA ─────────────────────────
    for (const [prodId, qty] of qtyByProduct) {
      await client.query(
        `UPDATE ${stockSucT}
            SET stock_actual = stock_actual - $1, updated_at = now()
          WHERE producto_id = $2 AND sucursal_id = $3`,
        [qty, prodId, params.sucursalId],
      );
      const inf = productosInfo.get(prodId)!;
      await client.query(
        `INSERT INTO ${movT} (
           empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, costo_unitario, origen, referencia, fecha,
           venta_id, created_by, usuario_nombre
         ) VALUES ($1,$2,$3,$4,'SALIDA',$5,$6,'venta',$7,now(),$8,$9,$10)`,
        [
          params.empresaId, prodId, inf.nombre, inf.sku, qty,
          inf.costo_promedio, numeroControl, ventaId,
          params.createdBy ?? null, params.usuarioNombre ?? null,
        ],
      );
    }

    // ── Consumo FIFO de crédito ──────────────────────────────────────
    let salidaCredId: string | null = null;
    if (creditoUsado > 0) {
      const salidaIns = await client.query<{ id: string }>(
        `INSERT INTO ${creditosT} (
           empresa_id, cliente_id, tipo, monto, origen, referencia_id,
           referencia_tipo, referencia_numero, observaciones,
           created_by, usuario_nombre
         ) VALUES ($1,$2,'SALIDA',$3,'venta',$4,'venta',$5,$6,$7,$8)
         RETURNING id`,
        [
          params.empresaId, params.clienteId, creditoUsado, ventaId,
          numeroControl, `Aplicado como pago en venta ${numeroControl}`,
          params.createdBy ?? null, params.usuarioNombre ?? null,
        ],
      );
      salidaCredId = salidaIns.rows[0].id;

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
           VALUES ($1,$2,$3,$4)`,
          [params.empresaId, lote.id, salidaCredId, aplicar],
        );
        restante -= aplicar;
      }
      if (restante > TOL) {
        throw new Error(
          `El crédito del cliente cambió durante la operación. Faltaron Gs. ${Math.round(restante)}.`,
        );
      }
    }

    // ── Pagos inmediatos: ventas_pagos_detalle (fuente única) ────────
    // NO se inserta en caja_movimientos (esa tabla es solo ajustes manuales).
    // TODOS los métodos (efectivo, tarjeta, transferencia, qr, billetera) se
    // asocian a la caja/turno con caja_id. Solo efectivo modifica
    // efectivo_esperado; los demás aparecen en sus totales por método.
    // direccion='ingreso' porque es un pago recibido por la venta.
    for (const pg of pagosInmediatos) {
      await client.query(
        `INSERT INTO ${pagosDetT} (
           empresa_id, venta_id, sucursal_id, caja_id, metodo_pago,
           entidad_bancaria_id, entidad_nombre_snapshot, monto, referencia,
           titular, fecha_acreditacion, observacion, direccion
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ingreso')`,
        [
          params.empresaId, ventaId, params.sucursalId, cajaIdActual,
          pg.metodo_pago, pg.entidad_bancaria_id ?? null,
          pg.entidad_nombre_snapshot ?? null, pg.monto,
          pg.referencia ?? null, pg.titular ?? null,
          pg.fecha_acreditacion ?? null, pg.observacion ?? null,
        ],
      );
    }

    // El crédito aplicado NO va como pago_detalle (no es efectivo/banco).
    // Queda representado en cliente_creditos_movimientos + consumos FIFO.

    // ── CxC solo por monto_financiado (venta CREDITO) ─────────────────
    let cxcId: string | null = null;
    if (params.tipoVenta === "CREDITO" && montoFinanciado > TOL) {
      const vencimiento = params.plazoDias && params.plazoDias > 0
        ? new Date(Date.now() + params.plazoDias * 86400000).toISOString().slice(0, 10)
        : null;
      const cxcIns = await client.query<{ id: string }>(
        `INSERT INTO ${cxcT} (
           empresa_id, cliente_id, venta_id, sucursal_id, numero_venta,
           moneda, total, saldo, estado, fecha_emision, fecha_vencimiento
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendiente',now(),$9)
         RETURNING id`,
        [
          params.empresaId, params.clienteId, ventaId, params.sucursalId,
          numeroControl, params.moneda, montoFinanciado, montoFinanciado, vencimiento,
        ],
      );
      cxcId = cxcIns.rows[0].id;
    }

    // ── Evento historial ─────────────────────────────────────────────
    try {
      const tipoEv: "cambio" | "credito_uso" | "beneficio" =
        params.cambioId ? "cambio"
        : creditoUsado > 0 ? "credito_uso"
        : "beneficio";
      const detalle = [
        `Venta ${numeroControl} — total Gs. ${Math.round(total)}.`,
        creditoUsado > 0 ? `Crédito aplicado: Gs. ${Math.round(creditoUsado)}.` : "",
        totalPagosInmediatos > 0 ? `Pagos inmediatos: Gs. ${Math.round(totalPagosInmediatos)}.` : "",
        montoFinanciado > 0 ? `Financiado (CxC): Gs. ${Math.round(montoFinanciado)}.` : "",
      ].filter(Boolean).join(" ");
      await client.query(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion, monto,
           referencia_tipo, referencia_id, referencia_numero,
           autor_id, autor_nombre
         ) VALUES ($1,$2,$3,$4,$5,$6,'venta',$7,$8,$9,$10)`,
        [
          params.empresaId, params.clienteId, tipoEv,
          params.tipoVenta === "CREDITO" ? "Compró (crédito)" : "Compró",
          detalle, total, ventaId, numeroControl,
          params.createdBy ?? null, params.usuarioNombre ?? null,
        ],
      );
    } catch {
      /* cliente_eventos puede no existir en instancias viejas */
    }

    // ── Cerrar cambio si aplica ──────────────────────────────────────
    if (params.cambioId) {
      await confirmarCambioPg(client, {
        schema: params.schema,
        empresaId: params.empresaId,
        cambioId: params.cambioId,
        ventaId,
        ventaTotal: total,
        creditoAplicado: creditoUsado,
        saldoRestantePagado: totalPagosInmediatos,
      });
    }

    return {
      ventaId,
      numeroControl,
      fechaIso,
      total,
      creditoAplicado: creditoUsado,
      pagosInmediatosTotal: totalPagosInmediatos,
      montoFinanciado,
      cxcId,
    };
  }
}
