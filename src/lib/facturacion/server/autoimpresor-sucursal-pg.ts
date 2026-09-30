/**
 * Autoimpresor POR SUCURSAL.
 *
 * El timbrado de Akakua'a es paraguayo y vale uno solo para Lillo y Palmeras,
 * pero cada establecimiento numera aparte:
 *
 *   Lillo    → 001-001-0000001, 0000002, …
 *   Palmeras → 002-001-0000001, 0000002, …
 *
 * Los datos comunes (RUC, razón social, timbrado, vigencia) viven en
 * `empresa_autoimpresor_config`. Lo propio de cada establecimiento
 * (código, punto de expedición, rango y contador) vive en
 * `sucursal_autoimpresor_config`, una fila por sucursal.
 *
 * Las sucursales de Brasil NO tienen fila: eso solo las deja fuera, sin
 * preguntar el país en ninguna parte.
 */

import type { PoolClient } from "pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";

export type AutoimpresorSucursal = {
  sucursal_id: string;
  sucursal_nombre: string | null;
  activo: boolean;
  establecimiento_codigo: string;
  punto_expedicion_codigo: string;
  numero_inicial: number;
  numero_final: number;
  numero_emitido: number | null;
  /** Cuántos números quedan sin usar en el rango autorizado. */
  disponibles: number;
};

/** Datos comunes del timbrado (nivel empresa). */
export type AutoimpresorEmpresa = {
  ruc_emisor: string | null;
  razon_social_emisor: string | null;
  nombre_fantasia: string | null;
  direccion_matriz: string | null;
  telefono: string | null;
  timbrado_numero: string | null;
  timbrado_inicio_vigencia: string | null;
  timbrado_fin_vigencia: string | null;
};

/** "001-001-0000123" — el formato que exige la SET. */
export function formatNumeroFactura(
  establecimiento: string,
  puntoExpedicion: string,
  numero: number,
): string {
  const est = String(establecimiento).padStart(3, "0");
  const pex = String(puntoExpedicion).padStart(3, "0");
  return `${est}-${pex}-${String(numero).padStart(7, "0")}`;
}

async function resolverSchema(empresaId: string): Promise<string> {
  return assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
}

/** Configuración de todas las sucursales, para la pantalla de ajustes. */
export async function listarAutoimpresorSucursales(
  empresaId: string,
): Promise<AutoimpresorSucursal[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];
  const schema = await resolverSchema(empresaId);
  const tCfg = quoteSchemaTable(schema, "sucursal_autoimpresor_config");
  const tSuc = quoteSchemaTable(schema, "sucursales");

  // LEFT JOIN al revés: se listan TODAS las sucursales, tengan config o no,
  // para que la pantalla muestre cuáles facturan y cuáles no.
  const r = await pool.query<{
    sucursal_id: string; sucursal_nombre: string | null; activo: boolean | null;
    establecimiento_codigo: string | null; punto_expedicion_codigo: string | null;
    numero_inicial: number | null; numero_final: number | null; numero_emitido: number | null;
  }>(
    `SELECT s.id::text          AS sucursal_id,
            s.nombre            AS sucursal_nombre,
            c.activo            AS activo,
            c.establecimiento_codigo,
            c.punto_expedicion_codigo,
            c.numero_inicial,
            c.numero_final,
            c.numero_emitido
       FROM ${tSuc} s
       LEFT JOIN ${tCfg} c ON c.sucursal_id = s.id
      WHERE s.empresa_id = $1::uuid
      ORDER BY s.nombre`,
    [empresaId],
  );

  return r.rows
    .filter((x) => x.establecimiento_codigo != null)
    .map((x) => {
      const ini = Number(x.numero_inicial) || 0;
      const fin = Number(x.numero_final) || 0;
      const emitido = x.numero_emitido == null ? null : Number(x.numero_emitido);
      return {
        sucursal_id: x.sucursal_id,
        sucursal_nombre: x.sucursal_nombre,
        activo: x.activo === true,
        establecimiento_codigo: String(x.establecimiento_codigo),
        punto_expedicion_codigo: String(x.punto_expedicion_codigo ?? "001"),
        numero_inicial: ini,
        numero_final: fin,
        numero_emitido: emitido,
        disponibles: Math.max(0, fin - (emitido ?? ini - 1)),
      };
    });
}

