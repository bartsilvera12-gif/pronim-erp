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
 * Filtros:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   & sucursal_id=uuid & motivo=codigo
 *   & usuario_id=uuid  & cliente_id=uuid
 *   & q=texto (busca en numero_control / cliente / usuario)
 *
 * Devuelve:
 *   - por_motivo, por_sucursal, por_usuario
 *   - ventas (hasta 1000, filtrable con q en cliente/UI)
 *   - total_general, ventas_con_descuento_count
 *   - opciones: { sucursales, usuarios, motivos, clientes } para poblar selects
 *
 * Requiere columnas `descuento_general` / `descuento_motivo` en ventas
 * (migración 20260910). Si faltan, devuelve arrays vacíos con warning.
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
    const tC = quoteSchemaTable(schema, "clientes");
    // usuarios vive en el catálogo (public) o en el schema de app; detectamos.
    const usuariosSchemaQ = await pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'usuarios' AND table_schema IN ('public','pronimerp',$1) LIMIT 1`,
      [schema],
    );
    const usuariosSchema = usuariosSchemaQ.rows[0]?.table_schema ?? "public";
    const tU = `"${usuariosSchema}"."usuarios"`;

    // ventas puede no tener columna de usuario — detectamos cuál existe.
    const vColQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'ventas'`,
      [schema],
    );
    const vCols = new Set(vColQ.rows.map((r) => r.column_name));
    const userCol = ["created_by", "usuario_id", "vendedor_id", "created_by_id"].find((c) => vCols.has(c)) ?? null;
    const hayUsuario = userCol != null;
    const uJoin = hayUsuario ? `LEFT JOIN ${tU} u ON u.id = v.${userCol}` : "";
    const uIdSel = hayUsuario ? `v.${userCol}::text` : "NULL::text";
    const uNombreGrp = hayUsuario ? "COALESCE(u.nombre, u.email, 'Sin usuario')" : "'Sin usuario'";

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const sucursalId = sp.get("sucursal_id");
    const motivo = sp.get("motivo");
    const usuarioId = sp.get("usuario_id");
    const clienteId = sp.get("cliente_id");
    const q = (sp.get("q") ?? "").trim();

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
    if (motivo) push("COALESCE(v.descuento_motivo,'otro') = ?", motivo);
    if (usuarioId && hayUsuario) push(`v.${userCol} = ?::uuid`, usuarioId);
    if (clienteId) push("v.cliente_id = ?::uuid", clienteId);
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      const usuarioLike = hayUsuario ? `OR LOWER(COALESCE(u.nombre, u.email, '')) LIKE ${p}` : "";
      conds.push(`(LOWER(v.numero_control) LIKE ${p}
                   OR LOWER(COALESCE(c.empresa, c.nombre_contacto, c.nombre, '')) LIKE ${p}
                   ${usuarioLike})`);
    }
    conds.push("(v.estado IS NULL OR v.estado <> 'anulada')");

    const fromJoin = `${tV} v
       LEFT JOIN ${tS} s ON s.id = v.sucursal_id
       LEFT JOIN ${tC} c ON c.id = v.cliente_id
       ${uJoin}`;

    // Agregado por motivo
    const byMotivo = await pool.query<{
      motivo: string; total: string; cnt: string; ticket_avg: string;
    }>(
      `SELECT COALESCE(v.descuento_motivo, 'otro') AS motivo,
              COALESCE(SUM(v.descuento_general), 0)::text AS total,
              COUNT(*)::text                              AS cnt,
              COALESCE(AVG(v.descuento_general), 0)::text AS ticket_avg
         FROM ${fromJoin}
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
         FROM ${fromJoin}
        WHERE ${conds.join(" AND ")}
        GROUP BY v.sucursal_id, s.nombre
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string }> }));

    // Agregado por usuario (cajera)
    const byUsr = hayUsuario ? await pool.query<{
      usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string;
    }>(
      `SELECT v.${userCol}::text AS usuario_id,
              ${uNombreGrp} AS usuario_nombre,
              COALESCE(SUM(v.descuento_general), 0)::text AS total,
              COUNT(*)::text                              AS cnt
         FROM ${fromJoin}
        WHERE ${conds.join(" AND ")}
        GROUP BY v.${userCol}, ${uNombreGrp}
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string }> }))
    : { rows: [] as Array<{ usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string }> };

    // Ventas detalle (drill) — hasta 1000
    const ventas = await pool.query<{
      id: string; numero_control: string; fecha: string;
      total: string; descuento_general: string; descuento_motivo: string | null;
      sucursal_id: string | null; sucursal_nombre: string | null;
      cliente_id: string | null; cliente_nombre: string | null;
      usuario_id: string | null; usuario_nombre: string | null;
    }>(
      `SELECT v.id::text, v.numero_control, v.fecha,
              v.total::text, v.descuento_general::text, v.descuento_motivo,
              v.sucursal_id::text, s.nombre AS sucursal_nombre,
              v.cliente_id::text,
              COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
              ${uIdSel} AS usuario_id,
              ${hayUsuario ? "COALESCE(u.nombre, u.email)" : "NULL::text"} AS usuario_nombre
         FROM ${fromJoin}
        WHERE ${conds.join(" AND ")}
        ORDER BY v.fecha DESC
        LIMIT 1000`,
      params,
    ).catch(() => ({ rows: [] as Array<{ id: string; numero_control: string; fecha: string; total: string; descuento_general: string; descuento_motivo: string | null; sucursal_id: string | null; sucursal_nombre: string | null; cliente_id: string | null; cliente_nombre: string | null; usuario_id: string | null; usuario_nombre: string | null }> }));

    // Labels de motivos configurados
    const motivosCat = await pool.query<{ codigo: string; label: string }>(
      `SELECT codigo, label FROM ${tM} WHERE empresa_id = $1`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ codigo: string; label: string }> }));
    const labelByCode = new Map(motivosCat.rows.map((r) => [r.codigo, r.label]));

    // Opciones para los selects: sucursales y usuarios de la empresa
    const opSuc = await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tS} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> }));

    const opUsr = await pool.query<{ id: string; nombre: string | null; email: string | null }>(
      `SELECT id::text, nombre, email FROM ${tU} WHERE empresa_id = $1 ORDER BY COALESCE(nombre,email)`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string | null; email: string | null }> }));

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
      por_usuario: byUsr.rows.map((r) => ({
        usuario_id: r.usuario_id,
        usuario_nombre: r.usuario_nombre ?? "Sin usuario",
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
        sucursal_id: r.sucursal_id,
        sucursal_nombre: r.sucursal_nombre,
        cliente_id: r.cliente_id,
        cliente_nombre: r.cliente_nombre,
        usuario_id: r.usuario_id,
        usuario_nombre: r.usuario_nombre,
      })),
      opciones: {
        sucursales: opSuc.rows,
        usuarios: opUsr.rows.map((r) => ({ id: r.id, nombre: r.nombre ?? r.email ?? "—" })),
        motivos: motivosCat.rows,
      },
      warning: byMotivo.rows.length === 0 && bySuc.rows.length === 0
        ? "Si acabás de aplicar la migración 20260910, todavía no hay ventas con descuento persistido." : null,
    }));
  } catch (err) {
    console.error("[/api/reportes/descuentos GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
