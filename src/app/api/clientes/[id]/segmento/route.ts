import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/clientes/[id]/segmento
 *
 * Endpoint liviano para el chip de segmento en /caja y /ventas.
 * Devuelve solo lo mínimo necesario para clasificar (VIP/frecuente/nuevo/
 * dormido) y las flags (reclamos, beneficios). Una sola query combinada
 * en vez de las 6 de /consultas.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const ventasT = quoteSchemaTable(schema, "ventas");
    const eventosT = quoteSchemaTable(schema, "cliente_eventos");

    const client = await pool.connect();
    try {
      const ventasQ = client.query<{
        ultima_fecha: string | null;
        total_hist: string | null;
        count_90d: string | null;
      }>(
        `SELECT
           MAX(fecha)                                                  AS ultima_fecha,
           COALESCE(SUM(total), 0)::text                               AS total_hist,
           COUNT(*) FILTER (WHERE fecha >= now() - interval '90 days')::text AS count_90d
         FROM ${ventasT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [empresaId, clienteId],
      );

      const eventosQ = client
        .query<{ reclamos: string; beneficios: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE tipo = 'reclamo')::text                                    AS reclamos,
             COUNT(*) FILTER (WHERE tipo IN ('beneficio','cashback','descuento'))::text        AS beneficios
           FROM ${eventosT}
           WHERE empresa_id = $1 AND cliente_id = $2 AND deleted_at IS NULL`,
          [empresaId, clienteId],
        )
        .catch(() => ({ rows: [{ reclamos: "0", beneficios: "0" }] }));

      const [vRes, eRes] = await Promise.all([ventasQ, eventosQ]);
      const vs = vRes.rows[0];
      const es = eRes.rows[0];

      const ultimaCompra = vs?.ultima_fecha ?? null;
      const totalHistorico = Number(vs?.total_hist ?? 0);
      const comprasUltimos90d = Number(vs?.count_90d ?? 0);
      const diasDesdeUltima = ultimaCompra
        ? Math.max(0, Math.floor((Date.now() - new Date(ultimaCompra).getTime()) / 86400000))
        : null;
      const reclamosCount = Number(es?.reclamos ?? 0);
      const beneficiosCount = Number(es?.beneficios ?? 0);

      const categoria: "nuevo" | "habitual" | "vip" | "dormido" =
        totalHistorico >= 5_000_000 || comprasUltimos90d >= 6
          ? "vip"
          : totalHistorico <= 0
            ? "nuevo"
            : diasDesdeUltima != null && diasDesdeUltima > 120
              ? "dormido"
              : "habitual";

      return NextResponse.json(
        successResponse({
          categoria,
          totalHistorico,
          comprasUltimos90d,
          diasDesdeUltima,
          tieneReclamos: reclamosCount > 0,
          reclamosCount,
          recibioBeneficios: beneficiosCount > 0,
          beneficiosCount,
        }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/segmento GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
