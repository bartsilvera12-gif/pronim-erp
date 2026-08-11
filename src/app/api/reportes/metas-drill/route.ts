import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/metas-drill
 * Reporte de metas y comisiones (estimadas).
 *
 * Filtros:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   & sucursal_id=uuid & usuario_id=uuid
 *
 * Comisión se calcula por día × sucursal:
 *   - Si ventas_dia >= meta_diaria ⇒ comision_alcanza_pct
 *   - Sino ⇒ comision_no_alcanza_pct
 *
 * La comisión por vendedora es su participación en las ventas del día × pct
 * (proporcional a lo que cada uno vendió).
 *
 * Devuelve:
 *   - kpis: { ventas_total, dias_operados, dias_meta_alcanzada, comision_total }
 *   - por_dia:      [{ fecha, sucursal, meta, ventas, alcanzada, comision_pct, comision_total }]
 *   - por_sucursal: [{ sucursal_id, sucursal_nombre, dias_op, dias_alc, ventas, comision }]
 *   - por_usuario:  [{ usuario_id, usuario_nombre, ventas, comision_estimada }]
 *   - opciones: { sucursales, usuarios }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tV = quoteSchemaTable(schema, "ventas");
    const tS = quoteSchemaTable(schema, "sucursales");
    const tM = quoteSchemaTable(schema, "metas_sucursal");
    const uSchemaQ = await pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'usuarios' AND table_schema IN ('public','pronimerp',$1) LIMIT 1`,
      [schema],
    );
    const tU = `"${uSchemaQ.rows[0]?.table_schema ?? "public"}"."usuarios"`;

    const tblQ = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'metas_sucursal'`,
      [schema],
    );
    const hayMetas = tblQ.rows.length > 0;

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const sucursalId = sp.get("sucursal_id");
    const usuarioId = sp.get("usuario_id");

    const conds: string[] = ["v.empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      conds.push(sql.replace("?", `$${params.length}`));
    };
    if (desde) push("v.fecha >= ?::timestamptz", desde);
    if (hasta) push("v.fecha <  (? ::date + interval '1 day')", hasta);
    if (sucursalId) push("v.sucursal_id = ?::uuid", sucursalId);
    if (auth.sucursal_id) push("v.sucursal_id = ?::uuid", auth.sucursal_id);
    if (usuarioId) push("v.created_by = ?::uuid", usuarioId);
    conds.push("(v.estado IS NULL OR v.estado <> 'anulada')");
    conds.push("v.sucursal_id IS NOT NULL");

    const from = `${tV} v
       LEFT JOIN ${tS} s ON s.id = v.sucursal_id
       LEFT JOIN ${tU} u ON u.id = v.created_by
       ${hayMetas ? `LEFT JOIN ${tM} m ON m.sucursal_id = v.sucursal_id AND COALESCE(m.activo,true) = true` : ""}`;

    // Metas por sucursal (para uso en subquery si aplica)
    const metaExpr = hayMetas ? "COALESCE(m.monto_meta_diaria, 0)" : "0";
    const pctAlcExpr = hayMetas ? "COALESCE(m.comision_alcanza_pct, 0)" : "0";
    const pctNoExpr  = hayMetas ? "COALESCE(m.comision_no_alcanza_pct, 0)" : "0";

    // Por día × sucursal — agregado base
    const porDia = await pool.query<{
      fecha: string; sucursal_id: string | null; sucursal_nombre: string | null;
      meta: string; ventas: string; alcanzada: boolean;
      comision_pct: string; comision_total: string;
    }>(
      `WITH dia_suc AS (
         SELECT date_trunc('day', v.fecha)::date AS dia,
                v.sucursal_id,
                s.nombre AS sucursal_nombre,
                ${metaExpr}::numeric AS meta,
                ${pctAlcExpr}::numeric AS pct_alc,
                ${pctNoExpr}::numeric AS pct_no,
                COALESCE(SUM(v.total),0)::numeric AS ventas
           FROM ${from} WHERE ${conds.join(" AND ")}
          GROUP BY date_trunc('day', v.fecha)::date, v.sucursal_id, s.nombre, ${metaExpr}, ${pctAlcExpr}, ${pctNoExpr}
       )
       SELECT dia::text AS fecha, sucursal_id::text, sucursal_nombre,
              meta::text, ventas::text,
              (ventas >= meta AND meta > 0) AS alcanzada,
              (CASE WHEN ventas >= meta AND meta > 0 THEN pct_alc ELSE pct_no END)::text AS comision_pct,
              (ventas * (CASE WHEN ventas >= meta AND meta > 0 THEN pct_alc ELSE pct_no END) / 100.0)::text AS comision_total
         FROM dia_suc
        ORDER BY dia DESC, sucursal_nombre`,
      params,
    ).catch(() => ({ rows: [] as Array<{ fecha: string; sucursal_id: string | null; sucursal_nombre: string | null; meta: string; ventas: string; alcanzada: boolean; comision_pct: string; comision_total: string }> }));

    // KPIs globales
    const ventasTotal = porDia.rows.reduce((s, r) => s + Number(r.ventas), 0);
    const comisionTotal = porDia.rows.reduce((s, r) => s + Number(r.comision_total), 0);
    const diasOperados = porDia.rows.length;
    const diasMetaAlc = porDia.rows.filter((r) => r.alcanzada).length;

    // Por sucursal
    const porSucMap = new Map<string, { sucursal_id: string | null; sucursal_nombre: string; dias_op: number; dias_alc: number; ventas: number; comision: number }>();
    for (const r of porDia.rows) {
      const key = String(r.sucursal_id ?? "sin");
      const bag = porSucMap.get(key) ?? { sucursal_id: r.sucursal_id, sucursal_nombre: r.sucursal_nombre ?? "Sin sucursal", dias_op: 0, dias_alc: 0, ventas: 0, comision: 0 };
      bag.dias_op += 1;
      if (r.alcanzada) bag.dias_alc += 1;
      bag.ventas += Number(r.ventas);
      bag.comision += Number(r.comision_total);
      porSucMap.set(key, bag);
    }
    const porSuc = Array.from(porSucMap.values()).sort((a, b) => b.ventas - a.ventas);

    // Por usuario (vendedora / cajera) — comisión proporcional al share dentro del día×sucursal
    const porUsrRaw = await pool.query<{ usuario_id: string | null; usuario_nombre: string | null; dia: string; sucursal_id: string | null; ventas: string }>(
      `SELECT v.created_by::text AS usuario_id,
              COALESCE(u.nombre, u.email, 'Sin usuario') AS usuario_nombre,
              date_trunc('day', v.fecha)::date::text AS dia,
              v.sucursal_id::text,
              COALESCE(SUM(v.total),0)::text AS ventas
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY v.created_by, COALESCE(u.nombre, u.email, 'Sin usuario'),
                 date_trunc('day', v.fecha)::date, v.sucursal_id`,
      params,
    ).catch(() => ({ rows: [] as Array<{ usuario_id: string | null; usuario_nombre: string | null; dia: string; sucursal_id: string | null; ventas: string }> }));

    // Índice de comisión pct por (día, sucursal)
    const pctBySucDia = new Map<string, number>();
    const ventasBySucDia = new Map<string, number>();
    for (const r of porDia.rows) {
      const key = `${r.fecha}|${r.sucursal_id ?? "sin"}`;
      pctBySucDia.set(key, Number(r.comision_pct));
      ventasBySucDia.set(key, Number(r.ventas));
    }

    const porUsrMap = new Map<string, { usuario_id: string | null; usuario_nombre: string; ventas: number; comision_estimada: number }>();
    for (const r of porUsrRaw.rows) {
      const key = `${r.dia}|${r.sucursal_id ?? "sin"}`;
      const pct = pctBySucDia.get(key) ?? 0;
      const ventas = Number(r.ventas);
      const comision = ventas * pct / 100;
      const uKey = String(r.usuario_id ?? "sin");
      const bag = porUsrMap.get(uKey) ?? { usuario_id: r.usuario_id, usuario_nombre: r.usuario_nombre ?? "Sin usuario", ventas: 0, comision_estimada: 0 };
      bag.ventas += ventas;
      bag.comision_estimada += comision;
      porUsrMap.set(uKey, bag);
    }
    const porUsr = Array.from(porUsrMap.values()).sort((a, b) => b.ventas - a.ventas);

    // Opciones
    const opSuc = await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tS} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> }));
    const opUsr = await pool.query<{ id: string; nombre: string | null; email: string | null }>(
      `SELECT id::text, nombre, email FROM ${tU} WHERE empresa_id = $1 ORDER BY COALESCE(nombre,email)`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string | null; email: string | null }> }));

    return NextResponse.json(successResponse({
      kpis: {
        ventas_total: ventasTotal,
        dias_operados: diasOperados,
        dias_meta_alcanzada: diasMetaAlc,
        comision_total: comisionTotal,
      },
      por_dia: porDia.rows.map((r) => ({
        fecha: r.fecha,
        sucursal_id: r.sucursal_id, sucursal_nombre: r.sucursal_nombre ?? "Sin sucursal",
        meta: Number(r.meta), ventas: Number(r.ventas),
        alcanzada: r.alcanzada,
        comision_pct: Number(r.comision_pct),
        comision_total: Number(r.comision_total),
      })),
      por_sucursal: porSuc,
      por_usuario: porUsr,
      opciones: {
        sucursales: opSuc.rows,
        usuarios: opUsr.rows.map((r) => ({ id: r.id, nombre: r.nombre ?? r.email ?? "—" })),
      },
      hay_metas_configuradas: hayMetas,
    }));
  } catch (err) {
    console.error("[/api/reportes/metas-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
