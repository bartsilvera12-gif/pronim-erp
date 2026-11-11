/**
 * Devoluciones de prendas vendidas (pronimerp).
 *
 * Reglas (confirmadas por la clienta):
 *   - Se puede devolver cualquier prenda vendida hace 90 días o menos.
 *   - Valor = precio al que se vendió (ventas_items.precio_venta).
 *   - Stock: vuelve al mismo producto, en la sucursal que recibe.
 *   - El valor queda como crédito a favor (cliente_creditos_movimientos,
 *     origen 'devolucion', referencia a la venta original) SIN vencimiento.
 *     Si hay compra nueva, esa venta usa el crédito para descontarse del total.
 *   - Una prenda no se puede devolver dos veces (ventas_devoluciones_items).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const DEVOLUCION_PLAZO_DIAS = 90;

export interface DevolucionItemInput {
  venta_item_id: string;
  cantidad: number;
}

export interface CrearDevolucionParams {
  schema: string;
  empresaId: string;
  /** Si viene, debe coincidir con el cliente de la venta original. */
  clienteId?: string | null;
  sucursalId: string;
  ventaOriginalId: string;
  items: DevolucionItemInput[];
  ventaNuevaId?: string | null;
  observaciones?: string | null;
  createdBy?: string | null;
  usuarioNombre?: string | null;
}

export interface CrearDevolucionResult {
  devolucionId: string;
  total: number;
  clienteId: string;
  ventaOriginalNumero: string;
  creditoId: string;
  requiereNotaCredito: boolean;
}

const MS_DIA = 86400000;

/** Días enteros transcurridos desde la fecha de venta. */
export function diasDesde(fechaIso: string | Date, ahora: Date = new Date()): number {
  const f = fechaIso instanceof Date ? fechaIso : new Date(fechaIso);
  return Math.floor((ahora.getTime() - f.getTime()) / MS_DIA);
}

export async function crearDevolucionPg(p: CrearDevolucionParams): Promise<CrearDevolucionResult> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión directa a Postgres.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await crearDevolucionEnClientePg(client, p);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

