/**
 * Corrige SOLO la fecha de una venta ya registrada, sin anularla ni crear una
 * nueva: conserva número, stock, crédito del cliente, cobros y cuenta por
 * cobrar. Solo se mueve la fecha (y el vencimiento de la cuenta por cobrar, si
 * existe, para mantener el mismo plazo).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export interface CambiarFechaVentaInput {
  schema: string;
  empresaId: string;
  ventaId: string;
  /** Fecha pura YYYY-MM-DD. */
  fecha: string;
  motivo: string | null;
  actorNombre: string | null;
}

export async function cambiarFechaVentaPg(p: CambiarFechaVentaInput) {
  const schema = assertAllowedChatDataSchema(p.schema);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) throw new Error("Fecha inválida.");
  if (p.fecha > new Date().toISOString().slice(0, 10)) {
    throw new Error("No se puede poner una fecha futura.");
  }
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const ventasT = quoteSchemaTable(schema, "ventas");
  const cxcT = quoteSchemaTable(schema, "cuentas_por_cobrar");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prev = await client.query<{ numero_control: string; estado: string; plazo_dias: number | null }>(
      `SELECT numero_control, estado, plazo_dias FROM ${ventasT}
        WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    const v = prev.rows[0];
    if (!v) throw new Error("No encontré esa venta.");
    if (v.estado === "anulada") throw new Error("Esa venta está anulada: no se puede editar.");

    const nota = `Fecha corregida a ${p.fecha}` +
      (p.motivo ? ` (${p.motivo})` : "") +
      (p.actorNombre ? ` por ${p.actorNombre}` : "");
    await client.query(
      `UPDATE ${ventasT}
          SET fecha = ($3::date + time '12:00') AT TIME ZONE 'UTC',
              updated_at = now(),
              observaciones = CASE WHEN COALESCE(observaciones,'') = '' THEN $4
                                   ELSE observaciones || ' · ' || $4 END
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [p.ventaId, p.empresaId, p.fecha, nota],
    );
    await client.query(
      `UPDATE ${cxcT}
          SET fecha_emision = ($3::date + time '12:00') AT TIME ZONE 'UTC',
              fecha_vencimiento = CASE WHEN fecha_vencimiento IS NULL THEN NULL
                                       ELSE $3::date + COALESCE($4::int, 0) END,
              updated_at = now()
        WHERE venta_id = $1::uuid AND empresa_id = $2::uuid`,
      [p.ventaId, p.empresaId, p.fecha, v.plazo_dias],
    );
    await client.query("COMMIT");
    return { ventaId: p.ventaId, numeroControl: v.numero_control, fecha: p.fecha };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
