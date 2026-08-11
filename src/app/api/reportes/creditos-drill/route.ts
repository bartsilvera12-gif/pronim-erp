import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/creditos-drill
 * Filtros:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   & cliente_id=uuid & tipo=ENTRADA|SALIDA|AJUSTE
 *   & origen=cashback|venta|ajuste_manual|evaluacion|... & categoria=credito|cashback|consignacion
 *   & usuario_id=uuid & q=texto
 *
 * Devuelve:
 *   - kpis: { entradas_periodo, salidas_periodo, neto_periodo,
 *             saldo_credito_global, saldo_cashback_global }
 *   - por_cliente (top saldo)
 *   - por_origen, por_tipo
 *   - movimientos: hasta 1000 filas
 *   - opciones: { clientes_disponibles (con saldo), origenes, usuarios }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tM = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const tC = quoteSchemaTable(schema, "clientes");
    const uSchemaQ = await pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'usuarios' AND table_schema IN ('public','pronimerp',$1) LIMIT 1`,
      [schema],
    );
    const tU = `"${uSchemaQ.rows[0]?.table_schema ?? "public"}"."usuarios"`;

    // Detección de columna `categoria` (agregada en tanda 4)
    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cliente_creditos_movimientos'`,
      [schema],
    );
    const cols = new Set(colQ.rows.map((r) => r.column_name));
    const hasCategoria = cols.has("categoria");

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const clienteId = sp.get("cliente_id");
    const tipo = sp.get("tipo");
    const origen = sp.get("origen");
    const categoria = sp.get("categoria");
    const usuarioId = sp.get("usuario_id");
    const q = (sp.get("q") ?? "").trim();

    // Condiciones para filtrar movimientos DEL PERÍODO / FILTROS
    const conds: string[] = ["m.empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      conds.push(sql.replace("?", `$${params.length}`));
    };
    if (desde) push("m.created_at >= ?::timestamptz", desde);
    if (hasta) push("m.created_at <  (? ::date + interval '1 day')", hasta);
    if (clienteId) push("m.cliente_id = ?::uuid", clienteId);
    if (tipo) push("m.tipo = ?", tipo);
    if (origen) push("COALESCE(m.origen,'sin_origen') = ?", origen);
    if (categoria && hasCategoria) push("COALESCE(m.categoria,'credito') = ?", categoria);
    if (usuarioId) push("m.created_by = ?::uuid", usuarioId);
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      conds.push(`(LOWER(COALESCE(c.empresa, c.nombre_contacto, c.nombre, '')) LIKE ${p}
                   OR LOWER(COALESCE(m.referencia_numero, '')) LIKE ${p}
                   OR LOWER(COALESCE(m.observaciones, '')) LIKE ${p})`);
    }

    const from = `${tM} m
       LEFT JOIN ${tC} c ON c.id = m.cliente_id
       LEFT JOIN ${tU} u ON u.id = m.created_by`;

    // KPIs del período (filtrado)
    const kpis = await pool.query<{
      entradas: string; salidas: string; ajustes: string;
    }>(
      `SELECT COALESCE(SUM(CASE WHEN m.tipo='ENTRADA' THEN m.monto ELSE 0 END),0)::text AS entradas,
              COALESCE(SUM(CASE WHEN m.tipo='SALIDA'  THEN m.monto ELSE 0 END),0)::text AS salidas,
              COALESCE(SUM(CASE WHEN m.tipo='AJUSTE'  THEN m.monto ELSE 0 END),0)::text AS ajustes
         FROM ${from} WHERE ${conds.join(" AND ")}`,
      params,
    );
    const k = kpis.rows[0] ?? { entradas: "0", salidas: "0", ajustes: "0" };

    // Saldos GLOBALES (todos los movs de la empresa, no importa el filtro de período)
    const saldoCredExpr = hasCategoria
      ? `CASE WHEN COALESCE(m.categoria,'credito') = 'credito'
                 THEN (CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END)
              ELSE 0 END`
      : `CASE WHEN COALESCE(m.origen,'') <> 'cashback'
                 THEN (CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END)
              ELSE 0 END`;
    const saldoCashExpr = hasCategoria
      ? `CASE WHEN COALESCE(m.categoria,'credito') = 'cashback'
                 THEN (CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END)
              ELSE 0 END`
      : `CASE WHEN COALESCE(m.origen,'') = 'cashback'
                 THEN (CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END)
              ELSE 0 END`;
    const saldosG = await pool.query<{ saldo_cred: string; saldo_cash: string }>(
      `SELECT COALESCE(SUM(${saldoCredExpr}),0)::text AS saldo_cred,
              COALESCE(SUM(${saldoCashExpr}),0)::text AS saldo_cash
         FROM ${tM} m WHERE m.empresa_id = $1`,
      [auth.empresa_id],
    );
    const sg = saldosG.rows[0] ?? { saldo_cred: "0", saldo_cash: "0" };

    // Por cliente (saldo GLOBAL por cliente, no del período)
    const porCliente = await pool.query<{
      cliente_id: string | null; cliente_nombre: string | null;
      saldo_credito: string; saldo_cashback: string; movs_periodo: string;
    }>(
      `WITH mov_cli AS (
         SELECT m.cliente_id,
                SUM(${saldoCredExpr}) AS s_cred,
                SUM(${saldoCashExpr}) AS s_cash
           FROM ${tM} m WHERE m.empresa_id = $1
          GROUP BY m.cliente_id
       ),
       periodo_cli AS (
         SELECT m.cliente_id, COUNT(*) AS cnt
           FROM ${from} WHERE ${conds.join(" AND ")}
          GROUP BY m.cliente_id
       )
       SELECT mc.cliente_id::text,
              COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
              COALESCE(mc.s_cred,0)::text AS saldo_credito,
              COALESCE(mc.s_cash,0)::text AS saldo_cashback,
              COALESCE(pc.cnt,0)::text    AS movs_periodo
         FROM mov_cli mc
         LEFT JOIN ${tC} c ON c.id = mc.cliente_id
         LEFT JOIN periodo_cli pc ON pc.cliente_id = mc.cliente_id
        WHERE COALESCE(mc.s_cred,0) > 0 OR COALESCE(mc.s_cash,0) > 0 OR COALESCE(pc.cnt,0) > 0
        ORDER BY (COALESCE(mc.s_cred,0) + COALESCE(mc.s_cash,0)) DESC, cliente_nombre
        LIMIT 300`,
      params,
    );

    // Por origen (dentro del período)
    const porOrigen = await pool.query<{ origen: string; entradas: string; salidas: string; cnt: string }>(
      `SELECT COALESCE(m.origen,'sin_origen') AS origen,
              COALESCE(SUM(CASE WHEN m.tipo='ENTRADA' THEN m.monto ELSE 0 END),0)::text AS entradas,
              COALESCE(SUM(CASE WHEN m.tipo='SALIDA'  THEN m.monto ELSE 0 END),0)::text AS salidas,
              COUNT(*)::text AS cnt
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY COALESCE(m.origen,'sin_origen') ORDER BY entradas DESC, salidas DESC`,
      params,
    );

    const porTipo = await pool.query<{ tipo: string; total: string; cnt: string }>(
      `SELECT m.tipo, COALESCE(SUM(m.monto),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY m.tipo ORDER BY tipo`,
      params,
    );

    // Movimientos detalle
    const movs = await pool.query<{
      id: string; created_at: string; cliente_id: string | null; cliente_nombre: string | null;
      tipo: string; monto: string; origen: string | null; categoria: string | null;
      referencia_tipo: string | null; referencia_numero: string | null;
      observaciones: string | null; usuario_nombre: string | null;
    }>(
      `SELECT m.id::text, m.created_at,
              m.cliente_id::text,
              COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
              m.tipo, m.monto::text, m.origen,
              ${hasCategoria ? "COALESCE(m.categoria,'credito')" : "'credito'"}::text AS categoria,
              m.referencia_tipo, m.referencia_numero, m.observaciones,
              COALESCE(u.nombre, u.email, m.usuario_nombre) AS usuario_nombre
         FROM ${from} WHERE ${conds.join(" AND ")}
        ORDER BY m.created_at DESC LIMIT 1000`,
      params,
    );

    return NextResponse.json(successResponse({
      kpis: {
        entradas_periodo: Number(k.entradas),
        salidas_periodo:  Number(k.salidas),
        ajustes_periodo:  Number(k.ajustes),
        neto_periodo:     Number(k.entradas) + Number(k.ajustes) - Number(k.salidas),
        saldo_credito_global:  Number(sg.saldo_cred),
        saldo_cashback_global: Number(sg.saldo_cash),
      },
      por_cliente: porCliente.rows.map((r) => ({
        cliente_id: r.cliente_id, cliente_nombre: r.cliente_nombre ?? "—",
        saldo_credito: Number(r.saldo_credito),
        saldo_cashback: Number(r.saldo_cashback),
        movs_periodo: Number(r.movs_periodo),
      })),
      por_origen: porOrigen.rows.map((r) => ({
        origen: r.origen, entradas: Number(r.entradas), salidas: Number(r.salidas), cnt: Number(r.cnt),
      })),
      por_tipo: porTipo.rows.map((r) => ({ tipo: r.tipo, total: Number(r.total), cnt: Number(r.cnt) })),
      movimientos: movs.rows.map((r) => ({
        ...r,
        monto: Number(r.monto),
      })),
      opciones: {
        origenes: porOrigen.rows.map((r) => r.origen).filter(Boolean),
      },
      soporta_categoria: hasCategoria,
    }));
  } catch (err) {
    console.error("[/api/reportes/creditos-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
