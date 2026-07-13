import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * POST /api/franjas/seed
 *
 * Siembra un conjunto inicial de franjas de precio. El body puede
 * pasar una lista explícita `{ precios: number[] }` para no hardcodear
 * los valores en el server. Si no viene body, se usan las 20 franjas
 * base del modelo Pronim (documentadas por el cliente).
 *
 * Solo super_admin. Idempotente: si la franja ya existe (mismo SKU),
 * no la duplica.
 */

const DEFAULT_PRECIOS = [
  6000, 9000, 14000, 19000, 24000, 29000,
  34000, 39000, 44000, 49000, 54000, 59000,
  64000, 69000, 74000, 79000, 84000, 89000,
  94000, 99000,
];

function franjaLabel(precio: number): { nombre: string; sku: string } {
  const p = Math.round(precio);
  const nombre = "Prenda - Categoría Gs. " + p.toLocaleString("es-PY").replace(/,/g, ".");
  const sku = "FRJ-" + p;
  return { nombre, sku };
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo super_admin puede sembrar franjas."),
        { status: 403 },
      );
    }
    const empresaId = ctx.auth.empresa_id;

    let precios: number[] = DEFAULT_PRECIOS;
    try {
      const body = (await request.json()) as { precios?: unknown };
      if (Array.isArray(body?.precios)) {
        const parsed = body.precios
          .map((p) => Number(p))
          .filter((p) => Number.isFinite(p) && p > 0);
        if (parsed.length > 0) precios = parsed;
      }
    } catch {
      /* body opcional */
    }

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const productosT = quoteSchemaTable(schema, "productos");
    const categoriasT = quoteSchemaTable(schema, "categorias_productos");
    const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const sucursalesT = quoteSchemaTable(schema, "sucursales");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Categoría FRANJA (por empresa)
      let catId: string;
      const catQ = await client.query<{ id: string }>(
        `SELECT id FROM ${categoriasT} WHERE empresa_id = $1 AND codigo = 'FRANJA' LIMIT 1`,
        [empresaId],
      );
      if (catQ.rows.length) {
        catId = catQ.rows[0].id;
      } else {
        const insCat = await client.query<{ id: string }>(
          `INSERT INTO ${categoriasT} (empresa_id, nombre, codigo, activo, visible_web)
           VALUES ($1, 'Prendas por franja', 'FRANJA', true, false)
           RETURNING id`,
          [empresaId],
        );
        catId = insCat.rows[0].id;
      }

      let creadas = 0;
      let existentes = 0;
      for (const precio of precios) {
        const { nombre, sku } = franjaLabel(precio);
        const ins = await client.query<{ id: string }>(
          `INSERT INTO ${productosT} (
             empresa_id, nombre, sku, precio_venta, costo_promedio,
             stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
             activo, es_franja_precio, visible_web, categoria_principal_id
           ) VALUES ($1, $2, $3, $4, 0, 0, 0, 'Unidad', 'CPP', true, true, false, $5)
           ON CONFLICT (empresa_id, sku) DO NOTHING
           RETURNING id`,
          [empresaId, nombre, sku, precio, catId],
        );
        if (ins.rows.length) {
          creadas++;
          // stock por sucursal en 0
          await client.query(
            `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, stock_minimo)
             SELECT $1, s.id, 0, 0
             FROM ${sucursalesT} s
             WHERE s.empresa_id = $2
             ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
            [ins.rows[0].id, empresaId],
          );
        } else {
          existentes++;
        }
      }

      await client.query("COMMIT");
      return NextResponse.json(
        successResponse({
          creadas,
          existentes,
          total: precios.length,
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
    console.error("[/api/franjas/seed POST]", msg);
    return NextResponse.json(errorResponse("No se pudo sembrar el conjunto de franjas."), { status: 500 });
  }
}
