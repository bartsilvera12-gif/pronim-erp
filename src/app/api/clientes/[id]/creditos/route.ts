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
      // Saldos desagregados por origen: cashback (ENTRADAs origen='cashback')
      // se muestra separado del "crédito a favor" normal. La consumición (SALIDA)
      // sigue siendo unificada — se resta del total y del cashback proporcionalmente
      // (aprox: se descuenta primero de cashback si aún hay saldo, si no del crédito).
      const saldoQ = await client.query<{
        entradas_cashback: string; entradas_otras: string;
        salidas_total: string; ajustes_total: string;
      }>(
        `SELECT
           COALESCE(SUM(CASE WHEN tipo='ENTRADA' AND origen='cashback' THEN monto ELSE 0 END),0)::text AS entradas_cashback,
           COALESCE(SUM(CASE WHEN tipo='ENTRADA' AND origen<>'cashback' THEN monto ELSE 0 END),0)::text AS entradas_otras,
           COALESCE(SUM(CASE WHEN tipo='SALIDA' THEN monto ELSE 0 END),0)::text AS salidas_total,
           COALESCE(SUM(CASE WHEN tipo='AJUSTE' THEN monto ELSE 0 END),0)::text AS ajustes_total
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [empresaId, clienteId],
      );
      const entCash = Number(saldoQ.rows[0]?.entradas_cashback ?? 0);
      const entOtras = Number(saldoQ.rows[0]?.entradas_otras ?? 0);
      const salidas = Number(saldoQ.rows[0]?.salidas_total ?? 0);
      const ajustes = Number(saldoQ.rows[0]?.ajustes_total ?? 0);
      // Convención UI: descontamos SALIDAs primero de cashback y el remanente
      // baja el crédito "otro". Es una vista aproximada — el ledger unificado
      // sigue siendo la fuente de verdad para el total.
      const salidasContraCash = Math.min(entCash, salidas);
      const salidasContraOtro = salidas - salidasContraCash;
      const saldoCashback = Math.max(0, entCash - salidasContraCash);
      const saldoCreditoOtro = Math.max(0, entOtras + ajustes - salidasContraOtro);
      const saldo = saldoCashback + saldoCreditoOtro;

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
        successResponse({
          saldo,
          saldo_cashback: saldoCashback,
          saldo_credito: saldoCreditoOtro,
          movimientos: movQ.rows,
        }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/creditos GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
