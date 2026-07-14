/**
 * Operación de CAMBIO para pronimerp.
 *
 * Un cambio vincula:
 *   - Una recepción de prendas (crédito generado).
 *   - Una venta al mismo cliente (nueva mercadería).
 *   - Crédito previo usado y diferencia pagada quedan al confirmarse.
 *
 * Flujo:
 *   1) Vendedor confirma recepción. Botón "Continuar como cambio".
 *   2) Backend: crea fila en `cambios` en estado 'borrador' con recepcion_id.
 *   3) Redirige a /ventas/nueva?cambio_id=<uuid>.
 *   4) Al confirmar la venta con ese cambio_id, se enlaza venta y se calcula
 *      credito_generado, credito_previo_usado, diferencia_pagada, credito_restante.
 *   5) Estado → 'confirmado'.
 *
 * Si el usuario abandona: el cambio queda 'borrador' pero la recepción es válida
 * como compra normal. Un cron o acción manual puede limpiar borradores viejos.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

async function nextCambioNumero(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string,
): Promise<string> {
  const t = quoteSchemaTable(schema, "cambios");
  const { rows } = await client.query<{ maxn: number | null }>(
    `SELECT COALESCE(MAX(
       CASE WHEN numero_control ~ '^CMB-[0-9]+$'
            THEN (substring(numero_control from 5))::int
            ELSE 0 END
     ), 0) AS maxn
     FROM ${t} WHERE empresa_id = $1::uuid`,
    [empresaId],
  );
  const next = Number(rows[0]?.maxn ?? 0) + 1;
  return `CMB-${String(next).padStart(6, "0")}`;
}

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

/**
 * Crea un cambio en estado 'borrador' asociado a una recepción existente,
 * marca la recepción con `cambio_id` y devuelve la URL a la que redirigir
 * el vendedor para completar la venta del cambio.
 */
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

    // Validaciones básicas
    const rc = await client.query<{ id: string; cliente_id: string; cambio_id: string | null; estado: string }>(
      `SELECT id, cliente_id, cambio_id, estado
       FROM ${recepT}
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    if (!rc.rows.length) throw new Error("Recepción no encontrada.");
    if (rc.rows[0].estado === "anulada") {
      throw new Error("La recepción está anulada; no se puede continuar como cambio.");
    }
    if (rc.rows[0].cambio_id) {
      // Ya tiene un cambio asociado; devolver el existente
      const q = await client.query<{ id: string; numero_control: string; estado: string }>(
        `SELECT id, numero_control, estado FROM ${cambiosT} WHERE id = $1`,
        [rc.rows[0].cambio_id],
      );
      const existing = q.rows[0];
      await client.query("COMMIT");
      return {
        id: existing.id,
        numero_control: existing.numero_control,
        estado: existing.estado as "borrador",
        redirect_url: `/ventas/nueva?cambio_id=${existing.id}&cliente_id=${rc.rows[0].cliente_id}`,
      };
    }
    if (rc.rows[0].cliente_id !== p.clienteId) {
      throw new Error("El cliente indicado no coincide con el de la recepción.");
    }

    // Cliente + sucursal pertenecen a empresa
    const ck = await client.query(
      `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2`,
      [p.clienteId, p.empresaId],
    );
    if (!ck.rows.length) throw new Error("Cliente inválido.");
    const sk = await client.query(
      `SELECT 1 FROM ${sucT} WHERE id = $1 AND empresa_id = $2`,
      [p.sucursalId, p.empresaId],
    );
    if (!sk.rows.length) throw new Error("Sucursal inválida.");

    const numero = await nextCambioNumero(client, schema, p.empresaId);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO ${cambiosT} (
         empresa_id, cliente_id, sucursal_id, numero_control,
         recepcion_id, estado, created_by, created_by_nombre
       ) VALUES ($1, $2, $3, $4, $5, 'borrador', $6, $7)
       RETURNING id`,
      [
        p.empresaId,
        p.clienteId,
        p.sucursalId,
        numero,
        p.recepcionId,
        p.actorId,
        p.actorNombre,
      ],
    );
    const cambioId = ins.rows[0].id;

    // Marcar la recepción con el cambio_id
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
 * Al confirmar la venta con cambio_id, la propia venta llama esta función
 * para cerrar el cambio calculando los totales.
 * Se ejecuta SIN transacción propia (usa la del caller si existe).
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

  // Verificar estado y recepción asociada
  const cq = await client.query<{
    id: string;
    estado: string;
    recepcion_id: string | null;
  }>(
    `SELECT id, estado, recepcion_id
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

  const rq = await client.query<{ total_credito: string }>(
    `SELECT total_credito FROM ${recepT} WHERE id = $1`,
    [cambio.recepcion_id],
  );
  const creditoGenerado = Number(rq.rows[0]?.total_credito ?? 0);
  const creditoRestante = Math.max(0, creditoGenerado - args.creditoAplicado);

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
      args.creditoAplicado,
      args.saldoRestantePagado,
      creditoRestante,
      args.cambioId,
    ],
  );
}
