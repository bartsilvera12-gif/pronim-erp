import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/clientes/segmentos
 *
 * Filtros combinables (todos AND):
 *   ?vip=1 & con_credito=1 & con_cashback=1
 *   & inactivos_90d=1 & nuevos_mes=1 & en_riesgo=1
 *   & q=texto  (busca en nombre/teléfono/email)
 *
 * Devuelve:
 *   - segmentos: baseline counts (cuántos clientes de la empresa hay en cada
 *     segmento en total, sin considerar los filtros — para poder tildar más)
 *   - clientes: los que cumplen TODOS los filtros activos
 *   - count: total del listado devuelto
 */

type SegmentoSlug =
  | "vip" | "con_credito" | "con_cashback"
  | "inactivos_90d" | "nuevos_mes" | "en_riesgo";

const SEGMENTOS: { slug: SegmentoSlug; label: string; descripcion: string; emoji: string }[] = [
  { slug: "vip",           label: "VIP",                 descripcion: "Marcados manualmente como VIP.",                    emoji: "⭐" },
  { slug: "con_credito",   label: "Con crédito a favor", descripcion: "Saldo de crédito disponible mayor a cero.",        emoji: "💰" },
  { slug: "con_cashback",  label: "Con cashback",        descripcion: "Cashback acreditado pendiente de usar.",            emoji: "🎁" },
  { slug: "inactivos_90d", label: "Inactivos +90 días",  descripcion: "Última compra hace 90 días o más (o sin compra).", emoji: "📅" },
  { slug: "nuevos_mes",    label: "Nuevos este mes",     descripcion: "Alta dentro del mes calendario en curso.",          emoji: "🆕" },
  { slug: "en_riesgo",     label: "En riesgo",           descripcion: "Antes venían seguido y hace ≥45 días no vuelven.",  emoji: "📉" },
];

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const flags: Record<SegmentoSlug, boolean> = {
      vip:            url.searchParams.get("vip") === "1",
      con_credito:    url.searchParams.get("con_credito") === "1",
      con_cashback:   url.searchParams.get("con_cashback") === "1",
      inactivos_90d:  url.searchParams.get("inactivos_90d") === "1",
      nuevos_mes:     url.searchParams.get("nuevos_mes") === "1",
      en_riesgo:      url.searchParams.get("en_riesgo") === "1",
    };
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const cliT = quoteSchemaTable(schema, "clientes");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

    const tblQ = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name IN ('ventas','cliente_creditos_movimientos')`,
      [schema],
    );
    const tables = new Set(tblQ.rows.map((r) => r.table_name));
    const hasVentas = tables.has("ventas");
    const hasCred = tables.has("cliente_creditos_movimientos");

    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'clientes'`,
      [schema],
    );
    const cliCols = new Set(colQ.rows.map((r) => r.column_name));
    const hasEsVip = cliCols.has("es_vip");

    let vCols = new Set<string>();
    if (hasVentas) {
      const vColQ = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'ventas'`,
        [schema],
      );
      vCols = new Set(vColQ.rows.map((r) => r.column_name));
    }
    const ventasFiltroEstado = vCols.has("estado") ? "AND (v.estado IS NULL OR v.estado <> 'anulada')" : "";
    const ventasFechaCol = vCols.has("fecha") ? "v.fecha" : "v.created_at";

    const actividadCTE = hasVentas ? `
      actividad AS (
        SELECT v.cliente_id,
               MAX(${ventasFechaCol})           AS ultima_venta_at,
               COALESCE(SUM(v.total),0)::numeric AS total_comprado,
               COUNT(*)                          AS cnt_ventas,
               COUNT(*) FILTER (WHERE ${ventasFechaCol} >= now() - interval '90 days') AS cnt_90d,
               COUNT(*) FILTER (WHERE ${ventasFechaCol} >= now() - interval '180 days'
                                  AND ${ventasFechaCol} <  now() - interval '90 days') AS cnt_prev_90d
          FROM ${ventasT} v
         WHERE v.empresa_id = $1 ${ventasFiltroEstado}
           AND v.cliente_id IS NOT NULL
         GROUP BY v.cliente_id
      )
    ` : `actividad AS (SELECT NULL::uuid AS cliente_id, NULL::timestamptz AS ultima_venta_at, 0::numeric AS total_comprado, 0 AS cnt_ventas, 0 AS cnt_90d, 0 AS cnt_prev_90d WHERE false)`;

    const creditosCTE = hasCred ? `
      creditos AS (
        SELECT m.cliente_id,
               COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto ELSE -monto END),0)::numeric AS saldo_credito,
               COALESCE(SUM(CASE WHEN tipo='ENTRADA' AND origen='cashback' THEN monto
                                 WHEN tipo='SALIDA' AND origen='cashback' THEN -monto
                                 ELSE 0 END),0)::numeric AS saldo_cashback
          FROM ${credT} m
         WHERE m.empresa_id = $1
         GROUP BY m.cliente_id
      )
    ` : `creditos AS (SELECT NULL::uuid AS cliente_id, 0::numeric AS saldo_credito, 0::numeric AS saldo_cashback WHERE false)`;

    // Expresiones booleanas por segmento (reutilizables en filtros y counts)
    const expr: Record<SegmentoSlug, string> = {
      vip:            `${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} = true`,
      con_credito:    `COALESCE(cr.saldo_credito,0)  > 0`,
      con_cashback:   `COALESCE(cr.saldo_cashback,0) > 0`,
      inactivos_90d:  `(a.ultima_venta_at IS NULL OR a.ultima_venta_at < now() - interval '90 days')`,
      nuevos_mes:     `c.created_at >= date_trunc('month', now())`,
      en_riesgo:      `COALESCE(a.cnt_prev_90d,0) >= 2 AND (a.ultima_venta_at IS NULL OR a.ultima_venta_at < now() - interval '45 days')`,
    };

    // Baseline counts (por segmento, sin considerar filtros)
    const countsQ = await pool.query<Record<SegmentoSlug | "total", string>>(
      `WITH ${actividadCTE}, ${creditosCTE}
       SELECT ${SEGMENTOS.map((s) => `COUNT(*) FILTER (WHERE ${expr[s.slug]})::text AS ${s.slug}`).join(",\n              ")},
              COUNT(*)::text AS total
         FROM ${cliT} c
         LEFT JOIN actividad a  ON a.cliente_id  = c.id
         LEFT JOIN creditos cr  ON cr.cliente_id = c.id
        WHERE c.empresa_id = $1`,
      [auth.empresa_id],
    );
    const cntRow = countsQ.rows[0] ?? {} as Record<string, string>;

    // Filtros activos → WHERE combinado con AND
    const activos = (Object.entries(flags) as [SegmentoSlug, boolean][]).filter(([, on]) => on).map(([k]) => k);

    const selectBase = `
      c.id::text                                    AS id,
      COALESCE(c.empresa, c.nombre_contacto, c.nombre, 'Cliente') AS nombre,
      c.telefono                                    AS telefono,
      c.email                                       AS email,
      ${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} AS es_vip,
      a.ultima_venta_at                             AS ultima_venta_at,
      COALESCE(a.total_comprado,0)::text            AS total_comprado,
      COALESCE(a.cnt_ventas,0)                      AS cnt_ventas,
      COALESCE(cr.saldo_credito,0)::text            AS saldo_credito,
      COALESCE(cr.saldo_cashback,0)::text           AS saldo_cashback
    `;

    const params: unknown[] = [auth.empresa_id];
    const whereParts: string[] = ["c.empresa_id = $1"];
    for (const slug of activos) whereParts.push(expr[slug]);
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      whereParts.push(`(LOWER(COALESCE(c.empresa, c.nombre_contacto, c.nombre, '')) LIKE ${p}
                        OR LOWER(COALESCE(c.telefono, '')) LIKE ${p}
                        OR LOWER(COALESCE(c.email, '')) LIKE ${p})`);
    }

    const listado = await pool.query<Record<string, unknown>>(
      `WITH ${actividadCTE}, ${creditosCTE}
       SELECT ${selectBase}
         FROM ${cliT} c
         LEFT JOIN actividad a  ON a.cliente_id  = c.id
         LEFT JOIN creditos cr  ON cr.cliente_id = c.id
        WHERE ${whereParts.join(" AND ")}
        ORDER BY COALESCE(a.total_comprado,0) DESC NULLS LAST,
                 a.ultima_venta_at DESC NULLS LAST,
                 c.created_at DESC
        LIMIT 2000`,
      params,
    );

    return NextResponse.json(successResponse({
      segmentos: SEGMENTOS.map((s) => ({ ...s, count: Number(cntRow[s.slug] ?? 0) })),
      total_clientes: Number(cntRow.total ?? 0),
      filtros_activos: activos,
      clientes: listado.rows,
      count: listado.rows.length,
    }));
  } catch (err) {
    console.error("[clientes/segmentos GET]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error"),
      { status: 500 },
    );
  }
}
