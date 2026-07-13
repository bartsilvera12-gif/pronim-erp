import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

interface Uso {
  fecha: string;
  monto_aplicado: number;
  referencia_numero: string | null;
  origen_salida: string;
}

interface Lote {
  entrada_id: string;
  origen: string;
  fecha_ingreso: string;
  referencia_numero: string | null;
  referencia_tipo: string | null;
  observaciones: string | null;
  monto_inicial: number;
  monto_consumido: number;
  saldo_restante: number;
  usos: Uso[];
}

/**
 * GET /api/clientes/[id]/creditos/lotes
 *
 * Devuelve cada crédito ingresado como un "lote" con vida propia:
 *   - origen, fecha, monto inicial, monto consumido, saldo restante.
 *   - Detalle de usos (fecha, referencia de la venta, monto aplicado).
 * Ordenados de más nuevo a más viejo. FIFO se aplica al consumir.
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

    const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const consumosT = quoteSchemaTable(schema, "cliente_creditos_consumos");

    const client = await pool.connect();
    try {
      // Lotes: ENTRADAs + AJUSTEs positivos.
      const lotesQ = await client.query<{
        entrada_id: string;
        origen: string;
        fecha_ingreso: string;
        referencia_numero: string | null;
        referencia_tipo: string | null;
        observaciones: string | null;
        monto_inicial: string;
        monto_consumido: string;
      }>(
        `SELECT
           e.id AS entrada_id,
           e.origen,
           e.fecha AS fecha_ingreso,
           e.referencia_numero,
           e.referencia_tipo,
           e.observaciones,
           e.monto::text AS monto_inicial,
           COALESCE(SUM(c.monto_aplicado), 0)::text AS monto_consumido
         FROM ${creditosT} e
         LEFT JOIN ${consumosT} c ON c.entrada_id = e.id
         WHERE e.empresa_id = $1
           AND e.cliente_id = $2
           AND e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id
         ORDER BY e.fecha DESC`,
        [empresaId, clienteId],
      );

      const lotes: Lote[] = lotesQ.rows.map((r) => {
        const inicial = Number(r.monto_inicial);
        const consumido = Number(r.monto_consumido);
        return {
          entrada_id: r.entrada_id,
          origen: r.origen,
          fecha_ingreso: r.fecha_ingreso,
          referencia_numero: r.referencia_numero,
          referencia_tipo: r.referencia_tipo,
          observaciones: r.observaciones,
          monto_inicial: inicial,
          monto_consumido: consumido,
          saldo_restante: inicial - consumido,
          usos: [],
        };
      });

      if (lotes.length) {
        const ids = lotes.map((l) => l.entrada_id);
        const usosQ = await client.query<{
          entrada_id: string;
          fecha: string;
          monto_aplicado: string;
          referencia_numero: string | null;
          origen_salida: string;
        }>(
          `SELECT
             c.entrada_id,
             s.fecha,
             c.monto_aplicado::text AS monto_aplicado,
             s.referencia_numero,
             s.origen AS origen_salida
           FROM ${consumosT} c
           JOIN ${creditosT} s ON s.id = c.salida_id
           WHERE c.empresa_id = $1 AND c.entrada_id = ANY($2::uuid[])
           ORDER BY s.fecha ASC`,
          [empresaId, ids],
        );
        const byEntrada = new Map<string, Uso[]>();
        for (const u of usosQ.rows) {
          const arr = byEntrada.get(u.entrada_id) ?? [];
          arr.push({
            fecha: u.fecha,
            monto_aplicado: Number(u.monto_aplicado),
            referencia_numero: u.referencia_numero,
            origen_salida: u.origen_salida,
          });
          byEntrada.set(u.entrada_id, arr);
        }
        for (const l of lotes) {
          l.usos = byEntrada.get(l.entrada_id) ?? [];
        }
      }

      const saldoTotal = lotes.reduce((s, l) => s + l.saldo_restante, 0);

      return NextResponse.json(
        successResponse({ lotes, saldo_total: saldoTotal }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/creditos/lotes GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
