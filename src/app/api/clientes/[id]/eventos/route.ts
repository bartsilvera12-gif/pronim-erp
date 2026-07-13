import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

const TIPOS_VALIDOS = new Set([
  "reclamo",
  "elogio",
  "beneficio",
  "descuento",
  "cashback",
  "cambio",
  "otro",
]);

const EVENTO_COLS =
  "id,cliente_id,tipo,titulo,descripcion,monto,referencia_tipo,referencia_id,referencia_numero," +
  "fecha,autor_id,autor_nombre,created_at";

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const qs = new URLSearchParams({
      select: EVENTO_COLS,
      empresa_id: `eq.${empresaId}`,
      cliente_id: `eq.${clienteId}`,
      deleted_at: "is.null",
      order: "fecha.desc",
      limit: "500",
    });
    const r = await postgrestGet<Record<string, unknown>>(
      "cliente_eventos",
      qs.toString(),
      { role: "jwt", jwt, noStore: true },
    );
    if (!r.ok) {
      return NextResponse.json(errorResponse("No se pudieron cargar los eventos."), { status: 502 });
    }
    return NextResponse.json(successResponse({ eventos: r.rows }));
  } catch (err) {
    console.error("[/api/clientes/[id]/eventos GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}

/**
 * POST — registra un evento manual sobre el cliente. Append-only.
 * Body:
 *   { tipo, descripcion, titulo?, monto?, fecha?, generar_credito?,
 *     referencia_tipo?, referencia_id?, referencia_numero? }
 *
 * Si tipo=cashback y generar_credito=true, además crea un asiento
 * ENTRADA en cliente_creditos_movimientos (que va a los lotes FIFO).
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const tipo = String(body.tipo ?? "").trim().toLowerCase();
    if (!TIPOS_VALIDOS.has(tipo)) {
      return NextResponse.json(errorResponse("Tipo de evento inválido."), { status: 400 });
    }
    const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
    if (!descripcion) {
      return NextResponse.json(errorResponse("La descripción es obligatoria."), { status: 400 });
    }
    if (descripcion.length > 4000) {
      return NextResponse.json(errorResponse("Descripción demasiado larga (máx 4000)."), { status: 400 });
    }
    const titulo = typeof body.titulo === "string" ? body.titulo.trim().slice(0, 200) : null;
    const montoRaw = body.monto;
    const monto =
      montoRaw == null || montoRaw === ""
        ? null
        : Math.max(0, Number(montoRaw) || 0);
    const fecha = typeof body.fecha === "string" && body.fecha ? body.fecha : null;
    const refTipo =
      typeof body.referencia_tipo === "string" ? body.referencia_tipo.slice(0, 60) : null;
    const refId =
      typeof body.referencia_id === "string" && body.referencia_id ? body.referencia_id : null;
    const refNumero =
      typeof body.referencia_numero === "string"
        ? body.referencia_numero.slice(0, 60)
        : null;
    const generarCredito =
      tipo === "cashback" && body.generar_credito === true && monto != null && monto > 0;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const eventosT = quoteSchemaTable(schema, "cliente_eventos");
    const creditosT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const cliT = quoteSchemaTable(schema, "clientes");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cl = await client.query(
        `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
        [clienteId, auth.empresa_id],
      );
      if (!cl.rows.length) {
        throw new Error("Cliente no encontrado en esta empresa.");
      }

      const ins = await client.query<Record<string, unknown>>(
        `INSERT INTO ${eventosT} (
           empresa_id, cliente_id, tipo, titulo, descripcion, monto,
           referencia_tipo, referencia_id, referencia_numero,
           fecha, autor_id, autor_nombre
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   COALESCE($10::timestamptz, now()), $11, $12)
         RETURNING *`,
        [
          auth.empresa_id,
          clienteId,
          tipo,
          titulo,
          descripcion,
          monto,
          refTipo,
          refId,
          refNumero,
          fecha,
          auth.user.id ?? null,
          auth.nombre ?? null,
        ],
      );
      const evento = ins.rows[0];

      if (generarCredito) {
        await client.query(
          `INSERT INTO ${creditosT} (
             empresa_id, cliente_id, tipo, monto, origen,
             referencia_tipo, referencia_numero, observaciones,
             created_by, usuario_nombre
           ) VALUES ($1, $2, 'ENTRADA', $3, 'ajuste_manual',
                     'cashback', $4, $5, $6, $7)`,
          [
            auth.empresa_id,
            clienteId,
            monto,
            titulo ?? "Cashback",
            `Cashback: ${descripcion.slice(0, 200)}`,
            auth.user.id ?? null,
            auth.nombre ?? null,
          ],
        );
      }

      await client.query("COMMIT");
      return NextResponse.json(
        successResponse({ evento, credito_generado: generarCredito }),
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error("[/api/clientes/[id]/eventos POST]", msg);
    return NextResponse.json(
      errorResponse(msg),
      { status: msg.includes("Cliente no encontrado") ? 400 : 500 },
    );
  }
}
