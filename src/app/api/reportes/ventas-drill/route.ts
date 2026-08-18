import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/ventas-drill
 * Filtros:
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   & sucursal_id=uuid & usuario_id=uuid & cliente_id=uuid
 *   & metodo_pago=efectivo|transferencia|credito|... & con_descuento=1
 *   & q=texto (busca en numero_control / cliente / usuario)
 *
 * Devuelve:
 *   - kpis: { total_facturado, cantidad_ventas, ticket_promedio, total_descuento, con_descuento_count }
 *   - por_sucursal, por_usuario, por_metodo_pago (clickeables)
 *   - ventas: hasta 1000 filas para drill
 *   - opciones: { sucursales, usuarios, metodos_pago }
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
    const tC = quoteSchemaTable(schema, "clientes");
    const uSchemaQ = await pool.query<{ table_schema: string }>(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = 'usuarios' AND table_schema IN ('public','pronimerp',$1) LIMIT 1`,
      [schema],
    );
    const tU = `"${uSchemaQ.rows[0]?.table_schema ?? "public"}"."usuarios"`;

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const sucursalId = sp.get("sucursal_id");
    const usuarioId = sp.get("usuario_id");
    const clienteId = sp.get("cliente_id");
    const metodoPago = sp.get("metodo_pago");
    const conDesc = sp.get("con_descuento") === "1";
    const q = (sp.get("q") ?? "").trim();

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
    if (clienteId) push("v.cliente_id = ?::uuid", clienteId);
    if (metodoPago) push("v.metodo_pago = ?", metodoPago);
    if (conDesc) conds.push("COALESCE(v.descuento_general,0) > 0");
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      conds.push(`(LOWER(v.numero_control) LIKE ${p}
                   OR LOWER(COALESCE(c.empresa, c.nombre_contacto, c.nombre, '')) LIKE ${p}
                   OR LOWER(COALESCE(u.nombre, u.email, '')) LIKE ${p})`);
    }
    conds.push("(v.estado IS NULL OR v.estado <> 'anulada')");

    const from = `${tV} v
       LEFT JOIN ${tS} s ON s.id = v.sucursal_id
       LEFT JOIN ${tC} c ON c.id = v.cliente_id
       LEFT JOIN ${tU} u ON u.id = v.created_by`;

    // KPIs globales
    const kpis = await pool.query<{
      total_fact: string; cnt: string; con_desc: string; total_desc: string;
    }>(
      `SELECT COALESCE(SUM(v.total),0)::text                                              AS total_fact,
              COUNT(*)::text                                                              AS cnt,
              COUNT(*) FILTER (WHERE COALESCE(v.descuento_general,0) > 0)::text           AS con_desc,
              COALESCE(SUM(COALESCE(v.descuento_general,0)),0)::text                      AS total_desc
         FROM ${from} WHERE ${conds.join(" AND ")}`,
      params,
    );
    const kRow = kpis.rows[0] ?? { total_fact: "0", cnt: "0", con_desc: "0", total_desc: "0" };
    const totalFact = Number(kRow.total_fact);
    const cnt = Number(kRow.cnt);

    const bySuc = await pool.query<{ sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string }>(
      `SELECT v.sucursal_id::text, s.nombre AS sucursal_nombre,
              COALESCE(SUM(v.total),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY v.sucursal_id, s.nombre ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ sucursal_id: string | null; sucursal_nombre: string | null; total: string; cnt: string }> }));

    const byUsr = await pool.query<{ usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string }>(
      `SELECT v.created_by::text AS usuario_id,
              COALESCE(u.nombre, u.email, 'Sin usuario') AS usuario_nombre,
              COALESCE(SUM(v.total),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY v.created_by, COALESCE(u.nombre, u.email, 'Sin usuario')
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ usuario_id: string | null; usuario_nombre: string | null; total: string; cnt: string }> }));

    const byMet = await pool.query<{ metodo_pago: string | null; total: string; cnt: string }>(
      `SELECT COALESCE(v.metodo_pago,'sin_metodo') AS metodo_pago,
              COALESCE(SUM(v.total),0)::text AS total, COUNT(*)::text AS cnt
         FROM ${from} WHERE ${conds.join(" AND ")}
        GROUP BY COALESCE(v.metodo_pago,'sin_metodo') ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ metodo_pago: string | null; total: string; cnt: string }> }));

    const tVI = quoteSchemaTable(schema, "ventas_items");
    const ventas = await pool.query<{
      id: string; numero_control: string; fecha: string; total: string;
      descuento_general: string; metodo_pago: string | null; estado: string | null;
      sucursal_id: string | null; sucursal_nombre: string | null;
      cliente_id: string | null; cliente_nombre: string | null;
      usuario_id: string | null; usuario_nombre: string | null;
      cant_productos: string;
    }>(
      `SELECT v.id::text, v.numero_control, v.fecha, v.total::text,
              COALESCE(v.descuento_general,0)::text AS descuento_general,
              v.metodo_pago, v.estado,
              v.sucursal_id::text, s.nombre AS sucursal_nombre,
              v.cliente_id::text,
              COALESCE(c.empresa, c.nombre_contacto, c.nombre) AS cliente_nombre,
              v.created_by::text AS usuario_id,
              COALESCE(u.nombre, u.email) AS usuario_nombre,
              COALESCE((SELECT SUM(it.cantidad) FROM ${tVI} it WHERE it.venta_id = v.id),0)::text AS cant_productos
         FROM ${from} WHERE ${conds.join(" AND ")}
        ORDER BY v.fecha DESC LIMIT 2000`,
      params,
    ).catch(() => ({ rows: [] as Array<{ id: string; numero_control: string; fecha: string; total: string; descuento_general: string; metodo_pago: string | null; estado: string | null; sucursal_id: string | null; sucursal_nombre: string | null; cliente_id: string | null; cliente_nombre: string | null; usuario_id: string | null; usuario_nombre: string | null; cant_productos: string }> }));

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
        total_facturado: totalFact,
        cantidad_ventas: cnt,
        ticket_promedio: cnt > 0 ? totalFact / cnt : 0,
        total_descuento: Number(kRow.total_desc),
        con_descuento_count: Number(kRow.con_desc),
      },
      por_sucursal: bySuc.rows.map((r) => ({ sucursal_id: r.sucursal_id, sucursal_nombre: r.sucursal_nombre ?? "Sin sucursal", total: Number(r.total), cnt: Number(r.cnt) })),
      por_usuario:  byUsr.rows.map((r) => ({ usuario_id: r.usuario_id, usuario_nombre: r.usuario_nombre ?? "Sin usuario", total: Number(r.total), cnt: Number(r.cnt) })),
      por_metodo_pago: byMet.rows.map((r) => ({ metodo_pago: r.metodo_pago, total: Number(r.total), cnt: Number(r.cnt) })),
      ventas: ventas.rows.map((r) => ({
        ...r,
        total: Number(r.total),
        descuento_general: Number(r.descuento_general),
        cant_productos: Number(r.cant_productos),
      })),
      opciones: {
        sucursales: opSuc.rows,
        usuarios: opUsr.rows.map((r) => ({ id: r.id, nombre: r.nombre ?? r.email ?? "—" })),
        metodos_pago: byMet.rows.map((r) => r.metodo_pago).filter(Boolean) as string[],
      },
    }));
  } catch (err) {
    console.error("[/api/reportes/ventas-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
