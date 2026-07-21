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
 * /api/franjas — CRUD de "categorías de precio" (modelo Pronim).
 *
 * Reglas canónicas:
 *   - UNA franja activa por precio (garantía DB: uq_franjas_activas_precio).
 *   - Nombre y SKU se generan automáticamente desde el precio: no se
 *     permite nombre libre. El vendedor solo tipea cantidad por precio.
 *
 * Solo super_admin puede crear/editar. GET también restringido a super_admin
 * porque es la pantalla de administración.
 */

const FRANJA_COLS =
  "id,empresa_id,nombre,sku,precio_venta,stock_actual,stock_minimo," +
  "activo,es_franja_precio,unidad_medida,categoria_principal_id,created_at,updated_at,sucursal_id";

// Nombre/SKU de la franja. Cuando la crea un usuario con sucursal fija,
// suffixamos el sku con los últimos 4 chars del sucursal_id para evitar
// choques del UNIQUE(empresa, sku) contra franjas globales con el mismo
// precio (ej.: Gs. 6.000 en Principal + R\$ 6,00 en El Dorado ambos serían
// FRJ-6000). El nombre queda genérico — el símbolo de moneda lo muestra
// el frontend en runtime.
function franjaLabel(precio: number, sucursalId: string | null): { nombre: string; sku: string } {
  const p = Math.round(precio);
  const nombre = "Prenda - Categoría " + p.toLocaleString("es-PY").replace(/,/g, ".");
  const sufijo = sucursalId ? "-" + sucursalId.replace(/-/g, "").slice(-6).toUpperCase() : "";
  const sku = "FRJ-" + p + sufijo;
  return { nombre, sku };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const auth = await getAuthWithRol(request);
    // Autorización: super_admin ve todas las franjas; usuarios con
    // sucursal fija ven SOLO las de su sucursal + las globales.
    // Sin sucursal y sin super → 403.
    const esSuper = isSuperAdmin(auth);
    if (!esSuper && !auth?.sucursal_id) {
      return NextResponse.json(
        errorResponse("Necesitás sucursal asignada para administrar categorías."),
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
    // Aislamiento por sucursal para usuarios no-super.
    if (!esSuper && auth?.sucursal_id) {
      qs.set("or", `(sucursal_id.eq.${auth.sucursal_id},sucursal_id.is.null)`);
    }
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
    // Autorización: super_admin puede crear globales/scoped; usuarios con
    // sucursal_id fija pueden crear franjas para SU sucursal. Sin sucursal
    // y sin super_admin → rechazo (evita que un usuario random cree
    // franjas globales).
    const esSuper = isSuperAdmin(auth);
    if (!esSuper && !auth?.sucursal_id) {
      return NextResponse.json(
        errorResponse("Necesitás sucursal asignada para crear categorías."),
        { status: 403 },
      );
    }
    const empresaId = ctx.auth.empresa_id;
    // sucursal_id de la franja: si el usuario tiene sucursal fija, va esa
    // (scoped). Si es super_admin sin sucursal, la franja queda global
    // (sucursal_id = NULL) — visible para todas las sucursales.
    const franjaSucursalId: string | null = auth?.sucursal_id ?? null;

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

    const { nombre, sku } = franjaLabel(precio, franjaSucursalId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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

      // Insertar: si ya existe una franja con ese SKU (=precio), reactivarla.
      // Nuevo: `sucursal_id` se setea desde el usuario que crea la franja
      // (fija para BR, NULL para super_admin/global).
      const ins = await client.query<{ id: string }>(
        `INSERT INTO ${productosT} (
           empresa_id, nombre, sku, precio_venta, costo_promedio,
           stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
           activo, es_franja_precio, visible_web, categoria_principal_id,
           sucursal_id
         ) VALUES ($1, $2, $3, $4, 0, 0, 0, 'Unidad', 'CPP', true, true, false, $5, $6)
         ON CONFLICT (empresa_id, sku) DO UPDATE
           SET activo = true, nombre = EXCLUDED.nombre, precio_venta = EXCLUDED.precio_venta
         RETURNING id`,
        [empresaId, nombre, sku, precio, catId, franjaSucursalId],
      );
      const productoId = ins.rows[0].id;

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
    if (msg.includes("uq_franjas_activas_precio") || msg.includes("uq_franjas") || msg.includes("duplicate")) {
      return NextResponse.json(
        errorResponse("Ya existe una categoría activa con ese precio."),
        { status: 409 },
      );
    }
    return NextResponse.json(errorResponse("No se pudo crear la categoría."), { status: 500 });
  }
}
