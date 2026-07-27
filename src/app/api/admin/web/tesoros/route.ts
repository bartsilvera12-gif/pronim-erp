import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Admin CRUD para tesoros del sitio publico (Akakua'a). Solo super_admin.
 * Todo scopeado a `empresa_id = auth.empresa_id`.
 */

const COLS =
  "id, empresa_id, tipo, url, titulo, subtitulo, precio, sku_franja, orden, activo, created_at, updated_at";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

/** GET /api/admin/web/tesoros — lista todos (incluye inactivos). */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_tesoros");
    const sql =
      `SELECT ${COLS} FROM ${t} WHERE empresa_id = $1::uuid ` +
      `ORDER BY orden ASC, created_at ASC`;
    const { rows } = await pool().query(sql, [auth.empresa_id]);
    return NextResponse.json(successResponse({ tesoros: rows }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar.";
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json(successResponse({ tesoros: [] }));
    }
    console.error("[/api/admin/web/tesoros GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/admin/web/tesoros — crea. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo super_admin."), { status: 403 });
    }
    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "web_tesoros");

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const tipoRaw = String(b.tipo ?? "").trim().toLowerCase();
    if (tipoRaw !== "foto" && tipoRaw !== "video") {
      return NextResponse.json(errorResponse("Tipo inválido (foto|video)."), { status: 400 });
    }
    const url = typeof b.url === "string" ? b.url.trim() : "";
    if (!url) {
      return NextResponse.json(errorResponse("URL requerida."), { status: 400 });
    }
    if (url.length > 1000) {
      return NextResponse.json(errorResponse("URL demasiado larga."), { status: 400 });
    }

    const titulo = typeof b.titulo === "string" && b.titulo.trim() ? b.titulo.trim().slice(0, 200) : null;
    const subtitulo = typeof b.subtitulo === "string" && b.subtitulo.trim() ? b.subtitulo.trim().slice(0, 200) : null;
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

    const sql =
      `INSERT INTO ${t} (empresa_id, tipo, url, titulo, subtitulo, precio, sku_franja, orden, activo, created_by) ` +
      `VALUES ($1::uuid, $2, $3, $4, $5, $6::numeric, $7, $8::int, $9, $10::uuid) ` +
      `RETURNING ${COLS}`;
    const { rows } = await pool().query(sql, [
      auth.empresa_id,
      tipoRaw,
      url,
      titulo,
      subtitulo,
      precioNum,
      skuFranja,
      Math.trunc(ordenNum),
      activo,
      auth.usuarioCatalogId ?? null,
    ]);
    return NextResponse.json(successResponse({ tesoro: rows[0] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo crear.";
    console.error("[/api/admin/web/tesoros POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
