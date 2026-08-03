import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/descuentos
 * Filtros: ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD & sucursal_id=uuid
 *
 * Devuelve:
 *   - por_motivo:   [{ motivo, total_descuento, ventas_count, ticket_promedio }]
 *   - por_sucursal: [{ sucursal_id, sucursal_nombre, total_descuento, ventas_count }]
 *   - ventas:       hasta 500 ventas con descuento_general > 0 en el período
 *                    (detalle para drill).
 *   - total_general, ventas_con_descuento_count
 *
 * Requiere columnas `descuento_general` y `descuento_motivo` (migración
 * 20260910). Si no están, devuelve arrays vacíos con warning.
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
    const tM = quoteSchemaTable(schema, "motivos_descuento");
    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const sucursalId = sp.get("sucursal_id");

    const conds: string[] = ["v.empresa_id = $1", "COALESCE(v.descuento_general,0) > 0"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      conds.push(sql.replace("?", `$${params.length}`));
    };
    if (desde) push("v.fecha >= ?::timestamptz", desde);
    if (hasta) push("v.fecha <  (? ::date + interval '1 day')", hasta);
    if (sucursalId) push("v.sucursal_id = ?::uuid", sucursalId);
    if (auth.sucursal_id) push("v.sucursal_id = ?::uuid", auth.sucursal_id);
    // Excluir anuladas
    conds.push("(v.estado IS NULL OR v.estado <> 'anulada')");

    // Agregado por motivo
    const byMotivo = await pool.query<{
      motivo: string; total: string; cnt: string; ticket_avg: string;
    }>(
      `SELECT COALESCE(v.descuento_motivo, 'otro') AS motivo,
              COALESCE(SUM(v.descuento_general), 0)::text AS total,
              COUNT(*)::text                              AS cnt,
              COALESCE(AVG(v.descuento_general), 0)::text AS ticket_avg
         FROM ${tV} v
        WHERE ${conds.join(" AND ")}
        GROUP BY COALESCE(v.descuento_motivo, 'otro')
        ORDER BY total DESC`,
      params,
    ).catch((e) => {
      if (e?.code === "42703" || e?.code === "42P01") return { rows: [] as Array<{ motivo: string; total: string; cnt: string; ticket_avg: string }> };
      throw e;
    });

    // Agregado por sucursal
    const bySuc = await pool.query<{
      sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string;
    }>(
      `SELECT v.sucursal_id::text,
              s.nombre AS sucursal_nombre,
              COALESCE(SUM(v.descuento_general), 0)::text AS total,
              COUNT(*)::text                              AS cnt
         FROM ${tV} v
    LEFT JOIN ${tS} s ON s.id = v.sucursal_id
        WHERE ${conds.join(" AND ")}
        GROUP BY v.sucursal_id, s.nombre
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string }> }));

    // Ventas detalle (drill)
    const ventas = await pool.query<{
      id: string; numero_control: string; fecha: string;
      total: string; descuento_general: string; descuento_motivo: string | null;
      sucursal_nombre: string | null;
    }>(
      `SELECT v.id, v.numero_control, v.fecha,
              v.total::text, v.descuento_general::text, v.descuento_motivo,
              s.nombre AS sucursal_nombre
         FROM ${tV} v
    LEFT JOIN ${tS} s ON s.id = v.sucursal_id
        WHERE ${conds.join(" AND ")}
        ORDER BY v.fecha DESC
        LIMIT 500`,
      params,
    ).catch(() => ({ rows: [] as Array<{ id: string; numero_control: string; fecha: string; total: string; descuento_general: string; descuento_motivo: string | null; sucursal_nombre: string | null }> }));

    // Labels de motivos configurados (para render legible)
    const motivosCat = await pool.query<{ codigo: string; label: string }>(
      `SELECT codigo, label FROM ${tM} WHERE empresa_id = $1`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ codigo: string; label: string }> }));
    const labelByCode = new Map(motivosCat.rows.map((r) => [r.codigo, r.label]));

    const total_general = byMotivo.rows.reduce((s, r) => s + Number(r.total), 0);
    const ventas_con_descuento_count = byMotivo.rows.reduce((s, r) => s + Number(r.cnt), 0);

    return NextResponse.json(successResponse({
      total_general,
      ventas_con_descuento_count,
      por_motivo: byMotivo.rows.map((r) => ({
        motivo: r.motivo,
        label: labelByCode.get(r.motivo) ?? r.motivo,
        total_descuento: Number(r.total),
        ventas_count: Number(r.cnt),
        ticket_promedio: Number(r.ticket_avg),
        pct: total_general > 0 ? Math.round((Number(r.total) / total_general) * 1000) / 10 : 0,
      })),
      por_sucursal: bySuc.rows.map((r) => ({
        sucursal_id: r.sucursal_id,
        sucursal_nombre: r.sucursal_nombre ?? "Sin sucursal",
        total_descuento: Number(r.total),
        ventas_count: Number(r.cnt),
      })),
      ventas: ventas.rows.map((r) => ({
        id: r.id,
        numero_control: r.numero_control,
        fecha: r.fecha,
        total: Number(r.total),
        descuento_general: Number(r.descuento_general),
        descuento_motivo: r.descuento_motivo,
        motivo_label: r.descuento_motivo ? (labelByCode.get(r.descuento_motivo) ?? r.descuento_motivo) : null,
        sucursal_nombre: r.sucursal_nombre,
      })),
      warning: byMotivo.rows.length === 0 && bySuc.rows.length === 0
        ? "Si acabás de aplicar la migración 20260910, todavía no hay ventas con descuento persistido." : null,
    }));
  } catch (err) {
    console.error("[/api/reportes/descuentos GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
