import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  postgrestGet,
  postgrestInsert,
  getAccessTokenForRequest,
} from "@/lib/supabase/postgrest-runtime";

const NOTA_COLS =
  "id,cliente_id,autor_id,autor_nombre,texto,created_at,deleted_at,deleted_by,deleted_by_nombre";

/** GET — lista notas activas del cliente. */
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
      select: NOTA_COLS,
      empresa_id: `eq.${empresaId}`,
      cliente_id: `eq.${clienteId}`,
      deleted_at: "is.null",
      order: "created_at.desc",
      limit: "200",
    });
    const r = await postgrestGet<Record<string, unknown>>(
      "cliente_notas",
      qs.toString(),
      { role: "jwt", jwt, noStore: true },
    );
    if (!r.ok) {
      return NextResponse.json(errorResponse("No se pudieron cargar las notas."), { status: 502 });
    }
    return NextResponse.json(successResponse({ notas: r.rows }));
  } catch (err) {
    console.error("[/api/clientes/[id]/notas GET]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}

/** POST — agrega una nota. Autor: usuario actual. */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const jwt = await getAccessTokenForRequest(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const texto = typeof body.texto === "string" ? body.texto.trim() : "";
    if (!texto) return NextResponse.json(errorResponse("El texto es requerido."), { status: 400 });
    if (texto.length > 4000) {
      return NextResponse.json(errorResponse("Nota demasiado larga (máx 4000)."), { status: 400 });
    }

    const r = await postgrestInsert<Record<string, unknown>>(
      "cliente_notas",
      {
        empresa_id: auth.empresa_id,
        cliente_id: clienteId,
        autor_id: auth.user.id,
        autor_nombre: auth.nombre ?? null,
        texto,
      },
      { role: "jwt", jwt },
    );
    if (!r.ok) {
      console.error("[/api/clientes/[id]/notas POST]", r.error);
      return NextResponse.json(errorResponse("No se pudo guardar la nota."), { status: 502 });
    }
    return NextResponse.json(successResponse({ nota: r.rows[0] ?? null }));
  } catch (err) {
    console.error("[/api/clientes/[id]/notas POST]", err);
    return NextResponse.json(errorResponse("Error inesperado."), { status: 500 });
  }
}
