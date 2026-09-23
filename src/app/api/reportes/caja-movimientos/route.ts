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
 *   5. Gastos                  (gastos) → SALE
 *   6. Compras a proveedores   (compras al contado) → SALE. Se excluyen las
 *      generadas desde una evaluación (recepcion_id IS NOT NULL): ya vienen
 *      contadas en el punto 2 y si no se duplicarían.
 *   7. Otros ingresos          (otros_ingresos) → ENTRA
 *
 * `gastos` y `compras` no guardan método de pago, así que entran con método
 * vacío y afecta_efectivo=false: aparecen en el libro pero no ensucian el
 * arqueo de efectivo, que solo cuenta lo que sí declara ser efectivo.
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

    // Estas tres tablas no existen en todos los deploys: se consultan solo
    // si están, para que el reporte no falle entero por una que falte.
    const tablasQ = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name IN ('gastos','compras','otros_ingresos')`,
      [schema],
    );
    const hay = new Set(tablasQ.rows.map((x) => x.table_name));
    const colsQ = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name IN ('gastos','compras')
          AND column_name IN ('sucursal_id','recepcion_id')`,
      [schema],
    );
    const tieneCol = (t: string, c: string) =>
      colsQ.rows.some((x) => x.table_name === t && x.column_name === c);

    const extras: string[] = [];

    if (hay.has("gastos")) {
      const tG = quoteSchemaTable(schema, "gastos");
      const sucJoin = tieneCol("gastos", "sucursal_id")
        ? `LEFT JOIN ${tSuc} s ON s.id = g.sucursal_id`
        : `LEFT JOIN ${tSuc} s ON false`;
      const sucWhere = sucFiltro && tieneCol("gastos", "sucursal_id")
        ? "AND g.sucursal_id = $4::uuid"
        : "";
      extras.push(`
        SELECT g.fecha::text,
               'gasto',
               'Gasto',
               COALESCE(NULLIF(TRIM(g.descripcion), ''), NULLIF(TRIM(g.categoria), ''), 'Gasto'),
               NULL,            -- metodo: gastos no registra forma de pago
               NULL,            -- entidad
               g.categoria,     -- referencia: sirve de clasificación
               NULL,            -- cliente
               NULL,            -- numero
               s.nombre,
               NULL,
               g.monto::text,
               '-1',
               false,
               NULL
          FROM ${tG} g
          ${sucJoin}
         WHERE g.empresa_id = $1::uuid
           AND g.fecha BETWEEN $2::date AND $3::date
           ${sucWhere}
      `);
    }

    if (hay.has("compras")) {
      const tC = quoteSchemaTable(schema, "compras");
      // Una compra son N filas (una por producto): se agrupa por N° de
      // control para que el libro muestre UNA salida por compra.
      const sinRecepcion = tieneCol("compras", "recepcion_id")
        ? "AND co.recepcion_id IS NULL"
        : "";
      const sucWhere = sucFiltro && tieneCol("compras", "sucursal_id")
        ? "AND co.sucursal_id = $4::uuid"
        : "";
      const sucSel = tieneCol("compras", "sucursal_id") ? "co.sucursal_id" : "NULL::uuid";
      extras.push(`
        SELECT MIN(co.fecha)::text,
               'compra',
               'Compra a proveedor',
               COALESCE(MIN(co.proveedor_nombre), 'Proveedor'),
               NULL, NULL, NULL, NULL,
               co.numero_control,
               MIN(s.nombre),
               NULL,
               SUM(co.total)::text,
               '-1',
               false,
               NULL
          FROM ${tC} co
          LEFT JOIN ${tSuc} s ON s.id = ${sucSel}
         WHERE co.empresa_id = $1::uuid
           AND co.estado <> 'anulada'
           AND co.tipo_pago = 'contado'
           ${sinRecepcion}
           AND co.fecha::date BETWEEN $2::date AND $3::date
           ${sucWhere}
         GROUP BY co.numero_control
      `);
    }

    if (hay.has("otros_ingresos")) {
      const tOI = quoteSchemaTable(schema, "otros_ingresos");
      const tEnt = quoteSchemaTable(schema, "entidades_bancarias");
      const sucWhere = sucFiltro ? "AND oi.sucursal_id = $4::uuid" : "";
      extras.push(`
        SELECT oi.fecha::text,
               'otro_ingreso',
               'Otro ingreso',
               oi.concepto,
               oi.metodo_pago,
               e.nombre,
               oi.referencia,
               NULL, NULL,
               s.nombre,
               NULL,
               oi.monto::text,
               '1',
               (oi.metodo_pago = 'efectivo'),
               oi.observaciones
          FROM ${tOI} oi
          LEFT JOIN ${tSuc} s ON s.id = oi.sucursal_id
          LEFT JOIN ${tEnt} e ON e.id = oi.entidad_bancaria_id
         WHERE oi.empresa_id = $1::uuid
           AND oi.anulado_at IS NULL
           AND oi.fecha BETWEEN $2::date AND $3::date
           ${sucWhere}
      `);
    }

    const ramasExtra = extras.length > 0
      ? extras.map((x) => `UNION ALL${x}`).join("")
      : "";

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

      ${ramasExtra}

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
