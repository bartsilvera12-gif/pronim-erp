import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/recepciones/[id]/ingresar-con-overrides
 *
 * Ingresa una recepción al stock permitiendo, opcionalmente, reasignar
 * la FRANJA de venta (producto_id) de items individuales. Útil cuando
 * la cajera evaluó "más o menos" al recibir y ahora quiere asignar el
 * precio de venta real prenda por prenda.
 *
 * Body (dos formas — se pueden mezclar por item):
 *   {
 *     overrides?: [
 *       // Forma 1: reasignar TODO el item a una franja (comportamiento clásico)
 *       { item_id: uuid, producto_id: uuid },
 *       // Forma 2: REPARTIR la cantidad del item en varias franjas
 *       // (ej: 5 prendas van a franja 99mil, 4 a franja 84mil). Suma
 *       // de cantidades debe igualar la cantidad del item.
 *       { item_id: uuid, splits: [{ producto_id: uuid, cantidad: number }] }
 *     ]
 *   }
 *
 * - Forma 1 es equivalente a `splits: [{producto_id, cantidad: <item.cantidad>}]`.
 * - Para forma 2, la fila del item se ACTUALIZA a la primera franja del
 *   split y su cantidad; las franjas restantes se crean como filas nuevas
 *   clonando el resto de campos del item original.
 * - `precio_compra_unitario` NO cambia (lo pagado al cliente sigue igual);
 *   `subtotal` se recalcula = precio_compra_unitario * cantidad_split.
 *
 * Todo se hace en UNA sola transacción — si algo falla, rollback total
 * y la recepción sigue en estado 'pendiente_ingreso' sin daño.
 *
 * Solo funciona sobre recepciones estado='pendiente_ingreso' del mismo
 * tenant. Si el usuario tiene sucursal fija, valida que la recepción sea
 * de su sucursal.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: recepcionId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      overrides?: {
        item_id?: string;
        producto_id?: string;
        splits?: { producto_id?: string; cantidad?: number }[];
      }[];
      // Modo "bucket libre" (fase 2 post-launch): cantidad total puede
      // diferir de la recepción original. El backend borra los items
      // originales y reinserta las líneas del bucket, prorrateando el
      // total_credito uniformemente entre las nuevas unidades.
      overrides_flat?: { producto_id: string; cantidad: number }[];
    };
    // Normalizamos a la forma agrupada por item_id → splits[]. Cualquier
    // override sin `splits` se convierte al formato splits=[{producto_id}]
    // con cantidad = <null>, y el server rellena la cantidad = item.cantidad
    // más adelante (equivalente al comportamiento previo).
    type Split = { producto_id: string; cantidad: number | null };
    const overridesByItem = new Map<string, Split[]>();
    if (Array.isArray(body.overrides)) {
      for (const o of body.overrides) {
        if (typeof o.item_id !== "string" || !o.item_id) continue;
        const list = overridesByItem.get(o.item_id) ?? [];
        if (Array.isArray(o.splits) && o.splits.length > 0) {
          for (const s of o.splits) {
            if (typeof s.producto_id !== "string" || !s.producto_id) continue;
            const c = Number(s.cantidad);
            if (!(Number.isFinite(c) && c > 0)) continue;
            list.push({ producto_id: s.producto_id, cantidad: Math.floor(c) });
          }
        } else if (typeof o.producto_id === "string" && o.producto_id) {
          // Forma clásica: 1 franja para todo el item.
          list.push({ producto_id: o.producto_id, cantidad: null });
        }
        if (list.length > 0) overridesByItem.set(o.item_id, list);
      }
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const prodT = quoteSchemaTable(schema, "productos");
    const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const movT = quoteSchemaTable(schema, "movimientos_inventario");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Cabecera + validación tenant + estado + scope de sucursal.
      const cab = await client.query<{
        id: string; numero_control: string; estado: string; sucursal_id: string;
        total_credito: string | number;
      }>(
        `SELECT id, numero_control, estado, sucursal_id, total_credito
         FROM ${recepT}
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE`,
        [recepcionId, auth.empresa_id],
      );
      if (!cab.rows.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse("Recepción no encontrada."), { status: 404 });
      }
      const rec = cab.rows[0];
      if (auth.sucursal_id && rec.sucursal_id !== auth.sucursal_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse("Recepción de otra sucursal."), { status: 403 });
      }
      if (rec.estado !== "pendiente_ingreso") {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse(`No se puede ingresar en estado '${rec.estado}'.`), { status: 400 });
      }

      // 1.a) Modo bucket libre: la clienta puede ingresar MÁS o MENOS
      //      prendas que la evaluación original. Reemplazamos todos los
      //      items de la recepción por el bucket, prorrateando el
      //      total_credito uniformemente sobre las nuevas unidades.
      const bucketFlat = Array.isArray(body.overrides_flat) ? body.overrides_flat : [];
      if (bucketFlat.length > 0) {
        const totalCredito = Number(rec.total_credito ?? 0);
        const totalUnidadesBucket = bucketFlat.reduce(
          (s, b) => s + (Number.isFinite(b.cantidad) && b.cantidad > 0 ? Math.floor(b.cantidad) : 0),
          0,
        );
        if (totalUnidadesBucket === 0) {
          throw new Error("El bucket no tiene unidades para ingresar.");
        }
        // Validar productos destino
        const uniqProds = [...new Set(bucketFlat.map((b) => b.producto_id))];
        const prodQ = await client.query<{
          id: string; nombre: string; sku: string;
          precio_venta: string; activo: boolean; es_franja_precio: boolean;
        }>(
          `SELECT id, nombre, sku, precio_venta::text, activo, es_franja_precio
             FROM ${prodT}
            WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [auth.empresa_id, uniqProds],
        );
        const prodById = new Map(prodQ.rows.map((p) => [p.id, p]));
        for (const b of bucketFlat) {
          const p = prodById.get(b.producto_id);
          if (!p) throw new Error(`Franja destino no encontrada: ${b.producto_id}`);
          if (!p.activo) throw new Error(`Franja ${p.nombre} está inactiva.`);
          if (!p.es_franja_precio) throw new Error(`Producto ${p.nombre} no es una franja de precio válida.`);
        }
        // Costo prorrateado uniforme (mismo costo unitario para todas las unidades).
        const costoUnitProrrateado = Math.round(totalCredito / totalUnidadesBucket);
        // Borrar items originales
        await client.query(
          `DELETE FROM ${recepItT} WHERE recepcion_id = $1`,
          [recepcionId],
        );
        // Insertar líneas del bucket
        for (const b of bucketFlat) {
          const c = Math.floor(Number(b.cantidad) || 0);
          if (c <= 0) continue;
          const p = prodById.get(b.producto_id)!;
          const precioVenta = Number(p.precio_venta);
          const margenPct = precioVenta > 0
            ? ((precioVenta - costoUnitProrrateado) / precioVenta) * 100
            : null;
          await client.query(
            `INSERT INTO ${recepItT} (
               empresa_id, recepcion_id, producto_id, producto_nombre, sku,
               cantidad, precio_compra_unitario, precio_venta_snapshot,
               subtotal, margen_bruto_pct
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              auth.empresa_id, recepcionId, p.id, p.nombre, p.sku,
              c, costoUnitProrrateado, precioVenta,
              costoUnitProrrateado * c, margenPct,
            ],
          );
        }
      }

      // 1.b) Overrides clásico (por item_id): reasignar producto_id
      //    manteniendo la cantidad original — restringido a cambios de franja.
      if (overridesByItem.size > 0) {
        // Validamos que todos los productos destino existan en el tenant.
        const uniqProds = [
          ...new Set(
            Array.from(overridesByItem.values()).flatMap((sp) => sp.map((s) => s.producto_id)),
          ),
        ];
        const prodQ = await client.query<{
          id: string; nombre: string; sku: string;
          precio_venta: string; activo: boolean; es_franja_precio: boolean;
        }>(
          `SELECT id, nombre, sku, precio_venta::text, activo, es_franja_precio
           FROM ${prodT}
           WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
          [auth.empresa_id, uniqProds],
        );
        const prodById = new Map(prodQ.rows.map((p) => [p.id, p]));
        for (const [, splits] of overridesByItem) {
          for (const s of splits) {
            const p = prodById.get(s.producto_id);
            if (!p) throw new Error(`Franja destino no encontrada: ${s.producto_id}`);
            if (!p.activo) throw new Error(`Franja ${p.nombre} está inactiva.`);
            if (!p.es_franja_precio) throw new Error(`Producto ${p.nombre} no es una franja de precio válida.`);
          }
        }
        // Validamos que los items pertenezcan a esta recepción y obtenemos
        // su cantidad actual (para validar sumas de splits).
        const uniqItems = [...overridesByItem.keys()];
        const itemsQ = await client.query<{ id: string; cantidad: string }>(
          `SELECT id, cantidad::text FROM ${recepItT}
           WHERE recepcion_id = $1 AND id = ANY($2::uuid[])
           FOR UPDATE`,
          [recepcionId, uniqItems],
        );
        const itemCantById = new Map(itemsQ.rows.map((r) => [r.id, Number(r.cantidad)]));
        for (const itemId of uniqItems) {
          if (!itemCantById.has(itemId)) {
            throw new Error(`Item ${itemId} no pertenece a esta recepción.`);
          }
        }

        // Aplicamos por item: primer split → UPDATE de la fila original;
        // resto → INSERT clonando el resto de campos del item original.
        for (const [itemId, splitsRaw] of overridesByItem) {
          const cantOriginal = itemCantById.get(itemId)!;
          // Rellenamos cantidad=null (forma clásica de un solo producto)
          // con la cantidad total del item. Si hay varios splits, todos
          // deben traer cantidad explícita.
          const splits = splitsRaw.map((s) => ({
            producto_id: s.producto_id,
            cantidad: s.cantidad ?? cantOriginal,
          }));
          const suma = splits.reduce((a, s) => a + s.cantidad, 0);
          if (suma !== cantOriginal) {
            throw new Error(
              `La suma de cantidades por franja (${suma}) no coincide con la cantidad del item (${cantOriginal}).`,
            );
          }

          const first = splits[0];
          const pFirst = prodById.get(first.producto_id)!;
          await client.query(
            `UPDATE ${recepItT}
                SET producto_id = $1,
                    producto_nombre = $2,
                    sku = $3,
                    precio_venta_snapshot = $4,
                    cantidad = $5,
                    subtotal = COALESCE(precio_compra_unitario, 0) * $5,
                    margen_bruto_pct = CASE
                      WHEN $4::numeric > 0 AND precio_compra_unitario IS NOT NULL
                      THEN (($4::numeric - precio_compra_unitario) / $4::numeric) * 100
                      ELSE NULL
                    END
              WHERE id = $6`,
            [pFirst.id, pFirst.nombre, pFirst.sku, Number(pFirst.precio_venta), first.cantidad, itemId],
          );

          // Splits adicionales → filas nuevas clonando empresa_id,
          // recepcion_id, precio_compra_unitario, costo_historico_incompleto
          // y tipo_prenda_id del item original.
          for (let i = 1; i < splits.length; i++) {
            const s = splits[i];
            const p = prodById.get(s.producto_id)!;
            await client.query(
              `INSERT INTO ${recepItT} (
                 empresa_id, recepcion_id, producto_id, producto_nombre, sku,
                 cantidad, precio_compra_unitario, precio_venta_snapshot,
                 subtotal, margen_bruto_pct, costo_historico_incompleto,
                 tipo_prenda_id
               )
               SELECT empresa_id, recepcion_id, $1, $2, $3,
                      $4, precio_compra_unitario, $5,
                      COALESCE(precio_compra_unitario, 0) * $4,
                      CASE
                        WHEN $5::numeric > 0 AND precio_compra_unitario IS NOT NULL
                        THEN (($5::numeric - precio_compra_unitario) / $5::numeric) * 100
                        ELSE NULL
                      END,
                      costo_historico_incompleto,
                      tipo_prenda_id
                 FROM ${recepItT}
                WHERE id = $6`,
              [p.id, p.nombre, p.sku, s.cantidad, Number(p.precio_venta), itemId],
            );
          }
        }
      }

      // 2) Ingreso al stock — replica la lógica de ingresarRecepcionPgInternal
      //    pero inline para poder correr en la MISMA tx que los updates de
      //    overrides. Cambios idénticos: WACP + stock por sucursal + movimiento.
      const items = await client.query<{
        producto_id: string;
        producto_nombre: string;
        sku: string;
        cantidad: string;
        precio_compra_unitario: string | null;
      }>(
        `SELECT producto_id, producto_nombre, sku, cantidad, precio_compra_unitario
         FROM ${recepItT}
         WHERE recepcion_id = $1`,
        [recepcionId],
      );

      for (const it of items.rows) {
        const qty = Number(it.cantidad);
        const costo = Number(it.precio_compra_unitario ?? 0);

        const prevQ = await client.query<{ stock_actual: string; costo_promedio: string }>(
          `SELECT stock_actual::text, costo_promedio::text
           FROM ${prodT} WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
          [it.producto_id, auth.empresa_id],
        );
        const stockPrev = Number(prevQ.rows[0]?.stock_actual ?? 0);
        const costoPrev = Number(prevQ.rows[0]?.costo_promedio ?? 0);
        const stockNew = stockPrev + qty;
        const wacp = stockNew > 0
          ? Math.round(((stockPrev * costoPrev) + (qty * costo)) / stockNew)
          : costo;

        await client.query(
          `UPDATE ${prodT} SET costo_promedio = $1, updated_at = now()
            WHERE id = $2 AND empresa_id = $3`,
          [wacp, it.producto_id, auth.empresa_id],
        );

        await client.query(
          `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (producto_id, sucursal_id) DO UPDATE
             SET stock_actual = ${stockSucT}.stock_actual + EXCLUDED.stock_actual,
                 updated_at = now()`,
          [it.producto_id, rec.sucursal_id, qty],
        );

        await client.query(
          `INSERT INTO ${movT} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, costo_unitario, origen, referencia, fecha,
             created_by, usuario_nombre
           ) VALUES ($1,$2,$3,$4,'ENTRADA',$5,$6,'compra',$7,now(),$8,$9)`,
          [
            auth.empresa_id, it.producto_id, it.producto_nombre, it.sku,
            qty, costo, rec.numero_control, auth.user.id ?? null, auth.nombre ?? null,
          ],
        );
      }

      // 3) Marcar la recepción como ingresada.
      const upd = await client.query<{ ingresada_at: string }>(
        `UPDATE ${recepT}
            SET estado = 'ingresada',
                ingresada_at = now(),
                ingresada_by = $1,
                ingresada_by_nombre = $2,
                updated_at = now()
          WHERE id = $3 AND empresa_id = $4
          RETURNING ingresada_at`,
        [auth.user.id ?? null, auth.nombre ?? null, recepcionId, auth.empresa_id],
      );

      await client.query("COMMIT");
      return NextResponse.json(successResponse({
        id: recepcionId,
        numero_control: rec.numero_control,
        estado: "ingresada",
        ingresada_at: upd.rows[0].ingresada_at,
        overrides_aplicados: Array.from(overridesByItem.values()).reduce((a, s) => a + s.length, 0),
      }));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => null);
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[/api/recepciones/[id]/ingresar-con-overrides]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
