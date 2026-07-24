import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  listEntidadesBancarias,
  insertEntidadBancaria,
  updateEntidadBancaria,
  type TipoEntidad,
} from "@/lib/ventas/server/pago-detalle-pg";

export const dynamic = "force-dynamic";

const TIPOS: TipoEntidad[] = ["caja", "banco", "tarjeta", "billetera", "otro"];
function normTipo(v: unknown): TipoEntidad {
  return TIPOS.includes(v as TipoEntidad) ? (v as TipoEntidad) : "otro";
}
function cleanCodigo(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return s.length > 0 ? s.slice(0, 20) : null;
}

/** GET /api/entidades-bancarias[?todas=1] — activas por defecto; todas incluye inactivas. */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const todas = request.nextUrl.searchParams.get("todas") === "1";
    const entidades = await listEntidadesBancarias(schema, auth.empresa_id, { todas });
    return NextResponse.json(successResponse({ entidades }));
  } catch (err) {
    console.error("[/api/entidades-bancarias GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las entidades."), { status: 500 });
  }
}

/** POST /api/entidades-bancarias — crea una entidad. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    const orden = Number.isFinite(Number(b.orden)) ? Math.floor(Number(b.orden)) : 0;
    try {
      const entidad = await insertEntidadBancaria(schema, auth.empresa_id, {
        codigo: cleanCodigo(b.codigo),
        nombre: nombre.slice(0, 120),
        tipo: normTipo(b.tipo),
        activo: b.activo === false ? false : true,
        orden,
      });
      return NextResponse.json(successResponse({ entidad }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/duplicate key|unique|23505/i.test(msg)) {
        return NextResponse.json(errorResponse("Ya existe una entidad con ese código."), { status: 409 });
      }
      throw e;
    }
  } catch (err) {
    console.error("[/api/entidades-bancarias POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo crear la entidad."), { status: 500 });
  }
}

/** PATCH /api/entidades-bancarias — actualiza (body.id requerido). */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof b.id === "string" ? b.id : "";
    if (!id) return NextResponse.json(errorResponse("Falta el id de la entidad."), { status: 400 });
    const patch: Record<string, unknown> = {};
    if (b.codigo !== undefined) patch.codigo = cleanCodigo(b.codigo);
    if (typeof b.nombre === "string" && b.nombre.trim()) patch.nombre = b.nombre.trim().slice(0, 120);
    if (b.tipo !== undefined) patch.tipo = normTipo(b.tipo);
    if (b.activo !== undefined) patch.activo = b.activo === true;
    if (b.orden !== undefined && Number.isFinite(Number(b.orden))) patch.orden = Math.floor(Number(b.orden));
    try {
      const entidad = await updateEntidadBancaria(schema, auth.empresa_id, id, patch);
      if (!entidad) return NextResponse.json(errorResponse("Entidad no encontrada."), { status: 404 });
      return NextResponse.json(successResponse({ entidad }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/duplicate key|unique|23505/i.test(msg)) {
        return NextResponse.json(errorResponse("Ya existe una entidad con ese código."), { status: 409 });
      }
      throw e;
    }
  } catch (err) {
    console.error("[/api/entidades-bancarias PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar la entidad."), { status: 500 });
  }
}

/** DELETE /api/entidades-bancarias?id=... — soft delete (activo=false). */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json(errorResponse("Falta el id de la entidad."), { status: 400 });
    const entidad = await updateEntidadBancaria(schema, auth.empresa_id, id, { activo: false });
    if (!entidad) return NextResponse.json(errorResponse("Entidad no encontrada."), { status: 404 });
    return NextResponse.json(successResponse({ entidad }));
  } catch (err) {
    console.error("[/api/entidades-bancarias DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo eliminar la entidad."), { status: 500 });
  }
}
