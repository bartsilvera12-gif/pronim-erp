import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * POST /api/franjas/[id]/stock
 * Body: { sucursal_id: string, delta?: number, set?: number, motivo?: string }
 *
 * Solo super_admin. Ajuste manual de stock. `delta` suma/resta; `set`
 * fija un valor absoluto. Uno de los dos requerido. Registra un
 * movimiento_inventario tipo AJUSTE con origen `ajuste_manual`.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const empresaId = ctx.auth.empresa_id;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const sucursalId = typeof body.sucursal_id === "string" ? body.sucursal_id : "";
    if (!sucursalId) {
      return NextResponse.json(errorResponse("sucursal_id requerido."), { status: 400 });
    }
    const deltaRaw = body.delta;
    const setRaw = body.set;
    const useSet = setRaw !== undefined && setRaw !== null;
    const useDelta = deltaRaw !== undefined && deltaRaw !== null;
    if (useSet === useDelta) {
      return NextResponse.json(errorResponse("Especificá delta O set (no ambos)."), { status: 400 });
    }
    const value = Number(useSet ? setRaw : deltaRaw);
    if (!Number.isFinite(value)) {
      return NextResponse.json(errorResponse("Valor numérico inválido."), { status: 400 });
    }
    const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 200) : "";

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const stockT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const prodT = quoteSchemaTable(schema, "productos");
    const movT = quoteSchemaTable(schema, "movimientos_inventario");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Validar franja y empresa.
      const pk = await client.query<{ nombre: string; sku: string; costo_promedio: string }>(
        `SELECT nombre, sku, costo_promedio FROM ${prodT}
         WHERE id = $1 AND empresa_id = $2 AND es_franja_precio = true LIMIT 1`,
        [productoId, empresaId],
      );
      if (!pk.rows.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse("Franja no encontrada."), { status: 404 });
      }

      // UPSERT stock por sucursal.
      const stockRow = await client.query<{ stock_actual: string }>(
        `INSERT INTO ${stockT} (producto_id, sucursal_id, stock_actual, stock_minimo)
         VALUES ($1, $2, 0, 0)
         ON CONFLICT (producto_id, sucursal_id) DO NOTHING
         RETURNING stock_actual`,
        [productoId, sucursalId],
      );
      let stockPrev: number;
      if (stockRow.rows.length) {
        stockPrev = Number(stockRow.rows[0].stock_actual);
      } else {
        const g = await client.query<{ stock_actual: string }>(
          `SELECT stock_actual FROM ${stockT} WHERE producto_id = $1 AND sucursal_id = $2`,
          [productoId, sucursalId],
        );
        stockPrev = Number(g.rows[0]?.stock_actual ?? 0);
      }
      const stockFinal = useSet ? value : stockPrev + value;
      if (stockFinal < 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse(`Stock quedaría negativo (${stockFinal}). Cancelado.`),
          { status: 400 },
        );
      }
      await client.query(
        `UPDATE ${stockT} SET stock_actual = $1, updated_at = now()
         WHERE producto_id = $2 AND sucursal_id = $3`,
        [stockFinal, productoId, sucursalId],
      );

      const deltaFinal = stockFinal - stockPrev;
      if (deltaFinal !== 0) {
        const tipo = deltaFinal > 0 ? "ENTRADA" : "SALIDA";
        await client.query(
          `INSERT INTO ${movT} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, costo_unitario, origen, referencia, fecha,
             created_by, usuario_nombre
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ajuste_manual', $8, now(), $9, $10)`,
          [
            empresaId,
            productoId,
            pk.rows[0].nombre,
            pk.rows[0].sku,
            tipo,
            Math.abs(deltaFinal),
            Number(pk.rows[0].costo_promedio || 0),
            motivo || "Ajuste manual desde admin de franjas",
            auth?.user?.id ?? null,
            auth?.nombre ?? null,
          ],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json(
        successResponse({
          producto_id: productoId,
          sucursal_id: sucursalId,
          stock_anterior: stockPrev,
          stock_actual: stockFinal,
        }),
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/franjas/[id]/stock POST]", msg);
    return NextResponse.json(errorResponse("Error al ajustar stock."), { status: 500 });
  }
}
