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
 * Body: { precio_venta?: number, nombre?: string, activo?: boolean, stock_minimo?: number }
 *
 * Solo super_admin.
 *
 * Reglas de nombre/SKU:
 *   - Si el usuario manda `nombre`, se usa ese texto libre (y se genera
 *     un SKU nuevo por slug + sufijo para evitar duplicados).
 *   - Si no manda `nombre` pero sí `precio_venta`, se DEJA el nombre
 *     actual (no lo pisamos) — el nombre libre del usuario tiene
 *     prioridad. Solo el precio se actualiza.
 */

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function siguienteSkuLibre(
  client: import("pg").PoolClient,
  productosT: string,
  empresaId: string,
  base: string,
  excluirId: string,
): Promise<string> {
  let candidato = base;
  let intento = 1;
  while (true) {
    const q = await client.query(
      `SELECT 1 FROM ${productosT}
        WHERE empresa_id = $1 AND sku = $2 AND id <> $3 LIMIT 1`,
      [empresaId, candidato, excluirId],
    );
    if (q.rows.length === 0) return candidato;
    intento += 1;
    candidato = `${base}-${intento}`;
    if (intento > 200) throw new Error("No se pudo generar un SKU único.");
  }
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

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const productosT = quoteSchemaTable(schema, "productos");

    const client = await pool.connect();
    try {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;

      if (body.precio_venta !== undefined) {
        const p = Number(body.precio_venta);
        if (!Number.isFinite(p) || p <= 0) {
          return NextResponse.json(errorResponse("Precio inválido."), { status: 400 });
        }
        sets.push(`precio_venta = $${i++}`);
        values.push(p);
      }
      if (body.nombre !== undefined) {
        const n = typeof body.nombre === "string" ? body.nombre.trim() : "";
        if (!n) {
          return NextResponse.json(errorResponse("Nombre vacío."), { status: 400 });
        }
        const nuevoSku = await siguienteSkuLibre(
          client,
          productosT,
          empresaId,
          "CAT-" + slugify(n),
          id,
        );
        sets.push(`nombre = $${i++}`, `sku = $${i++}`);
        values.push(n.slice(0, 120), nuevoSku);
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
      if (!sets.length) {
        return NextResponse.json(errorResponse("Nada para actualizar."), { status: 400 });
      }
      sets.push(`updated_at = now()`);
      values.push(id, empresaId);

      const sql = `UPDATE ${productosT}
                   SET ${sets.join(", ")}
                   WHERE id = $${i++} AND empresa_id = $${i++} AND es_franja_precio = true
                   RETURNING id, nombre, sku, precio_venta, activo, stock_actual, stock_minimo`;

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
    if (msg.includes("productos_empresa") || msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        errorResponse("Conflicto de SKU al renombrar. Probá con otro nombre."),
        { status: 409 },
      );
    }
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
