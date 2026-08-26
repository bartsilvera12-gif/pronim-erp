import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/proveedores/estadisticas
 *
 * Agregados por proveedor sobre TODA su historia de compras/evaluaciones:
 *   - evaluaciones      COUNT(DISTINCT numero_control)  (una evaluación = una orden)
 *   - total_pagado      SUM(total)                      lo que se le pagó
 *   - total_ingresado   SUM(cantidad × precio_venta)    valor de venta de lo recibido
 *   - markup_medio      (ingresado − pagado) / pagado × 100
 *   - ultima_evaluacion MAX(fecha)
 *
 * Se calcula server-side para no depender del límite del listado de compras.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ stats: {} }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tC = quoteSchemaTable(schema, "compras");

    const r = await pool.query<{
      proveedor_id: string;
      evaluaciones: string;
      total_pagado: string;
      total_ingresado: string;
      ultima_evaluacion: string | null;
    }>(
      `SELECT proveedor_id,
              COUNT(DISTINCT numero_control)::text                          AS evaluaciones,
              COALESCE(SUM(total), 0)::text                                 AS total_pagado,
              COALESCE(SUM(cantidad * COALESCE(precio_venta, 0)), 0)::text  AS total_ingresado,
              MAX(fecha)::text                                              AS ultima_evaluacion
         FROM ${tC}
        WHERE empresa_id = $1::uuid
          AND proveedor_id IS NOT NULL
          AND COALESCE(estado, '') <> 'anulada'
        GROUP BY proveedor_id`,
      [auth.empresa_id],
    );

    const stats: Record<string, {
      evaluaciones: number;
      total_pagado: number;
      total_ingresado: number;
      markup_medio: number | null;
      ultima_evaluacion: string | null;
    }> = {};

    for (const row of r.rows) {
      const pagado = Number(row.total_pagado) || 0;
      const ingresado = Number(row.total_ingresado) || 0;
      stats[row.proveedor_id] = {
        evaluaciones: Number(row.evaluaciones) || 0,
        total_pagado: pagado,
        total_ingresado: ingresado,
        markup_medio: pagado > 0 && ingresado > 0 ? ((ingresado - pagado) / pagado) * 100 : null,
        ultima_evaluacion: row.ultima_evaluacion,
      };
    }

    return NextResponse.json(successResponse({ stats }));
  } catch (e) {
    console.error("[proveedores/estadisticas GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ stats: {} }));
  }
}
