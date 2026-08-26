import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/compras/metodos-pago
 *
 * Devuelve, por `numero_control` de compra, con qué se le pagó al cliente que
 * trajo las prendas: `{ "REC-000016": ["efectivo"], ... }`.
 *
 * Por qué hace falta: `compras.tipo_pago` solo distingue contado/crédito. El
 * método real (efectivo, transferencia, crédito en productos, consignación)
 * vive en `cliente_recepciones_pagos`, y se llega vía `compras.recepcion_id`
 * (las compras de Pronim son el espejo de una recepción/evaluación).
 *
 * Tolerante: si falta la columna recepcion_id o la tabla de pagos (schema sin
 * la migración), devuelve un mapa vacío en vez de romper el listado.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ metodos: {} }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));

    // La columna `recepcion_id` se agregó en la migración 20260824; sin ella
    // no hay forma de enlazar y devolvemos vacío.
    const colQ = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'compras' AND column_name = 'recepcion_id'`,
      [schema],
    );
    if (Number(colQ.rows[0]?.n ?? 0) === 0) {
      return NextResponse.json(successResponse({ metodos: {} }));
    }

    const tC = quoteSchemaTable(schema, "compras");
    const tP = quoteSchemaTable(schema, "cliente_recepciones_pagos");

    const r = await pool.query<{ numero_control: string; metodos: string[] }>(
      `SELECT c.numero_control,
              ARRAY_AGG(DISTINCT p.metodo) FILTER (WHERE p.metodo IS NOT NULL) AS metodos
         FROM ${tC} c
         JOIN ${tP} p ON p.recepcion_id = c.recepcion_id
        WHERE c.empresa_id = $1::uuid
          AND c.recepcion_id IS NOT NULL
          -- Las reversas de anulación no cuentan como forma de pago.
          AND COALESCE(p.direccion, '') <> 'ingreso'
        GROUP BY c.numero_control`,
      [auth.empresa_id],
    );

    const metodos: Record<string, string[]> = {};
    for (const row of r.rows) {
      if (row.metodos && row.metodos.length > 0) metodos[row.numero_control] = row.metodos;
    }
    return NextResponse.json(successResponse({ metodos }));
  } catch (e) {
    console.error("[compras/metodos-pago GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ metodos: {} }));
  }
}
