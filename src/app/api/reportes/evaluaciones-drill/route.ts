import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/evaluaciones-drill
 * Reporte de compras/evaluaciones (cliente_recepciones).
 *
 * Filtros:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   & sucursal_id=uuid & usuario_id=uuid & cliente_id=uuid & estado=xxx
 *   & tipo_prenda_id=uuid  & q=texto
 *
 * Devuelve:
 *   - kpis: { total_pagado, cantidad_evaluaciones, prendas_evaluadas,
 *             ticket_promedio, pendientes_ingreso_count, pendientes_ingreso_total }
 *   - por_sucursal, por_usuario (evaluadora), por_estado, por_tipo_prenda
 *   - evaluaciones: hasta 1000 filas
 *   - opciones: { sucursales, usuarios, estados, tipos_prenda }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tR = quoteSchemaTable(schema, "cliente_recepciones");
    const tRI = quoteSchemaTable(schema, "cliente_recepciones_items");
    const tS = quoteSchemaTable(schema, "sucursales");
    const tC = quoteSchemaTable(schema, "clientes");
    const tTP = quoteSchemaTable(schema, "tipos_prenda");
    const uSchemaQ = await pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'usuarios' AND table_schema IN ('public','pronimerp',$1) LIMIT 1`,
      [schema],
    );
    const tU = `"${uSchemaQ.rows[0]?.table_schema ?? "public"}"."usuarios"`;

    // Detectar columnas por si el schema es viejo
    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cliente_recepciones'`,
      [schema],
    );
    const cols = new Set(colQ.rows.map((r) => r.column_name));
    const hasTotalFinal = cols.has("total_final");
    const hasSubtotalEv = cols.has("subtotal_evaluado");
    const hasAjusteEv   = cols.has("ajuste_evaluacion");
    const totalExpr = hasTotalFinal ? "COALESCE(r.total_final, r.total_compra, 0)" : "COALESCE(r.total_compra, 0)";

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const sucursalId = sp.get("sucursal_id");
    const usuarioId = sp.get("usuario_id");
    const clienteId = sp.get("cliente_id");
    const estado = sp.get("estado");
    const tipoPrendaId = sp.get("tipo_prenda_id");
    const q = (sp.get("q") ?? "").trim();

    const conds: string[] = ["r.empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      conds.push(sql.replace("?", `$${params.length}`));
    };
    if (desde) push("r.fecha >= ?::timestamptz", desde);
    if (hasta) push("r.fecha <  (? ::date + interval '1 day')", hasta);
    if (sucursalId) push("r.sucursal_id = ?::uuid", sucursalId);
    if (auth.sucursal_id) push("r.sucursal_id = ?::uuid", auth.sucursal_id);
    if (usuarioId) push("r.created_by = ?::uuid", usuarioId);
    if (clienteId) push("r.cliente_id = ?::uuid", clienteId);
    if (estado) push("COALESCE(r.estado,'') = ?", estado);
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      conds.push(`(LOWER(r.numero_control) LIKE ${p}
                   OR LOWER(COALESCE(c.empresa, c.nombre_contacto, c.nombre, '')) LIKE ${p}
                   OR LOWER(COALESCE(u.nombre, u.email, r.usuario_nombre, '')) LIKE ${p})`);
    }
    conds.push("(r.estado IS NULL OR r.estado <> 'anulada')");

    // Filtro por tipo_prenda: se aplica sólo sobre listado + agregado por tipo
    // (requiere EXISTS en items). No afecta el count global de "pendientes".
    const condsConTipo = [...conds];
    if (tipoPrendaId) {
      params.push(tipoPrendaId);
      condsConTipo.push(`EXISTS (SELECT 1 FROM ${tRI} it WHERE it.recepcion_id = r.id AND it.tipo_prenda_id = $${params.length}::uuid)`);
    }

    const from = `${tR} r
       LEFT JOIN ${tS} s ON s.id = r.sucursal_id
       LEFT JOIN ${tC} c ON c.id = r.cliente_id
       LEFT JOIN ${tU} u ON u.id = r.created_by`;

    // KPIs
    const kpis = await pool.query<{
      total: string; cnt: string; prendas: string; pend_cnt: string; pend_tot: string;
    }>(
      `SELECT COALESCE(SUM(${totalExpr}),0)::text                                             AS total,
              COUNT(*)::text                                                                  AS cnt,
              COALESCE((SELECT SUM(it.cantidad) FROM ${tRI} it
                          JOIN ${tR} rr ON rr.id = it.recepcion_id
                         WHERE rr.empresa_id = $1
                           ${desde ? `AND rr.fecha >= '${desde}'::timestamptz` : ""}
                           ${hasta ? `AND rr.fecha <  ('${hasta}'::date + interval '1 day')` : ""}
                           AND (rr.estado IS NULL OR rr.estado <> 'anulada')
                       ),0)::text                                                             AS prendas,
              COUNT(*) FILTER (WHERE r.estado = 'pendiente_ingreso')::text                    AS pend_cnt,
              COALESCE(SUM(${totalExpr}) FILTER (WHERE r.estado = 'pendiente_ingreso'),0)::text AS pend_tot
         FROM ${from} WHERE ${condsConTipo.join(" AND ")}`,
      params,
    );
    const k = kpis.rows[0] ?? { total: "0", cnt: "0", prendas: "0", pend_cnt: "0", pend_tot: "0" };
    const totalP = Number(k.total);
    const cntP = Number(k.cnt);

    const bySuc = await pool.query<{ sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string }>(
      `SELECT r.sucursal_id::text, s.nombre AS sucursal_nombre,
              COALESCE(SUM(${totalExpr}),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${condsConTipo.join(" AND ")}
        GROUP BY r.sucursal_id, s.nombre ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string }> }));

    const byUsr = await pool.query<{ usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string }>(
      `SELECT r.created_by::text AS usuario_id,
              COALESCE(u.nombre, u.email, r.usuario_nombre, 'Sin usuario') AS usuario_nombre,
              COALESCE(SUM(${totalExpr}),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${condsConTipo.join(" AND ")}
        GROUP BY r.created_by, COALESCE(u.nombre, u.email, r.usuario_nombre, 'Sin usuario')
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string }> }));

    const byEst = await pool.query<{ estado: string; total: string; cnt: string }>(
      `SELECT COALESCE(r.estado,'sin_estado') AS estado,
              COALESCE(SUM(${totalExpr}),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${condsConTipo.join(" AND ")}
        GROUP BY COALESCE(r.estado,'sin_estado') ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ estado: string; total: string; cnt: string }> }));

    // Por tipo de prenda (join items)
    const byTP = await pool.query<{ tipo_id: string | null; tipo_nombre: string | null; prendas: string; total: string }>(
      `SELECT it.tipo_prenda_id::text AS tipo_id,
              tp.nombre AS tipo_nombre,
              COALESCE(SUM(it.cantidad),0)::text AS prendas,
              COALESCE(SUM(it.subtotal),0)::text AS total
         FROM ${tRI} it
         JOIN ${tR} r ON r.id = it.recepcion_id
         LEFT JOIN ${tC} c ON c.id = r.cliente_id
         LEFT JOIN ${tU} u ON u.id = r.created_by
         LEFT JOIN ${tTP} tp ON tp.id = it.tipo_prenda_id
        WHERE ${condsConTipo.join(" AND ")}
        GROUP BY it.tipo_prenda_id, tp.nombre
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ tipo_id: string | null; tipo_nombre: string | null; prendas: string; total: string }> }));

    // Listado
    const evals = await pool.query<{
      id: string; numero_control: string; fecha: string;
      cliente_id: string | null; cliente_nombre: string | null;
      sucursal_id: string | null; sucursal_nombre: string | null;
      usuario_id: string | null; usuario_nombre: string | null;
      estado: string | null;
      subtotal: string; ajuste: string; total: string;
      prendas: string;
    }>(
      `SELECT r.id::text, r.numero_control, r.fecha,
              r.cliente_id::text,
              COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
              r.sucursal_id::text, s.nombre AS sucursal_nombre,
              r.created_by::text AS usuario_id,
              COALESCE(u.nombre, u.email, r.usuario_nombre) AS usuario_nombre,
              r.estado,
              ${hasSubtotalEv ? "COALESCE(r.subtotal_evaluado,0)" : "0"}::text AS subtotal,
              ${hasAjusteEv ? "COALESCE(r.ajuste_evaluacion,0)" : "0"}::text AS ajuste,
              ${totalExpr}::text AS total,
              COALESCE((SELECT SUM(it.cantidad) FROM ${tRI} it WHERE it.recepcion_id = r.id),0)::text AS prendas
         FROM ${from} WHERE ${condsConTipo.join(" AND ")}
        ORDER BY r.fecha DESC LIMIT 1000`,
      params,
    ).catch(() => ({ rows: [] as Array<{ id: string; numero_control: string; fecha: string; cliente_id: string | null; cliente_nombre: string | null; sucursal_id: string | null; sucursal_nombre: string | null; usuario_id: string | null; usuario_nombre: string | null; estado: string | null; subtotal: string; ajuste: string; total: string; prendas: string }> }));

    const opSuc = await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tS} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> }));

    const opUsr = await pool.query<{ id: string; nombre: string | null; email: string | null }>(
      `SELECT id::text, nombre, email FROM ${tU} WHERE empresa_id = $1 ORDER BY COALESCE(nombre,email)`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string | null; email: string | null }> }));

    const opTP = await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tTP} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> }));

    return NextResponse.json(successResponse({
      kpis: {
        total_pagado: totalP,
        cantidad_evaluaciones: cntP,
        prendas_evaluadas: Number(k.prendas),
        ticket_promedio: cntP > 0 ? totalP / cntP : 0,
        pendientes_ingreso_count: Number(k.pend_cnt),
        pendientes_ingreso_total: Number(k.pend_tot),
      },
      por_sucursal: bySuc.rows.map((r) => ({ sucursal_id: r.sucursal_id, sucursal_nombre: r.sucursal_nombre ?? "Sin sucursal", total: Number(r.total), cnt: Number(r.cnt) })),
      por_usuario:  byUsr.rows.map((r) => ({ usuario_id: r.usuario_id, usuario_nombre: r.usuario_nombre ?? "Sin usuario", total: Number(r.total), cnt: Number(r.cnt) })),
      por_estado:   byEst.rows.map((r) => ({ estado: r.estado, total: Number(r.total), cnt: Number(r.cnt) })),
      por_tipo_prenda: byTP.rows.map((r) => ({ tipo_id: r.tipo_id, tipo_nombre: r.tipo_nombre ?? "Sin tipo", prendas: Number(r.prendas), total: Number(r.total) })),
      evaluaciones: evals.rows.map((r) => ({
        ...r,
        subtotal: Number(r.subtotal),
        ajuste: Number(r.ajuste),
        total: Number(r.total),
        prendas: Number(r.prendas),
      })),
      opciones: {
        sucursales: opSuc.rows,
        usuarios: opUsr.rows.map((r) => ({ id: r.id, nombre: r.nombre ?? r.email ?? "—" })),
        estados: byEst.rows.map((r) => r.estado).filter(Boolean),
        tipos_prenda: opTP.rows,
      },
    }));
  } catch (err) {
    console.error("[/api/reportes/evaluaciones-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
