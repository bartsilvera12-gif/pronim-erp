import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/sucursal-simple
 *
 * Dashboard reducido para usuarios NO admin (con sucursal_id fija). Devuelve
 * sólo métricas de la propia sucursal:
 *   - Ventas de hoy (Gs. + cantidad)
 *   - Ventas del mes en curso (Gs. + cantidad)
 *   - Últimas 10 ventas
 *   - Clientes atendidos por esta sucursal (últimos 10 + total)
 *
 * Si el usuario NO tiene sucursal (admin/super), devuelve 403 — usen el
 * dashboard completo.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!auth.sucursal_id) {
      return NextResponse.json(errorResponse("Este dashboard es solo para usuarios de sucursal."), { status: 403 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const ventasT = quoteSchemaTable(schema, "ventas");
    const clientesT = quoteSchemaTable(schema, "clientes");
    const sucursalesT = quoteSchemaTable(schema, "sucursales");

    const client = await pool.connect();
    try {
      // Nombre de sucursal (best-effort).
      let sucursalNombre: string | null = null;
      try {
        const s = await client.query<{ nombre: string }>(
          `SELECT nombre FROM ${sucursalesT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
          [auth.sucursal_id, auth.empresa_id],
        );
        sucursalNombre = s.rows[0]?.nombre ?? null;
      } catch { /* schema sin sucursales — ok */ }

      // Ventas hoy + mes (misma query).
      const ventasStatsQ = await client.query<{
        total_hoy: string; count_hoy: string;
        total_mes: string; count_mes: string;
        total_mes_prev: string; count_mes_prev: string;
      }>(
        `SELECT
           COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE THEN total ELSE 0 END),0)::text AS total_hoy,
           COUNT(*) FILTER (WHERE fecha::date = CURRENT_DATE)::text AS count_hoy,
           COALESCE(SUM(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END),0)::text AS total_mes,
           COUNT(*) FILTER (WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE))::text AS count_mes,
           COALESCE(SUM(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - interval '1 month') THEN total ELSE 0 END),0)::text AS total_mes_prev,
           COUNT(*) FILTER (WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - interval '1 month'))::text AS count_mes_prev
         FROM ${ventasT}
         WHERE empresa_id = $1 AND sucursal_id = $2 AND (estado IS NULL OR estado <> 'anulada')`,
        [auth.empresa_id, auth.sucursal_id],
      );
      const vs = ventasStatsQ.rows[0];

      // Últimas 10 ventas.
      const ultimasQ = await client.query<{
        id: string; fecha: string; total: string;
        numero_control: string | null; cliente_nombre: string | null;
      }>(
        `SELECT id, fecha, total::text, numero_control, cliente_nombre
         FROM ${ventasT}
         WHERE empresa_id = $1 AND sucursal_id = $2 AND (estado IS NULL OR estado <> 'anulada')
         ORDER BY fecha DESC LIMIT 10`,
        [auth.empresa_id, auth.sucursal_id],
      );

      // Clientes: total con al menos 1 venta en esta sucursal + últimos atendidos.
      const clientesStatsQ = await client.query<{ total_atendidos: string }>(
        `SELECT COUNT(DISTINCT cliente_id)::text AS total_atendidos
         FROM ${ventasT}
         WHERE empresa_id = $1 AND sucursal_id = $2 AND cliente_id IS NOT NULL`,
        [auth.empresa_id, auth.sucursal_id],
      );

      const ultimosClientesQ = await client.query<{
        cliente_id: string; nombre: string | null; empresa: string | null;
        telefono: string | null; ultima_fecha: string; total_gastado: string;
      }>(
        `SELECT v.cliente_id,
                MAX(c.nombre_contacto) AS nombre,
                MAX(c.empresa) AS empresa,
                MAX(c.telefono) AS telefono,
                MAX(v.fecha) AS ultima_fecha,
                COALESCE(SUM(v.total),0)::text AS total_gastado
         FROM ${ventasT} v
         LEFT JOIN ${clientesT} c ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
         WHERE v.empresa_id = $1 AND v.sucursal_id = $2 AND v.cliente_id IS NOT NULL
           AND (v.estado IS NULL OR v.estado <> 'anulada')
         GROUP BY v.cliente_id
         ORDER BY MAX(v.fecha) DESC
         LIMIT 10`,
        [auth.empresa_id, auth.sucursal_id],
      );

      return NextResponse.json(successResponse({
        sucursal: {
          id: auth.sucursal_id,
          nombre: sucursalNombre,
        },
        ventas: {
          total_hoy: Number(vs?.total_hoy ?? 0),
          count_hoy: Number(vs?.count_hoy ?? 0),
          total_mes: Number(vs?.total_mes ?? 0),
          count_mes: Number(vs?.count_mes ?? 0),
          total_mes_prev: Number(vs?.total_mes_prev ?? 0),
          count_mes_prev: Number(vs?.count_mes_prev ?? 0),
          ultimas: ultimasQ.rows.map((r) => ({
            id: r.id, fecha: r.fecha,
            total: Number(r.total),
            numero_control: r.numero_control,
            cliente_nombre: r.cliente_nombre,
          })),
        },
        clientes: {
          total_atendidos: Number(clientesStatsQ.rows[0]?.total_atendidos ?? 0),
          recientes: ultimosClientesQ.rows.map((r) => ({
            id: r.cliente_id,
            nombre: r.empresa || r.nombre || "Cliente",
            telefono: r.telefono,
            ultima_fecha: r.ultima_fecha,
            total_gastado: Number(r.total_gastado),
          })),
        },
      }));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/dashboard/sucursal-simple]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
