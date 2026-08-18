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
    const clientesT = quoteSchemaTable(schema, "clientes");

    const client = await pool.connect();
    try {
      // Scope de cartera por sucursal: si el cliente no está en el scope
      // del usuario, devolvemos 404 igual que /api/clientes/[id].
      if (ctx.auth.scope_clientes) {
        const scopeQ = await client.query<{ scope_clientes: string | null }>(
          `SELECT scope_clientes FROM ${clientesT}
            WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
          [clienteId, empresaId],
        ).catch((e) => (e?.code === "42703" ? { rows: [] as Array<{ scope_clientes: string | null }> } : Promise.reject(e)));
        if (scopeQ.rows.length > 0) {
          const rowScope = scopeQ.rows[0].scope_clientes;
          if (rowScope != null && rowScope !== ctx.auth.scope_clientes) {
            return NextResponse.json(errorResponse("Cliente no encontrado"), { status: 404 });
          }
        }
      }
      // Detección: si el schema tiene ya la columna `categoria` (migración
      // fase 2 tanda 4), usamos ese campo — más limpio que inferir por origen.
      const colsQ = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'cliente_creditos_movimientos'`,
        [schema],
      );
      const cols = new Set(colsQ.rows.map((r) => r.column_name));
      const tieneCategoria = cols.has("categoria");
      const tieneVencimiento = cols.has("vencimiento_at");
      const tienePromoId = cols.has("promocion_id");

      let saldoCredito = 0, saldoCashback = 0, saldoConsignacion = 0;
      if (tieneCategoria) {
        // Cashback ENTRADA vencido (vencimiento_at < now()) NO cuenta como saldo.
        const cashVencidoCero = tieneVencimiento
          ? `WHEN categoria='cashback' AND tipo='ENTRADA' AND vencimiento_at IS NOT NULL AND vencimiento_at < now() THEN 0`
          : "";
        const saldoQ = await client.query<{ categoria: string; saldo: string }>(
          `SELECT categoria,
                  COALESCE(SUM(CASE ${cashVencidoCero}
                                    WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto
                                    ELSE -monto END),0)::text AS saldo
             FROM ${creditosT}
            WHERE empresa_id = $1 AND cliente_id = $2
            GROUP BY categoria`,
          [empresaId, clienteId],
        );
        for (const r of saldoQ.rows) {
          const n = Math.max(0, Number(r.saldo));
          if (r.categoria === "cashback") saldoCashback = n;
          else if (r.categoria === "consignacion") saldoConsignacion = n;
          else saldoCredito = n;
        }
      } else {
        // Legacy: inferimos por origen (cashback vs resto). No hay consignación.
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
        const salidasContraCash = Math.min(entCash, salidas);
        const salidasContraOtro = salidas - salidasContraCash;
        saldoCashback = Math.max(0, entCash - salidasContraCash);
        saldoCredito = Math.max(0, entOtras + ajustes - salidasContraOtro);
      }
      const saldo = saldoCredito + saldoCashback + saldoConsignacion;

      // Últimos 200 movimientos para display — categoria/vencimiento/promocion_id
      // solo cuando existen en el schema (evita SELECT con columna inexistente).
      const extraSel = [
        tieneCategoria ? "categoria" : "'credito'::text AS categoria",
        tieneVencimiento ? "vencimiento_at" : "NULL::timestamptz AS vencimiento_at",
        tienePromoId ? "promocion_id" : "NULL::uuid AS promocion_id",
      ].join(", ");
      const movQ = await client.query<Record<string, unknown>>(
        `SELECT id, cliente_id, tipo, monto, origen, ${extraSel},
                referencia_id, referencia_tipo, referencia_numero,
                observaciones, fecha, created_by, usuario_nombre
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2
         ORDER BY fecha DESC, created_at DESC
         LIMIT 200`,
        [empresaId, clienteId],
      );

      return NextResponse.json(
        successResponse({
          saldo,
          saldo_credito: saldoCredito,
          saldo_cashback: saldoCashback,
          saldo_consignacion: saldoConsignacion,
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
