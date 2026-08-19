import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/gastos-drill?desde=&hasta=
 * Gastos: fecha, categoría, descripción, tipo (fijo/variable), recurrente, monto.
 * Sucursal solo si la tabla la tiene (schema base no la trae).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tG = quoteSchemaTable(schema, "gastos");
    const tS = quoteSchemaTable(schema, "sucursales");

    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='gastos'`,
      [schema],
    );
    const cols = new Set(colQ.rows.map((r) => r.column_name));
    const hasSuc = cols.has("sucursal_id");
    const hasFrec = cols.has("frecuencia");
    const hasRec = cols.has("recurrente");
    const hasTipo = cols.has("tipo");

    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const params: unknown[] = [auth.empresa_id];
    const conds: string[] = ["g.empresa_id = $1"];
    if (desde) { params.push(desde); conds.push(`g.fecha >= $${params.length}::date`); }
    if (hasta) { params.push(hasta); conds.push(`g.fecha <= $${params.length}::date`); }

    const r = await pool.query<Record<string, unknown>>(
      `SELECT g.id::text AS id, g.fecha::text AS fecha,
              COALESCE(g.categoria,'(sin categoría)') AS categoria,
              COALESCE(g.descripcion,'') AS descripcion,
              ${hasTipo ? "COALESCE(g.tipo,'variable')" : "'variable'"} AS tipo,
              ${hasRec ? "COALESCE(g.recurrente,false)" : "false"} AS recurrente,
              ${hasFrec ? "g.frecuencia" : "NULL::text"} AS frecuencia,
              COALESCE(g.monto,0)::float8 AS monto,
              ${hasSuc ? "s.nombre" : "NULL::text"} AS sucursal
         FROM ${tG} g
         ${hasSuc ? `LEFT JOIN ${tS} s ON s.id = g.sucursal_id` : ""}
        WHERE ${conds.join(" AND ")}
        ORDER BY g.fecha DESC
        LIMIT 5000`,
      params,
    );
    return NextResponse.json(successResponse({ gastos: r.rows, tiene_sucursal: hasSuc }));
  } catch (err) {
    console.error("[/api/reportes/gastos-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
