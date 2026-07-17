/**
 * Evaluador server-side de promociones para pronimerp.
 *
 * Se corre dentro de una transacción (recibe el PoolClient) para poder ser
 * llamado desde el orquestador /api/atencion/confirmar antes de crear la
 * venta. Devuelve descuento y cashback CALCULADOS por el server; los
 * valores que envíe el frontend se ignoran.
 *
 * Reemplaza la lógica que hoy vive en `POST /api/promociones/aplicar`
 * (ese endpoint sigue funcionando para preview UI; usa la misma tabla).
 */

import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export interface EvaluarPromocionInput {
  schema: string;
  empresaId: string;
  clienteId: string | null;
  sucursalId: string;
  /** Uno de los dos: cupón (código) o id explícito. Si vienen ambos, gana id. */
  promocionId?: string | null;
  cuponCodigo?: string | null;
  /** Carrito real del cliente (post-server-lock). */
  items: { franja_id: string; cantidad: number; precio_unitario: number }[];
  /** Fecha de evaluación (default hoy en zona local del server). */
  fechaISO?: string;
}

export interface PromoEvaluada {
  promocionId: string;
  nombre: string;
  tipo: "descuento_pct" | "descuento_fijo" | "lleve_n_pague_m" | "cashback";
  cuponCodigo: string | null;
  descuento: number;
  cashback: number;
}

interface PromoRow {
  id: string; nombre: string;
  tipo: "descuento_pct" | "descuento_fijo" | "lleve_n_pague_m" | "cashback";
  valor: string; lleve_n: number | null; pague_m: number | null;
  cupon_codigo: string | null;
  ambito: "general" | "franja" | "sucursal" | "cliente";
  franja_id: string | null; sucursal_id: string | null; cliente_id: string | null;
  fecha_desde: string | null; fecha_hasta: string | null;
  minimo_compra: string;
}

/**
 * Evalúa las promociones aplicables y devuelve la MEJOR (mayor descuento+cashback).
 * Si no aplica ninguna, devuelve null. Si viene `cuponCodigo` y no matchea/no
 * aplica, THROW con mensaje claro (el orquestador lo mapea a 400).
 * Si viene `promocionId`, se busca esa exacta y se re-valida.
 */
