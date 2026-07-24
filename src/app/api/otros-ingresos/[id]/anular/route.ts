import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import {
  fetchDataSchemaForEmpresaId,
} from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

/**
 * POST /api/otros-ingresos/[id]/anular
 * Body: { motivo?: string }
 * Solo el creador o un admin pueden anular.
 * Idempotente: si ya esta anulado, no lo pisa.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json(errorResponse("Falta el id."), { status: 400 });
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "otros_ingresos");

    let motivo: string | null = null;
    try {
      const b = (await request.json()) as { motivo?: unknown };
      motivo = b?.motivo == null ? null : String(b.motivo).trim().slice(0, 500) || null;
    } catch { /* body vacio */ }

    // Cargar el ingreso
    const { rows: found } = await pool().query<{
      id: string; creado_por: string | null; anulado_at: string | null;
    }>(
      `SELECT id, creado_por, anulado_at FROM ${t} WHERE id=$1::uuid AND empresa_id=$2::uuid`,
      [id, auth.empresa_id]
    );
    const ing = found[0];
    if (!ing) return NextResponse.json(errorResponse("Ingreso no encontrado."), { status: 404 });

    // Ya anulado -> idempotente
    if (ing.anulado_at) return NextResponse.json(successResponse({ ok: true, already: true }));

    // Autorizacion: creador o admin
    const admin = isAdmin(auth);
    const esCreador = !!(auth.usuarioCatalogId && ing.creado_por === auth.usuarioCatalogId);
    if (!admin && !esCreador) {
      return NextResponse.json(errorResponse("Solo el creador o un admin pueden anular este ingreso."), { status: 403 });
    }

    await pool().query(
      `UPDATE ${t} SET anulado_at = now(), anulado_by = $1::uuid, anulacion_motivo = $2, updated_at = now()
       WHERE id = $3::uuid AND empresa_id = $4::uuid`,
      [auth.usuarioCatalogId ?? null, motivo, id, auth.empresa_id]
    );
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo anular el ingreso.";
    console.error("[/api/otros-ingresos/[id]/anular POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
