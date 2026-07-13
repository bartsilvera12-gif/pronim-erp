import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * DELETE /api/clientes/[id]/eventos/[eventoId] — soft-delete.
 * Solo super_admin. Los eventos son append-only para el resto del equipo.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; eventoId: string }> },
) {
  try {
    const { id: clienteId, eventoId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isSuperAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo super_admin puede eliminar eventos del historial."),
        { status: 403 },
      );
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const eventosT = quoteSchemaTable(schema, "cliente_eventos");
    const client = await pool.connect();
    try {
      const r = await client.query(
        `UPDATE ${eventosT}
            SET deleted_at = now(),
                deleted_by = $1,
                deleted_by_nombre = $2
          WHERE id = $3 AND cliente_id = $4 AND empresa_id = $5
            AND deleted_at IS NULL
          RETURNING id`,
        [auth.user.id, auth.nombre ?? null, eventoId, clienteId, auth.empresa_id],
      );
      if (!r.rows.length) {
        return NextResponse.json(errorResponse("Evento no encontrado o ya eliminado."), { status: 404 });
      }
      return NextResponse.json(successResponse({ id: eventoId }));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/eventos/[eventoId] DELETE]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
