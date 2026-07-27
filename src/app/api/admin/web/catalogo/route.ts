import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Admin CRUD para items del catálogo web (Akakua'a). Solo super_admin.
 * Todo scopeado a `empresa_id = auth.empresa_id`.
 */

const COLS =
  "id, empresa_id, nombre, descripcion, precio, categoria, edad, imagen_url, sku_franja, orden, activo, destacado, created_at, updated_at";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

/** GET /api/admin/web/catalogo — lista todos (incluye inactivos). */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_catalogo_items");
    const sql =
      `SELECT ${COLS} FROM ${t} WHERE empresa_id = $1::uuid ` +
      `ORDER BY orden ASC, created_at ASC`;
    const { rows } = await pool().query(sql, [auth.empresa_id]);
    return NextResponse.json(successResponse({ items: rows }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar.";
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json(successResponse({ items: [] }));
    }
    console.error("[/api/admin/web/catalogo GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/admin/web/catalogo — crea. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_catalogo_items");

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
    if (!nombre) {
      return NextResponse.json(errorResponse("Nombre requerido."), { status: 400 });
    }
    if (nombre.length > 200) {
      return NextResponse.json(errorResponse("Nombre demasiado largo."), { status: 400 });
    }
    const imagen = typeof b.imagen_url === "string" ? b.imagen_url.trim() : "";
    if (!imagen) {
      return NextResponse.json(errorResponse("Imagen URL requerida."), { status: 400 });
    }
    if (imagen.length > 1000) {
      return NextResponse.json(errorResponse("Imagen URL demasiado larga."), { status: 400 });
    }

    const descripcion = typeof b.descripcion === "string" && b.descripcion.trim() ? b.descripcion.trim().slice(0, 2000) : null;
    const categoria = typeof b.categoria === "string" && b.categoria.trim() ? b.categoria.trim().slice(0, 120) : null;
    const edad = typeof b.edad === "string" && b.edad.trim() ? b.edad.trim().slice(0, 120) : null;
    const skuFranja = typeof b.sku_franja === "string" && b.sku_franja.trim() ? b.sku_franja.trim().slice(0, 80) : null;
    const precioNum = b.precio == null || b.precio === "" ? null : Number(b.precio);
    if (precioNum != null && (!Number.isFinite(precioNum) || precioNum < 0)) {
      return NextResponse.json(errorResponse("Precio inválido."), { status: 400 });
    }
    const ordenNum = b.orden == null || b.orden === "" ? 0 : Number(b.orden);
    if (!Number.isFinite(ordenNum)) {
      return NextResponse.json(errorResponse("Orden inválido."), { status: 400 });
    }
    const activo = b.activo === undefined ? true : b.activo === true;
    const destacado = b.destacado === true;

    const sql =
      `INSERT INTO ${t} (empresa_id, nombre, descripcion, precio, categoria, edad, imagen_url, sku_franja, orden, activo, destacado, created_by) ` +
      `VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6, $7, $8, $9::int, $10, $11, $12::uuid) ` +
      `RETURNING ${COLS}`;
    const { rows } = await pool().query(sql, [
      auth.empresa_id,
      nombre,
      descripcion,
      precioNum,
      categoria,
      edad,
      imagen,
      skuFranja,
      Math.trunc(ordenNum),
      activo,
      destacado,
      auth.usuarioCatalogId ?? null,
    ]);
    return NextResponse.json(successResponse({ item: rows[0] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo crear.";
    console.error("[/api/admin/web/catalogo POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
