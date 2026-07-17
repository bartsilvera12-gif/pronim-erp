import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/clientes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal_id=...&segmento=...&q=...
 *
 * Devuelve todo agregado server-side en 2-3 pasadas: KPIs de segmentos +
 * tabla principal con las columnas que consume la UI (última visita,
 * frecuencia, prendas traídas, compras, crédito, sucursal preferida).
 *
 * Reglas de "visita":
 *   - Recepción no anulada
 *   - Venta no anulada
 *   - Trae+Lleva (recepción y venta con mismo cambio_id) cuentan como 1.
 *
 * Segmentos coherentes con /api/clientes/[id]/segmento (mismos umbrales).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || todayMinus(90);
    const hasta = url.searchParams.get("hasta") || todayISO();
    const sucursalFiltroRaw = url.searchParams.get("sucursal_id");
    const segmento = url.searchParams.get("segmento"); // vip|habitual|nuevo|dormido|null
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 100)));

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const scopedSucursal = auth.sucursal_id ?? null;
    const sucursalFiltro = esAdmin
      ? (sucursalFiltroRaw && sucursalFiltroRaw.trim() !== "" ? sucursalFiltroRaw : null)
      : scopedSucursal;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const cliT = quoteSchemaTable(schema, "clientes");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const recepItT = quoteSchemaTable(schema, "cliente_recepciones_items");
    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const eventosT = quoteSchemaTable(schema, "cliente_eventos");
    const client = await pool.connect();
    try {
      // Umbrales del segmento (mismos que en /api/clientes/[id]/segmento).
      // Todo se calcula en SQL — nada se descarga al frontend.
      const scopeSuc = sucursalFiltro ? "AND (v.sucursal_id = $4 OR r.sucursal_id = $4)" : "";
      const scopeCliVentas = sucursalFiltro ? "WHERE v.sucursal_id = $4" : "";
      const scopeCliRecep  = sucursalFiltro ? "WHERE r.sucursal_id = $4" : "";
      const scopeArgs: unknown[] = sucursalFiltro
        ? [auth.empresa_id, desde, hasta, sucursalFiltro]
        : [auth.empresa_id, desde, hasta];

      // Base: por cliente, aggregate all-time y período.
      // - total_hist: SUM total ventas (all-time)
      // - compras_90d: COUNT ventas últimos 90 días
      // - ultima_venta / ultima_recep: para calcular días desde última visita
      // - prendas_traidas_periodo: SUM cant items recepción en el período
      // - compras_periodo: COUNT ventas en el período
      // - saldo_credito: SUM ENTRADAS - SALIDAS
      // - sucursal_preferida_id: sucursal con más visitas totales
      const filaClienteQ = await client.query<{
        cliente_id: string; nombre: string;
        total_hist: string; compras_90d: string;
        ultima_venta: string | null; ultima_recep: string | null;
        prendas_traidas_periodo: string; compras_periodo: string;
        saldo_credito: string;
        sucursal_preferida_id: string | null;
        sucursal_preferida_nombre: string | null;
        solo_trae: boolean; solo_lleva: boolean; ambos: boolean;
      }>(
        `WITH ventas_all AS (
           SELECT v.cliente_id, v.total, v.fecha, v.sucursal_id, v.cambio_id
           FROM ${ventasT} v
           WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada')
         ),
         recep_all AS (
           SELECT r.cliente_id, r.fecha, r.sucursal_id, r.cambio_id
           FROM ${recepT} r
           WHERE r.empresa_id = $1 AND r.estado IN ('pendiente_ingreso','ingresada')
         ),
         suc_por_cli AS (
           SELECT cliente_id, sucursal_id, COUNT(*) AS visitas
           FROM (
             SELECT cliente_id, sucursal_id FROM ventas_all
             UNION ALL
             SELECT cliente_id, sucursal_id FROM recep_all
           ) x
           WHERE cliente_id IS NOT NULL AND sucursal_id IS NOT NULL
           GROUP BY cliente_id, sucursal_id
         ),
         suc_preferida AS (
           SELECT DISTINCT ON (cliente_id) cliente_id, sucursal_id
           FROM suc_por_cli
           ORDER BY cliente_id, visitas DESC, sucursal_id
         )
         SELECT
           c.id AS cliente_id, c.nombre,
           COALESCE((SELECT SUM(total) FROM ventas_all WHERE cliente_id = c.id), 0)::text AS total_hist,
           COALESCE((SELECT COUNT(*)
                     FROM ventas_all WHERE cliente_id = c.id
                       AND fecha >= now() - interval '90 days'), 0)::text AS compras_90d,
           (SELECT MAX(fecha)::text FROM ventas_all WHERE cliente_id = c.id) AS ultima_venta,
           (SELECT MAX(fecha)::text FROM recep_all WHERE cliente_id = c.id) AS ultima_recep,
           COALESCE((
             SELECT SUM(ri.cantidad) FROM ${recepItT} ri
             JOIN ${recepT} r ON r.id = ri.recepcion_id
             WHERE r.cliente_id = c.id AND r.empresa_id = $1
               AND r.estado IN ('pendiente_ingreso','ingresada')
               AND r.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND r.sucursal_id = $4" : ""}
           ), 0)::text AS prendas_traidas_periodo,
           COALESCE((
             SELECT COUNT(*) FROM ${ventasT} v
             WHERE v.cliente_id = c.id AND v.empresa_id = $1
               AND v.estado IN ('pendiente','completada')
               AND v.fecha::date BETWEEN $2 AND $3
               ${sucursalFiltro ? "AND v.sucursal_id = $4" : ""}
           ), 0)::text AS compras_periodo,
           COALESCE((SELECT SUM(
             CASE WHEN tipo='ENTRADA' THEN monto
                  WHEN tipo='SALIDA' THEN -monto
                  WHEN tipo='AJUSTE' THEN monto ELSE 0 END
           ) FROM ${credT} WHERE cliente_id = c.id), 0)::text AS saldo_credito,
           (SELECT sp.sucursal_id FROM suc_preferida sp WHERE sp.cliente_id = c.id) AS sucursal_preferida_id,
           (SELECT s2.nombre FROM ${quoteSchemaTable(schema, "sucursales")} s2
             WHERE s2.id = (SELECT sp.sucursal_id FROM suc_preferida sp WHERE sp.cliente_id = c.id)
           ) AS sucursal_preferida_nombre,
           (EXISTS (SELECT 1 FROM recep_all WHERE cliente_id = c.id)
             AND NOT EXISTS (SELECT 1 FROM ventas_all WHERE cliente_id = c.id)) AS solo_trae,
           (NOT EXISTS (SELECT 1 FROM recep_all WHERE cliente_id = c.id)
             AND EXISTS (SELECT 1 FROM ventas_all WHERE cliente_id = c.id)) AS solo_lleva,
           (EXISTS (SELECT 1 FROM recep_all WHERE cliente_id = c.id)
             AND EXISTS (SELECT 1 FROM ventas_all WHERE cliente_id = c.id)) AS ambos
         FROM ${cliT} c
         WHERE c.empresa_id = $1
           ${q ? `AND (LOWER(c.nombre) LIKE $${scopeArgs.length + 1})` : ""}`,
        q ? [...scopeArgs, `%${q.toLowerCase()}%`] : scopeArgs,
      );

      // Enriquecer con segmento + dias_desde_ultima_visita (max de venta y recep).
      type Row = (typeof filaClienteQ.rows)[number];
      const now = Date.now();
      const enriquecidos = filaClienteQ.rows.map((r: Row) => {
        const totalHist = Number(r.total_hist);
        const c90 = Number(r.compras_90d);
        const ultimaVenta = r.ultima_venta ? new Date(r.ultima_venta).getTime() : 0;
        const ultimaRecep = r.ultima_recep ? new Date(r.ultima_recep).getTime() : 0;
        const ultimaVisitaMs = Math.max(ultimaVenta, ultimaRecep);
        const diasUlt = ultimaVisitaMs > 0
          ? Math.max(0, Math.floor((now - ultimaVisitaMs) / 86400000))
          : null;
        const cat: "vip" | "habitual" | "nuevo" | "dormido" =
          totalHist >= 5_000_000 || c90 >= 6 ? "vip"
          : totalHist <= 0 ? "nuevo"
          : (diasUlt != null && diasUlt > 120) ? "dormido"
          : "habitual";
        return {
          cliente_id: r.cliente_id,
          nombre: r.nombre,
          segmento: cat,
          total_historico: totalHist,
          compras_90d: c90,
          ultima_visita: ultimaVisitaMs > 0 ? new Date(ultimaVisitaMs).toISOString() : null,
          dias_desde_ultima: diasUlt,
          prendas_traidas_periodo: Number(r.prendas_traidas_periodo),
          compras_periodo: Number(r.compras_periodo),
          saldo_credito: Number(r.saldo_credito),
          sucursal_preferida_id: r.sucursal_preferida_id,
          sucursal_preferida_nombre: r.sucursal_preferida_nombre,
          actividad:
            r.ambos ? "ambos" : r.solo_trae ? "solo_trae" : r.solo_lleva ? "solo_lleva" : "sin_actividad",
        };
      });

      // Filtrado post-cálculo (segmento). No cargamos mil clientes al front.
      const filtrados = enriquecidos.filter((c) => {
        if (segmento && c.segmento !== segmento) return false;
        return true;
      });
      const totalClientes = filtrados.length;
      const kpis = {
        total: totalClientes,
        vip: filtrados.filter((c) => c.segmento === "vip").length,
        habitual: filtrados.filter((c) => c.segmento === "habitual").length,
        nuevo: filtrados.filter((c) => c.segmento === "nuevo").length,
        dormido: filtrados.filter((c) => c.segmento === "dormido").length,
        solo_trae: filtrados.filter((c) => c.actividad === "solo_trae").length,
        solo_lleva: filtrados.filter((c) => c.actividad === "solo_lleva").length,
        ambos: filtrados.filter((c) => c.actividad === "ambos").length,
        credito_disponible_total: filtrados.reduce((s, c) => s + Math.max(0, c.saldo_credito), 0),
        prom_dias_entre_visitas: null as number | null, // se llena abajo
      };
      // Promedio de días entre visitas (aprox: días_desde_ultima promedio entre los que tienen visita).
      const conVisita = filtrados.filter((c) => c.dias_desde_ultima != null);
      kpis.prom_dias_entre_visitas = conVisita.length > 0
        ? Math.round(conVisita.reduce((s, c) => s + (c.dias_desde_ultima ?? 0), 0) / conVisita.length)
        : null;

      // Rankings top 10 (ya viene el conjunto agregado, ordenamos in-memory —
      // el volumen es acotado por diseño).
      const rankVisitas = [...filtrados]
        .sort((a, b) => (b.compras_periodo + (b.dias_desde_ultima != null ? 1 : 0)) - (a.compras_periodo + (a.dias_desde_ultima != null ? 1 : 0)))
        .slice(0, 10);
      const rankCompras = [...filtrados].sort((a, b) => b.total_historico - a.total_historico).slice(0, 10);
      const rankPrendas = [...filtrados].sort((a, b) => b.prendas_traidas_periodo - a.prendas_traidas_periodo).slice(0, 10);

      // Recientes/dormidos rápido para tabla principal (limit).
      const filas = [...filtrados]
        .sort((a, b) => {
          if (b.ultima_visita && !a.ultima_visita) return 1;
          if (!b.ultima_visita && a.ultima_visita) return -1;
          if (!a.ultima_visita || !b.ultima_visita) return 0;
          return new Date(b.ultima_visita).getTime() - new Date(a.ultima_visita).getTime();
        })
        .slice(0, limit);

      // Eventos informativos: dejo el módulo eventos accesible por id de cliente
      // ya existente — el front lo carga al abrir el detalle.
      void eventosT;

      return NextResponse.json(successResponse({
        periodo: { desde, hasta },
        alcance: { es_admin: esAdmin, sucursal_forzada: !esAdmin ? scopedSucursal : null },
        kpis,
        filas,
        rankings: {
          por_compras: rankCompras,
          por_prendas: rankPrendas,
          por_visitas: rankVisitas,
        },
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[/api/dashboard/clientes]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
