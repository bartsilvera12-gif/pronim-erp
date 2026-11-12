/**
 * Corrige SOLO la forma de pago de una venta ya registrada, sin anularla ni
 * crear otra: conserva número, stock, montos y crédito. Cambia el método de
 * cada cobro inmediato (ventas_pagos_detalle) y el método informativo de la
 * cabecera.
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const METODOS_EDITABLES_VENTA = ["efectivo", "tarjeta", "transferencia"] as const;
export type MetodoEditableVenta = (typeof METODOS_EDITABLES_VENTA)[number];

export interface PagoVentaFila {
  id: string;
  metodo_pago: string;
  monto: number;
}

export async function listarPagosVentaPg(schemaRaw: string, empresaId: string, ventaId: string) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");
  const t = quoteSchemaTable(schema, "ventas_pagos_detalle");
  const r = await pool.query<{ id: string; metodo_pago: string; monto: string }>(
    `SELECT id::text, metodo_pago, monto::text FROM ${t}
      WHERE venta_id = $1::uuid AND empresa_id = $2::uuid
        AND direccion = 'ingreso' AND reversa_de_id IS NULL
      ORDER BY created_at, id`,
    [ventaId, empresaId],
  );
  return r.rows.map((x): PagoVentaFila => ({ id: x.id, metodo_pago: x.metodo_pago, monto: Number(x.monto) }));
}

export interface CambiarPagosVentaInput {
  schema: string;
  empresaId: string;
  ventaId: string;
  cambios: Array<{ id: string; metodo_pago: string }>;
  motivo: string | null;
  actorNombre: string | null;
}

export async function cambiarPagosVentaPg(p: CambiarPagosVentaInput) {
  const schema = assertAllowedChatDataSchema(p.schema);
  if (p.cambios.length === 0) throw new Error("No hay cambios para guardar.");
  for (const c of p.cambios) {
    if (!(METODOS_EDITABLES_VENTA as readonly string[]).includes(c.metodo_pago)) {
      throw new Error("Forma de pago no permitida.");
    }
  }
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres.");

  const ventasT = quoteSchemaTable(schema, "ventas");
  const pagosT = quoteSchemaTable(schema, "ventas_pagos_detalle");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prev = await client.query<{ numero_control: string; estado: string }>(
      `SELECT numero_control, estado FROM ${ventasT}
        WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    const v = prev.rows[0];
    if (!v) throw new Error("No encontré esa venta.");
    if (v.estado === "anulada") throw new Error("Esa venta está anulada: no se puede editar.");

    const actuales = await client.query<{ id: string; metodo_pago: string }>(
      `SELECT id::text, metodo_pago FROM ${pagosT}
        WHERE venta_id = $1::uuid AND empresa_id = $2::uuid
          AND direccion = 'ingreso' AND reversa_de_id IS NULL
        FOR UPDATE`,
      [p.ventaId, p.empresaId],
    );
    const porId = new Map(actuales.rows.map((x) => [x.id, x.metodo_pago]));
    const descripcion: string[] = [];
    for (const c of p.cambios) {
      const antes = porId.get(c.id);
      if (!antes) throw new Error("Uno de los cobros no pertenece a esta venta.");
      if (antes === c.metodo_pago) continue;
      await client.query(
        `UPDATE ${pagosT}
            SET metodo_pago = $3,
                tarjeta_tipo = CASE WHEN $3 = 'tarjeta' THEN tarjeta_tipo ELSE NULL END
          WHERE id = $1::uuid AND empresa_id = $2::uuid`,
        [c.id, p.empresaId, c.metodo_pago],
      );
      porId.set(c.id, c.metodo_pago);
      descripcion.push(`${antes} → ${c.metodo_pago}`);
    }
    if (descripcion.length === 0) throw new Error("No cambiaste ninguna forma de pago.");

    const metodos = [...porId.values()];
    const legacy = metodos.includes("efectivo") ? "efectivo" : metodos[0];
    const nota = `Forma de pago corregida (${descripcion.join(", ")})` +
      (p.motivo ? ` (${p.motivo})` : "") +
      (p.actorNombre ? ` por ${p.actorNombre}` : "");
    await client.query(
      `UPDATE ${ventasT}
          SET metodo_pago = $3,
              updated_at = now(),
              observaciones = CASE WHEN COALESCE(observaciones,'') = '' THEN $4
                                   ELSE observaciones || ' · ' || $4 END
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [p.ventaId, p.empresaId, legacy, nota],
    );
    await client.query("COMMIT");
    return { ventaId: p.ventaId, numeroControl: v.numero_control };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
