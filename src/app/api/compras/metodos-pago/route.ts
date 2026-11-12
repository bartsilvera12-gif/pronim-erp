import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
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
/**
 * PATCH /api/compras/metodos-pago — solo administrador.
 *
 * Cambia la forma de pago de una evaluación (compra) ya registrada, entre
 * efectivo y transferencia. Body: { numero_control, de, a }.
 * La caja lee el método desde `cliente_recepciones_pagos`, así que el cambio
 * se refleja solo. No toca créditos ni consignaciones.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
  if (!esRolAdminEmpresaOGlobal(auth.rol)) {
    return NextResponse.json(
      errorResponse("Solo el administrador puede cambiar la forma de pago."),
      { status: 403 },
    );
  }
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Base no disponible."), { status: 500 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

  const numero = String(body.numero_control ?? "").trim();
  const de = String(body.de ?? "");
  const a = String(body.a ?? "");
  const ok = ["efectivo", "transferencia"];
  if (!numero || !ok.includes(de) || !ok.includes(a) || de === a) {
    return NextResponse.json(
      errorResponse("Solo se puede cambiar entre efectivo y transferencia."),
      { status: 400 },
    );
  }

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tC = quoteSchemaTable(schema, "compras");
    const tP = quoteSchemaTable(schema, "cliente_recepciones_pagos");

    const rec = await pool.query<{ recepcion_id: string }>(
      `SELECT DISTINCT recepcion_id FROM ${tC}
        WHERE empresa_id = $1::uuid AND numero_control = $2 AND recepcion_id IS NOT NULL`,
      [auth.empresa_id, numero],
    );
    if (rec.rows.length !== 1) {
      return NextResponse.json(errorResponse("La evaluación no tiene pagos vinculados."), { status: 404 });
    }
    const recepcionId = rec.rows[0].recepcion_id;

    const pagos = await pool.query<{ metodo: string; direccion: string }>(
      `SELECT metodo, direccion FROM ${tP} WHERE empresa_id = $1::uuid AND recepcion_id = $2::uuid`,
      [auth.empresa_id, recepcionId],
    );
    if (pagos.rows.some((p) => p.direccion === "ingreso")) {
      return NextResponse.json(errorResponse("La evaluación está anulada: no se puede editar."), { status: 400 });
    }
    if (pagos.rows.some((p) => p.metodo === a)) {
      return NextResponse.json(
        errorResponse("Esa evaluación ya tiene un pago con esa forma de pago."),
        { status: 400 },
      );
    }

    const u = await pool.query(
      `UPDATE ${tP} SET metodo = $3
        WHERE empresa_id = $1::uuid AND recepcion_id = $2::uuid
          AND direccion = 'egreso' AND metodo = $4`,
      [auth.empresa_id, recepcionId, a, de],
    );
    if (!u.rowCount) {
      return NextResponse.json(errorResponse("No se encontró un pago con la forma indicada."), { status: 404 });
    }
    return NextResponse.json(successResponse({ actualizados: u.rowCount }));
  } catch (e) {
    console.error("[compras/metodos-pago PATCH]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo cambiar la forma de pago."), { status: 500 });
  }
}

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
