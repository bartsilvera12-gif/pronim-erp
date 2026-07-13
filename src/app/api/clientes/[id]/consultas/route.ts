import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

interface TimelineEvent {
  tipo:
    | "venta"
    | "pago"
    | "recepcion"
    | "credito_uso"
    | "credito_entrada"
    | "nota_credito"
    | "nota"
    | "reclamo"
    | "elogio"
    | "beneficio"
    | "descuento"
    | "cashback"
    | "cambio"
    | "otro";
  fecha: string;
  monto: number | null;
  referencia: string | null;
  detalle: string | null;
}

interface KPIs {
  saldo_credito: number;
  ultima_compra_fecha: string | null;
  dias_desde_ultima_compra: number | null;
  compras_ultimos_90d: number;
  total_comprado_historico: number;
  total_consignado_historico: number;
  cadencia_dias: number | null;
  facturas_pendientes: number;
  monto_pendiente: number;
}

/**
 * GET /api/clientes/[id]/consultas
 *
 * Devuelve KPIs + timeline unificado. Usa pool directo porque combina
 * varias tablas (ventas, cliente_recepciones, cliente_creditos_mov,
 * notas_credito si existen). Todo en 1 query round-trip.
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
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const facturasT = quoteSchemaTable(schema, "facturas");
    const eventosT = quoteSchemaTable(schema, "cliente_eventos");

    const client = await pool.connect();
    try {
      // Saldo crédito (SUM CASE).
      const saldoQ = await client.query<{ saldo: string | null }>(
        `SELECT COALESCE(SUM(
           CASE WHEN tipo = 'ENTRADA' THEN monto
                WHEN tipo = 'SALIDA' THEN -monto
                WHEN tipo = 'AJUSTE' THEN monto
                ELSE 0 END
         ), 0) AS saldo
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [empresaId, clienteId],
      );
      const saldoCredito = Number(saldoQ.rows[0]?.saldo ?? 0);

      // Última compra + cadencia + count 90d + total histórico.
      const ventasStatsQ = await client.query<{
        ultima_fecha: string | null;
        total_hist: string | null;
        count_90d: string | null;
      }>(
        `SELECT
           MAX(fecha) AS ultima_fecha,
           COALESCE(SUM(total), 0)::text AS total_hist,
           COUNT(*) FILTER (WHERE fecha >= now() - interval '90 days')::text AS count_90d
         FROM ${ventasT}
         WHERE empresa_id = $1 AND cliente_id = $2`,
        [empresaId, clienteId],
      );
      const vs = ventasStatsQ.rows[0];
      const ultimaCompra = vs?.ultima_fecha ?? null;
      const totalComprado = Number(vs?.total_hist ?? 0);
      const compras90 = Number(vs?.count_90d ?? 0);

      // Cadencia: media de días entre compras (últimas 10).
      const cadenciaQ = await client.query<{ avg_dias: string | null }>(
        `WITH ult AS (
           SELECT fecha FROM ${ventasT}
           WHERE empresa_id = $1 AND cliente_id = $2
           ORDER BY fecha DESC LIMIT 10
         ),
         diffs AS (
           SELECT EXTRACT(EPOCH FROM (LAG(fecha) OVER (ORDER BY fecha) - fecha)) / 86400 AS d
           FROM ult
         )
         SELECT AVG(ABS(d))::text AS avg_dias FROM diffs WHERE d IS NOT NULL`,
        [empresaId, clienteId],
      );
      const cadencia = Number(cadenciaQ.rows[0]?.avg_dias ?? 0) || null;

      // Total consignado histórico.
      const consignQ = await client.query<{ total: string | null }>(
        `SELECT COALESCE(SUM(total_credito), 0)::text AS total
         FROM ${recepT}
         WHERE empresa_id = $1 AND cliente_id = $2 AND estado = 'registrada'`,
        [empresaId, clienteId],
      );
      const totalConsignado = Number(consignQ.rows[0]?.total ?? 0);

      // Facturas pendientes / monto (si existe la tabla facturas).
      let facturasPendientes = 0;
      let montoPendiente = 0;
      try {
        const fpQ = await client.query<{ c: string; m: string }>(
          `SELECT COUNT(*)::text AS c, COALESCE(SUM(saldo_pendiente), 0)::text AS m
           FROM ${facturasT}
           WHERE empresa_id = $1 AND cliente_id = $2 AND estado IN ('pendiente','parcial','vencida')`,
          [empresaId, clienteId],
        );
        facturasPendientes = Number(fpQ.rows[0]?.c ?? 0);
        montoPendiente = Number(fpQ.rows[0]?.m ?? 0);
      } catch {
        /* si facturas no existe o no tiene esos campos, se omite */
      }

      const diasDesdeUlt = ultimaCompra
        ? Math.max(0, Math.floor((Date.now() - new Date(ultimaCompra).getTime()) / 86400000))
        : null;

      const kpis: KPIs = {
        saldo_credito: saldoCredito,
        ultima_compra_fecha: ultimaCompra,
        dias_desde_ultima_compra: diasDesdeUlt,
        compras_ultimos_90d: compras90,
        total_comprado_historico: totalComprado,
        total_consignado_historico: totalConsignado,
        cadencia_dias: cadencia,
        facturas_pendientes: facturasPendientes,
        monto_pendiente: montoPendiente,
      };

      // Timeline: ventas + recepciones + movimientos crédito (últimos 100 combinados).
      const eventos: TimelineEvent[] = [];

      const ventasEv = await client.query<{
        fecha: string;
        total: string;
        numero_control: string;
      }>(
        `SELECT fecha, total::text, numero_control
         FROM ${ventasT}
         WHERE empresa_id = $1 AND cliente_id = $2
         ORDER BY fecha DESC LIMIT 50`,
        [empresaId, clienteId],
      );
      for (const r of ventasEv.rows) {
        eventos.push({
          tipo: "venta",
          fecha: r.fecha,
          monto: Number(r.total),
          referencia: r.numero_control,
          detalle: "Venta al cliente",
        });
      }

      const recepEv = await client.query<{
        fecha: string;
        total_credito: string;
        numero_control: string;
      }>(
        `SELECT fecha, total_credito::text, numero_control
         FROM ${recepT}
         WHERE empresa_id = $1 AND cliente_id = $2 AND estado = 'registrada'
         ORDER BY fecha DESC LIMIT 50`,
        [empresaId, clienteId],
      );
      for (const r of recepEv.rows) {
        eventos.push({
          tipo: "recepcion",
          fecha: r.fecha,
          monto: Number(r.total_credito),
          referencia: r.numero_control,
          detalle: "Recepción de prendas (crédito generado)",
        });
      }

      const credEv = await client.query<{
        fecha: string;
        tipo: string;
        monto: string;
        origen: string;
        referencia_numero: string | null;
        observaciones: string | null;
      }>(
        `SELECT fecha, tipo, monto::text, origen, referencia_numero, observaciones
         FROM ${creditosT}
         WHERE empresa_id = $1 AND cliente_id = $2
         ORDER BY fecha DESC LIMIT 50`,
        [empresaId, clienteId],
      );
      for (const r of credEv.rows) {
        // Skip ENTRADA por 'recepcion' (ya está representada en recepEv).
        if (r.tipo === "ENTRADA" && r.origen === "recepcion") continue;
        eventos.push({
          tipo:
            r.tipo === "ENTRADA"
              ? "credito_entrada"
              : r.tipo === "SALIDA"
              ? "credito_uso"
              : "credito_entrada",
          fecha: r.fecha,
          monto: Number(r.monto),
          referencia: r.referencia_numero,
          detalle: r.observaciones ?? `${r.tipo} · ${r.origen}`,
        });
      }

      // Eventos manuales (reclamos, elogios, beneficios, descuentos, cashback, cambios, otros).
      try {
        const evEv = await client.query<{
          fecha: string;
          tipo: string;
          titulo: string | null;
          descripcion: string;
          monto: string | null;
          referencia_numero: string | null;
        }>(
          `SELECT fecha, tipo, titulo, descripcion, monto::text, referencia_numero
           FROM ${eventosT}
           WHERE empresa_id = $1 AND cliente_id = $2 AND deleted_at IS NULL
           ORDER BY fecha DESC LIMIT 100`,
          [empresaId, clienteId],
        );
        for (const r of evEv.rows) {
          const tipo = (
            [
              "reclamo",
              "elogio",
              "beneficio",
              "descuento",
              "cashback",
              "cambio",
              "otro",
            ].includes(r.tipo)
              ? r.tipo
              : "otro"
          ) as TimelineEvent["tipo"];
          eventos.push({
            tipo,
            fecha: r.fecha,
            monto: r.monto == null ? null : Number(r.monto),
            referencia: r.referencia_numero,
            detalle: r.titulo ? `${r.titulo} — ${r.descripcion}` : r.descripcion,
          });
        }
      } catch {
        /* tabla cliente_eventos no existe todavía (migración pendiente) */
      }

      eventos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

      return NextResponse.json(
        successResponse({ kpis, timeline: eventos.slice(0, 200) }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/consultas GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
