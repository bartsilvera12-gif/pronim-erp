import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/clientes/segmentos?tipo=<slug>
 *
 * Sin `tipo`: devuelve los counts de todos los segmentos.
 * Con `tipo`: devuelve el listado detallado del segmento.
 *
 * Segmentos:
 *  - vip           → clientes marcados manualmente como VIP (clientes.es_vip)
 *  - con_credito   → saldo de crédito disponible > 0
 *  - con_cashback  → cashback pendiente > 0
 *  - inactivos_90d → última compra hace >= 90 días (o sin compra)
 *  - nuevos_mes    → creados dentro del mes calendario en curso
 *  - en_riesgo     → antes compraban seguido (≥2 compras en 90d prev.)
 *                    y hace ≥45d que no vuelven
 */

type SegmentoSlug =
  | "vip" | "con_credito" | "con_cashback"
  | "inactivos_90d" | "nuevos_mes" | "en_riesgo";

const SEGMENTOS: { slug: SegmentoSlug; label: string; descripcion: string; emoji: string }[] = [
  { slug: "vip",           label: "VIP",                  descripcion: "Marcados manualmente como VIP.",                     emoji: "⭐" },
  { slug: "con_credito",   label: "Con crédito a favor",  descripcion: "Saldo de crédito disponible mayor a cero.",         emoji: "💰" },
  { slug: "con_cashback",  label: "Con cashback",         descripcion: "Cashback acreditado pendiente de usar.",             emoji: "🎁" },
  { slug: "inactivos_90d", label: "Inactivos +90 días",   descripcion: "Última compra hace 90 días o más (o sin compra).",  emoji: "📅" },
  { slug: "nuevos_mes",    label: "Nuevos este mes",      descripcion: "Alta dentro del mes calendario en curso.",           emoji: "🆕" },
  { slug: "en_riesgo",     label: "En riesgo",            descripcion: "Antes venían seguido y hace ≥45 días no vuelven.",   emoji: "📉" },
];

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const tipo = (url.searchParams.get("tipo") ?? "").trim().toLowerCase() as SegmentoSlug | "";

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const cliT = quoteSchemaTable(schema, "clientes");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");

    // ── CTEs comunes ────────────────────────────────────────────────
    // - actividad: última venta + total comprado + count por cliente
    // - creditos: saldo total y saldo cashback (origen='cashback')
    // Chequeamos existencia de tablas/columnas para degradar sin romper.
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

    // Empresa gate en cada CTE
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

    // ── Modo COUNTS ──────────────────────────────────────────────────
    if (!tipo) {
      const q = await pool.query<{
        vip: string; con_credito: string; con_cashback: string;
        inactivos_90d: string; nuevos_mes: string; en_riesgo: string; total: string;
      }>(
        `WITH ${actividadCTE}, ${creditosCTE}
         SELECT
           COUNT(*) FILTER (WHERE ${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} = true)::text AS vip,
           COUNT(*) FILTER (WHERE COALESCE(cr.saldo_credito,0)  > 0)::text                       AS con_credito,
           COUNT(*) FILTER (WHERE COALESCE(cr.saldo_cashback,0) > 0)::text                       AS con_cashback,
           COUNT(*) FILTER (WHERE a.ultima_venta_at IS NULL
                                OR a.ultima_venta_at < now() - interval '90 days')::text          AS inactivos_90d,
           COUNT(*) FILTER (WHERE c.created_at >= date_trunc('month', now()))::text               AS nuevos_mes,
           COUNT(*) FILTER (WHERE COALESCE(a.cnt_prev_90d,0) >= 2
                                AND (a.ultima_venta_at IS NULL OR a.ultima_venta_at < now() - interval '45 days'))::text AS en_riesgo,
           COUNT(*)::text AS total
         FROM ${cliT} c
         LEFT JOIN actividad a  ON a.cliente_id  = c.id
         LEFT JOIN creditos cr  ON cr.cliente_id = c.id
         WHERE c.empresa_id = $1`,
        [auth.empresa_id],
      );
      const row = q.rows[0] ?? {} as Record<string, string>;
      return NextResponse.json(successResponse({
        segmentos: SEGMENTOS.map((s) => ({
          ...s,
          count: Number(row[s.slug] ?? 0),
        })),
        total_clientes: Number(row.total ?? 0),
      }));
    }

    // ── Modo LISTADO ────────────────────────────────────────────────
    const filtros: Record<SegmentoSlug, string> = {
      vip:            `${hasEsVip ? "COALESCE(c.es_vip,false)" : "false"} = true`,
      con_credito:    `COALESCE(cr.saldo_credito,0)  > 0`,
      con_cashback:   `COALESCE(cr.saldo_cashback,0) > 0`,
      inactivos_90d:  `(a.ultima_venta_at IS NULL OR a.ultima_venta_at < now() - interval '90 days')`,
      nuevos_mes:     `c.created_at >= date_trunc('month', now())`,
      en_riesgo:      `COALESCE(a.cnt_prev_90d,0) >= 2 AND (a.ultima_venta_at IS NULL OR a.ultima_venta_at < now() - interval '45 days')`,
    };
    if (!(tipo in filtros)) {
      return NextResponse.json(errorResponse("Segmento inválido."), { status: 400 });
    }
    const where = filtros[tipo as SegmentoSlug];

    const q = await pool.query<Record<string, unknown>>(
      `WITH ${actividadCTE}, ${creditosCTE}
       SELECT ${selectBase}
         FROM ${cliT} c
         LEFT JOIN actividad a  ON a.cliente_id  = c.id
         LEFT JOIN creditos cr  ON cr.cliente_id = c.id
        WHERE c.empresa_id = $1
          AND ${where}
        ORDER BY
          CASE WHEN '${tipo}' IN ('vip','con_credito','con_cashback') THEN COALESCE(a.total_comprado,0) END DESC NULLS LAST,
          a.ultima_venta_at DESC NULLS LAST,
          c.created_at DESC
        LIMIT 1000`,
      [auth.empresa_id],
    );

    const meta = SEGMENTOS.find((s) => s.slug === tipo)!;
    return NextResponse.json(successResponse({
      segmento: meta,
      clientes: q.rows,
      count: q.rows.length,
    }));
  } catch (err) {
    console.error("[clientes/segmentos GET]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error"),
      { status: 500 },
    );
  }
}
