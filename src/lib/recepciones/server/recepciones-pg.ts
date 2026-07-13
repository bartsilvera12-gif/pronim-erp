import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export interface RecepcionItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface RecepcionCreateInput {
  schema: string;
  empresaId: string;
  clienteId: string;
  sucursalId: string | null;
  items: RecepcionItemInput[];
  totalDeclarado: number;
  observaciones: string | null;
  createdBy: string | null;
  usuarioNombre: string | null;
}

export interface RecepcionCreated {
  id: string;
  numero_control: string;
  fecha: string;
  total_credito: number;
}

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

/**
 * Registra una recepción de prendas del cliente:
 *  - Inserta cabecera + líneas.
 *  - Aumenta stock por sucursal (producto_stock_sucursal).
 *  - Registra movimiento ENTRADA por cada línea (origen=ajuste_manual con
 *    referencia = número de recepción, para reutilizar la tabla existente).
 *  - Genera cliente_creditos_movimientos ENTRADA por total.
 * Todo transaccional.
 */
export async function crearRecepcionPg(
  p: RecepcionCreateInput,
): Promise<RecepcionCreated> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  if (!p.items.length) throw new Error("La recepción debe tener al menos una prenda.");

  // Recalculo defensivo del total.
  const totalCalc = p.items.reduce((s, it) => s + it.subtotal, 0);
  if (Math.abs(totalCalc - p.totalDeclarado) > 2) {
    throw new Error("El total no coincide con los ítems (revisá cantidades).");
  }

  const cliT = quoteSchemaTable(schema, "clientes");
  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
  const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
  const prodT = quoteSchemaTable(schema, "productos");
  const movT = quoteSchemaTable(schema, "movimientos_inventario");
  const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validar cliente pertenece a empresa.
    const cl = await client.query(
      `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
      [p.clienteId, p.empresaId],
    );
    if (!cl.rows.length) throw new Error("Cliente no encontrado en esta empresa.");

    const numero = await nextRecepcionNumero(client, schema, p.empresaId);

    const ins = await client.query<{ id: string; fecha: string }>(
      `INSERT INTO ${recepT} (
         empresa_id, cliente_id, sucursal_id, numero_control,
         total_credito, observaciones, created_by, usuario_nombre
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, fecha`,
      [
        p.empresaId,
        p.clienteId,
        p.sucursalId,
        numero,
        totalCalc,
        p.observaciones,
        p.createdBy,
        p.usuarioNombre,
      ],
    );
    const recepcionId = ins.rows[0].id;
    const fecha = ins.rows[0].fecha;

    // Items + stock + movimientos.
    for (const it of p.items) {
      await client.query(
        `INSERT INTO ${recepItemsT} (
           empresa_id, recepcion_id, producto_id, producto_nombre, sku,
           cantidad, precio_unitario, subtotal
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          p.empresaId,
          recepcionId,
          it.producto_id,
          it.producto_nombre,
          it.sku,
          it.cantidad,
          it.precio_unitario,
          it.subtotal,
        ],
      );

      // Aumentar stock por sucursal (trigger sincroniza productos.stock_actual).
      if (p.sucursalId) {
        await client.query(
          `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (producto_id, sucursal_id) DO UPDATE
             SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
                 updated_at = now()`,
          [it.producto_id, p.sucursalId, it.cantidad],
        );
      } else {
        await client.query(
          `UPDATE ${prodT} SET stock_actual = stock_actual + $1, updated_at = now()
             WHERE id = $2 AND empresa_id = $3`,
          [it.cantidad, it.producto_id, p.empresaId],
        );
      }

      // Movimiento de inventario ENTRADA (usamos origen ajuste_manual como
      // marcador porque el schema base no tiene 'recepcion_cliente'; se
      // preserva trazabilidad vía referencia = número de recepción).
      try {
        await client.query(
          `INSERT INTO ${movT} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, costo_unitario, origen, referencia, fecha,
             created_by, usuario_nombre
           ) VALUES ($1, $2, $3, $4, 'ENTRADA', $5, 0, 'ajuste_manual', $6, now(), $7, $8)`,
          [
            p.empresaId,
            it.producto_id,
            it.producto_nombre,
            it.sku,
            it.cantidad,
            numero,
            p.createdBy,
            p.usuarioNombre,
          ],
        );
      } catch (movErr) {
        // Si falla el movimiento, no bloquea la recepción (best-effort).
        console.error("[recepciones-pg] movimiento ENTRADA falló", movErr);
      }
    }

    // Crédito ENTRADA al cliente.
    await client.query(
      `INSERT INTO ${creditosT} (
         empresa_id, cliente_id, tipo, monto, origen, referencia_id,
         referencia_tipo, referencia_numero, observaciones,
         created_by, usuario_nombre
       ) VALUES ($1, $2, 'ENTRADA', $3, 'recepcion', $4, 'recepcion', $5, $6, $7, $8)`,
      [
        p.empresaId,
        p.clienteId,
        totalCalc,
        recepcionId,
        numero,
        p.observaciones,
        p.createdBy,
        p.usuarioNombre,
      ],
    );

    await client.query("COMMIT");
    return {
      id: recepcionId,
      numero_control: numero,
      fecha,
      total_credito: totalCalc,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
