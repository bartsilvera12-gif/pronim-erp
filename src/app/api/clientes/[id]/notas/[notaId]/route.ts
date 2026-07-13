import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * DELETE /api/clientes/[id]/notas/[notaId] — soft-delete.
 * Solo el autor original o un super_admin pueden borrar.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; notaId: string }> },
) {
  try {
    const { id: clienteId, notaId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const notasT = quoteSchemaTable(schema, "cliente_notas");
    const client = await pool.connect();
    try {
      const q = await client.query<{ autor_id: string | null; deleted_at: string | null }>(
        `SELECT autor_id, deleted_at FROM ${notasT}
         WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3 LIMIT 1`,
        [notaId, clienteId, auth.empresa_id],
      );
      if (!q.rows.length) {
        return NextResponse.json(errorResponse("Nota no encontrada."), { status: 404 });
      }
      const nota = q.rows[0];
      if (nota.deleted_at) {
        return NextResponse.json(errorResponse("Ya estaba eliminada."), { status: 409 });
      }

      const esAutor = nota.autor_id != null && nota.autor_id === auth.user.id;
      if (!esAutor && !isSuperAdmin(auth)) {
        return NextResponse.json(
          errorResponse("Solo el autor de la nota (o un super_admin) puede eliminarla."),
          { status: 403 },
        );
      }

      await client.query(
        `UPDATE ${notasT}
            SET deleted_at = now(),
                deleted_by = $1,
                deleted_by_nombre = $2
          WHERE id = $3 AND empresa_id = $4`,
        [auth.user.id, auth.nombre ?? null, notaId, auth.empresa_id],
      );
      return NextResponse.json(successResponse({ id: notaId }));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/notas/[notaId] DELETE]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
