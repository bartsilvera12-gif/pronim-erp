import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const DEFAULTS = [
  { codigo: "efectivo",      label: "Efectivo",      orden: 10 },
  { codigo: "tarjeta",       label: "Tarjeta",       orden: 20 },
  { codigo: "transferencia", label: "Transferencia", orden: 30 },
  { codigo: "qr",            label: "QR",            orden: 40 },
  { codigo: "billetera",     label: "Billetera",     orden: 50 },
  { codigo: "otro",          label: "Otro",          orden: 90 },
];

/**
 * GET  /api/formas-pago         → activas (para <select> en flujos de venta)
 * PATCH /api/formas-pago (admin) → { codigo, label?, orden?, activo? }
 *
 * Si la tabla no existe, GET devuelve DEFAULTS (compat 100%).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "formas_pago_config");
    const soloActivas = request.nextUrl.searchParams.get("todos") !== "1";
    const filtro = soloActivas ? "AND activo = true" : "";
    try {
      const { rows } = await pool.query<{
        id: string; codigo: string; label: string; orden: number; activo: boolean;
      }>(
        `SELECT id, codigo, label, orden, activo
           FROM ${t}
          WHERE empresa_id = $1 ${filtro}
          ORDER BY orden ASC, label ASC`,
        [auth.empresa_id],
      );
      return NextResponse.json(successResponse({ formas: rows }));
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "42P01") {
        return NextResponse.json(successResponse({
          formas: DEFAULTS.map((d) => ({ id: d.codigo, ...d, activo: true })),
          warning: "Aplicá la migración 20260918_pronimerp_formas_pago_config para editarlas.",
        }));
      }
      throw e;
    }
  } catch (err) {
    console.error("[/api/formas-pago GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });

    let body: { codigo?: string; label?: string; orden?: number; activo?: boolean } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const codigo = String(body.codigo ?? "").trim();
    const codigosOk = new Set(DEFAULTS.map((d) => d.codigo));
    if (!codigosOk.has(codigo)) return NextResponse.json(errorResponse("codigo inválido."), { status: 400 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "formas_pago_config");

    await pool.query(
      `UPDATE ${t} SET
         label  = COALESCE($2, label),
         orden  = COALESCE($3, orden),
         activo = COALESCE($4, activo),
         updated_at = now()
       WHERE empresa_id = $1 AND codigo = $5`,
      [
        auth.empresa_id,
        typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 40) : null,
        Number.isFinite(body.orden) ? Number(body.orden) : null,
        typeof body.activo === "boolean" ? body.activo : null,
        codigo,
      ],
    );
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/formas-pago PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