export async function crearDevolucionEnClientePg(
  client: import("pg").PoolClient,
  p: CrearDevolucionParams,
): Promise<CrearDevolucionResult> {
  const schema = assertAllowedChatDataSchema(p.schema);
  if (!p.ventaOriginalId) throw new Error("Elegí la venta original de la devolución.");
  if (!p.sucursalId) throw new Error("Sucursal requerida para registrar la devolución.");

  // Se agrupa por ítem: la misma línea no puede venir dos veces.
  const pedido = new Map<string, number>();
  for (const it of p.items ?? []) {
    const c = Number(it.cantidad);
    if (!it.venta_item_id || !(c > 0)) continue;
    pedido.set(it.venta_item_id, (pedido.get(it.venta_item_id) ?? 0) + c);
  }
  if (pedido.size === 0) throw new Error("Elegí al menos una prenda para devolver.");

  const ventasT = quoteSchemaTable(schema, "ventas");
  const itemsT = quoteSchemaTable(schema, "ventas_items");
  const devT = quoteSchemaTable(schema, "ventas_devoluciones");
  const devItemsT = quoteSchemaTable(schema, "ventas_devoluciones_items");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
  const eventosT = quoteSchemaTable(schema, "cliente_eventos");
  const sucT = quoteSchemaTable(schema, "sucursales");

  const sc = await client.query(
    `SELECT 1 FROM ${sucT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
    [p.sucursalId, p.empresaId],
  );
  if (!sc.rows.length) throw new Error("Sucursal inválida: no pertenece a la empresa.");

  const vq = await client.query<{
    id: string; cliente_id: string | null; numero_control: string; estado: string;
    fecha: string; factura_numero: string | null;
  }>(
    `SELECT id, cliente_id, numero_control, estado, fecha, factura_numero
       FROM ${ventasT}
      WHERE id = $1 AND empresa_id = $2
      FOR UPDATE`,
    [p.ventaOriginalId, p.empresaId],
  );
  const venta = vq.rows[0];
  if (!venta) throw new Error("La venta original no existe.");
  if (venta.estado !== "completada") {
    throw new Error(`La venta ${venta.numero_control} está ${venta.estado}: no se puede devolver.`);
  }
  if (!venta.cliente_id) throw new Error("La venta original no tiene cliente.");
  if (p.clienteId && p.clienteId !== venta.cliente_id) {
    throw new Error(
      `La venta ${venta.numero_control} es de otro cliente: la devolución tiene que ser de una venta del mismo cliente.`,
    );
  }
  const dias = diasDesde(venta.fecha);
  if (dias > DEVOLUCION_PLAZO_DIAS) {
    throw new Error(
      `La venta ${venta.numero_control} se hizo hace ${dias} días: solo se pueden devolver prendas vendidas hace ${DEVOLUCION_PLAZO_DIAS} días o menos.`,
    );
  }

  const ids = [...pedido.keys()];
  const iq = await client.query<{
    id: string; producto_id: string; producto_nombre: string; sku: string;
    cantidad: string; precio_venta: string; costo_unitario_snapshot: string | null;
  }>(
    `SELECT id, producto_id, producto_nombre, sku, cantidad::text, precio_venta::text,
            costo_unitario_snapshot::text
       FROM ${itemsT}
      WHERE venta_id = $1 AND empresa_id = $2 AND id = ANY($3::uuid[])
      FOR UPDATE`,
    [venta.id, p.empresaId, ids],
  );
  if (iq.rows.length !== ids.length) {
    throw new Error("Alguna de las prendas elegidas no pertenece a esa venta.");
  }
  const dq = await client.query<{ venta_item_id: string; devuelto: string }>(
    `SELECT venta_item_id, SUM(cantidad)::text AS devuelto
       FROM ${devItemsT}
      WHERE empresa_id = $1 AND venta_item_id = ANY($2::uuid[])
      GROUP BY venta_item_id`,
    [p.empresaId, ids],
  );
  const yaDevuelto = new Map(dq.rows.map((r) => [r.venta_item_id, Number(r.devuelto)]));

  let total = 0;
  const lineas = iq.rows.map((it) => {
    const cant = pedido.get(it.id)!;
    const disponible = Number(it.cantidad) - (yaDevuelto.get(it.id) ?? 0);
    if (cant > disponible + 1e-9) {
      throw new Error(
        disponible <= 0
          ? `La prenda ${it.producto_nombre} (${it.sku}) ya fue devuelta: no se puede devolver dos veces.`
          : `De ${it.producto_nombre} (${it.sku}) solo quedan ${disponible} para devolver.`,
      );
    }
    const precio = Number(it.precio_venta);
    const sub = Math.round(cant * precio);
    total += sub;
    return { ...it, cant, precio, sub };
  });

  const dIns = await client.query<{ id: string }>(
    `INSERT INTO ${devT} (
       empresa_id, cliente_id, venta_original_id, sucursal_id, venta_nueva_id,
       total, requiere_nota_credito, observaciones, created_by, usuario_nombre
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      p.empresaId, venta.cliente_id, venta.id, p.sucursalId, p.ventaNuevaId ?? null,
      total, venta.factura_numero != null, p.observaciones ?? null,
      p.createdBy ?? null, p.usuarioNombre ?? null,
    ],
  );
  const devolucionId = dIns.rows[0].id;

  for (const l of lineas) {
    await client.query(
      `INSERT INTO ${devItemsT} (
         empresa_id, devolucion_id, venta_item_id, venta_original_id,
         producto_id, cantidad, precio_venta, total
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.empresaId, devolucionId, l.id, venta.id, l.producto_id, l.cant, l.precio, l.sub],
    );
    // Stock: vuelve al mismo producto, en la sucursal que recibe.
    await client.query(
      `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (producto_id, sucursal_id) DO UPDATE
         SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
             updated_at = now()`,
      [l.producto_id, p.sucursalId, l.cant],
    );
    await client.query(
      `INSERT INTO ${movT} (
         empresa_id, producto_id, producto_nombre, producto_sku,
         tipo, cantidad, costo_unitario, origen, referencia, fecha,
         venta_id, created_by, usuario_nombre
       ) VALUES ($1,$2,$3,$4,'ENTRADA',$5,$6,'ajuste_manual',$7,now(),$8,$9,$10)`,
      [
        p.empresaId, l.producto_id, l.producto_nombre, l.sku, l.cant,
        Math.max(0, Number(l.costo_unitario_snapshot ?? 0) || 0),
        `Devolución de venta ${venta.numero_control}`, venta.id,
        p.createdBy ?? null, p.usuarioNombre ?? null,
      ],
    );
  }

  // Crédito a favor: origen 'devolucion', sin vencimiento (vencimiento_at NULL).
  await client.query(
    `SELECT pronimerp.lock_cliente_credito($1::uuid, $2::uuid)`,
    [p.empresaId, venta.cliente_id],
  );
  const cIns = await client.query<{ id: string }>(
    `INSERT INTO ${creditosT} (
       empresa_id, cliente_id, tipo, monto, origen, categoria,
       referencia_id, referencia_tipo, referencia_numero, observaciones,
       vencimiento_at, created_by, usuario_nombre
     ) VALUES ($1,$2,'ENTRADA',$3,'devolucion','credito',$4,'devolucion',$5,$6,NULL,$7,$8)
     RETURNING id`,
    [
      p.empresaId, venta.cliente_id, total, venta.id, venta.numero_control,
      `Devolución de prendas de la venta ${venta.numero_control}`,
      p.createdBy ?? null, p.usuarioNombre ?? null,
    ],
  );
  const creditoId = cIns.rows[0].id;
  await client.query(
    `UPDATE ${devT} SET credito_movimiento_id = $1 WHERE id = $2`,
    [creditoId, devolucionId],
  );

  // Historial del cliente (opcional: si falla no corta la devolución).
  await client.query("SAVEPOINT sp_evento_devolucion");
  try {
    await client.query(
      `INSERT INTO ${eventosT} (
         empresa_id, cliente_id, tipo, titulo, descripcion, monto,
         referencia_tipo, referencia_id, referencia_numero, autor_id, autor_nombre
       ) VALUES ($1,$2,'beneficio','Devolución de prendas',$3,$4,'venta',$5,$6,$7,$8)`,
      [
        p.empresaId, venta.cliente_id,
        `Devolvió prendas de la venta ${venta.numero_control} por Gs. ${total.toLocaleString("es-PY")}.`,
        total, venta.id, venta.numero_control, p.createdBy ?? null, p.usuarioNombre ?? null,
      ],
    );
    await client.query("RELEASE SAVEPOINT sp_evento_devolucion");
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT sp_evento_devolucion");
    await client.query("RELEASE SAVEPOINT sp_evento_devolucion");
    console.warn("[devolucion] evento historial falló:", e instanceof Error ? e.message : e);
  }

  return {
    devolucionId,
    total,
    clienteId: venta.cliente_id,
    ventaOriginalNumero: venta.numero_control,
    creditoId,
    requiereNotaCredito: venta.factura_numero != null,
  };
}

export interface VentaDevolublePrenda {
  venta_item_id: string;
  producto_nombre: string;
  sku: string;
  precio_venta: number;
  cantidad_vendida: number;
  cantidad_disponible: number;
}
export interface VentaDevoluble {
  id: string;
  numero_control: string;
  fecha: string;
  dias: number;
  fuera_de_plazo: boolean;
  cliente_id: string;
  cliente_nombre: string | null;
  prendas: VentaDevolublePrenda[];
}

/** Ventas completadas del cliente (o por número) con lo que todavía se puede devolver. */
export async function buscarVentasDevoluciblesPg(p: {
  schema: string;
  empresaId: string;
  clienteId?: string | null;
  q?: string | null;
}): Promise<VentaDevoluble[]> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión directa a Postgres.");
  const schema = assertAllowedChatDataSchema(p.schema);
  const ventasT = quoteSchemaTable(schema, "ventas");
  const itemsT = quoteSchemaTable(schema, "ventas_items");
  const devItemsT = quoteSchemaTable(schema, "ventas_devoluciones_items");
  const cliT = quoteSchemaTable(schema, "clientes");

  const q = (p.q ?? "").trim();
  if (!p.clienteId && !q) return [];
  const params: unknown[] = [p.empresaId];
  let where = `v.empresa_id = $1 AND v.estado = 'completada' AND v.cliente_id IS NOT NULL`;
  if (p.clienteId) {
    params.push(p.clienteId);
    where += ` AND v.cliente_id = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (v.numero_control ILIKE $${params.length} OR c.nombre ILIKE $${params.length})`;
  }
  const vr = await pool.query<{
    id: string; numero_control: string; fecha: string; cliente_id: string; cliente_nombre: string | null;
  }>(
    `SELECT v.id, v.numero_control, v.fecha, v.cliente_id, c.nombre AS cliente_nombre
       FROM ${ventasT} v LEFT JOIN ${cliT} c ON c.id = v.cliente_id
      WHERE ${where}
      ORDER BY v.fecha DESC
      LIMIT 15`,
    params,
  );
  if (!vr.rows.length) return [];
  const ventaIds = vr.rows.map((r) => r.id);
  const ir = await pool.query<{
    id: string; venta_id: string; producto_nombre: string; sku: string;
    cantidad: string; precio_venta: string; devuelto: string;
  }>(
    `SELECT i.id, i.venta_id, i.producto_nombre, i.sku, i.cantidad::text, i.precio_venta::text,
            COALESCE((SELECT SUM(d.cantidad) FROM ${devItemsT} d WHERE d.venta_item_id = i.id), 0)::text AS devuelto
       FROM ${itemsT} i
      WHERE i.empresa_id = $1 AND i.venta_id = ANY($2::uuid[])
      ORDER BY i.created_at`,
    [p.empresaId, ventaIds],
  );
  return vr.rows.map((v) => {
    const dias = diasDesde(v.fecha);
    return {
      id: v.id,
      numero_control: v.numero_control,
      fecha: v.fecha,
      dias,
      fuera_de_plazo: dias > DEVOLUCION_PLAZO_DIAS,
      cliente_id: v.cliente_id,
      cliente_nombre: v.cliente_nombre,
      prendas: ir.rows
        .filter((i) => i.venta_id === v.id)
        .map((i) => ({
          venta_item_id: i.id,
          producto_nombre: i.producto_nombre,
          sku: i.sku,
          precio_venta: Number(i.precio_venta),
          cantidad_vendida: Number(i.cantidad),
          cantidad_disponible: Number(i.cantidad) - Number(i.devuelto),
        }))
        .filter((i) => i.cantidad_disponible > 0),
    };
  });
}
