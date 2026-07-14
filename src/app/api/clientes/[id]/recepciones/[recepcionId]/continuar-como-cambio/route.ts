import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { iniciarCambioPg } from "@/lib/cambios/server/cambio-pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/** POST /api/clientes/[id]/recepciones/[recepcionId]/continuar-como-cambio
 *  Crea un cambio en 'borrador' asociado a esta recepción y devuelve la
 *  URL de venta que hay que abrir. */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string; recepcionId: string }> },
) {
  try {
    const { id: clienteId, recepcionId } = await ctxParams.params;
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    // Resolver la sucursal desde la recepción (siempre tiene sucursal_id ahora)
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) throw new Error("Sin conexión Postgres.");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const client = await pool.connect();
    let sucursalId: string;
    try {
      const q = await client.query<{ sucursal_id: string }>(
        `SELECT sucursal_id FROM ${recepT} WHERE id = $1 AND empresa_id = $2`,
        [recepcionId, auth.empresa_id],
      );
      if (!q.rows.length) throw new Error("Recepción no encontrada.");
      sucursalId = q.rows[0].sucursal_id;
    } finally {
      client.release();
    }

    const r = await iniciarCambioPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      sucursalId,
      recepcionId,
      actorId: auth.user.id ?? null,
      actorNombre: null,
    });
    return NextResponse.json(successResponse({ cambio: r }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al iniciar cambio.";
    console.error("[cambio init POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
