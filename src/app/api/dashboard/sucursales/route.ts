import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

// El endpoint arma ~10 queries agregadas contra tablas grandes; con el
// volumen de la empresa puede tardar más que los 10s default de Vercel.
// 60s es el máximo del plan actual y evita los HTTP 502 por timeout.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/sucursales?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal_id=...
 *
 * Dashboard OPERATIVO y trazable. Todo se agrega server-side. Ver
 * `docs/dashboards-formulas.md` para el detalle de cada KPI.
 *
 * Secciones devueltas:
 *   - `flujo`        — visitas, únicos, nuevos, recurrentes, mix
 *   - `recepciones`  — prendas, subtotal, ajustes, total_final, evaluadores
 *   - `credito`      — generado, usado, tiempo prom, sin volver
 *   - `inventario`   — ingresos, salidas, stock, antigüedad aprox
 *   - `ventas`       — ticket, pagos, promos, cambios, anulaciones, evolución
 *   - `sucursales`   — tabla comparativa
 *   - `totales`      — resumen general
 *   - `tipos_prenda` — ranking mix
 *
 * Alcance:
 *   - admin ⇒ ve todas; puede filtrar por sucursal_id.
 *   - usuario con sucursal fija ⇒ solo la suya (ignora sucursal_id del query).
 */