export async function evaluarPromocionEnClientePg(
  client: import("pg").PoolClient,
  p: EvaluarPromocionInput,
): Promise<PromoEvaluada | null> {
  const items = p.items.filter((i) => Number(i.cantidad) > 0);
  const subtotal = items.reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0);
  if (subtotal <= 0 || items.length === 0) return null;

  const cupon = p.cuponCodigo?.trim() ? p.cuponCodigo.trim().toUpperCase() : null;
  const hoy = p.fechaISO ?? new Date().toISOString().slice(0, 10);
  const promosT = quoteSchemaTable(p.schema, "promociones");

  let sql: string;
  let args: unknown[];
  if (p.promocionId) {
    sql = `SELECT id,nombre,tipo,valor::text,lleve_n,pague_m,cupon_codigo,ambito,
                  franja_id,sucursal_id,cliente_id,fecha_desde,fecha_hasta,
                  minimo_compra::text
           FROM ${promosT}
           WHERE empresa_id = $1 AND id = $2 AND activo = true
           LIMIT 1`;
    args = [p.empresaId, p.promocionId];
  } else if (cupon) {
    sql = `SELECT id,nombre,tipo,valor::text,lleve_n,pague_m,cupon_codigo,ambito,
                  franja_id,sucursal_id,cliente_id,fecha_desde,fecha_hasta,
                  minimo_compra::text
           FROM ${promosT}
           WHERE empresa_id = $1 AND activo = true AND LOWER(cupon_codigo) = LOWER($2)`;
    args = [p.empresaId, cupon];
  } else {
    // Automáticas (sin cupón).
    sql = `SELECT id,nombre,tipo,valor::text,lleve_n,pague_m,cupon_codigo,ambito,
                  franja_id,sucursal_id,cliente_id,fecha_desde,fecha_hasta,
                  minimo_compra::text
           FROM ${promosT}
           WHERE empresa_id = $1 AND activo = true AND cupon_codigo IS NULL`;
    args = [p.empresaId];
  }

  const r = await client.query<PromoRow>(sql, args);
  const rows = r.rows;
  if (cupon && rows.length === 0) {
    throw new Error(`El cupón "${cupon}" no existe o está inactivo.`);
  }
  if (p.promocionId && rows.length === 0) {
    throw new Error("La promoción indicada no existe o está inactiva.");
  }

  // Cupón obligatorio cuando la promo lo tiene configurado.
  // Al buscar por promocion_id, si la promo requiere cupón, exigimos que
  // el request lo incluya y que coincida exactamente (normalizado a upper).
  // Esto impide "saltear" el cupón mandando solo el UUID de la promo.
  if (p.promocionId) {
    for (const row of rows) {
      if (row.cupon_codigo) {
        const requerido = row.cupon_codigo.trim().toUpperCase();
        if (!cupon) {
          throw new Error(
            `La promoción "${row.nombre}" requiere ingresar el cupón "${row.cupon_codigo}".`,
          );
        }
        if (cupon !== requerido) {
          throw new Error(
            `El cupón enviado no coincide con el configurado para "${row.nombre}".`,
          );
        }
      }
    }
  }

  // Filtrado por vigencia / ámbito / mínimo.
  const aplicables = rows.filter((row) => {
    const minComp = Number(row.minimo_compra);
    if (minComp > 0 && subtotal < minComp) return false;
    if (row.fecha_desde && hoy < row.fecha_desde) return false;
    if (row.fecha_hasta && hoy > row.fecha_hasta) return false;
    if (row.ambito === "cliente" && row.cliente_id && row.cliente_id !== p.clienteId) return false;
    if (row.ambito === "sucursal" && row.sucursal_id && row.sucursal_id !== p.sucursalId) return false;
    if (row.ambito === "franja" && row.franja_id) {
      if (!items.some((i) => i.franja_id === row.franja_id)) return false;
    }
    return true;
  });

  if (aplicables.length === 0) {
    if (cupon) throw new Error(`El cupón "${cupon}" no aplica a este carrito.`);
    if (p.promocionId) throw new Error("La promoción indicada no aplica a este carrito.");
    return null;
  }

  let mejor: { promo: PromoRow; descuento: number; cashback: number } | null = null;
  for (const row of aplicables) {
    const valor = Number(row.valor);
    let desc = 0; let cash = 0;
    const subFranja = row.ambito === "franja" && row.franja_id
      ? items.filter((i) => i.franja_id === row.franja_id)
             .reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0)
      : subtotal;
    if (row.tipo === "descuento_pct") {
      desc = Math.min(subFranja * (valor / 100), subFranja);
    } else if (row.tipo === "descuento_fijo") {
      desc = Math.min(valor, subFranja);
    } else if (row.tipo === "lleve_n_pague_m" && row.lleve_n && row.pague_m) {
      const scope = row.ambito === "franja" && row.franja_id
        ? items.filter((i) => i.franja_id === row.franja_id)
        : items;
      for (const it of scope) {
        const grupos = Math.floor(it.cantidad / row.lleve_n);
        desc += grupos * (row.lleve_n - row.pague_m) * Number(it.precio_unitario);
      }
    } else if (row.tipo === "cashback") {
      cash = subFranja * (valor / 100);
    }
    desc = Math.round(Math.max(0, desc));
    cash = Math.round(Math.max(0, cash));
    if (!mejor || (desc + cash) > (mejor.descuento + mejor.cashback)) {
      mejor = { promo: row, descuento: desc, cashback: cash };
    }
  }

  if (!mejor || (mejor.descuento === 0 && mejor.cashback === 0)) return null;
  return {
    promocionId: mejor.promo.id,
    nombre: mejor.promo.nombre,
    tipo: mejor.promo.tipo,
    cuponCodigo: mejor.promo.cupon_codigo,
    descuento: mejor.descuento,
    cashback: mejor.cashback,
  };
}
