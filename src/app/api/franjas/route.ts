import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * /api/franjas — CRUD acotado de "franjas de precio" (modelo Pronim).
 *
 * Todas las operaciones requieren rol super_admin. Las franjas son
 * productos con `es_franja_precio=true`, categoría `FRANJA`, SKU
 * `FRJ-<precio>` y nombre `Prenda Gs. <precio>`. No exponen los campos
 * web/catalogo; el usuario solo maneja precio, activo, stock (por
 * sucursal — si querés ajustes usá /api/franjas/[id]/stock).
 *
 * GET  → lista de franjas de la empresa activa (activas + inactivas).
 * POST → crea una nueva franja (precio numérico obligatorio).
 */

const FRANJA_COLS =
  "id,empresa_id,nombre,sku,precio_venta,stock_actual,stock_minimo," +
  "activo,es_franja_precio,unidad_medida,categoria_principal_id,created_at,updated_at";

function franjaLabel(precio: number): { nombre: string; sku: string } {
  const p = Math.round(precio);
  const nombre = "Prenda - Categoría Gs. " + p.toLocaleString("es-PY").replace(/,/g, ".");
  const sku = "FRJ-" + p;
  return { nombre, sku };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo super_admin puede consultar la administración de categorías."),
        { status: 403 },
      );
    }
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);
    const qs = new URLSearchParams({
      select: FRANJA_COLS,
      empresa_id: `eq.${empresaId}`,
      es_franja_precio: "eq.true",
      order: "precio_venta.asc",
      limit: "200",
    });
    const r = await postgrestGet<Record<string, unknown>>("productos", qs.toString(), {
      role: "jwt",
      jwt,
      noStore: true,
    });
    if (!r.ok) {
      return NextResponse.json(errorResponse("No se pudieron cargar las franjas."), { status: 502 });
    }
    return NextResponse.json(successResponse({ franjas: r.rows }));
  } catch (err) {
    console.error("[/api/franjas GET] uncaught", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo super_admin puede crear categorías."),
        { status: 403 },
      );
    }
    const empresaId = ctx.auth.empresa_id;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const precio = Number(body.precio_venta);
    if (!Number.isFinite(precio) || precio <= 0) {
      return NextResponse.json(errorResponse("Precio inválido: debe ser mayor a 0."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    }

    const productosT = quoteSchemaTable(schema, "productos");
    const categoriasT = quoteSchemaTable(schema, "categorias_productos");
    const stockSucT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const sucursalesT = quoteSchemaTable(schema, "sucursales");

    const { nombre, sku } = franjaLabel(precio);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Categoría FRANJA (por empresa). Si no existe, crearla.
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

      const ins = await client.query<{ id: string }>(
        `INSERT INTO ${productosT} (
           empresa_id, nombre, sku, precio_venta, costo_promedio,
           stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
           activo, es_franja_precio, visible_web, categoria_principal_id
         ) VALUES ($1, $2, $3, $4, 0, 0, 0, 'Unidad', 'CPP', true, true, false, $5)
         ON CONFLICT (empresa_id, sku) DO UPDATE SET activo = true
         RETURNING id`,
        [empresaId, nombre, sku, precio, catId],
      );
      const productoId = ins.rows[0].id;

      // Backfill stock por sucursal en 0.
      await client.query(
        `INSERT INTO ${stockSucT} (producto_id, sucursal_id, stock_actual, stock_minimo)
         SELECT $1, s.id, 0, 0
         FROM ${sucursalesT} s
         WHERE s.empresa_id = $2
         ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
        [productoId, empresaId],
      );

      await client.query("COMMIT");
      return NextResponse.json(
        successResponse({ franja: { id: productoId, precio_venta: precio, nombre, sku } }),
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/franjas POST]", msg);
    return NextResponse.json(errorResponse("No se pudo crear la franja."), { status: 500 });
  }
}