export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || todayMinus(30);
    const hasta = url.searchParams.get("hasta") || todayISO();
    const sucursalFiltroRaw = url.searchParams.get("sucursal_id");

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const scopedSucursal = auth.sucursal_id ?? null;
    const sucursalFiltro = esAdmin
      ? (sucursalFiltroRaw && sucursalFiltroRaw.trim() !== "" ? sucursalFiltroRaw : null)
      : scopedSucursal;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const sucT = quoteSchemaTable(schema, "sucursales");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const ventasItT = quoteSchemaTable(schema, "ventas_items");
    const pagoDetT = quoteSchemaTable(schema, "ventas_pagos_detalle");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const stockT = quoteSchemaTable(schema, "producto_stock_sucursal");
    const prodT = quoteSchemaTable(schema, "productos");
    const cajasT = quoteSchemaTable(schema, "cajas");
    const metasT = quoteSchemaTable(schema, "metas_sucursal");
    const tiposT = quoteSchemaTable(schema, "tipos_prenda");
    const cambiosT = quoteSchemaTable(schema, "cambios");
    const credMovT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const credConT = quoteSchemaTable(schema, "cliente_creditos_consumos");
    const promoAplT = quoteSchemaTable(schema, "promocion_aplicaciones");
    const eventosT = quoteSchemaTable(schema, "cliente_eventos");
    const movInvT = quoteSchemaTable(schema, "movimientos_inventario");

    const client = await pool.connect();
    try {
      const args: unknown[] = [auth.empresa_id, desde, hasta];
      // Si viene sucursal_id, se aplica en las CTEs de visitas y en la tabla por sucursal.
      const sucCondV = sucursalFiltro ? "AND v.sucursal_id = $4" : "";
      const sucCondR = sucursalFiltro ? "AND r.sucursal_id = $4" : "";
      const sucCondC = sucursalFiltro ? "AND c.sucursal_id = $4" : "";
      const sucRowClause = sucursalFiltro ? "AND s.id = $4" : "";
      if (sucursalFiltro) args.push(sucursalFiltro);

      // ═════ 1) CTE canónico de visitas — ver docs/dashboards-formulas.md ═════
      // Se materializa una TEMP TABLE por sesión para no re-ejecutar los 3
      // UNIONs en cada query subsiguiente. La droppeamos al inicio porque
      // el pool reutiliza clients (el `ON COMMIT DROP` solo aplica dentro
      // de una tx explícita; sin BEGIN, la temp table persiste hasta que
      // el client vuelve al pool).
      await client.query(`DROP TABLE IF EXISTS _visitas`);
      await client.query(
        `CREATE TEMP TABLE _visitas AS
         WITH visitas_all AS (
           SELECT c.id AS visita_id, c.cliente_id, c.sucursal_id,
                  COALESCE(r.fecha, v.fecha) AS fecha,
                  'trae_lleva'::text AS tipo
           FROM ${cambiosT} c
           LEFT JOIN ${recepT} r ON r.id = c.recepcion_id
           LEFT JOIN ${ventasT} v ON v.id = c.venta_id
           WHERE c.empresa_id = $1 AND c.estado = 'confirmado'
             AND (r.id IS NULL OR r.estado <> 'anulada')
             AND (v.id IS NULL OR v.estado <> 'anulada')
             ${sucCondC}
           UNION ALL
           SELECT r.id, r.cliente_id, r.sucursal_id, r.fecha, 'solo_trae'
           FROM ${recepT} r
           WHERE r.empresa_id = $1 AND r.estado <> 'anulada' AND r.cambio_id IS NULL
             ${sucCondR}
           UNION ALL
           SELECT v.id, v.cliente_id, v.sucursal_id, v.fecha, 'solo_lleva'
           FROM ${ventasT} v
           WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada') AND v.cambio_id IS NULL
             ${sucCondV}
         )
         SELECT * FROM visitas_all
         WHERE fecha::date BETWEEN $2 AND $3`,
        args,
      );
      // Nota: ON COMMIT DROP + BEGIN implícito por transactional pool
      // ⇒ para forzar el scope de la temp table, envolvemos en BEGIN/COMMIT.
      // Alternativa: usar CTE inline en cada query. Elegimos temp table por
      // legibilidad y para evitar re-ejecutar los 3 UNIONs muchas veces.
      // Como el pg client no auto-envuelve en BEGIN, la temp table vive
      // hasta que se cierra la sesión del client. Como release() la devuelve
      // al pool, hacemos DROP manual al final del try.

      // ═════ 2) FLUJO DE ATENCIÓN ═════
      const flujoQ = await client.query<{
        visitas: string; unicos: string; nuevos: string; recurrentes: string;
        solo_trae: string; solo_lleva: string; trae_lleva: string;
        prendas_por_visita_prom: string | null;
      }>(
        `WITH primera_visita AS (
           SELECT cliente_id, MIN(fecha) AS primera
           FROM (
             -- cambios: cliente_id y fecha vienen del cambio + recepción
             SELECT c.cliente_id AS cliente_id, COALESCE(r.fecha, v.fecha) AS fecha
             FROM ${cambiosT} c
             LEFT JOIN ${recepT} r ON r.id = c.recepcion_id
             LEFT JOIN ${ventasT} v ON v.id = c.venta_id
             WHERE c.empresa_id = $1 AND c.estado = 'confirmado' AND c.cliente_id IS NOT NULL
             UNION ALL
             SELECT r2.cliente_id, r2.fecha FROM ${recepT} r2
             WHERE r2.empresa_id = $1 AND r2.estado <> 'anulada' AND r2.cambio_id IS NULL AND r2.cliente_id IS NOT NULL
             UNION ALL
             SELECT v2.cliente_id, v2.fecha FROM ${ventasT} v2
             WHERE v2.empresa_id = $1 AND v2.estado IN ('pendiente','completada') AND v2.cambio_id IS NULL AND v2.cliente_id IS NOT NULL
           ) x
           GROUP BY cliente_id
         ),
         visitas_por_cli AS (
           SELECT cliente_id, COUNT(*) AS n
           FROM _visitas
           WHERE cliente_id IS NOT NULL
           GROUP BY cliente_id
         ),
         prendas_por_recep_visita AS (
           SELECT v.visita_id, COALESCE(SUM(i.cantidad), 0) AS cant
           FROM _visitas v
           LEFT JOIN ${recepT} r ON r.id = v.visita_id OR r.cambio_id = v.visita_id
           LEFT JOIN ${recepItT} i ON i.recepcion_id = r.id
           WHERE r.id IS NOT NULL
           GROUP BY v.visita_id
         )
         SELECT
           (SELECT COUNT(*) FROM _visitas)::text AS visitas,
           (SELECT COUNT(DISTINCT cliente_id) FROM _visitas WHERE cliente_id IS NOT NULL)::text AS unicos,
           (SELECT COUNT(*) FROM primera_visita
              WHERE primera::date BETWEEN $2 AND $3)::text AS nuevos,
           (SELECT COUNT(*) FROM visitas_por_cli WHERE n >= 2)::text AS recurrentes,
           (SELECT COUNT(*) FROM _visitas WHERE tipo = 'solo_trae')::text AS solo_trae,
           (SELECT COUNT(*) FROM _visitas WHERE tipo = 'solo_lleva')::text AS solo_lleva,
           (SELECT COUNT(*) FROM _visitas WHERE tipo = 'trae_lleva')::text AS trae_lleva,
           (SELECT (SUM(cant)::numeric / NULLIF(COUNT(*), 0))::text
              FROM prendas_por_recep_visita)::text AS prendas_por_visita_prom`,
        [auth.empresa_id, desde, hasta],
      );
      const flujo = flujoQ.rows[0];

      // ═════ 3) Días y horarios de mayor atención ═════
      const dowQ = await client.query<{ dow: string; n: string }>(
        `SELECT EXTRACT(DOW FROM fecha)::text AS dow, COUNT(*)::text AS n
         FROM _visitas GROUP BY 1 ORDER BY 1`,
      );
      const horaQ = await client.query<{ hora: string; n: string }>(
        `SELECT EXTRACT(HOUR FROM fecha)::text AS hora, COUNT(*)::text AS n
         FROM _visitas GROUP BY 1 ORDER BY 1`,
      );

      // Días entre visitas promedio (LAG por cliente)
      const cadenciaQ = await client.query<{ prom_dias: string | null }>(
        `WITH orden AS (
           SELECT cliente_id, fecha,
                  LAG(fecha) OVER (PARTITION BY cliente_id ORDER BY fecha) AS prev
           FROM _visitas WHERE cliente_id IS NOT NULL
         )
         SELECT AVG(EXTRACT(EPOCH FROM (fecha - prev)) / 86400)::text AS prom_dias
         FROM orden WHERE prev IS NOT NULL`,
      );

      // ═════ 4) RECEPCIONES / EVALUACIONES ═════
      const recepQ = await client.query<{
        prendas: string; recepciones: string;
        subtotal_evaluado: string; ajuste_positivo: string; ajuste_negativo: string;
        total_final: string; eval_prom_prenda: string | null;
      }>(
        `WITH recep_p AS (
           SELECT id, subtotal_evaluado, ajuste_evaluacion, total_final
           FROM ${recepT}
           WHERE empresa_id = $1 AND estado <> 'anulada'
             AND fecha::date BETWEEN $2 AND $3
             ${sucursalFiltro ? "AND sucursal_id = $4" : ""}
         ),
         items_p AS (
           SELECT SUM(i.cantidad) AS prendas
           FROM ${recepItT} i JOIN recep_p r ON r.id = i.recepcion_id
         )
         SELECT
           COALESCE((SELECT prendas FROM items_p), 0)::text AS prendas,
           (SELECT COUNT(*) FROM recep_p)::text AS recepciones,
           COALESCE((SELECT SUM(subtotal_evaluado) FROM recep_p), 0)::text AS subtotal_evaluado,
           COALESCE((SELECT SUM(ajuste_evaluacion) FROM recep_p WHERE ajuste_evaluacion > 0), 0)::text AS ajuste_positivo,
           COALESCE((SELECT SUM(ajuste_evaluacion) FROM recep_p WHERE ajuste_evaluacion < 0), 0)::text AS ajuste_negativo,
           COALESCE((SELECT SUM(total_final) FROM recep_p), 0)::text AS total_final,
           (SELECT (SUM(total_final)::numeric / NULLIF(SUM(i.cantidad), 0))::text
              FROM recep_p r JOIN ${recepItT} i ON i.recepcion_id = r.id) AS eval_prom_prenda`,
        args,
      );
      const recep = recepQ.rows[0];

      // Operadores evaluadores
      const evaluadoresQ = await client.query<{
        usuario: string | null; recepciones: string; total_final: string;
      }>(
        `SELECT COALESCE(usuario_nombre, '(sin nombre)') AS usuario,
                COUNT(*)::text AS recepciones,
                COALESCE(SUM(total_final), 0)::text AS total_final
         FROM ${recepT}
         WHERE empresa_id = $1 AND estado <> 'anulada'
           AND fecha::date BETWEEN $2 AND $3
           ${sucursalFiltro ? "AND sucursal_id = $4" : ""}
         GROUP BY usuario_nombre
         ORDER BY SUM(total_final) DESC NULLS LAST
         LIMIT 10`,
        args,
      );

      // ═════ 5) CRÉDITO ═════
      const creditoQ = await client.query<{
        generado: string; usado: string;
        ventas_100_credito: string; ventas_mixto: string;
        tiempo_gen_uso_dias_prom: string | null;
        clientes_con_credito_sin_volver: string;
      }>(
        `WITH ventas_p AS (
           SELECT v.id, v.total,
                  COALESCE((
                    SELECT SUM(m.monto)
                    FROM ${credMovT} m
                    WHERE m.tipo='SALIDA' AND m.origen='venta' AND m.referencia_id = v.id
                  ), 0) AS credito_usado,
                  COALESCE((
                    SELECT SUM(monto) FROM ${pagoDetT}
                    WHERE venta_id = v.id AND direccion='ingreso'
                  ), 0) AS pagos_inmediatos
           FROM ${ventasT} v
           WHERE v.empresa_id = $1
             AND v.estado IN ('pendiente','completada')
             AND v.fecha::date BETWEEN $2 AND $3
             ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
         )
         SELECT
           COALESCE((
             SELECT SUM(monto) FROM ${credMovT}
             WHERE empresa_id = $1 AND tipo='ENTRADA' AND origen='recepcion'
               AND fecha::date BETWEEN $2 AND $3
           ), 0)::text AS generado,
           COALESCE((
             SELECT SUM(monto) FROM ${credMovT}
             WHERE empresa_id = $1 AND tipo='SALIDA' AND origen='venta'
               AND fecha::date BETWEEN $2 AND $3
           ), 0)::text AS usado,
           (SELECT COUNT(*) FROM ventas_p
              WHERE credito_usado >= total - 2 AND credito_usado > 0)::text AS ventas_100_credito,
           (SELECT COUNT(*) FROM ventas_p
              WHERE credito_usado > 0 AND pagos_inmediatos > 0)::text AS ventas_mixto,
           (SELECT AVG(EXTRACT(EPOCH FROM (ms.fecha - me.fecha)) / 86400)::text
              FROM ${credConT} cc
              JOIN ${credMovT} me ON me.id = cc.entrada_id
              JOIN ${credMovT} ms ON ms.id = cc.salida_id
              WHERE ms.origen = 'venta'
                AND ms.fecha::date BETWEEN $2 AND $3) AS tiempo_gen_uso_dias_prom,
           (SELECT COUNT(*) FROM (
              SELECT cliente_id,
                     COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                                       WHEN tipo='SALIDA' THEN -monto
                                       WHEN tipo='AJUSTE' THEN monto ELSE 0 END), 0) AS saldo,
                     COALESCE(MAX(fecha), 'epoch') AS ult_mov
              FROM ${credMovT}
              WHERE empresa_id = $1
              GROUP BY cliente_id
           ) x WHERE saldo > 0 AND ult_mov < now() - interval '30 days')::text
              AS clientes_con_credito_sin_volver`,
        args,
      );
      const credito = creditoQ.rows[0];

      // ═════ 6) INVENTARIO ═════
      const invQ = await client.query<{
        prendas_entradas: string; prendas_salidas: string;
        stock_actual: string;
      }>(
        `SELECT
           COALESCE((
             SELECT SUM(cantidad) FROM ${movInvT}
             WHERE empresa_id = $1 AND tipo='ENTRADA' AND origen='compra'
               AND fecha::date BETWEEN $2 AND $3
           ), 0)::text AS prendas_entradas,
           COALESCE((
             SELECT SUM(cantidad) FROM ${movInvT}
             WHERE empresa_id = $1 AND tipo='SALIDA' AND origen='venta'
               AND fecha::date BETWEEN $2 AND $3
           ), 0)::text AS prendas_salidas,
           COALESCE((
             SELECT SUM(stock_actual) FROM ${stockT} s
             WHERE ${sucursalFiltro ? "s.sucursal_id = $4" : "TRUE"}
           ), 0)::text AS stock_actual`,
        args,
      );
      const inv = invQ.rows[0];

      // Antigüedad promedio del stock (aprox: para cada producto con stock,
      // días desde la última ENTRADA). Ponderado por stock_actual.
      const antigQ = await client.query<{ antig_dias_prom: string | null }>(
        `WITH pstock AS (
           SELECT ps.producto_id, SUM(ps.stock_actual) AS s
           FROM ${stockT} ps
           ${sucursalFiltro ? "WHERE ps.sucursal_id = $1" : ""}
           GROUP BY ps.producto_id HAVING SUM(ps.stock_actual) > 0
         ),
         ult AS (
           SELECT producto_id, MAX(fecha) AS ultima
           FROM ${movInvT}
           WHERE tipo='ENTRADA' AND origen='compra'
           GROUP BY producto_id
         )
         SELECT (SUM(EXTRACT(EPOCH FROM (now() - u.ultima)) / 86400 * p.s)::numeric
                 / NULLIF(SUM(p.s), 0))::text AS antig_dias_prom
         FROM pstock p LEFT JOIN ult u ON u.producto_id = p.producto_id`,
        sucursalFiltro ? [sucursalFiltro] : [],
      );

      // ═════ 7) VENTAS ═════
      const ventasQ = await client.query<{
        ventas: string; prendas: string; total: string;
        promociones: string; cashback_total: string; descuento_total: string;
        cambios_confirmados: string; anulaciones_venta: string; anulaciones_recep: string;
        costo_total: string;
      }>(
        `SELECT
           COALESCE((
             SELECT COUNT(*) FROM ${ventasT} v
             WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
               AND v.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
           ), 0)::text AS ventas,
           COALESCE((
             SELECT SUM(vi.cantidad) FROM ${ventasItT} vi
             JOIN ${ventasT} v ON v.id = vi.venta_id
             WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
               AND v.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
           ), 0)::text AS prendas,
           COALESCE((
             SELECT SUM(total) FROM ${ventasT} v
             WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
               AND v.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
           ), 0)::text AS total,
           COALESCE((
             SELECT COUNT(*) FROM ${promoAplT} pa
             WHERE pa.empresa_id = $1 AND pa.created_at::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND pa.sucursal_id = $4" : ""}
           ), 0)::text AS promociones,
           COALESCE((
             SELECT SUM(cashback_generado) FROM ${promoAplT} pa
             WHERE pa.empresa_id = $1 AND pa.created_at::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND pa.sucursal_id = $4" : ""}
           ), 0)::text AS cashback_total,
           COALESCE((
             SELECT SUM(descuento_aplicado) FROM ${promoAplT} pa
             WHERE pa.empresa_id = $1 AND pa.created_at::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND pa.sucursal_id = $4" : ""}
           ), 0)::text AS descuento_total,
           COALESCE((
             SELECT COUNT(*) FROM ${cambiosT} c
             WHERE c.empresa_id = $1 AND c.estado = 'confirmado'
               AND c.created_at::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND c.sucursal_id = $4" : ""}
           ), 0)::text AS cambios_confirmados,
           COALESCE((
             SELECT COUNT(*) FROM ${ventasT} v
             WHERE v.empresa_id = $1 AND v.estado = 'anulada'
               AND v.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
           ), 0)::text AS anulaciones_venta,
           COALESCE((
             SELECT COUNT(*) FROM ${recepT} r
             WHERE r.empresa_id = $1 AND r.estado = 'anulada'
               AND r.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND r.sucursal_id = $4" : ""}
           ), 0)::text AS anulaciones_recep,
           -- Costo total de las ventas del período. Basado en el
           -- snapshot ventas_items.costo_unitario_snapshot que se guarda
           -- al crear la venta (viene del WACP del producto). Habilita
           -- el cálculo de margen bruto sin necesidad de recorrer FIFO.
           COALESCE((
             SELECT SUM(vi.cantidad * COALESCE(vi.costo_unitario_snapshot, 0))
             FROM ${ventasItT} vi
             JOIN ${ventasT} v ON v.id = vi.venta_id
             WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
               AND v.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
           ), 0)::text AS costo_total`,
        args,
      );
      const vs = ventasQ.rows[0];

      // Formas de pago (agregado por método)
      const pagosQ = await client.query<{ metodo: string; total: string; ops: string }>(
        `SELECT pd.metodo_pago AS metodo,
                COALESCE(SUM(pd.monto), 0)::text AS total,
                COUNT(*)::text AS ops
         FROM ${pagoDetT} pd
         JOIN ${ventasT} v ON v.id = pd.venta_id
         WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
           AND pd.direccion = 'ingreso'
           AND v.fecha::date BETWEEN $2 AND $3
           ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
         GROUP BY pd.metodo_pago
         ORDER BY SUM(pd.monto) DESC`,
        args,
      );

      // Evolución diaria de ventas (total por día) — usado para el label
      // "Total X en N días" arriba del chart.
      const evolQ = await client.query<{ dia: string; total: string; ops: string }>(
        `SELECT v.fecha::date::text AS dia,
                COALESCE(SUM(v.total), 0)::text AS total,
                COUNT(*)::text AS ops
         FROM ${ventasT} v
         WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
           AND v.fecha::date BETWEEN $2 AND $3
           ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
         GROUP BY v.fecha::date
         ORDER BY 1 ASC`,
        args,
      );

      // Evolución diaria POR SUCURSAL — para pintar una línea por sucursal
      // en el chart con tooltip. Se devuelve JOIN con nombre; el frontend
      // arma el pivot dia×sucursal.
      const evolPorSucQ = await client.query<{
        dia: string; sucursal_id: string; nombre: string; total: string;
      }>(
        `SELECT v.fecha::date::text AS dia,
                v.sucursal_id::text AS sucursal_id,
                s.nombre,
                COALESCE(SUM(v.total), 0)::text AS total
         FROM ${ventasT} v
         JOIN ${sucT} s ON s.id = v.sucursal_id
         WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
           AND v.fecha::date BETWEEN $2 AND $3
           ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
         GROUP BY v.fecha::date, v.sucursal_id, s.nombre
         ORDER BY 1 ASC, s.nombre ASC`,
        args,
      );

      // ═════ 8) SUCURSALES (tabla comparativa) ═════
      const rowsQ = await client.query<{
        sucursal_id: string; nombre: string;
        ventas: string; operaciones: string; ticket_promedio: string;
        clientes_atendidos: string; prendas_vendidas: string;
        prendas_recibidas: string; stock: string;
        cajas_abiertas: string; cajas_cerradas: string;
        meta_diaria: string | null; vendido_periodo: string; dias_periodo: string;
        ventas_prev: string; operaciones_prev: string;
        visitas_suc: string; recurrentes_suc: string;
        credito_gen_suc: string; credito_usado_suc: string;
      }>(
        `WITH periodo AS (
           SELECT $2::date AS desde, $3::date AS hasta,
                  ($3::date - $2::date + 1) AS dias
         ),
         prev AS (
           SELECT (desde - dias)::date AS desde, (desde - 1)::date AS hasta
           FROM periodo
         ),
         ventas_periodo AS (
           SELECT v.sucursal_id, v.total, v.cliente_id, v.id
           FROM ${ventasT} v
           WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
             AND v.fecha::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
         ),
         ventas_prev AS (
           SELECT v.sucursal_id, v.total
           FROM ${ventasT} v
           WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
             AND v.fecha::date BETWEEN (SELECT desde FROM prev) AND (SELECT hasta FROM prev)
         ),
         recep_periodo AS (
           SELECT r.id, r.sucursal_id, r.cliente_id
           FROM ${recepT} r
           WHERE r.empresa_id = $1 AND r.estado <> 'anulada'
             AND r.fecha::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
         ),
         visitas_por_suc AS (
           SELECT sucursal_id, COUNT(*) AS n,
                  COUNT(*) FILTER (WHERE cliente_id IN (
                    SELECT cliente_id FROM _visitas WHERE cliente_id IS NOT NULL
                    GROUP BY cliente_id HAVING COUNT(*) >= 2
                  )) AS recurrentes
           FROM _visitas
           WHERE sucursal_id IS NOT NULL
           GROUP BY sucursal_id
         ),
         credito_por_suc AS (
           SELECT COALESCE(v.sucursal_id, r.sucursal_id) AS sucursal_id,
                  SUM(CASE WHEN m.tipo='ENTRADA' AND m.origen='recepcion' THEN m.monto ELSE 0 END) AS gen,
                  SUM(CASE WHEN m.tipo='SALIDA' AND m.origen='venta' THEN m.monto ELSE 0 END) AS usado
           FROM ${credMovT} m
           LEFT JOIN ${ventasT} v ON m.origen='venta' AND v.id = m.referencia_id
           LEFT JOIN ${recepT} r ON m.origen='recepcion' AND r.id = m.referencia_id
           WHERE m.empresa_id = $1
             AND m.fecha::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
           GROUP BY COALESCE(v.sucursal_id, r.sucursal_id)
         )
         SELECT
           s.id AS sucursal_id, s.nombre,
           COALESCE((SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id), 0)::text AS ventas,
           COALESCE((SELECT COUNT(*) FROM ventas_periodo WHERE sucursal_id = s.id), 0)::text AS operaciones,
           COALESCE(
             CASE WHEN (SELECT COUNT(*) FROM ventas_periodo WHERE sucursal_id = s.id) > 0
                  THEN (SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id)::numeric /
                       (SELECT COUNT(*) FROM ventas_periodo WHERE sucursal_id = s.id)
                  ELSE 0 END, 0
           )::text AS ticket_promedio,
           COALESCE((
             SELECT COUNT(*) FROM (
               SELECT cliente_id FROM ventas_periodo WHERE sucursal_id = s.id
               UNION
               SELECT cliente_id FROM recep_periodo   WHERE sucursal_id = s.id
             ) u WHERE cliente_id IS NOT NULL
           ), 0)::text AS clientes_atendidos,
           COALESCE((
             SELECT SUM(vi.cantidad) FROM ${ventasItT} vi
             JOIN ventas_periodo v ON v.id = vi.venta_id AND v.sucursal_id = s.id
           ), 0)::text AS prendas_vendidas,
           COALESCE((
             SELECT SUM(ri.cantidad)
             FROM ${recepItT} ri
             JOIN recep_periodo rp ON rp.id = ri.recepcion_id
             WHERE rp.sucursal_id = s.id
           ), 0)::text AS prendas_recibidas,
           COALESCE((SELECT SUM(stock_actual) FROM ${stockT} WHERE sucursal_id = s.id), 0)::text AS stock,
           COALESCE((SELECT COUNT(*) FROM ${cajasT}
             WHERE empresa_id = $1 AND sucursal_id = s.id AND estado = 'abierta'
           ), 0)::text AS cajas_abiertas,
           COALESCE((SELECT COUNT(*) FROM ${cajasT}
             WHERE empresa_id = $1 AND sucursal_id = s.id AND estado = 'cerrada'
               AND fecha_cierre::date BETWEEN (SELECT desde FROM periodo) AND (SELECT hasta FROM periodo)
           ), 0)::text AS cajas_cerradas,
           NULLIF((
             SELECT monto_meta_diaria::text FROM ${metasT}
             WHERE empresa_id = $1 AND sucursal_id = s.id AND activo = true
               AND vigente_desde <= (SELECT hasta FROM periodo)
             ORDER BY vigente_desde DESC LIMIT 1
           ), '')::text AS meta_diaria,
           COALESCE((SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id), 0)::text AS vendido_periodo,
           (SELECT dias FROM periodo)::text AS dias_periodo,
           COALESCE((SELECT SUM(total) FROM ventas_prev WHERE sucursal_id = s.id), 0)::text AS ventas_prev,
           COALESCE((SELECT COUNT(*) FROM ventas_prev WHERE sucursal_id = s.id), 0)::text AS operaciones_prev,
           COALESCE((SELECT n FROM visitas_por_suc WHERE sucursal_id = s.id), 0)::text AS visitas_suc,
           COALESCE((SELECT recurrentes FROM visitas_por_suc WHERE sucursal_id = s.id), 0)::text AS recurrentes_suc,
           COALESCE((SELECT gen FROM credito_por_suc WHERE sucursal_id = s.id), 0)::text AS credito_gen_suc,
           COALESCE((SELECT usado FROM credito_por_suc WHERE sucursal_id = s.id), 0)::text AS credito_usado_suc
         FROM ${sucT} s
         WHERE s.empresa_id = $1 ${sucRowClause}
         ORDER BY (SELECT SUM(total) FROM ventas_periodo WHERE sucursal_id = s.id) DESC NULLS LAST, s.nombre`,
        args,
      );

      // ═════ 9) Tipos de prenda (ranking mix) ═════
      // Prioridad de agrupamiento:
      //   1. tipo_prenda si el ítem lo tiene (categoría curada).
      //   2. franja (producto.nombre) como fallback — así al menos se ve
      //      la distribución por rango de precio en lugar de un genérico
      //      "(sin tipo)" que no aporta nada operativamente.
      const tiposQ = await client.query<{
        tipo_id: string; tipo_nombre: string; cantidad: string;
      }>(
        `SELECT
           COALESCE(t.id::text, 'franja:' || p.id::text, 'sin_tipo') AS tipo_id,
           COALESCE(
             t.nombre,
             CASE WHEN p.nombre IS NOT NULL
                  THEN 'Franja ' || regexp_replace(p.nombre, '^Prenda\\s*-\\s*Categor[ií]a\\s*', '', 'i')
             END,
             '(sin categoría)'
           ) AS tipo_nombre,
           COALESCE(SUM(ri.cantidad), 0)::text AS cantidad
         FROM ${recepItT} ri
         JOIN ${recepT} r ON r.id = ri.recepcion_id
         LEFT JOIN ${tiposT} t ON t.id = ri.tipo_prenda_id
         LEFT JOIN ${prodT} p ON p.id = ri.producto_id
         WHERE r.empresa_id = $1 AND r.estado <> 'anulada'
           AND r.fecha::date BETWEEN $2 AND $3
           ${sucursalFiltro ? "AND r.sucursal_id = $4" : ""}
         GROUP BY t.id, t.nombre, p.id, p.nombre
         ORDER BY SUM(ri.cantidad) DESC NULLS LAST
         LIMIT 20`,
        args,
      );

      // ═════ 10) Beneficios entregados (eventos) ═════
      const beneQ = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${eventosT}
         WHERE empresa_id = $1
           AND tipo IN ('cashback','beneficio','descuento','cambio')
           AND fecha::date BETWEEN $2 AND $3`,
        [auth.empresa_id, desde, hasta],
      );

      // ═════ Cleanup temp table ═════
      await client.query(`DROP TABLE IF EXISTS _visitas`).catch(() => null);

      // ═════ Serialización ═════
      const sucursales = rowsQ.rows.map((r) => ({
        sucursal_id: r.sucursal_id,
        nombre: r.nombre,
        ventas: Number(r.ventas),
        operaciones: Number(r.operaciones),
        ticket_promedio: Math.round(Number(r.ticket_promedio)),
        clientes_atendidos: Number(r.clientes_atendidos),
        prendas_vendidas: Number(r.prendas_vendidas),
        prendas_recibidas: Number(r.prendas_recibidas),
        stock: Number(r.stock),
        cajas_abiertas: Number(r.cajas_abiertas),
        cajas_cerradas: Number(r.cajas_cerradas),
        meta_diaria: r.meta_diaria ? Number(r.meta_diaria) : null,
        vendido_periodo: Number(r.vendido_periodo),
        dias_periodo: Number(r.dias_periodo),
        pct_meta: r.meta_diaria && Number(r.meta_diaria) > 0
          ? Math.round((Number(r.vendido_periodo) / (Number(r.meta_diaria) * Number(r.dias_periodo))) * 100)
          : null,
        ventas_prev: Number(r.ventas_prev),
        operaciones_prev: Number(r.operaciones_prev),
        var_ventas_pct: Number(r.ventas_prev) > 0
          ? Math.round(((Number(r.ventas) - Number(r.ventas_prev)) / Number(r.ventas_prev)) * 100)
          : null,
        visitas: Number(r.visitas_suc),
        recurrentes: Number(r.recurrentes_suc),
        credito_generado: Number(r.credito_gen_suc),
        credito_usado: Number(r.credito_usado_suc),
        conversion_pct: Number(r.visitas_suc) > 0
          ? Math.round((Number(r.operaciones) / Number(r.visitas_suc)) * 100)
          : null,
      }));

      const totales = {
        ventas: sucursales.reduce((s, x) => s + x.ventas, 0),
        operaciones: sucursales.reduce((s, x) => s + x.operaciones, 0),
        prendas_vendidas: sucursales.reduce((s, x) => s + x.prendas_vendidas, 0),
        prendas_recibidas: sucursales.reduce((s, x) => s + x.prendas_recibidas, 0),
        stock: sucursales.reduce((s, x) => s + x.stock, 0),
        clientes_atendidos_aprox: sucursales.reduce((s, x) => s + x.clientes_atendidos, 0),
        cajas_abiertas: sucursales.reduce((s, x) => s + x.cajas_abiertas, 0),
        cajas_cerradas: sucursales.reduce((s, x) => s + x.cajas_cerradas, 0),
        ventas_prev: sucursales.reduce((s, x) => s + x.ventas_prev, 0),
      };

      console.log(`[dashboard/sucursales] ok ms=${Date.now() - t0}`);
      return NextResponse.json(successResponse({
        periodo: { desde, hasta },
        alcance: { es_admin: esAdmin, sucursal_forzada: !esAdmin ? scopedSucursal : null, sucursal_filtro: sucursalFiltro },
        flujo: {
          visitas: Number(flujo.visitas),
          clientes_unicos: Number(flujo.unicos),
          clientes_nuevos: Number(flujo.nuevos),
          clientes_recurrentes: Number(flujo.recurrentes),
          solo_trae: Number(flujo.solo_trae),
          solo_lleva: Number(flujo.solo_lleva),
          trae_lleva: Number(flujo.trae_lleva),
          prendas_por_visita_prom: flujo.prendas_por_visita_prom ? Math.round(Number(flujo.prendas_por_visita_prom) * 10) / 10 : null,
          dias_entre_visitas_prom: cadenciaQ.rows[0]?.prom_dias ? Math.round(Number(cadenciaQ.rows[0].prom_dias)) : null,
          dow: dowQ.rows.map(r => ({ dow: Number(r.dow), n: Number(r.n) })),
          hora: horaQ.rows.map(r => ({ hora: Number(r.hora), n: Number(r.n) })),
        },
        recepciones: {
          prendas: Number(recep.prendas),
          recepciones: Number(recep.recepciones),
          subtotal_evaluado: Number(recep.subtotal_evaluado),
          ajuste_positivo: Number(recep.ajuste_positivo),
          ajuste_negativo: Number(recep.ajuste_negativo),
          total_final: Number(recep.total_final),
          ratio_ajuste_pct: Number(recep.subtotal_evaluado) > 0
            ? Math.round(((Number(recep.ajuste_positivo) + Number(recep.ajuste_negativo)) /
                          Number(recep.subtotal_evaluado)) * 10000) / 100
            : null,
          eval_prom_prenda: recep.eval_prom_prenda ? Math.round(Number(recep.eval_prom_prenda)) : null,
          evaluadores: evaluadoresQ.rows.map(e => ({
            usuario: e.usuario, recepciones: Number(e.recepciones), total_final: Number(e.total_final),
          })),
        },
        credito: {
          generado: Number(credito.generado),
          usado: Number(credito.usado),
          disponible: Math.max(0, Number(credito.generado) - Number(credito.usado)),
          ventas_100_credito: Number(credito.ventas_100_credito),
          ventas_mixto: Number(credito.ventas_mixto),
          tiempo_gen_uso_dias_prom: credito.tiempo_gen_uso_dias_prom ? Math.round(Number(credito.tiempo_gen_uso_dias_prom)) : null,
          clientes_con_credito_sin_volver: Number(credito.clientes_con_credito_sin_volver),
        },
        inventario: {
          prendas_entradas: Number(inv.prendas_entradas),
          prendas_salidas: Number(inv.prendas_salidas),
          diferencia_neta: Number(inv.prendas_entradas) - Number(inv.prendas_salidas),
          stock_actual: Number(inv.stock_actual),
          antig_dias_prom: antigQ.rows[0]?.antig_dias_prom ? Math.round(Number(antigQ.rows[0].antig_dias_prom)) : null,
          rotacion_pct: Number(inv.stock_actual) > 0
            ? Math.round((Number(inv.prendas_salidas) / Number(inv.stock_actual)) * 100)
            : null,
        },
        ventas: {
          cantidad: Number(vs.ventas),
          prendas: Number(vs.prendas),
          total: Number(vs.total),
          costo_total: Math.round(Number(vs.costo_total)),
          margen_bruto: Math.round(Number(vs.total) - Number(vs.costo_total)),
          margen_pct: Number(vs.total) > 0
            ? Math.round(((Number(vs.total) - Number(vs.costo_total)) / Number(vs.total)) * 1000) / 10
            : null,
          ticket_promedio: Number(vs.ventas) > 0 ? Math.round(Number(vs.total) / Number(vs.ventas)) : 0,
          prendas_por_venta_prom: Number(vs.ventas) > 0
            ? Math.round((Number(vs.prendas) / Number(vs.ventas)) * 10) / 10 : null,
          promociones_aplicadas: Number(vs.promociones),
          cashback_total: Number(vs.cashback_total),
          descuento_total: Number(vs.descuento_total),
          beneficios_entregados: Number(beneQ.rows[0]?.n ?? 0),
          cambios: Number(vs.cambios_confirmados),
          anulaciones_venta: Number(vs.anulaciones_venta),
          anulaciones_recep: Number(vs.anulaciones_recep),
          pagos: pagosQ.rows.map(p => ({ metodo: p.metodo, total: Number(p.total), ops: Number(p.ops) })),
          evolucion_diaria: evolQ.rows.map(e => ({ dia: e.dia, total: Number(e.total), ops: Number(e.ops) })),
          evolucion_por_sucursal: evolPorSucQ.rows.map(e => ({
            dia: e.dia, sucursal_id: e.sucursal_id, nombre: e.nombre, total: Number(e.total),
          })),
        },
        sucursales,
        totales,
        tipos_prenda: tiposQ.rows.map(t => ({
          tipo_id: t.tipo_id, tipo_nombre: t.tipo_nombre, cantidad: Number(t.cantidad),
        })),
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(`[dashboard/sucursales] FAIL ms=${Date.now() - t0}`, e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
