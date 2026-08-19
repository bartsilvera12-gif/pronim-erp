import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/comparativo?desde=&hasta=
 * Compara el período [desde,hasta] contra el período INMEDIATO ANTERIOR de la
 * misma duración, por sucursal. Responde "creció / cayó, y por qué":
 *   facturación, ventas, prendas, ticket promedio, clientes, precio/prenda.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const ok = (s: string | null) => s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!ok(desde) || !ok(hasta)) {
      return NextResponse.json(errorResponse("desde y hasta (YYYY-MM-DD) son obligatorios."), { status: 400 });
    }
    // Período anterior de igual duración, terminando el día antes de `desde`.
    const dA = new Date(desde + "T00:00:00Z");
    const hA = new Date(hasta + "T00:00:00Z");
    const dias = Math.round((hA.getTime() - dA.getTime()) / 86400000) + 1;
    const hB = new Date(dA.getTime() - 86400000);
    const dB = new Date(hB.getTime() - (dias - 1) * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const desdeB = iso(dB), hastaB = iso(hB);

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tS = quoteSchemaTable(schema, "sucursales");

    const vColQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='ventas'`, [schema]);
    const vCols = new Set(vColQ.rows.map((r) => r.column_name));
    const hasSuc = vCols.has("sucursal_id");
    const sucSel = hasSuc ? "v.sucursal_id::text" : "NULL::text";
    const sucNombre = hasSuc ? "s.nombre" : "'General'";
    const sucJoin = hasSuc ? `LEFT JOIN ${tS} s ON s.id = v.sucursal_id` : "";
    const sucGroup = hasSuc ? "v.sucursal_id, s.nombre" : "1";

    // Métricas por sucursal en un rango.
    async function metricas(d1: string, d2: string) {
      const r = await pool.query<{
        sucursal_id: string | null; sucursal: string | null;
        facturacion: string; cnt_ventas: string; prendas: string; clientes: string;
      }>(
        `SELECT ${sucSel} AS sucursal_id, ${sucNombre} AS sucursal,
                COALESCE(SUM(v.total),0)::text AS facturacion,
                COUNT(*)::text AS cnt_ventas,
                COALESCE((SELECT SUM(it.cantidad) FROM ${tVI} it
                            JOIN ${tV} vv ON vv.id = it.venta_id
                           WHERE vv.empresa_id=$1 ${hasSuc ? "AND vv.sucursal_id IS NOT DISTINCT FROM v.sucursal_id" : ""}
                             AND vv.fecha >= $2::timestamptz AND vv.fecha < ($3::date + interval '1 day')
                             AND (vv.estado IS NULL OR vv.estado <> 'anulada')),0)::text AS prendas,
                COUNT(DISTINCT v.cliente_id)::text AS clientes
           FROM ${tV} v ${sucJoin}
          WHERE v.empresa_id = $1 AND (v.estado IS NULL OR v.estado <> 'anulada')
            AND v.fecha >= $2::timestamptz AND v.fecha < ($3::date + interval '1 day')
          GROUP BY ${sucGroup}`,
        [auth.empresa_id, d1, d2],
      );
      return r.rows;
    }

    const [rowsA, rowsB] = await Promise.all([metricas(desde!, hasta!), metricas(desdeB, hastaB)]);

    type M = { facturacion: number; cnt_ventas: number; prendas: number; clientes: number };
    const mapA = new Map<string, M>();
    const mapB = new Map<string, M>();
    const nombres = new Map<string, string>();
    const acc = (map: Map<string, M>, rows: typeof rowsA) => {
      for (const r of rows) {
        const k = r.sucursal_id ?? "sin";
        nombres.set(k, r.sucursal ?? "Sin sucursal");
        map.set(k, {
          facturacion: Number(r.facturacion) || 0,
          cnt_ventas: Number(r.cnt_ventas) || 0,
          prendas: Number(r.prendas) || 0,
          clientes: Number(r.clientes) || 0,
        });
      }
    };
    acc(mapA, rowsA); acc(mapB, rowsB);

    const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));
    const derive = (m?: M) => {
      const f = m?.facturacion ?? 0, c = m?.cnt_ventas ?? 0, p = m?.prendas ?? 0, cl = m?.clientes ?? 0;
      return { facturacion: f, cnt_ventas: c, prendas: p, clientes: cl,
        ticket_prom: c > 0 ? f / c : 0, precio_prenda: p > 0 ? f / p : 0 };
    };
    const sucursales = keys.map((k) => {
      const a = derive(mapA.get(k)), b = derive(mapB.get(k));
      const deltaPct = (x: number, y: number) => y > 0 ? Math.round(((x - y) / y) * 1000) / 10 : (x > 0 ? 100 : 0);
      return {
        sucursal_id: k === "sin" ? null : k, sucursal: nombres.get(k) ?? "Sin sucursal",
        actual: a, anterior: b,
        delta_facturacion: a.facturacion - b.facturacion,
        delta_facturacion_pct: deltaPct(a.facturacion, b.facturacion),
        delta_clientes: a.clientes - b.clientes,
        delta_ticket_pct: deltaPct(a.ticket_prom, b.ticket_prom),
        delta_prendas: a.prendas - b.prendas,
        delta_precio_prenda_pct: deltaPct(a.precio_prenda, b.precio_prenda),
      };
    }).sort((x, y) => y.delta_facturacion - x.delta_facturacion);

    const sumM = (rows: M[]) => rows.reduce((s, m) => ({
      facturacion: s.facturacion + m.facturacion, cnt_ventas: s.cnt_ventas + m.cnt_ventas,
      prendas: s.prendas + m.prendas, clientes: s.clientes + m.clientes,
    }), { facturacion: 0, cnt_ventas: 0, prendas: 0, clientes: 0 });
    const totA = derive(sumM(Array.from(mapA.values())));
    const totB = derive(sumM(Array.from(mapB.values())));

    return NextResponse.json(successResponse({
      periodo_actual: { desde, hasta },
      periodo_anterior: { desde: desdeB, hasta: hastaB },
      dias,
      sucursales,
      total: {
        actual: totA, anterior: totB,
        delta_facturacion: totA.facturacion - totB.facturacion,
        delta_facturacion_pct: totB.facturacion > 0 ? Math.round(((totA.facturacion - totB.facturacion) / totB.facturacion) * 1000) / 10 : 0,
      },
    }));
  } catch (err) {
    console.error("[/api/reportes/comparativo GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
