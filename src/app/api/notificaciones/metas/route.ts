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
 * Endpoint liviano para notificaciones (bell del Header + sticky en la
 * caja). Devuelve las sucursales que ALCANZARON su meta DIARIA de HOY
 * (vendido_hoy vs monto_meta_diaria, pct >= 100). Ronda por día para
 * que la celebración se dispare cada vez que se llega a la meta.
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

    // Aislar por sucursal: si el usuario tiene sucursal_id asignada,
    // solo ve las metas de SU sucursal — aunque el rol sea admin. Solo
    // el admin GLOBAL (sin sucursal_id) ve todas. Antes cualquier admin
    // veía todas y en la campana de Sucursal 2 salían las celebraciones
    // de Principal, lo cual confundía a la cajera.
    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const sucScope = auth.sucursal_id ?? (esAdmin ? null : null);

    const sucT = quoteSchemaTable(schema, "sucursales");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const metasT = quoteSchemaTable(schema, "metas_sucursal");
    const celebT = quoteSchemaTable(schema, "metas_celebradas");

    const args: unknown[] = [auth.empresa_id];
    const sucCond = sucScope ? "AND s.id = $2" : "";
    if (sucScope) args.push(sucScope);

    const client = await pool.connect();
    try {
      const q = await client.query(
        `WITH suc AS (
           SELECT s.id, s.nombre
           FROM ${sucT} s
           WHERE s.empresa_id = $1 AND COALESCE(s.activo, true) = true
             ${sucCond}
         ),
         meta AS (
           SELECT s.id AS sucursal_id,
             (SELECT monto_meta_diaria FROM ${metasT} m
               WHERE m.empresa_id = $1 AND m.sucursal_id = s.id AND m.activo = true
                 AND m.vigente_desde <= CURRENT_DATE
               ORDER BY m.vigente_desde DESC LIMIT 1) AS meta_diaria
           FROM suc s
         ),
         vend AS (
           SELECT v.sucursal_id, COALESCE(SUM(v.total),0)::numeric AS vendido
           FROM ${ventasT} v
           WHERE v.empresa_id = $1
             AND v.fecha::date = CURRENT_DATE
             AND v.estado IN ('pendiente','completada')
           GROUP BY v.sucursal_id
         )
         SELECT s.id::text AS sucursal_id, s.nombre,
                COALESCE(v.vendido,0)::text AS vendido,
                m.meta_diaria::text AS meta_diaria,
                EXISTS(
                  SELECT 1 FROM ${celebT} c
                  WHERE c.empresa_id = $1
                    AND c.sucursal_id = s.id
                    AND c.fecha_meta = CURRENT_DATE
                ) AS ya_celebrada
         FROM suc s
         LEFT JOIN meta m ON m.sucursal_id = s.id
         LEFT JOIN vend v ON v.sucursal_id = s.id
         WHERE m.meta_diaria IS NOT NULL AND m.meta_diaria > 0`,
        args,
      );

      const metas = q.rows
        .map((r: { sucursal_id: string; nombre: string; vendido: string; meta_diaria: string; ya_celebrada: boolean }) => {
          const vendido = Number(r.vendido);
          const meta_diaria = Number(r.meta_diaria);
          const pct_meta = meta_diaria > 0 ? Math.round((vendido / meta_diaria) * 100) : 0;
          return {
            sucursal_id: r.sucursal_id,
            nombre: r.nombre,
            pct_meta,
            vendido,
            meta_periodo: meta_diaria,
            // Ya celebrada = existe fila en metas_celebradas para HOY.
            // El frontend usa este flag para NO abrir el modal
            // (mostrará el badge discreto "Meta cumplida").
            ya_celebrada: r.ya_celebrada === true,
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
