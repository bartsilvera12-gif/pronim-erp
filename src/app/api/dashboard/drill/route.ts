import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/drill?metric=<slug>&desde=&hasta=&sucursal_id=&cliente_id=&limit=100
 *
 * Endpoint genérico de trazabilidad. Cada `metric` slug corresponde a
 * un KPI del dashboard de Sucursales o Clientes. Devuelve la lista
 * subyacente que compone ese número — respetando el mismo filtro y
 * el mismo scope de permisos que el KPI original.
 *
 * Slugs soportados:
 *   - visitas | visitas_solo_trae | visitas_solo_lleva | visitas_trae_lleva
 *   - prendas_recibidas
 *   - prendas_vendidas
 *   - credito_generado | credito_usado
 *   - clientes_recurrentes | clientes_con_credito_sin_volver
 *   - anulaciones
 *   - tipos_prenda_top
 *
 * Ver `docs/dashboards-formulas.md` para las fórmulas.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const metric = (url.searchParams.get("metric") || "").trim();
    const desde = url.searchParams.get("desde") || todayMinus(30);
    const hasta = url.searchParams.get("hasta") || todayISO();
    const sucursalFiltroRaw = url.searchParams.get("sucursal_id");
    const clienteId = url.searchParams.get("cliente_id");
    const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 100)));

    if (!metric) return NextResponse.json(errorResponse("metric requerido"), { status: 400 });

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const scopedSucursal = auth.sucursal_id ?? null;
    const sucursalFiltro = esAdmin
      ? (sucursalFiltroRaw && sucursalFiltroRaw.trim() !== "" ? sucursalFiltroRaw : null)
      : scopedSucursal;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const ventasT = quoteSchemaTable(schema, "ventas");
    const ventasItT = quoteSchemaTable(schema, "ventas_items");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const cambiosT = quoteSchemaTable(schema, "cambios");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const cliT = quoteSchemaTable(schema, "clientes");
    const sucT = quoteSchemaTable(schema, "sucursales");
    const tiposT = quoteSchemaTable(schema, "tipos_prenda");

    const client = await pool.connect();
    try {
      // Args base compartidos por casi todas las queries.
      const args: unknown[] = [auth.empresa_id, desde, hasta];
      const sucFiltroClause = (col: string) => sucursalFiltro ? `AND ${col} = $4` : "";
      if (sucursalFiltro) args.push(sucursalFiltro);
      const cliClauseIdx = args.length + 1;
      const cliFiltroClause = (col: string) => clienteId ? `AND ${col} = $${cliClauseIdx}` : "";
      if (clienteId) args.push(clienteId);

      let sql = "";
      switch (metric) {
        case "visitas":
        case "visitas_solo_trae":
        case "visitas_solo_lleva":
        case "visitas_trae_lleva": {
          const tipoFiltro =
            metric === "visitas_solo_trae" ? "AND tipo='solo_trae'"
            : metric === "visitas_solo_lleva" ? "AND tipo='solo_lleva'"
            : metric === "visitas_trae_lleva" ? "AND tipo='trae_lleva'"
            : "";
          sql = `
            WITH visitas AS (
              SELECT c.id AS visita_id, c.cliente_id, c.sucursal_id,
                     COALESCE(r.fecha, v.fecha) AS fecha, 'trae_lleva' AS tipo,
                     v.numero_control AS numero_venta, r.numero_control AS numero_recepcion
              FROM ${cambiosT} c
              LEFT JOIN ${recepT} r ON r.id = c.recepcion_id
              LEFT JOIN ${ventasT} v ON v.id = c.venta_id
              WHERE c.empresa_id = $1 AND c.estado = 'confirmado'
                AND (r.id IS NULL OR r.estado <> 'anulada')
                AND (v.id IS NULL OR v.estado <> 'anulada')
                ${sucFiltroClause("c.sucursal_id")}
                ${cliFiltroClause("c.cliente_id")}
              UNION ALL
              SELECT r.id, r.cliente_id, r.sucursal_id, r.fecha, 'solo_trae',
                     NULL, r.numero_control
              FROM ${recepT} r
              WHERE r.empresa_id = $1 AND r.estado <> 'anulada' AND r.cambio_id IS NULL
                ${sucFiltroClause("r.sucursal_id")}
                ${cliFiltroClause("r.cliente_id")}
              UNION ALL
              SELECT v.id, v.cliente_id, v.sucursal_id, v.fecha, 'solo_lleva',
                     v.numero_control, NULL
              FROM ${ventasT} v
              WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada') AND v.cambio_id IS NULL
                ${sucFiltroClause("v.sucursal_id")}
                ${cliFiltroClause("v.cliente_id")}
            )
            SELECT v.visita_id, v.tipo, v.fecha,
                   v.cliente_id,
                   COALESCE(c.nombre_contacto, c.empresa, c.nombre) AS cliente_nombre,
                   v.sucursal_id,
                   s.nombre AS sucursal_nombre,
                   v.numero_venta, v.numero_recepcion
            FROM visitas v
            LEFT JOIN ${cliT} c ON c.id = v.cliente_id
            LEFT JOIN ${sucT} s ON s.id = v.sucursal_id
            WHERE v.fecha::date BETWEEN $2 AND $3 ${tipoFiltro}
            ORDER BY v.fecha DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "prendas_recibidas": {
          sql = `
            SELECT i.id AS item_id, i.recepcion_id, r.numero_control, r.fecha,
                   i.producto_nombre, i.cantidad, i.precio_compra_unitario, i.subtotal,
                   COALESCE(t.nombre, '(sin tipo)') AS tipo_prenda,
                   r.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre,
                   r.sucursal_id, s.nombre AS sucursal_nombre
            FROM ${recepItT} i
            JOIN ${recepT} r ON r.id = i.recepcion_id
            LEFT JOIN ${tiposT} t ON t.id = i.tipo_prenda_id
            LEFT JOIN ${cliT} cli ON cli.id = r.cliente_id
            LEFT JOIN ${sucT} s ON s.id = r.sucursal_id
            WHERE r.empresa_id = $1 AND r.estado <> 'anulada'
              AND r.fecha::date BETWEEN $2 AND $3
              ${sucFiltroClause("r.sucursal_id")}
              ${cliFiltroClause("r.cliente_id")}
            ORDER BY r.fecha DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "prendas_vendidas": {
          sql = `
            SELECT vi.id AS item_id, vi.venta_id, v.numero_control, v.fecha,
                   vi.producto_nombre, vi.cantidad, vi.precio_venta, vi.total_linea,
                   v.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre,
                   v.sucursal_id, s.nombre AS sucursal_nombre
            FROM ${ventasItT} vi
            JOIN ${ventasT} v ON v.id = vi.venta_id
            LEFT JOIN ${cliT} cli ON cli.id = v.cliente_id
            LEFT JOIN ${sucT} s ON s.id = v.sucursal_id
            WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
              AND v.fecha::date BETWEEN $2 AND $3
              ${sucFiltroClause("v.sucursal_id")}
              ${cliFiltroClause("v.cliente_id")}
            ORDER BY v.fecha DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "credito_generado":
        case "credito_usado": {
          const cond = metric === "credito_generado"
            ? `m.tipo='ENTRADA' AND m.origen='recepcion'`
            : `m.tipo='SALIDA' AND m.origen='venta'`;
          sql = `
            SELECT m.id, m.fecha, m.monto, m.origen, m.tipo,
                   m.referencia_id, m.referencia_numero, m.observaciones,
                   m.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre
            FROM ${credT} m
            LEFT JOIN ${cliT} cli ON cli.id = m.cliente_id
            WHERE m.empresa_id = $1 AND ${cond}
              AND m.fecha::date BETWEEN $2 AND $3
              ${cliFiltroClause("m.cliente_id")}
            ORDER BY m.fecha DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "clientes_recurrentes": {
          // Reconstruye visitas y devuelve clientes con >=2 en el período.
          sql = `
            WITH visitas AS (
              SELECT c.cliente_id, COALESCE(r.fecha, v.fecha) AS fecha
              FROM ${cambiosT} c
              LEFT JOIN ${recepT} r ON r.id = c.recepcion_id
              LEFT JOIN ${ventasT} v ON v.id = c.venta_id
              WHERE c.empresa_id = $1 AND c.estado = 'confirmado' AND c.cliente_id IS NOT NULL
                ${sucFiltroClause("c.sucursal_id")}
              UNION ALL
              SELECT r.cliente_id, r.fecha FROM ${recepT} r
              WHERE r.empresa_id = $1 AND r.estado <> 'anulada' AND r.cambio_id IS NULL AND r.cliente_id IS NOT NULL
                ${sucFiltroClause("r.sucursal_id")}
              UNION ALL
              SELECT v.cliente_id, v.fecha FROM ${ventasT} v
              WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada') AND v.cambio_id IS NULL AND v.cliente_id IS NOT NULL
                ${sucFiltroClause("v.sucursal_id")}
            )
            SELECT v.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre,
                   COUNT(*)::int AS visitas,
                   MIN(v.fecha) AS primera_visita_periodo,
                   MAX(v.fecha) AS ultima_visita_periodo
            FROM visitas v
            JOIN ${cliT} cli ON cli.id = v.cliente_id
            WHERE v.fecha::date BETWEEN $2 AND $3
            GROUP BY v.cliente_id, cli.nombre_contacto, cli.empresa, cli.nombre
            HAVING COUNT(*) >= 2
            ORDER BY visitas DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "clientes_con_credito_sin_volver": {
          sql = `
            SELECT m.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre,
                   SUM(CASE WHEN tipo='ENTRADA' THEN monto
                            WHEN tipo='SALIDA' THEN -monto
                            WHEN tipo='AJUSTE' THEN monto ELSE 0 END) AS saldo,
                   MAX(m.fecha) AS ultimo_movimiento
            FROM ${credT} m
            JOIN ${cliT} cli ON cli.id = m.cliente_id
            WHERE m.empresa_id = $1
            GROUP BY m.cliente_id, cli.nombre_contacto, cli.empresa, cli.nombre
            HAVING SUM(CASE WHEN tipo='ENTRADA' THEN monto
                            WHEN tipo='SALIDA' THEN -monto
                            WHEN tipo='AJUSTE' THEN monto ELSE 0 END) > 0
               AND MAX(m.fecha) < now() - interval '30 days'
            ORDER BY saldo DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "anulaciones": {
          sql = `
            SELECT 'venta' AS tipo, v.id, v.numero_control, v.fecha, v.total AS monto,
                   v.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre,
                   v.sucursal_id, s.nombre AS sucursal_nombre
            FROM ${ventasT} v
            LEFT JOIN ${cliT} cli ON cli.id = v.cliente_id
            LEFT JOIN ${sucT} s ON s.id = v.sucursal_id
            WHERE v.empresa_id = $1 AND v.estado = 'anulada'
              AND v.fecha::date BETWEEN $2 AND $3
              ${sucFiltroClause("v.sucursal_id")}
            UNION ALL
            SELECT 'recepcion' AS tipo, r.id, r.numero_control, r.fecha, r.total_final AS monto,
                   r.cliente_id,
                   COALESCE(cli.nombre_contacto, cli.empresa, cli.nombre) AS cliente_nombre,
                   r.sucursal_id, s.nombre AS sucursal_nombre
            FROM ${recepT} r
            LEFT JOIN ${cliT} cli ON cli.id = r.cliente_id
            LEFT JOIN ${sucT} s ON s.id = r.sucursal_id
            WHERE r.empresa_id = $1 AND r.estado = 'anulada'
              AND r.fecha::date BETWEEN $2 AND $3
              ${sucFiltroClause("r.sucursal_id")}
            ORDER BY fecha DESC
            LIMIT ${limit}
          `;
          break;
        }
        case "tipos_prenda_top": {
          sql = `
            SELECT COALESCE(t.id::text, 'sin_tipo') AS tipo_id,
                   COALESCE(t.nombre, '(sin tipo)') AS tipo_nombre,
                   SUM(i.cantidad)::int AS cantidad,
                   COUNT(DISTINCT r.cliente_id)::int AS clientes,
                   COUNT(DISTINCT r.sucursal_id)::int AS sucursales
            FROM ${recepItT} i
            JOIN ${recepT} r ON r.id = i.recepcion_id
            LEFT JOIN ${tiposT} t ON t.id = i.tipo_prenda_id
            WHERE r.empresa_id = $1 AND r.estado <> 'anulada'
              AND r.fecha::date BETWEEN $2 AND $3
              ${sucFiltroClause("r.sucursal_id")}
            GROUP BY t.id, t.nombre
            ORDER BY cantidad DESC
            LIMIT ${limit}
          `;
          break;
        }
        default:
          return NextResponse.json(errorResponse(`metric no soportado: ${metric}`), { status: 400 });
      }

      const r = await client.query(sql, args);
      return NextResponse.json(successResponse({
        metric, periodo: { desde, hasta },
        filas: r.rows, total_filas: r.rows.length,
        hint: `Ver docs/dashboards-formulas.md → sección de ${metric}.`,
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[dashboard/drill]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
