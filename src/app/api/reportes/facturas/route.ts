import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/facturas?desde=&hasta=[&sucursal_id=]
 *
 * LIBRO DE VENTAS: las facturas del autoimpresor emitidas en el período, que
 * es lo que la contadora necesita para liquidar el IVA.
 *
 * Dos decisiones que no son obvias:
 *
 * 1. Las facturas ANULADAS vienen igual, marcadas. Un número de factura
 *    emitido no puede desaparecer del libro: la SET pide poder seguir la
 *    numeración completa, sin huecos, y un hueco sin explicar es peor que
 *    una anulada a la vista.
 *
 * 2. La liquidación de IVA sale de las líneas de la venta (`ventas_items`),
 *    no de `ventas.monto_iva`. Una venta puede mezclar exentas y gravadas y
 *    el total no alcanza para separarlas. Si la venta no tiene líneas —las
 *    históricas importadas no las tienen— se informa como exenta, que es lo
 *    que se imprimió en su momento.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });

  const sp = request.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  const okFecha = (s: string | null) => s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!okFecha(desde) || !okFecha(hasta)) {
    return NextResponse.json(errorResponse("desde y hasta (YYYY-MM-DD) son obligatorios."), { status: 400 });
  }

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ facturas: [] }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tCli = quoteSchemaTable(schema, "clientes");
    const tSuc = quoteSchemaTable(schema, "sucursales");

    // `factura_numero` llega con una migración que puede no estar aplicada.
    // Sin ella el reporte no tiene de dónde salir, pero contesta vacío en vez
    // de reventar: así la pantalla puede explicar qué falta.
    const colsQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'ventas'`,
      [schema],
    );
    const cols = new Set(colsQ.rows.map((r) => r.column_name));
    if (!cols.has("factura_numero")) {
      return NextResponse.json(successResponse({
        facturas: [],
        falta_migracion: "20260930000000_autoimpresor_por_sucursal.sql",
      }));
    }
    const colTimbrado = cols.has("factura_timbrado") ? "v.factura_timbrado" : "NULL::text";

    const itemsQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'ventas_items' AND column_name = 'tipo_iva'`,
      [schema],
    );
    const hayTipoIva = (itemsQ.rowCount ?? 0) > 0;

    const cliCols = new Set(
      (await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'clientes'`,
        [schema],
      )).rows.map((r) => r.column_name),
    );
    const colRuc = cliCols.has("ruc") ? "c.ruc" : "NULL::text";
    const colDoc = cliCols.has("documento") ? "c.documento" : "NULL::text";
    const colEmpresa = cliCols.has("empresa") ? "c.empresa" : "NULL::text";

    // Aislamiento por sucursal: si el usuario tiene una fija manda esa, si no
    // la que eligió en el selector de arriba.
    const sucFiltro = auth.sucursal_id ?? (sp.get("sucursal_id") || null);
    const args: unknown[] = [auth.empresa_id, desde, hasta];
    if (sucFiltro) args.push(sucFiltro);

    // Liquidación por línea. Sin `tipo_iva` todo se informa exento, que es lo
    // que el comprobante imprimió.
    const liq = hayTipoIva
      ? `COALESCE(it.exentas, v.total)        AS exentas,
         COALESCE(it.gravado5, 0)            AS gravado5,
         COALESCE(it.gravado10, 0)           AS gravado10,
         COALESCE(it.iva5, 0)                AS iva5,
         COALESCE(it.iva10, 0)               AS iva10`
      : `v.total AS exentas, 0 AS gravado5, 0 AS gravado10, 0 AS iva5, 0 AS iva10`;

    const joinItems = hayTipoIva
      ? `LEFT JOIN LATERAL (
           SELECT
             SUM(i.total_linea) FILTER (WHERE i.tipo_iva = 'exenta')            AS exentas,
             SUM(i.total_linea) FILTER (WHERE i.tipo_iva = '5')                 AS gravado5,
             SUM(i.total_linea) FILTER (WHERE i.tipo_iva = '10')                AS gravado10,
             SUM(i.monto_iva)   FILTER (WHERE i.tipo_iva = '5')                 AS iva5,
             SUM(i.monto_iva)   FILTER (WHERE i.tipo_iva = '10')                AS iva10
           FROM ${tVI} i WHERE i.venta_id = v.id
         ) it ON true`
      : "";

    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.fecha,
         v.factura_numero                                   AS numero,
         ${colTimbrado}                                     AS timbrado,
         v.numero_control,
         v.estado,
         v.total,
         COALESCE(NULLIF(TRIM(${colEmpresa}), ''),
                  NULLIF(TRIM(c.nombre), ''),
                  'SIN NOMBRE')                             AS cliente,
         COALESCE(NULLIF(TRIM(${colRuc}), ''),
                  NULLIF(TRIM(${colDoc}), ''), 'X')         AS documento,
         s.nombre                                           AS sucursal,
         ${liq}
       FROM ${tV} v
       LEFT JOIN ${tCli} c ON c.id = v.cliente_id
       LEFT JOIN ${tSuc} s ON s.id = v.sucursal_id
       ${joinItems}
       WHERE v.empresa_id = $1
         AND v.factura_numero IS NOT NULL
         AND v.fecha >= $2::date
         AND v.fecha <  ($3::date + 1)
         ${sucFiltro ? "AND v.sucursal_id = $4::uuid" : ""}
       ORDER BY v.factura_numero`,
      args,
    );

    const num = (v: unknown) => Math.round(Number(v) || 0);
    const facturas = rows.map((r) => ({
      id: String(r.id),
      fecha: r.fecha,
      numero: r.numero as string,
      timbrado: (r.timbrado as string | null) ?? null,
      numero_control: (r.numero_control as string | null) ?? null,
      anulada: String(r.estado ?? "") === "anulada",
      cliente: r.cliente as string,
      documento: r.documento as string,
      sucursal: (r.sucursal as string | null) ?? null,
      exentas: num(r.exentas),
      gravado5: num(r.gravado5),
      gravado10: num(r.gravado10),
      iva5: num(r.iva5),
      iva10: num(r.iva10),
      total: num(r.total),
    }));

    // Los totales se calculan acá y no en la pantalla: la contadora los compara
    // contra su propia planilla y tienen que salir del mismo lugar que el
    // detalle, no de una suma hecha aparte.
    const vivas = facturas.filter((f) => !f.anulada);
    const suma = (f: (x: typeof vivas[number]) => number) => vivas.reduce((a, x) => a + f(x), 0);

    return NextResponse.json(successResponse({
      facturas,
      totales: {
        emitidas: facturas.length,
        anuladas: facturas.length - vivas.length,
        exentas: suma((x) => x.exentas),
        gravado5: suma((x) => x.gravado5),
        gravado10: suma((x) => x.gravado10),
        iva5: suma((x) => x.iva5),
        iva10: suma((x) => x.iva10),
        total: suma((x) => x.total),
      },
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al armar el libro de ventas.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
