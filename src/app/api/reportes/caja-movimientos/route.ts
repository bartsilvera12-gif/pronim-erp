import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/caja-movimientos?desde=&hasta=[&sucursal_id=]
 *
 * LIBRO DE CAJA: todo lo que movió plata en el período, en una sola lista,
 * para poder cuadrar el día. Une cuatro orígenes:
 *
 *   1. Cobros de ventas        (ventas_pagos_detalle) → ENTRA, por método real
 *   2. Pagos por evaluaciones  (cliente_recepciones_pagos) → SALE (lo que se le
 *      paga al cliente por sus prendas). El método 'credito' NO mueve plata:
 *      queda marcado aparte para no ensuciar el arqueo de efectivo.
 *   3. Movimientos manuales    (caja_movimientos: ingreso/egreso/retiro/ajuste)
 *   4. Aperturas de caja       (monto inicial) → contexto del arqueo
 *
 * `signo` (+1 entra / -1 sale) y `afecta_efectivo` permiten sumar bien:
 * el total en efectivo del día es SUM(monto × signo) donde afecta_efectivo.
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
  if (!pool) return NextResponse.json(successResponse({ movimientos: [] }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tV = quoteSchemaTable(schema, "ventas");
    const tVP = quoteSchemaTable(schema, "ventas_pagos_detalle");
    const tR = quoteSchemaTable(schema, "cliente_recepciones");
    const tRP = quoteSchemaTable(schema, "cliente_recepciones_pagos");
    const tCM = quoteSchemaTable(schema, "caja_movimientos");
    const tCajas = quoteSchemaTable(schema, "cajas");
    const tSuc = quoteSchemaTable(schema, "sucursales");
    const tCli = quoteSchemaTable(schema, "clientes");

    // Aislamiento por sucursal: si el usuario tiene una fija, manda esa.
    const sucFiltro = auth.sucursal_id ?? (sp.get("sucursal_id") || null);
    const args: unknown[] = [auth.empresa_id, desde, hasta];
    if (sucFiltro) args.push(sucFiltro);
    const sucCond = (col: string) => (sucFiltro ? `AND ${col} = $4::uuid` : "");

    const r = await pool.query<{
      fecha: string; origen: string; tipo: string; concepto: string;
      metodo: string | null; entidad: string | null; referencia: string | null;
      cliente: string | null; numero: string | null;
      sucursal: string | null; caja_numero: string | null;
      monto: string; signo: string; afecta_efectivo: boolean;
      usuario: string | null;
    }>(
      `
      -- 1) Cobros de ventas
      SELECT vp.created_at::text          AS fecha,
             'venta'                      AS origen,
             'Cobro de venta'             AS tipo,
             COALESCE(v.numero_control, 'Venta') AS concepto,
             vp.metodo_pago               AS metodo,
             vp.entidad_nombre_snapshot   AS entidad,
             vp.referencia                AS referencia,
             COALESCE(NULLIF(TRIM(c.nombre_contacto),''), NULLIF(TRIM(c.nombre),''), NULLIF(TRIM(c.empresa),'')) AS cliente,
             v.numero_control             AS numero,
             s.nombre                     AS sucursal,
             ca.numero_caja::text         AS caja_numero,
             vp.monto::text               AS monto,
             '1'                          AS signo,
             (vp.metodo_pago = 'efectivo') AS afecta_efectivo,
             NULL::text                   AS usuario
        FROM ${tVP} vp
        JOIN ${tV} v ON v.id = vp.venta_id
        LEFT JOIN ${tCli} c ON c.id = v.cliente_id
        LEFT JOIN ${tSuc} s ON s.id = vp.sucursal_id
        LEFT JOIN ${tCajas} ca ON ca.id = v.caja_id
       WHERE vp.empresa_id = $1::uuid
         AND v.estado <> 'anulada'
         AND vp.created_at::date BETWEEN $2::date AND $3::date
         ${sucCond("vp.sucursal_id")}

      UNION ALL

      -- 2) Pagos al cliente por sus prendas (evaluaciones)
      SELECT rp.created_at::text,
             'evaluacion',
             'Pago por evaluación',
             COALESCE(r.numero_control, 'Evaluación'),
             rp.metodo,
             rp.entidad_nombre_snapshot,
             NULL,
             COALESCE(NULLIF(TRIM(c.nombre_contacto),''), NULLIF(TRIM(c.nombre),''), NULLIF(TRIM(c.empresa),'')),
             r.numero_control,
             s.nombre,
             NULL,
             rp.monto::text,
             '-1',
             (rp.metodo = 'efectivo'),
             NULL
        FROM ${tRP} rp
        JOIN ${tR} r ON r.id = rp.recepcion_id
        LEFT JOIN ${tCli} c ON c.id = r.cliente_id
        LEFT JOIN ${tSuc} s ON s.id = r.sucursal_id
       WHERE rp.empresa_id = $1::uuid
         AND r.estado <> 'anulada'
         AND COALESCE(rp.direccion, '') <> 'ingreso'
         AND rp.created_at::date BETWEEN $2::date AND $3::date
         ${sucCond("r.sucursal_id")}

      UNION ALL

      -- 3) Movimientos manuales de caja
      SELECT cm.created_at::text,
             'manual',
             INITCAP(cm.tipo),
             cm.concepto,
             cm.medio_pago,
             NULL,
             NULL,
             NULL,
             NULL,
             s.nombre,
             ca.numero_caja::text,
             cm.monto::text,
             CASE WHEN cm.tipo = 'ingreso' THEN '1' ELSE '-1' END,
             (cm.medio_pago = 'efectivo'),
             cm.observacion
        FROM ${tCM} cm
        JOIN ${tCajas} ca ON ca.id = cm.caja_id
        LEFT JOIN ${tSuc} s ON s.id = ca.sucursal_id
       WHERE cm.empresa_id = $1::uuid
         AND cm.created_at::date BETWEEN $2::date AND $3::date
         ${sucCond("ca.sucursal_id")}

      UNION ALL

      -- 4) Apertura de caja (fondo inicial)
      SELECT ca.fecha_apertura::text,
             'apertura',
             'Apertura de caja',
             'Monto inicial',
             'efectivo',
             NULL, NULL, NULL, NULL,
             s.nombre,
             ca.numero_caja::text,
             ca.monto_apertura::text,
             '1',
             true,
             NULL
        FROM ${tCajas} ca
        LEFT JOIN ${tSuc} s ON s.id = ca.sucursal_id
       WHERE ca.empresa_id = $1::uuid
         AND ca.fecha_apertura::date BETWEEN $2::date AND $3::date
         ${sucCond("ca.sucursal_id")}

      ORDER BY fecha DESC
      LIMIT 5000
      `,
      args,
    );

    const movimientos = r.rows.map((row) => {
      const monto = Number(row.monto) || 0;
      const signo = Number(row.signo) || 1;
      return {
        fecha: row.fecha,
        origen: row.origen,
        tipo: row.tipo,
        concepto: row.concepto,
        metodo: row.metodo,
        entidad: row.entidad,
        referencia: row.referencia,
        cliente: row.cliente,
        numero: row.numero,
        sucursal: row.sucursal,
        caja_numero: row.caja_numero,
        monto,
        signo,
        /** Monto con signo: sumar esta columna da el neto real. */
        neto: monto * signo,
        /** true si mueve efectivo físico (para el arqueo). */
        afecta_efectivo: row.afecta_efectivo === true,
        usuario: row.usuario,
      };
    });

    return NextResponse.json(successResponse({ movimientos }));
  } catch (e) {
    console.error("[reportes/caja-movimientos GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos de caja."), { status: 500 });
  }
}
