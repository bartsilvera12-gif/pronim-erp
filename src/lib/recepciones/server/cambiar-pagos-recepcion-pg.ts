/**
 * Corrige SOLO la forma de pago de una evaluación (recepción) ya registrada.
 *
 * Se puede cambiar entre efectivo y transferencia. El crédito y la
 * consignación NO se editan acá: generan saldo en la cuenta del cliente y
 * cambiarlos obliga a rehacer ese saldo (para eso está anular la evaluación).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

const METODOS_EDITABLES = ["efectivo", "transferencia"];

export async function listarPagosRecepcionPg(schemaRaw: string, empresaId: string, recepcionId: string) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const t = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const r = await pool.query<{ id: string; metodo: string; monto: string }>(
    `SELECT id::text, metodo, monto::text FROM ${t}
      WHERE recepcion_id = $1::uuid AND empresa_id = $2::uuid
        AND direccion = 'egreso' AND reversa_de_id IS NULL
      ORDER BY created_at, id`,
    [recepcionId, empresaId],
  );
  return r.rows.map((x) => ({
    id: x.id,
    metodo_pago: x.metodo,
    monto: Number(x.monto),
    opciones: METODOS_EDITABLES.includes(x.metodo) ? METODOS_EDITABLES : [x.metodo],
  }));
}

export interface CambiarPagosRecepcionInput {
  schema: string;
  empresaId: string;
  recepcionId: string;
  cambios: Array<{ id: string; metodo_pago: string }>;
  motivo: string | null;
  actorNombre: string | null;
}

export async function cambiarPagosRecepcionPg(p: CambiarPagosRecepcionInput) {
  const schema = assertAllowedChatDataSchema(p.schema);
  if (p.cambios.length === 0) throw new Error("No hay cambios para guardar.");
  for (const c of p.cambios) {
    if (!METODOS_EDITABLES.includes(c.metodo_pago)) throw new Error("Forma de pago no permitida.");
  }
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const recepT = quoteSchemaTable(schema, "cliente_recepciones");
  const pagosT = quoteSchemaTable(schema, "cliente_recepciones_pagos");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prev = await client.query<{ numero_control: string; estado: string }>(
      `SELECT numero_control, estado FROM ${recepT}
        WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    const rec = prev.rows[0];
    if (!rec) throw new Error("No encontré esa evaluación.");
    if (rec.estado === "anulada") throw new Error("Esa evaluación está anulada: no se puede editar.");

    const actuales = await client.query<{ id: string; metodo: string }>(
      `SELECT id::text, metodo FROM ${pagosT}
        WHERE recepcion_id = $1::uuid AND empresa_id = $2::uuid
          AND direccion = 'egreso' AND reversa_de_id IS NULL
        FOR UPDATE`,
      [p.recepcionId, p.empresaId],
    );
    const porId = new Map(actuales.rows.map((x) => [x.id, x.metodo]));
    const descripcion: string[] = [];
    for (const c of p.cambios) {
      const antes = porId.get(c.id);
      if (!antes) throw new Error("Uno de los pagos no pertenece a esta evaluación.");
      if (antes === c.metodo_pago) continue;
      if (!METODOS_EDITABLES.includes(antes)) {
        throw new Error("El pago en crédito o consignación no se puede cambiar: anulá la evaluación y cargala de nuevo.");
      }
      await client.query(
        `UPDATE ${pagosT} SET metodo = $3 WHERE id = $1::uuid AND empresa_id = $2::uuid`,
        [c.id, p.empresaId, c.metodo_pago],
      );
      descripcion.push(`${antes} → ${c.metodo_pago}`);
    }
    if (descripcion.length === 0) throw new Error("No cambiaste ninguna forma de pago.");

    const nota = `Forma de pago corregida (${descripcion.join(", ")})` +
      (p.motivo ? ` (${p.motivo})` : "") +
      (p.actorNombre ? ` por ${p.actorNombre}` : "");
    await client.query(
      `UPDATE ${recepT}
          SET observaciones = CASE WHEN COALESCE(observaciones,'') = '' THEN $3
                                   ELSE observaciones || ' · ' || $3 END
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [p.recepcionId, p.empresaId, nota],
    );
    await client.query("COMMIT");
    return { recepcionId: p.recepcionId, numeroControl: rec.numero_control };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
