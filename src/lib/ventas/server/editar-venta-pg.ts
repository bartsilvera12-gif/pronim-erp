/**
 * Edición de una venta ya registrada.
 *
 * No se "modifica" la venta: se **anula y se vuelve a crear** con los datos
 * nuevos, todo dentro de una sola transacción. Es la única forma segura de
 * tocar una venta cerrada, porque una venta no es una fila: arrastra stock,
 * crédito del cliente, cuentas por cobrar y cobros en caja. Reusando los dos
 * caminos que ya existen (anular y crear) esas reversiones ya están resueltas
 * y probadas, en vez de escribir una mutación nueva que tendría que deshacer
 * cada efecto a mano.
 *
 * Queda auditado solo: la venta vieja permanece como `anulada` con el motivo
 * apuntando a la nueva, y la nueva nace con su propio número de control.
 *
 * Si la creación falla, la anulación se deshace con ella: o se edita entera o
 * no se toca nada.
 */

import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { anularVentaEnClientePg } from "./anular-venta-pg";
import { createVentaEnClientePg, type CreateVentaPgParams } from "./create-venta-pg";

export interface EditarVentaInput {
  schema: string;
  empresaId: string;
  /** Venta que se está corrigiendo. */
  ventaId: string;
  motivo: string | null;
  actorId: string | null;
  actorNombre: string | null;
  /** Datos nuevos. Es la misma forma que usa el alta de ventas. */
  nueva: Omit<CreateVentaPgParams, "schema" | "empresaId" | "createdBy" | "usuarioNombre">;
}

export interface VentaEditada {
  anulada: { ventaId: string; numeroControl: string };
  nueva: { ventaId: string; numeroControl: string; total: number };
}

export async function editarVentaPg(p: EditarVentaInput): Promise<VentaEditada> {
  const schema = assertAllowedChatDataSchema(p.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const ventasT = quoteSchemaTable(schema, "ventas");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Bloquear la venta primero: si dos personas editan a la vez, la segunda
    // espera y encuentra la venta ya anulada en vez de duplicarla.
    const prev = await client.query<{ numero_control: string; estado: string }>(
      `SELECT numero_control, estado
         FROM ${ventasT}
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    const original = prev.rows[0];
    if (!original) throw new Error("No encontré esa venta.");
    if (original.estado === "anulada") {
      throw new Error("Esa venta está anulada: no se puede editar.");
    }

    const motivoBase = (p.motivo ?? "").trim();
    const anulada = await anularVentaEnClientePg(client, {
      schema,
      empresaId: p.empresaId,
      ventaId: p.ventaId,
      motivo: motivoBase
        ? `Editada: ${motivoBase}`
        : "Editada y reemplazada por una versión corregida",
      actorId: p.actorId,
      actorNombre: p.actorNombre,
    });

    const creada = await createVentaEnClientePg(client, {
      ...p.nueva,
      schema,
      empresaId: p.empresaId,
      createdBy: p.actorId,
      usuarioNombre: p.actorNombre,
      // La venta corregida reemplaza a una que ya usó el crédito del cliente:
      // ese crédito volvió al anular, pero si el cliente quedó en negativo por
      // otra operación no hay que frenar la corrección.
      permitirSobregiroCredito: true,
    });

    // Dejar el rastro en las dos direcciones: desde la anulada ya se ve el
    // motivo; acá se agrega a qué número fue a parar.
    await client.query(
      `UPDATE ${ventasT}
          SET anulacion_motivo = COALESCE(anulacion_motivo, '') || ' → ' || $2
        WHERE id = $1::uuid`,
      [p.ventaId, creada.numeroControl],
    );
    await client.query(
      `UPDATE ${ventasT}
          SET observaciones = CASE
                WHEN COALESCE(observaciones, '') = '' THEN $2
                ELSE observaciones || ' · ' || $2
              END
        WHERE id = $1::uuid`,
      [creada.ventaId, `Corrige a ${original.numero_control}`],
    );

    await client.query("COMMIT");

    return {
      anulada: { ventaId: anulada.ventaId, numeroControl: anulada.numeroControl },
      nueva: {
        ventaId: creada.ventaId,
        numeroControl: creada.numeroControl,
        total: creada.total,
      },
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
