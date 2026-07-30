import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { logAuditoria } from "@/lib/auditoria/log";

export const dynamic = "force-dynamic";

const ESTADOS_VALIDOS = new Set(["pendiente","en_proceso","confirmada","conciliada","descartada"]);

/**
 * GET /api/conciliacion — lista de pagos con estado y filtros.
 * Filtros opcionales:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   ?estado=pendiente|en_proceso|confirmada|conciliada|descartada
 *   ?metodo=efectivo|tarjeta|transferencia|qr|billetera|otro
 *   ?sucursal_id=uuid
 *   ?q=texto (busca en referencia/titular/observación)
 *   ?limit=200
 *
 * PATCH /api/conciliacion — actualiza estado de uno o varios pagos.
 * Body: { ids: string[], estado: <valor>, nota?: string }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const t = quoteSchemaTable(schema, "ventas_pagos_detalle");
    const tV = quoteSchemaTable(schema, "ventas");
    const tS = quoteSchemaTable(schema, "sucursales");
    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const estado = sp.get("estado");
    const metodo = sp.get("metodo");
    const sucursalId = sp.get("sucursal_id");
    const q = sp.get("q");
    const limit = Math.min(1000, Math.max(1, Number(sp.get("limit") ?? 300) || 300));

    const conds: string[] = ["p.empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, v: unknown) => { params.push(v); conds.push(sql.replace("?", `$${params.length}`)); };
    if (desde) push("p.created_at >= ?::timestamptz", desde);
    if (hasta) push("p.created_at <  (? ::date + interval '1 day')", hasta);
    if (estado && ESTADOS_VALIDOS.has(estado)) push("p.conciliacion_estado = ?", estado);
    if (metodo) push("p.metodo_pago = ?", metodo);
    if (sucursalId) push("p.sucursal_id = ?::uuid", sucursalId);
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const pn = `$${params.length}`;
      conds.push(`(p.referencia ILIKE ${pn} OR p.titular ILIKE ${pn} OR p.observacion ILIKE ${pn} OR v.numero_control ILIKE ${pn})`);
    }
    // Cajera solo su sucursal.
    if (auth.sucursal_id) push("p.sucursal_id = ?::uuid", auth.sucursal_id);

    const sql = `SELECT p.id, p.venta_id, p.metodo_pago, p.entidad_bancaria_id,
                        p.entidad_nombre_snapshot, p.monto::float8 AS monto,
                        p.referencia, p.titular, p.fecha_acreditacion, p.observacion,
                        p.conciliacion_estado, p.conciliado_at, p.conciliado_by_nombre,
                        p.conciliacion_nota, p.created_at,
                        v.numero_control, v.cliente_id,
                        s.nombre AS sucursal_nombre
                   FROM ${t} p
              LEFT JOIN ${tV} v ON v.id = p.venta_id
              LEFT JOIN ${tS} s ON s.id = p.sucursal_id
                  WHERE ${conds.join(" AND ")}
               ORDER BY p.created_at DESC
                  LIMIT ${limit}`;

    const { rows } = await pool.query(sql, params).catch((e) => {
      // 42703 = columna inexistente (migración no corrida) → devolver sin campos nuevos.
      if (e?.code === "42703") return retryWithoutExtendedCols(pool, t, tV, tS, conds, params, limit);
      if (e?.code === "42P01") return { rows: [] };
      throw e;
    });

    // Totales agregados para tablero (por estado + por método).
    const totalesQ = await pool.query<{ estado: string; metodo: string; total: string; cnt: string }>(
      `SELECT conciliacion_estado AS estado, metodo_pago AS metodo,
              COALESCE(SUM(monto),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${t}
        WHERE ${conds.map((c) => c.replace(/p\./g, "")).join(" AND ")}
        GROUP BY conciliacion_estado, metodo_pago`,
      params,
    ).catch(() => ({ rows: [] }));

    return NextResponse.json(successResponse({
      pagos: rows,
      totales: totalesQ.rows.map((r) => ({
        estado: r.estado, metodo: r.metodo,
        total: Number(r.total), count: Number(r.cnt),
      })),
    }));
  } catch (err) {
    console.error("[/api/conciliacion GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

async function retryWithoutExtendedCols(
  pool: NonNullable<ReturnType<typeof getChatPostgresPool>>,
  t: string, tV: string, tS: string,
  conds: string[], params: unknown[], limit: number,
): Promise<{ rows: Record<string, unknown>[] }> {
  const sql = `SELECT p.id, p.venta_id, p.metodo_pago, p.entidad_bancaria_id,
                      p.entidad_nombre_snapshot, p.monto::float8 AS monto,
                      p.referencia, p.titular, p.fecha_acreditacion, p.observacion,
                      p.conciliacion_estado,
                      NULL::timestamptz AS conciliado_at,
                      NULL::text AS conciliado_by_nombre,
                      NULL::text AS conciliacion_nota,
                      p.created_at,
                      v.numero_control, v.cliente_id,
                      s.nombre AS sucursal_nombre
                 FROM ${t} p
            LEFT JOIN ${tV} v ON v.id = p.venta_id
            LEFT JOIN ${tS} s ON s.id = p.sucursal_id
                WHERE ${conds.join(" AND ")}
             ORDER BY p.created_at DESC
                LIMIT ${limit}`;
  return pool.query(sql, params);
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: { ids?: unknown; estado?: unknown; nota?: unknown } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
    const estado = typeof body.estado === "string" ? body.estado : "";
    if (ids.length === 0) return NextResponse.json(errorResponse("ids requerido."), { status: 400 });
    if (!ESTADOS_VALIDOS.has(estado)) return NextResponse.json(errorResponse("estado inválido."), { status: 400 });
    const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 500) : null;

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "ventas_pagos_detalle");

    // Intento con columnas extendidas; si no existen, fallback sin ellas.
    const finalizado = ["conciliada", "confirmada"].includes(estado);
    const sqlExt = `UPDATE ${t}
       SET conciliacion_estado = $1,
           conciliado_at = CASE WHEN $2::boolean THEN COALESCE(conciliado_at, now()) ELSE conciliado_at END,
           conciliado_by = CASE WHEN $2::boolean THEN COALESCE(conciliado_by, $3::uuid) ELSE conciliado_by END,
           conciliado_by_nombre = CASE WHEN $2::boolean THEN COALESCE(conciliado_by_nombre, $4) ELSE conciliado_by_nombre END,
           conciliacion_nota = COALESCE($5, conciliacion_nota)
     WHERE empresa_id = $6 AND id = ANY($7::uuid[])`;
    const params = [estado, finalizado, auth.user.id ?? null, auth.nombre ?? null, nota, auth.empresa_id, ids];
    let updated: number;
    try {
      const r = await pool.query(sqlExt, params);
      updated = r.rowCount ?? 0;
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "42703") {
        const rf = await pool.query(
          `UPDATE ${t} SET conciliacion_estado = $1 WHERE empresa_id = $2 AND id = ANY($3::uuid[])`,
          [estado, auth.empresa_id, ids],
        );
        updated = rf.rowCount ?? 0;
      } else {
        throw e;
      }
    }

    await logAuditoria({
      empresaId: auth.empresa_id,
      usuarioId: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      sucursalId: auth.sucursal_id ?? null,
      tipo: "conciliacion_actualizada",
      entidad: "pago",
      referencia: `${updated} pago(s)`,
      datoNuevo: { estado, ids },
      motivo: nota,
    });

    return NextResponse.json(successResponse({ updated }));
  } catch (err) {
    console.error("[/api/conciliacion PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
