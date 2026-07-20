import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

/**
 * GET /api/notificaciones/metas
 *
 * Endpoint liviano usado por el bell del Header. Devuelve las sucursales
 * que ALCANZARON su meta del mes en curso (pct_meta >= 100). Se computa
 * el mes calendario actual (día 1 → hoy) contra `monto_meta_diaria`.
 *
 * Respuesta:
 *   { metas: [{ sucursal_id, nombre, pct_meta, vendido, meta_periodo }] }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const sucScope = esAdmin ? null : (auth.sucursal_id ?? null);

    const sucT = quoteSchemaTable(schema, "sucursales");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const metasT = quoteSchemaTable(schema, "metas_sucursal");

    const args: unknown[] = [auth.empresa_id];
    const sucCond = sucScope ? "AND s.id = $2" : "";
    if (sucScope) args.push(sucScope);

    const client = await pool.connect();
    try {
      const q = await client.query(
        `WITH periodo AS (
           SELECT date_trunc('month', CURRENT_DATE)::date AS desde,
                  CURRENT_DATE AS hasta
         ),
         suc AS (
           SELECT s.id, s.nombre
           FROM ${sucT} s
           WHERE s.empresa_id = $1 AND COALESCE(s.activo, true) = true
             ${sucCond}
         ),
         meta AS (
           SELECT s.id AS sucursal_id,
             (SELECT monto_meta_diaria FROM ${metasT} m
               WHERE m.empresa_id = $1 AND m.sucursal_id = s.id AND m.activo = true
                 AND m.vigente_desde <= (SELECT hasta FROM periodo)
               ORDER BY m.vigente_desde DESC LIMIT 1) AS meta_diaria
           FROM suc s
         ),
         vend AS (
           SELECT v.sucursal_id, COALESCE(SUM(v.total),0)::numeric AS vendido
           FROM ${ventasT} v, periodo p
           WHERE v.empresa_id = $1
             AND v.fecha::date BETWEEN p.desde AND p.hasta
             AND COALESCE(v.estado,'confirmada') = 'confirmada'
           GROUP BY v.sucursal_id
         )
         SELECT s.id::text AS sucursal_id, s.nombre,
                COALESCE(v.vendido,0)::text AS vendido,
                m.meta_diaria::text AS meta_diaria,
                ((SELECT hasta FROM periodo) - (SELECT desde FROM periodo) + 1)::text AS dias
         FROM suc s
         LEFT JOIN meta m ON m.sucursal_id = s.id
         LEFT JOIN vend v ON v.sucursal_id = s.id
         WHERE m.meta_diaria IS NOT NULL AND m.meta_diaria > 0`,
        args,
      );

      const metas = q.rows
        .map((r: { sucursal_id: string; nombre: string; vendido: string; meta_diaria: string; dias: string }) => {
          const vendido = Number(r.vendido);
          const meta_periodo = Number(r.meta_diaria) * Number(r.dias);
          const pct_meta = meta_periodo > 0 ? Math.round((vendido / meta_periodo) * 100) : 0;
          return {
            sucursal_id: r.sucursal_id,
            nombre: r.nombre,
            pct_meta,
            vendido,
            meta_periodo,
          };
        })
        .filter(m => m.pct_meta >= 100);

      return NextResponse.json(successResponse({ metas }));
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
