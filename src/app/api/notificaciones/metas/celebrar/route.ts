import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * POST /api/notificaciones/metas/celebrar
 *
 * Body: { sucursal_id: string; pct_meta: number; vendido: number; meta_diaria: number }
 *
 * Registra que la meta de HOY para (empresa, sucursal) ya fue celebrada.
 * Insert idempotente vía ON CONFLICT DO NOTHING sobre el UNIQUE
 * (empresa_id, sucursal_id, fecha_meta) — si dos requests concurrentes
 * intentan celebrar la misma meta, solo una fila queda. La respuesta
 * indica si el INSERT fue el "primer" ack o no.
 *
 * Autorización: cualquier usuario autenticado de la empresa. La celebración
 * es informativa; el cálculo real de meta vive en /api/notificaciones/metas.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      sucursal_id?: string; pct_meta?: number; vendido?: number; meta_diaria?: number;
      cerrado_por_usuario?: boolean;
    };
    const sucursalId = String(body.sucursal_id ?? "").trim();
    if (!sucursalId) {
      return NextResponse.json(errorResponse("sucursal_id requerido."), { status: 400 });
    }
    const pctMeta = Math.round(Number(body.pct_meta) || 0);
    const vendido = Number(body.vendido) || 0;
    const metaDiaria = Number(body.meta_diaria) || 0;
    const cerradoPorUsuario = body.cerrado_por_usuario === true;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const celebT = quoteSchemaTable(schema, "metas_celebradas");

    const client = await pool.connect();
    try {
      const r = await client.query<{ id: string }>(
        `INSERT INTO ${celebT} (
           empresa_id, sucursal_id, fecha_meta, pct_meta, vendido, meta_diaria,
           usuario_id, usuario_nombre, cerrado_por_usuario
         ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ON CONSTRAINT metas_celebradas_unicidad DO NOTHING
         RETURNING id`,
        [
          auth.empresa_id, sucursalId, pctMeta, vendido, metaDiaria,
          null, null, cerradoPorUsuario,
        ],
      );
      const primeraVez = r.rows.length > 0;
      return NextResponse.json(successResponse({
        celebrada: true,
        primera_vez: primeraVez,
      }));
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[/api/notificaciones/metas/celebrar]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
