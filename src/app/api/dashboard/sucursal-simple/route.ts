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
    const comprasT = quoteSchemaTable(schema, "compras");

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

      // Detectamos si el tenant tiene ventas.sucursal_id + ventas.estado + cliente_nombre.
      // Algunos esquemas viejos no las tienen — degradamos sin fallar.
      const colsQ = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'ventas'`,
        [schema],
      );
      const ventaCols = new Set(colsQ.rows.map((r) => r.column_name));
      const filtroSucursal = ventaCols.has("sucursal_id") ? "AND sucursal_id = $2" : "";
      const filtroEstado = ventaCols.has("estado") ? "AND (estado IS NULL OR estado <> 'anulada')" : "";
      const selectClienteNombre = ventaCols.has("cliente_nombre") ? "cliente_nombre" : "NULL::text AS cliente_nombre";
      const selectNumeroControl = ventaCols.has("numero_control") ? "numero_control" : "NULL::text AS numero_control";
      const paramsBase: unknown[] = ventaCols.has("sucursal_id")
        ? [auth.empresa_id, auth.sucursal_id]
        : [auth.empresa_id];

      // Ventas hoy + mes + comparativas temporales (fase 2 tanda 16).
      // - hoy vs ayer
      // - hoy vs mismo día de la semana pasada
      // - mes actual vs mes anterior (mismo rango de días transcurridos)
      // - media diaria últimos 7 días vs media diaria mismo día
      const ventasStatsQ = await client.query<{
        total_hoy: string; count_hoy: string;
        total_ayer: string;
        total_mismo_dia_sem_pasada: string;
        total_mes: string; count_mes: string;
        total_mes_prev: string; count_mes_prev: string;
        total_mes_prev_hasta_hoy: string;
        total_ultimos_7: string;
        ticket_prom_mes: string; ticket_prom_mes_prev: string;
      }>(
        `SELECT
           COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE THEN total ELSE 0 END),0)::text AS total_hoy,
           COUNT(*) FILTER (WHERE fecha::date = CURRENT_DATE)::text AS count_hoy,
           COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE - interval '1 day' THEN total ELSE 0 END),0)::text AS total_ayer,
           COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE - interval '7 days' THEN total ELSE 0 END),0)::text AS total_mismo_dia_sem_pasada,
           COALESCE(SUM(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END),0)::text AS total_mes,
           COUNT(*) FILTER (WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE))::text AS count_mes,
           COALESCE(SUM(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - interval '1 month') THEN total ELSE 0 END),0)::text AS total_mes_prev,
           COUNT(*) FILTER (WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - interval '1 month'))::text AS count_mes_prev,
           -- mes anterior hasta el mismo día del mes (rango justo comparable)
           COALESCE(SUM(CASE
             WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - interval '1 month')
              AND fecha::date <= (CURRENT_DATE - interval '1 month')::date
             THEN total ELSE 0 END),0)::text AS total_mes_prev_hasta_hoy,
           COALESCE(SUM(CASE WHEN fecha::date >= CURRENT_DATE - interval '7 days'
                              AND fecha::date <  CURRENT_DATE THEN total ELSE 0 END),0)::text AS total_ultimos_7,
           COALESCE(AVG(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE) THEN total END),0)::text AS ticket_prom_mes,
           COALESCE(AVG(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - interval '1 month') THEN total END),0)::text AS ticket_prom_mes_prev
         FROM ${ventasT}
         WHERE empresa_id = $1 ${filtroSucursal} ${filtroEstado}`,
        paramsBase,
      );
      const vs = ventasStatsQ.rows[0];

      // Últimas 10 ventas.
      const ultimasQ = await client.query<{
        id: string; fecha: string; total: string;
        numero_control: string | null; cliente_nombre: string | null;
      }>(
        `SELECT id, fecha, total::text, ${selectNumeroControl}, ${selectClienteNombre}
         FROM ${ventasT}
         WHERE empresa_id = $1 ${filtroSucursal} ${filtroEstado}
         ORDER BY fecha DESC LIMIT 10`,
        paramsBase,
      );

      // Clientes: total con al menos 1 venta en esta sucursal + últimos atendidos.
      const clientesStatsQ = await client.query<{ total_atendidos: string }>(
        `SELECT COUNT(DISTINCT cliente_id)::text AS total_atendidos
         FROM ${ventasT}
         WHERE empresa_id = $1 ${filtroSucursal} AND cliente_id IS NOT NULL`,
        paramsBase,
      );

      // Detectamos también los campos de clientes que podamos usar.
      const clienteColsQ = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'clientes'`,
        [schema],
      );
      const clienteCols = new Set(clienteColsQ.rows.map((r) => r.column_name));
      const selNombre = clienteCols.has("nombre_contacto")
        ? "MAX(c.nombre_contacto)"
        : clienteCols.has("nombre") ? "MAX(c.nombre)" : "NULL::text";
      const selEmpresa = clienteCols.has("empresa") ? "MAX(c.empresa)" : "NULL::text";
      const selTelefono = clienteCols.has("telefono") ? "MAX(c.telefono)" : "NULL::text";

      // Filtros calificados con alias v. para el JOIN con clientes (donde
      // algunas columnas se llaman igual en ambas tablas — 'estado' colisiona).
      const filtroSucursalV = ventaCols.has("sucursal_id") ? "AND v.sucursal_id = $2" : "";
      const filtroEstadoV = ventaCols.has("estado") ? "AND (v.estado IS NULL OR v.estado <> 'anulada')" : "";
      const ultimosClientesQ = await client.query<{
        cliente_id: string; nombre: string | null; empresa: string | null;
        telefono: string | null; ultima_fecha: string; total_gastado: string;
      }>(
        `SELECT v.cliente_id,
                ${selNombre} AS nombre,
                ${selEmpresa} AS empresa,
                ${selTelefono} AS telefono,
                MAX(v.fecha) AS ultima_fecha,
                COALESCE(SUM(v.total),0)::text AS total_gastado
         FROM ${ventasT} v
         LEFT JOIN ${clientesT} c ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
         WHERE v.empresa_id = $1 ${filtroSucursalV} ${filtroEstadoV}
           AND v.cliente_id IS NOT NULL
         GROUP BY v.cliente_id
         ORDER BY MAX(v.fecha) DESC
         LIMIT 10`,
        paramsBase,
      );

      // Compras del día / mes — best effort. Si el schema no tiene columna
      // sucursal_id en compras, no filtramos; devolvemos totales de empresa.
      let comprasHoy = 0, comprasMes = 0, countComprasHoy = 0, countComprasMes = 0;
      try {
        const cCols = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'compras'`,
          [schema],
        );
        const compraColSet = new Set(cCols.rows.map((r) => r.column_name));
        const compraTieneSucursal = compraColSet.has("sucursal_id");
        const filtroSucC = compraTieneSucursal ? "AND sucursal_id = $2" : "";
        const paramsC: unknown[] = compraTieneSucursal
          ? [auth.empresa_id, auth.sucursal_id]
          : [auth.empresa_id];
        const filtroEstadoC = compraColSet.has("estado") ? "AND (estado IS NULL OR estado <> 'anulada')" : "";
        const compraStatsQ = await client.query<{
          total_hoy: string; count_hoy: string;
          total_mes: string; count_mes: string;
        }>(
          `SELECT
             COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE THEN total ELSE 0 END),0)::text AS total_hoy,
             COUNT(*) FILTER (WHERE fecha::date = CURRENT_DATE)::text AS count_hoy,
             COALESCE(SUM(CASE WHEN date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END),0)::text AS total_mes,
             COUNT(*) FILTER (WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE))::text AS count_mes
           FROM ${comprasT}
           WHERE empresa_id = $1 ${filtroSucC} ${filtroEstadoC}`,
          paramsC,
        );
        const cs = compraStatsQ.rows[0];
        comprasHoy = Number(cs?.total_hoy ?? 0);
        comprasMes = Number(cs?.total_mes ?? 0);
        countComprasHoy = Number(cs?.count_hoy ?? 0);
        countComprasMes = Number(cs?.count_mes ?? 0);
      } catch { /* sin tabla compras — degradamos a 0 */ }

      return NextResponse.json(successResponse({
        sucursal: {
          id: auth.sucursal_id,
          nombre: sucursalNombre,
        },
        compras: {
          total_hoy: comprasHoy,
          total_mes: comprasMes,
          count_hoy: countComprasHoy,
          count_mes: countComprasMes,
        },
        ventas: {
          total_hoy: Number(vs?.total_hoy ?? 0),
          count_hoy: Number(vs?.count_hoy ?? 0),
          total_mes: Number(vs?.total_mes ?? 0),
          count_mes: Number(vs?.count_mes ?? 0),
          total_mes_prev: Number(vs?.total_mes_prev ?? 0),
          count_mes_prev: Number(vs?.count_mes_prev ?? 0),
          // Comparativas temporales (fase 2 tanda 16)
          total_ayer: Number(vs?.total_ayer ?? 0),
          total_mismo_dia_sem_pasada: Number(vs?.total_mismo_dia_sem_pasada ?? 0),
          total_mes_prev_hasta_hoy: Number(vs?.total_mes_prev_hasta_hoy ?? 0),
          total_ultimos_7: Number(vs?.total_ultimos_7 ?? 0),
          ticket_prom_mes: Number(vs?.ticket_prom_mes ?? 0),
          ticket_prom_mes_prev: Number(vs?.ticket_prom_mes_prev ?? 0),
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
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[/api/dashboard/sucursal-simple]", msg, err);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
