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
 * Body:
 *   {
 *     overrides?: [{ item_id: uuid, producto_id: uuid }]
 *   }
 *
 * - Si `overrides` viene, actualiza esos items:
 *     * `producto_id` = la nueva franja (el productos.id que aporta el user)
 *     * `precio_venta_snapshot` = productos.precio_venta de esa nueva franja
 *     * `precio_compra_unitario` NO cambia (lo que se pagó al cliente sigue igual)
 *     * `producto_nombre` y `sku` se actualizan al del nuevo producto
 * - Si `overrides` está vacío / undefined, se ingresa tal cual.
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
      overrides?: { item_id?: string; producto_id?: string }[];
    };
    const overrides = Array.isArray(body.overrides)
      ? body.overrides
          .filter((o) => typeof o.item_id === "string" && typeof o.producto_id === "string" && o.item_id && o.producto_id)
          .map((o) => ({ item_id: o.item_id as string, producto_id: o.producto_id as string }))
      : [];

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
      }>(
        `SELECT id, numero_control, estado, sucursal_id
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

      // 1) Aplicar overrides si vinieron: reasignar producto_id + snapshot
      //    del precio de venta al de la nueva franja.
      if (overrides.length > 0) {
        // Validamos que todos los productos destino existan en el tenant.
        const uniqProds = [...new Set(overrides.map((o) => o.producto_id))];
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
        for (const ov of overrides) {
          const p = prodById.get(ov.producto_id);
          if (!p) throw new Error(`Franja destino no encontrada: ${ov.producto_id}`);
          if (!p.activo) throw new Error(`Franja ${p.nombre} está inactiva.`);
          if (!p.es_franja_precio) throw new Error(`Producto ${p.nombre} no es una franja de precio válida.`);
        }
        // Validamos también que los items pertenezcan a esta recepción.
        const uniqItems = [...new Set(overrides.map((o) => o.item_id))];
        const itemsQ = await client.query<{ id: string }>(
          `SELECT id FROM ${recepItT}
           WHERE recepcion_id = $1 AND id = ANY($2::uuid[])`,
          [recepcionId, uniqItems],
        );
        const itemIdsValidos = new Set(itemsQ.rows.map((r) => r.id));
        for (const ov of overrides) {
          if (!itemIdsValidos.has(ov.item_id)) {
            throw new Error(`Item ${ov.item_id} no pertenece a esta recepción.`);
          }
        }

        // UPDATE por override. Reasigna producto, precio_venta_snapshot,
        // producto_nombre y sku. NO toca precio_compra_unitario ni cantidad.
        for (const ov of overrides) {
          const p = prodById.get(ov.producto_id)!;
          await client.query(
            `UPDATE ${recepItT}
                SET producto_id = $1,
                    producto_nombre = $2,
                    sku = $3,
                    precio_venta_snapshot = $4,
                    margen_bruto_pct = CASE
                      WHEN $4::numeric > 0 AND precio_compra_unitario IS NOT NULL
                      THEN (($4::numeric - precio_compra_unitario) / $4::numeric) * 100
                      ELSE NULL
                    END
              WHERE id = $5`,
            [p.id, p.nombre, p.sku, Number(p.precio_venta), ov.item_id],
          );
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
        overrides_aplicados: overrides.length,
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
