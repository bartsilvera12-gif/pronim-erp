import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { postgrestGet, getAccessTokenForRequest } from "@/lib/supabase/postgrest-runtime";

const MOV_COLS =
  "id,cliente_id,tipo,monto,origen,referencia_id,referencia_tipo,referencia_numero," +
  "observaciones,fecha,created_by,usuario_nombre";

/**
 * GET /api/clientes/[id]/creditos — saldo actual + últimos 200 movimientos.
 *
 * El saldo se computa server-side (SUM CASE) para evitar depender de una
 * view expuesta a PostgREST (que podría no tener grants correctos en
 * clonados anteriores). Los movimientos vienen ordenados por fecha DESC.
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
    const jwt = await getAccessTokenForRequest(request);

    const qs = new URLSearchParams({
      select: MOV_COLS,
      empresa_id: `eq.${empresaId}`,
      cliente_id: `eq.${clienteId}`,
      order: "fecha.desc",
      limit: "200",
    });
    const r = await postgrestGet<Record<string, unknown>>(
      "cliente_creditos_movimientos",
      qs.toString(),
      { role: "jwt", jwt, noStore: true },
    );
    if (!r.ok) {
      return NextResponse.json(errorResponse("No se pudieron cargar los créditos."), { status: 502 });
    }
    const movimientos = r.rows;
    const saldo = movimientos.reduce((acc: number, m) => {
      const tipo = String((m as { tipo?: string }).tipo ?? "");
      const monto = Number((m as { monto?: unknown }).monto ?? 0);
      if (tipo === "ENTRADA") return acc + monto;
      if (tipo === "SALIDA") return acc - monto;
      if (tipo === "AJUSTE") return acc + monto;
      return acc;
    }, 0);

    return NextResponse.json(successResponse({ saldo, movimientos }));
  } catch (err) {
    console.error("[/api/clientes/[id]/creditos GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