/** Sucursales de la empresa (con o sin config), para armar la pantalla. */
export async function listarSucursalesParaAutoimpresor(
  empresaId: string,
): Promise<{ id: string; nombre: string; configurada: boolean }[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];
  const schema = await resolverSchema(empresaId);
  const tCfg = quoteSchemaTable(schema, "sucursal_autoimpresor_config");
  const tSuc = quoteSchemaTable(schema, "sucursales");
  const r = await pool.query<{ id: string; nombre: string; configurada: boolean }>(
    `SELECT s.id::text AS id, s.nombre, (c.sucursal_id IS NOT NULL) AS configurada
       FROM ${tSuc} s
       LEFT JOIN ${tCfg} c ON c.sucursal_id = s.id
      WHERE s.empresa_id = $1::uuid
      ORDER BY s.nombre`,
    [empresaId],
  );
  return r.rows.map((x) => ({ id: x.id, nombre: x.nombre, configurada: x.configurada === true }));
}

export type GuardarSucursalInput = {
  sucursal_id: string;
  activo: boolean;
  establecimiento_codigo: string;
  punto_expedicion_codigo: string;
  numero_inicial: number;
  numero_final: number;
};

export function validarConfigSucursal(d: GuardarSucursalInput): string[] {
  const errores: string[] = [];
  if (!/^\d{1,3}$/.test(String(d.establecimiento_codigo).trim())) {
    errores.push("El establecimiento tiene que ser numérico de hasta 3 dígitos (ej: 001).");
  }
  if (!/^\d{1,3}$/.test(String(d.punto_expedicion_codigo).trim())) {
    errores.push("El punto de expedición tiene que ser numérico de hasta 3 dígitos (ej: 001).");
  }
  if (!Number.isInteger(d.numero_inicial) || d.numero_inicial < 1) {
    errores.push("El número inicial del rango es obligatorio.");
  }
  if (!Number.isInteger(d.numero_final) || d.numero_final < 1) {
    errores.push("El número final del rango es obligatorio.");
  }
  if (Number.isInteger(d.numero_inicial) && Number.isInteger(d.numero_final)
      && d.numero_final < d.numero_inicial) {
    errores.push("El número final no puede ser menor que el inicial.");
  }
  return errores;
}

export async function guardarConfigSucursal(
  empresaId: string,
  d: GuardarSucursalInput,
): Promise<void> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión a la base.");
  const schema = await resolverSchema(empresaId);
  const tCfg = quoteSchemaTable(schema, "sucursal_autoimpresor_config");
  await pool.query(
    `INSERT INTO ${tCfg}
       (sucursal_id, empresa_id, activo, establecimiento_codigo,
        punto_expedicion_codigo, numero_inicial, numero_final)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
     ON CONFLICT (sucursal_id) DO UPDATE SET
       activo                  = EXCLUDED.activo,
       establecimiento_codigo  = EXCLUDED.establecimiento_codigo,
       punto_expedicion_codigo = EXCLUDED.punto_expedicion_codigo,
       numero_inicial          = EXCLUDED.numero_inicial,
       numero_final            = EXCLUDED.numero_final,
       updated_at              = now()`,
    [
      d.sucursal_id, empresaId, d.activo,
      String(d.establecimiento_codigo).padStart(3, "0"),
      String(d.punto_expedicion_codigo).padStart(3, "0"),
      d.numero_inicial, d.numero_final,
    ],
  );
}

/** Quita la configuración: esa sucursal vuelve a emitir comprobante no fiscal. */
export async function borrarConfigSucursal(empresaId: string, sucursalId: string): Promise<void> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión a la base.");
  const schema = await resolverSchema(empresaId);
  const tCfg = quoteSchemaTable(schema, "sucursal_autoimpresor_config");
  await pool.query(
    `DELETE FROM ${tCfg} WHERE sucursal_id = $1::uuid AND empresa_id = $2::uuid`,
    [sucursalId, empresaId],
  );
}

export type NumeroAsignado = {
  numero: string;
  timbrado: string | null;
  emitida_at: string;
};

/**
 * Asigna el número de factura a una venta. Idempotente: si la venta ya tiene
 * número, devuelve el mismo — reimprimir NO consume otro número del rango.
 *
 * Devuelve null si la sucursal de la venta no factura (Brasil, o PY sin
 * configuración activa): en ese caso se imprime el comprobante no fiscal.
 *
 * La numeración tiene que ser correlativa y sin huecos, así que todo pasa
 * dentro de UNA transacción con `FOR UPDATE` sobre la fila de configuración:
 * dos cajas de la misma sucursal cobrando al mismo tiempo se serializan en vez
 * de sacar el mismo número.
 */
