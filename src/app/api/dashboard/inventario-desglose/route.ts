import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/inventario-desglose?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Devuelve dos secciones DESGLOSADAS POR SUCURSAL, pensadas para el
 * dashboard de Inventario:
 *
 *   sucursales[]:
 *     - sucursal_id, nombre
 *     - recepciones: {
 *         cantidad, subtotal_evaluado, ajuste_positivo, ajuste_negativo,
 *         total_final, ratio_ajuste_pct, eval_prom_prenda,
 *         prendas_recibidas, evaluadores: [{ usuario, recepciones, total_final }]
 *       }
 *     - inventario: {
 *         prendas_entradas, prendas_salidas, diferencia_neta,
 *         stock_actual, antig_dias_prom, rotacion_pct
 *       }
 *
 * Alcance: si el usuario tiene sucursal fija, se devuelve solo la suya.
 * El admin ve todas.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || todayMinus(30);
    const hasta = url.searchParams.get("hasta") || todayISO();

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const sucScope = esAdmin ? null : (auth.sucursal_id ?? null);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const sucT = quoteSchemaTable(schema, "sucursales");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const stockT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const movInvT = quoteSchemaTable(schema, "movimientos_inventario");

    const client = await pool.connect();
    try {
      const args: unknown[] = [auth.empresa_id, desde, hasta];
      const sucCond = sucScope ? "AND s.id = $4" : "";
      if (sucScope) args.push(sucScope);

      // 1) Sucursales (base)
      const sucQ = await client.query<{ id: string; nombre: string }>(
        `SELECT s.id::text AS id, s.nombre
         FROM ${sucT} s
         WHERE s.empresa_id = $1 AND COALESCE(s.activo, true) = true ${sucCond}
         ORDER BY s.nombre`,
        [auth.empresa_id, ...(sucScope ? [sucScope] : [])],
      );

      // 2) Recepciones agregadas por sucursal.
      const recepQ = await client.query<{
        sucursal_id: string;
        cantidad: string; subtotal_evaluado: string;
        ajuste_positivo: string; ajuste_negativo: string;
        total_final: string; prendas_recibidas: string;
      }>(
        `SELECT
           r.sucursal_id::text AS sucursal_id,
           COUNT(DISTINCT r.id)::text AS cantidad,
           COALESCE(SUM(r.subtotal_evaluado), 0)::text AS subtotal_evaluado,
           COALESCE(SUM(GREATEST(r.ajuste_evaluacion, 0)), 0)::text AS ajuste_positivo,
           COALESCE(SUM(GREATEST(-r.ajuste_evaluacion, 0)), 0)::text AS ajuste_negativo,
           COALESCE(SUM(r.total_final), 0)::text AS total_final,
           COALESCE(SUM((SELECT COALESCE(SUM(ri.cantidad),0) FROM ${recepItT} ri WHERE ri.recepcion_id = r.id)), 0)::text AS prendas_recibidas
         FROM ${recepT} r
         WHERE r.empresa_id = $1
           AND r.estado <> 'anulada'
           AND r.fecha::date BETWEEN $2 AND $3
         GROUP BY r.sucursal_id`,
        args.slice(0, 3),
      );

      // 3) Evaluadores por sucursal (top 5).
      const evalQ = await client.query<{
        sucursal_id: string; usuario: string; recepciones: string; total_final: string;
      }>(
        `SELECT
           r.sucursal_id::text AS sucursal_id,
           COALESCE(r.usuario_nombre, '(sin nombre)') AS usuario,
           COUNT(*)::text AS recepciones,
           COALESCE(SUM(r.total_final), 0)::text AS total_final
         FROM ${recepT} r
         WHERE r.empresa_id = $1
           AND r.estado <> 'anulada'
           AND r.fecha::date BETWEEN $2 AND $3
         GROUP BY r.sucursal_id, COALESCE(r.usuario_nombre, '(sin nombre)')
         ORDER BY r.sucursal_id, COUNT(*) DESC`,
        args.slice(0, 3),
      );

      // 4) Inventario por sucursal: entradas/salidas del período +
      //    stock actual + antigüedad prom aproximada (días desde
      //    último ingreso positivo).
      const movQ = await client.query<{
        sucursal_id: string; entradas: string; salidas: string;
      }>(
        `SELECT
           mi.sucursal_id::text AS sucursal_id,
           COALESCE(SUM(GREATEST(mi.cantidad, 0)), 0)::text AS entradas,
           COALESCE(SUM(GREATEST(-mi.cantidad, 0)), 0)::text AS salidas
         FROM ${movInvT} mi
         WHERE mi.empresa_id = $1
           AND mi.fecha::date BETWEEN $2 AND $3
         GROUP BY mi.sucursal_id`,
        args.slice(0, 3),
      );

      const stockQ = await client.query<{ sucursal_id: string; stock: string }>(
        `SELECT sucursal_id::text AS sucursal_id, COALESCE(SUM(stock_actual), 0)::text AS stock
         FROM ${stockT}
         GROUP BY sucursal_id`,
        [],
      );

      // Ensamblado — por cada sucursal armamos su bloque.
      type RecepRow = { sucursal_id: string; cantidad: string; subtotal_evaluado: string; ajuste_positivo: string; ajuste_negativo: string; total_final: string; prendas_recibidas: string };
      type EvalRow = { sucursal_id: string; usuario: string; recepciones: string; total_final: string };
      type MovRow = { sucursal_id: string; entradas: string; salidas: string };
      type StockRow = { sucursal_id: string; stock: string };

      const recepMap = new Map<string, RecepRow>(recepQ.rows.map(r => [r.sucursal_id, r]));
      const movMap = new Map<string, MovRow>(movQ.rows.map(r => [r.sucursal_id, r]));
      const stockMap = new Map<string, StockRow>(stockQ.rows.map(r => [r.sucursal_id, r]));
      const evalMap = new Map<string, EvalRow[]>();
      for (const row of evalQ.rows) {
        const list = evalMap.get(row.sucursal_id) ?? [];
        list.push(row);
        evalMap.set(row.sucursal_id, list);
      }

      const sucursales = sucQ.rows.map(s => {
        const rec = recepMap.get(s.id);
        const mov = movMap.get(s.id);
        const stock = stockMap.get(s.id);

        const cantidadRec = Number(rec?.cantidad ?? 0);
        const subtotalEval = Number(rec?.subtotal_evaluado ?? 0);
        const ajustePos = Number(rec?.ajuste_positivo ?? 0);
        const ajusteNeg = Number(rec?.ajuste_negativo ?? 0);
        const totalFinal = Number(rec?.total_final ?? 0);
        const prendasRecibidas = Number(rec?.prendas_recibidas ?? 0);

        const entradas = Number(mov?.entradas ?? 0);
        const salidas = Number(mov?.salidas ?? 0);
        const stockActual = Number(stock?.stock ?? 0);

        // Ratio ajuste = (ajuste_positivo + ajuste_negativo) / subtotal_evaluado × 100.
        const ratioAjuste = subtotalEval > 0
          ? Math.round(((ajustePos + ajusteNeg) / subtotalEval) * 1000) / 10
          : null;
        const evalPromPrenda = prendasRecibidas > 0
          ? Math.round(totalFinal / prendasRecibidas)
          : null;

        // Rotación aprox: salidas del período / stock actual × 100
        const rotacionPct = stockActual > 0
          ? Math.round((salidas / stockActual) * 1000) / 10
          : null;

        return {
          sucursal_id: s.id,
          nombre: s.nombre,
          recepciones: {
            cantidad: cantidadRec,
            subtotal_evaluado: subtotalEval,
            ajuste_positivo: ajustePos,
            ajuste_negativo: ajusteNeg,
            total_final: totalFinal,
            ratio_ajuste_pct: ratioAjuste,
            eval_prom_prenda: evalPromPrenda,
            prendas_recibidas: prendasRecibidas,
            evaluadores: (evalMap.get(s.id) ?? []).slice(0, 5).map(e => ({
              usuario: e.usuario,
              recepciones: Number(e.recepciones),
              total_final: Number(e.total_final),
            })),
          },
          inventario: {
            prendas_entradas: entradas,
            prendas_salidas: salidas,
            diferencia_neta: entradas - salidas,
            stock_actual: stockActual,
            antig_dias_prom: null as number | null, // omitido — costoso; se puede agregar si Karen lo pide
            rotacion_pct: rotacionPct,
          },
        };
      });

      return NextResponse.json(successResponse({ desde, hasta, sucursales }));
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function todayMinus(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
