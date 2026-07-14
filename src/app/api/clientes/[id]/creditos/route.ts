import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/clientes/[id]/creditos
 *
 * Devuelve:
 *   - saldo: SUM sobre TODOS los movimientos del cliente en Postgres
 *     (nunca calculado desde un subconjunto). Corrige el bug del bloque
 *     limitado a 200 filas que producía saldos incorrectos con historial
 *     largo.
 *   - movimientos: últimos 200 para display, ordenados DESC por fecha.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

    const client = await pool.connect();
    try {
      // Saldo: SUM sobre TODOS los movimientos (fuente de verdad)
      const saldoQ = await client.query<{ saldo: string }>(
        `SELECT COALESCE(SUM(
           CASE WHEN tipo = 'ENTRADA' THEN monto
                WHEN tipo = 'SALIDA' THEN -monto
                WHEN tipo = 'AJUSTE' THEN monto
                ELSE 0 END
         ), 0)::text AS saldo
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [empresaId, clienteId],
      );
      const saldo = Number(saldoQ.rows[0]?.saldo ?? 0);

      // Últimos 200 movimientos para display
      const movQ = await client.query<Record<string, unknown>>(
        `SELECT id, cliente_id, tipo, monto, origen, referencia_id,
                referencia_tipo, referencia_numero, observaciones, fecha,
                created_by, usuario_nombre
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2
         ORDER BY fecha DESC, created_at DESC
         LIMIT 200`,
        [empresaId, clienteId],
      );

      return NextResponse.json(
        successResponse({ saldo, movimientos: movQ.rows }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/creditos GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
