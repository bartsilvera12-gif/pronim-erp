import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/cajas-drill
 * Cierres de caja (turnos) con drill.
 *
 * Filtros:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   & estado=abierta|cerrada
 *   & usuario_id=uuid (matchea abierta_por o cerrada_por)
 *   & con_diferencia=1|neg|pos
 *   & q=texto (N° caja / observación / usuario)
 *
 * Devuelve:
 *   - kpis: { turnos_total, turnos_cerrados, turnos_abiertos,
 *             total_apertura, total_contado, total_esperado,
 *             diferencia_neta, diferencia_abs }
 *   - por_usuario (cerró), por_dia
 *   - cajas: hasta 500 filas
 *   - opciones: { usuarios }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tCJ = quoteSchemaTable(schema, "cajas");
    const tCM = quoteSchemaTable(schema, "caja_movimientos");
    const uSchemaQ = await pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'usuarios' AND table_schema IN ('public','pronimerp',$1) LIMIT 1`,
      [schema],
    );
    const tU = `"${uSchemaQ.rows[0]?.table_schema ?? "public"}"."usuarios"`;

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const estado = sp.get("estado");
    const usuarioId = sp.get("usuario_id");
    const conDif = sp.get("con_diferencia"); // "1" | "pos" | "neg"
    const q = (sp.get("q") ?? "").trim();

    const conds: string[] = ["c.empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      conds.push(sql.replace("?", `$${params.length}`));
    };
    if (desde) push("c.fecha_apertura >= ?::timestamptz", desde);
    if (hasta) push("c.fecha_apertura <  (? ::date + interval '1 day')", hasta);
    if (estado === "abierta" || estado === "cerrada") push("c.estado = ?", estado);
    if (usuarioId) push("(c.abierta_por = ?::uuid OR c.cerrada_por = ?::uuid)", usuarioId);
    if (conDif === "1")   conds.push("COALESCE(c.diferencia,0) <> 0");
    if (conDif === "pos") conds.push("COALESCE(c.diferencia,0) > 0");
    if (conDif === "neg") conds.push("COALESCE(c.diferencia,0) < 0");
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      conds.push(`(LOWER(COALESCE(c.observacion_apertura,'')) LIKE ${p}
                   OR LOWER(COALESCE(c.observacion_cierre,'')) LIKE ${p}
                   OR LOWER(COALESCE(ua.nombre, ua.email, '')) LIKE ${p}
                   OR LOWER(COALESCE(uc.nombre, uc.email, '')) LIKE ${p}
                   OR CAST(c.numero_caja AS text) LIKE ${p})`);
    }
    // Nota: si viene sucursal_id de auth y la tabla cajas la tiene, filtrar.
    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cajas'`,
      [schema],
    );
    const cajasCols = new Set(colQ.rows.map((r) => r.column_name));
    const hasSucursal = cajasCols.has("sucursal_id");
    if (hasSucursal && auth.sucursal_id) push("c.sucursal_id = ?::uuid", auth.sucursal_id);

    const from = `${tCJ} c
       LEFT JOIN ${tU} ua ON ua.id = c.abierta_por
       LEFT JOIN ${tU} uc ON uc.id = c.cerrada_por`;

    // KPIs
    const kpis = await pool.query<{
      total: string; cerradas: string; abiertas: string;
      apertura: string; contado: string; esperado: string;
      dif_neta: string; dif_abs: string;
    }>(
      `SELECT COUNT(*)::text                                                                   AS total,
              COUNT(*) FILTER (WHERE c.estado = 'cerrada')::text                              AS cerradas,
              COUNT(*) FILTER (WHERE c.estado = 'abierta')::text                              AS abiertas,
              COALESCE(SUM(c.monto_apertura),0)::text                                         AS apertura,
              COALESCE(SUM(c.monto_cierre_contado),0)::text                                   AS contado,
              COALESCE(SUM(c.monto_esperado_efectivo),0)::text                                AS esperado,
              COALESCE(SUM(c.diferencia),0)::text                                             AS dif_neta,
              COALESCE(SUM(ABS(c.diferencia)),0)::text                                        AS dif_abs
         FROM ${from} WHERE ${conds.join(" AND ")}`,
      params,
    );
    const k = kpis.rows[0] ?? { total: "0", cerradas: "0", abiertas: "0", apertura: "0", contado: "0", esperado: "0", dif_neta: "0", dif_abs: "0" };

    // Por usuario que cerró
    const byUsr = await pool.query<{ usuario_id: string | null; usuario_nombre: string | null; cnt: string; contado: string; esperado: string; dif: string }>(
      `SELECT c.cerrada_por::text AS usuario_id,
              COALESCE(uc.nombre, uc.email, 'Sin cierre') AS usuario_nombre,
              COUNT(*)::text AS cnt,
              COALESCE(SUM(c.monto_cierre_contado),0)::text AS contado,
              COALESCE(SUM(c.monto_esperado_efectivo),0)::text AS esperado,
              COALESCE(SUM(c.diferencia),0)::text AS dif
         FROM ${from} WHERE ${conds.join(" AND ")} AND c.estado = 'cerrada'
        GROUP BY c.cerrada_por, COALESCE(uc.nombre, uc.email, 'Sin cierre')
        ORDER BY cnt DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ usuario_id: string | null; usuario_nombre: string | null; cnt: string; contado: string; esperado: string; dif: string }> }));

    // Por día (fecha_apertura)
    const byDia = await pool.query<{ dia: string; cnt: string; contado: string; dif: string }>(
      `SELECT date_trunc('day', c.fecha_apertura)::date::text AS dia,
              COUNT(*)::text AS cnt,
              COALESCE(SUM(c.monto_cierre_contado),0)::text AS contado,
              COALESCE(SUM(c.diferencia),0)::text AS dif
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY date_trunc('day', c.fecha_apertura)::date
        ORDER BY dia DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ dia: string; cnt: string; contado: string; dif: string }> }));

    // Listado
    const cajas = await pool.query<{
      id: string; numero_caja: string; estado: string;
      fecha_apertura: string; fecha_cierre: string | null;
      abierta_por: string | null; abierta_por_nombre: string | null;
      cerrada_por: string | null; cerrada_por_nombre: string | null;
      monto_apertura: string; monto_esperado: string; monto_contado: string; diferencia: string;
      observacion_apertura: string | null; observacion_cierre: string | null;
      movs_count: string;
    }>(
      `SELECT c.id::text, c.numero_caja::text, c.estado,
              c.fecha_apertura, c.fecha_cierre,
              c.abierta_por::text,
              COALESCE(ua.nombre, ua.email) AS abierta_por_nombre,
              c.cerrada_por::text,
              COALESCE(uc.nombre, uc.email) AS cerrada_por_nombre,
              COALESCE(c.monto_apertura,0)::text AS monto_apertura,
              COALESCE(c.monto_esperado_efectivo,0)::text AS monto_esperado,
              COALESCE(c.monto_cierre_contado,0)::text AS monto_contado,
              COALESCE(c.diferencia,0)::text AS diferencia,
              c.observacion_apertura, c.observacion_cierre,
              COALESCE((SELECT COUNT(*) FROM ${tCM} m WHERE m.caja_id = c.id),0)::text AS movs_count
         FROM ${from} WHERE ${conds.join(" AND ")}
        ORDER BY c.fecha_apertura DESC LIMIT 500`,
      params,
    );

    // Opciones
    const opUsr = await pool.query<{ id: string; nombre: string | null; email: string | null }>(
      `SELECT id::text, nombre, email FROM ${tU} WHERE empresa_id = $1 ORDER BY COALESCE(nombre,email)`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string | null; email: string | null }> }));

    return NextResponse.json(successResponse({
      kpis: {
        turnos_total: Number(k.total),
        turnos_cerrados: Number(k.cerradas),
        turnos_abiertos: Number(k.abiertas),
        total_apertura: Number(k.apertura),
        total_contado: Number(k.contado),
        total_esperado: Number(k.esperado),
        diferencia_neta: Number(k.dif_neta),
        diferencia_abs: Number(k.dif_abs),
      },
      por_usuario: byUsr.rows.map((r) => ({
        usuario_id: r.usuario_id, usuario_nombre: r.usuario_nombre ?? "—",
        cnt: Number(r.cnt), contado: Number(r.contado), esperado: Number(r.esperado), diferencia: Number(r.dif),
      })),
      por_dia: byDia.rows.map((r) => ({
        dia: r.dia, cnt: Number(r.cnt), contado: Number(r.contado), diferencia: Number(r.dif),
      })),
      cajas: cajas.rows.map((r) => ({
        ...r,
        numero_caja: Number(r.numero_caja),
        monto_apertura: Number(r.monto_apertura),
        monto_esperado: Number(r.monto_esperado),
        monto_contado: Number(r.monto_contado),
        diferencia: Number(r.diferencia),
        movs_count: Number(r.movs_count),
      })),
      opciones: {
        usuarios: opUsr.rows.map((r) => ({ id: r.id, nombre: r.nombre ?? r.email ?? "—" })),
      },
    }));
  } catch (err) {
    console.error("[/api/reportes/cajas-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