export async function asignarNumeroFactura(
  empresaId: string,
  ventaId: string,
): Promise<NumeroAsignado | null> {
  const pool = getChatPostgresPool();
  if (!pool) return null;
  const schema = await resolverSchema(empresaId);
  const tCfg = quoteSchemaTable(schema, "sucursal_autoimpresor_config");
  const tVentas = quoteSchemaTable(schema, "ventas");
  const tEmp = quoteSchemaTable(schema, "empresa_autoimpresor_config");

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const vq = await client.query<{
      sucursal_id: string | null; factura_numero: string | null;
      factura_timbrado: string | null; factura_emitida_at: string | null;
      estado: string | null;
    }>(
      `SELECT sucursal_id::text, factura_numero, factura_timbrado,
              factura_emitida_at::text, estado
         FROM ${tVentas}
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        FOR UPDATE`,
      [ventaId, empresaId],
    );
    const venta = vq.rows[0];
    if (!venta) { await client.query("ROLLBACK"); return null; }

    // Ya tiene número: se reimprime el mismo.
    if (venta.factura_numero) {
      await client.query("COMMIT");
      return {
        numero: venta.factura_numero,
        timbrado: venta.factura_timbrado,
        emitida_at: venta.factura_emitida_at ?? "",
      };
    }
    // Una venta anulada no estrena número.
    if ((venta.estado ?? "") === "anulada") { await client.query("ROLLBACK"); return null; }
    if (!venta.sucursal_id) { await client.query("ROLLBACK"); return null; }

    const cq = await client.query<{
      establecimiento_codigo: string; punto_expedicion_codigo: string;
      numero_inicial: number; numero_final: number; numero_emitido: number | null;
    }>(
      `SELECT establecimiento_codigo, punto_expedicion_codigo,
              numero_inicial, numero_final, numero_emitido
         FROM ${tCfg}
        WHERE sucursal_id = $1::uuid AND empresa_id = $2::uuid AND activo = true
        FOR UPDATE`,
      [venta.sucursal_id, empresaId],
    );
    const cfg = cq.rows[0];
    // Sin configuración activa → esta sucursal no factura.
    if (!cfg) { await client.query("ROLLBACK"); return null; }

    const proximo = cfg.numero_emitido == null
      ? Number(cfg.numero_inicial)
      : Number(cfg.numero_emitido) + 1;

    if (proximo > Number(cfg.numero_final)) {
      await client.query("ROLLBACK");
      throw new Error(
        "Se agotó el rango de numeración autorizado para esta sucursal. " +
        "Hay que cargar un timbrado nuevo antes de seguir facturando.",
      );
    }

    const tq = await client.query<{ timbrado_numero: string | null }>(
      `SELECT timbrado_numero FROM ${tEmp} WHERE empresa_id = $1::uuid`,
      [empresaId],
    );
    const timbrado = tq.rows[0]?.timbrado_numero ?? null;

    const numero = formatNumeroFactura(
      cfg.establecimiento_codigo, cfg.punto_expedicion_codigo, proximo,
    );

    await client.query(
      `UPDATE ${tCfg} SET numero_emitido = $1, updated_at = now()
        WHERE sucursal_id = $2::uuid`,
      [proximo, venta.sucursal_id],
    );
    const up = await client.query<{ factura_emitida_at: string }>(
      `UPDATE ${tVentas}
          SET factura_numero = $1, factura_timbrado = $2, factura_emitida_at = now()
        WHERE id = $3::uuid
        RETURNING factura_emitida_at::text`,
      [numero, timbrado, ventaId],
    );

    await client.query("COMMIT");
    return { numero, timbrado, emitida_at: up.rows[0]?.factura_emitida_at ?? "" };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Datos del emisor para la cabecera del ticket. */
export async function leerDatosEmisor(empresaId: string): Promise<AutoimpresorEmpresa | null> {
  const pool = getChatPostgresPool();
  if (!pool) return null;
  const schema = await resolverSchema(empresaId);
  const tEmp = quoteSchemaTable(schema, "empresa_autoimpresor_config");
  const r = await pool.query<AutoimpresorEmpresa>(
    `SELECT ruc_emisor, razon_social_emisor, nombre_fantasia, direccion_matriz,
            telefono, timbrado_numero,
            timbrado_inicio_vigencia::text, timbrado_fin_vigencia::text
       FROM ${tEmp} WHERE empresa_id = $1::uuid`,
    [empresaId],
  );
  return r.rows[0] ?? null;
}
