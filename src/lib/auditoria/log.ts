import type { PoolClient } from "pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";

/**
 * Registrador único de eventos de auditoría. Escribe una fila en
 * `pronimerp.auditoria_eventos`. Nunca lanza — la falla se loguea y se
 * ignora para no romper la operación principal que auditó.
 *
 * Uso típico:
 *   await logAuditoria({
 *     empresaId: auth.empresa_id,
 *     usuarioId: auth.user.id ?? null,
 *     usuarioNombre: auth.nombre ?? null,
 *     sucursalId: auth.sucursal_id ?? null,
 *     tipo: "venta_anulada",
 *     entidad: "venta",
 *     entidadId: ventaId,
 *     referencia: numeroControl,
 *     datoAnterior: { estado: "completada", total },
 *     datoNuevo:    { estado: "anulada" },
 *     motivo:       body.motivo,
 *   });
 */
export interface AuditoriaEvento {
  empresaId: string;
  usuarioId?: string | null;
  usuarioNombre?: string | null;
  sucursalId?: string | null;
  sucursalNombre?: string | null;
  tipo: string;
  entidad: string;
  entidadId?: string | null;
  referencia?: string | null;
  datoAnterior?: unknown;
  datoNuevo?: unknown;
  motivo?: string | null;
  meta?: Record<string, unknown> | null;
  dispositivo?: string | null;
  ip?: string | null;
}

export async function logAuditoria(ev: AuditoriaEvento): Promise<void> {
  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(ev.empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return;
    const t = quoteSchemaTable(schema, "auditoria_eventos");
    await pool.query(
      `INSERT INTO ${t} (
         empresa_id, usuario_id, usuario_nombre, sucursal_id, sucursal_nombre,
         tipo, entidad, entidad_id, referencia,
         dato_anterior, dato_nuevo, motivo, meta, dispositivo, ip
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14,$15)`,
      [
        ev.empresaId, ev.usuarioId ?? null, ev.usuarioNombre ?? null,
        ev.sucursalId ?? null, ev.sucursalNombre ?? null,
        ev.tipo, ev.entidad, ev.entidadId ?? null, ev.referencia ?? null,
        ev.datoAnterior != null ? JSON.stringify(ev.datoAnterior) : null,
        ev.datoNuevo    != null ? JSON.stringify(ev.datoNuevo)    : null,
        ev.motivo ?? null,
        ev.meta != null ? JSON.stringify(ev.meta) : null,
        ev.dispositivo ?? null, ev.ip ?? null,
      ],
    );
  } catch (e) {
    console.error("[auditoria/log]", e instanceof Error ? e.message : e);
  }
}

/** Variante que reusa un PoolClient dentro de una transacción existente. */
export async function logAuditoriaClient(
  client: PoolClient,
  schema: string,
  ev: AuditoriaEvento,
): Promise<void> {
  try {
    const t = quoteSchemaTable(schema, "auditoria_eventos");
    await client.query(
      `INSERT INTO ${t} (
         empresa_id, usuario_id, usuario_nombre, sucursal_id, sucursal_nombre,
         tipo, entidad, entidad_id, referencia,
         dato_anterior, dato_nuevo, motivo, meta, dispositivo, ip
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14,$15)`,
      [
        ev.empresaId, ev.usuarioId ?? null, ev.usuarioNombre ?? null,
        ev.sucursalId ?? null, ev.sucursalNombre ?? null,
        ev.tipo, ev.entidad, ev.entidadId ?? null, ev.referencia ?? null,
        ev.datoAnterior != null ? JSON.stringify(ev.datoAnterior) : null,
        ev.datoNuevo    != null ? JSON.stringify(ev.datoNuevo)    : null,
        ev.motivo ?? null,
        ev.meta != null ? JSON.stringify(ev.meta) : null,
        ev.dispositivo ?? null, ev.ip ?? null,
      ],
    );
  } catch (e) {
    console.error("[auditoria/log-client]", e instanceof Error ? e.message : e);
  }
}
