import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/auditoria
 * Filtros (todos opcionales, se combinan con AND):
 *   ?desde=YYYY-MM-DD & hasta=YYYY-MM-DD
 *   ?tipo=venta_anulada
 *   ?entidad=venta
 *   ?usuario_id=uuid
 *   ?sucursal_id=uuid
 *   ?q=texto (búsqueda parcial en referencia/motivo)
 *   ?limit=200 (default 200, tope 1000)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const t = quoteSchemaTable(schema, "auditoria_eventos");
    const sp = request.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const tipo = sp.get("tipo");
    const entidad = sp.get("entidad");
    const usuarioId = sp.get("usuario_id");
    const sucursalId = sp.get("sucursal_id");
    const q = sp.get("q");
    const limit = Math.min(1000, Math.max(1, Number(sp.get("limit") ?? 200) || 200));

    const conds: string[] = ["empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, v: unknown) => { params.push(v); conds.push(sql.replace("?", `$${params.length}`)); };
    if (desde) push("fecha >= ?::timestamptz", desde);
    if (hasta) push("fecha <  (? ::date + interval '1 day')", hasta);
    if (tipo) push("tipo = ?", tipo);
    if (entidad) push("entidad = ?", entidad);
    if (usuarioId) push("usuario_id = ?::uuid", usuarioId);
    if (sucursalId) push("sucursal_id = ?::uuid", sucursalId);
    if (q && q.trim()) {
      const pat = `%${q.trim()}%`;
      params.push(pat);
      const p = `$${params.length}`;
      conds.push(`(referencia ILIKE ${p} OR motivo ILIKE ${p})`);
    }
    // Si el usuario tiene sucursal fija (cajera), solo ve eventos de su
    // sucursal + eventos globales (sucursal_id NULL).
    if (auth.sucursal_id) {
      params.push(auth.sucursal_id);
      const p = `$${params.length}`;
      conds.push(`(sucursal_id IS NULL OR sucursal_id = ${p}::uuid)`);
    }

    const sql = `SELECT id, fecha, usuario_id, usuario_nombre, sucursal_id, sucursal_nombre,
                        tipo, entidad, entidad_id, referencia,
                        dato_anterior, dato_nuevo, motivo, meta
                   FROM ${t}
                  WHERE ${conds.join(" AND ")}
                  ORDER BY fecha DESC
                  LIMIT ${limit}`;

    const { rows } = await pool.query(sql, params).catch((e) => {
      // Si la tabla no existe todavía (migración no corrió) devolvemos vacío.
      if (e?.code === "42P01") return { rows: [] as Record<string, unknown>[] };
      throw e;
    });

    return NextResponse.json(successResponse({ eventos: rows }));
  } catch (err) {
    console.error("[/api/auditoria GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
