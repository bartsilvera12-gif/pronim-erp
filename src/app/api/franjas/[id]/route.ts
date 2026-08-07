import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * PATCH /api/franjas/[id]
 * Body: { precio_venta?: number, activo?: boolean, stock_minimo?: number }
 *
 * Solo super_admin.
 * Nombre y SKU se regeneran automáticamente cuando cambia el precio
 * ("Prenda - Categoría Gs. X" / "FRJ-{precio}"). No hay nombre libre.
 */

function franjaLabel(precio: number, sucursalId: string | null): { nombre: string; sku: string } {
  const p = Math.round(precio);
  const nombre = "Prenda - Categoría " + p.toLocaleString("es-PY").replace(/,/g, ".");
  const sufijo = sucursalId ? "-" + sucursalId.replace(/-/g, "").slice(-6).toUpperCase() : "";
  const sku = "FRJ-" + p + sufijo;
  return { nombre, sku };
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    // Autorización: super_admin O usuario con sucursal fija. Los usuarios
    // solo pueden tocar franjas de su propia sucursal (WHERE agrega el
    // filtro más abajo).
    const esSuper = isSuperAdmin(auth);
    if (!esSuper && !auth?.sucursal_id) {
      return NextResponse.json(errorResponse("Necesitás sucursal asignada."), { status: 403 });
    }
    const empresaId = ctx.auth.empresa_id;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const productosT = quoteSchemaTable(schema, "productos");

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.precio_venta !== undefined) {
      const p = Number(body.precio_venta);
      if (!Number.isFinite(p) || p <= 0) {
        return NextResponse.json(errorResponse("Precio inválido."), { status: 400 });
      }
      // sku scoped por sucursal (mismo criterio que el POST) para no
      // colisionar con franjas globales o de otras sucursales.
      const { nombre, sku } = franjaLabel(p, auth?.sucursal_id ?? null);
      sets.push(`precio_venta = $${i++}`, `nombre = $${i++}`, `sku = $${i++}`);
      values.push(p, nombre, sku);
    }
    if (body.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      values.push(body.activo === true);
    }
    if (body.stock_minimo !== undefined) {
      const sm = Number(body.stock_minimo);
      if (!Number.isFinite(sm) || sm < 0) {
        return NextResponse.json(errorResponse("Stock mínimo inválido."), { status: 400 });
      }
      sets.push(`stock_minimo = $${i++}`);
      values.push(sm);
    }
    // Renombrar franja (label libre) — mantenemos el sku auto para no
    // romper referencias históricas.
    if (body.nombre !== undefined) {
      const n = String(body.nombre).trim();
      if (!n) {
        return NextResponse.json(errorResponse("Nombre inválido."), { status: 400 });
      }
      sets.push(`nombre = $${i++}`);
      values.push(n.slice(0, 120));
    }
    if (!sets.length) {
      return NextResponse.json(errorResponse("Nada para actualizar."), { status: 400 });
    }
    sets.push(`updated_at = now()`);
    const idIdx = i++;
    const empIdx = i++;
    values.push(id, empresaId);
    // Aislamiento: super_admin toca cualquier franja; usuario con
    // sucursal fija solo las suyas (o las globales NULL).
    let scopeCond = "";
    if (!esSuper && auth?.sucursal_id) {
      const sucIdx = i++;
      scopeCond = ` AND (sucursal_id = $${sucIdx} OR sucursal_id IS NULL)`;
      values.push(auth.sucursal_id);
    }
    const sql = `UPDATE ${productosT}
                 SET ${sets.join(", ")}
                 WHERE id = $${idIdx} AND empresa_id = $${empIdx} AND es_franja_precio = true${scopeCond}
                 RETURNING id, nombre, sku, precio_venta, activo, stock_actual, stock_minimo`;

    const client = await pool.connect();
    try {
      const r = await client.query(sql, values);
      if (!r.rows.length) {
        return NextResponse.json(errorResponse("Categoría no encontrada."), { status: 404 });
      }
      return NextResponse.json(successResponse({ franja: r.rows[0] }));
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/franjas/[id] PATCH]", msg);
    if (msg.includes("uq_franjas_activas_precio") || msg.includes("productos_empresa") || msg.includes("duplicate")) {
      return NextResponse.json(
        errorResponse("Ya existe una categoría activa con ese precio."),
        { status: 409 },
      );
    }
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}

/**
 * DELETE /api/franjas/[id]
 * Borra una franja de precio si no tiene movimientos, ventas ni recepciones.
 * Si tiene, retorna 409 con mensaje sugiriendo desactivarla en su lugar.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    const esSuper = isSuperAdmin(auth);
    if (!esSuper && !auth?.sucursal_id) {
      return NextResponse.json(errorResponse("Necesitás sucursal asignada."), { status: 403 });
    }
    const empresaId = ctx.auth.empresa_id;

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const productosT = quoteSchemaTable(schema, "productos");
    const ventasItemsT = quoteSchemaTable(schema, "ventas_items");
    const recepItemsT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const movT = quoteSchemaTable(schema, "movimientos_inventario");
    const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");

    const client = await pool.connect();
    try {
      // Verificar que la franja existe y pertenece a la empresa (+ sucursal si aplica)
      let scopeCond = "";
      const params: unknown[] = [id, empresaId];
      if (!esSuper && auth?.sucursal_id) {
        params.push(auth.sucursal_id);
        scopeCond = ` AND (sucursal_id = $3 OR sucursal_id IS NULL)`;
      }
      const chk = await client.query<{ id: string; nombre: string }>(
        `SELECT id, nombre FROM ${productosT}
         WHERE id = $1 AND empresa_id = $2 AND es_franja_precio = true${scopeCond}
         LIMIT 1`,
        params,
      );
      if (!chk.rows.length) {
        return NextResponse.json(errorResponse("Categoría no encontrada."), { status: 404 });
      }

      // Chequeo de referencias (best-effort — si las tablas no existen, salta).
      let usos = 0;
      try {
        const q1 = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ${ventasItemsT} WHERE producto_id = $1`, [id],
        );
        usos += Number(q1.rows[0]?.n ?? 0);
      } catch { /* tabla no existe */ }
      try {
        const q2 = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ${recepItemsT} WHERE producto_id = $1`, [id],
        );
        usos += Number(q2.rows[0]?.n ?? 0);
      } catch { /* tabla no existe */ }
      try {
        const q3 = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ${movT} WHERE producto_id = $1`, [id],
        );
        usos += Number(q3.rows[0]?.n ?? 0);
      } catch { /* tabla no existe */ }

      if (usos > 0) {
        return NextResponse.json(
          errorResponse(
            `No se puede borrar: la categoría tiene ${usos} movimiento(s) o venta(s) asociada(s). Podés desactivarla para que deje de aparecer sin perder el historial.`,
          ),
          { status: 409 },
        );
      }

      // Borrar dependencias limpias (stock_sucursal sin movimientos = OK borrar)
      try { await client.query(`DELETE FROM ${stockSucT} WHERE producto_id = $1`, [id]); } catch { /* tabla no existe */ }
      await client.query(
        `DELETE FROM ${productosT} WHERE id = $1 AND empresa_id = $2 AND es_franja_precio = true`,
        [id, empresaId],
      );
      return NextResponse.json(successResponse({ ok: true, nombre: chk.rows[0].nombre }));
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/franjas/[id] DELETE]", msg);
    return NextResponse.json(errorResponse("Error al borrar."), { status: 500 });
  }
}
