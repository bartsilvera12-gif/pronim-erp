import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET/PATCH de la config del modal previo al cierre de atención (/caja).
 * Estructura del JSON: ver migración 20260819000000_pronimerp_atencion_alertas_config.sql
 */

const TIPOS_EVENTO_VALIDOS = new Set(["beneficio", "descuento", "cashback", "otro"]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const empresasT = quoteSchemaTable(schema, "empresas");
    const client = await pool.connect();
    try {
      const r = await client.query<{ alertas_atencion_config: unknown }>(
        `SELECT alertas_atencion_config FROM ${empresasT} WHERE id = $1 LIMIT 1`,
        [ctx.auth.empresa_id],
      );
      return NextResponse.json(
        successResponse({ config: r.rows[0]?.alertas_atencion_config ?? null }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/configuracion/atencion-alertas GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la configuración."), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo un administrador puede modificar esta configuración."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nuevo = body.config;
    if (!nuevo || typeof nuevo !== "object" || Array.isArray(nuevo)) {
      return NextResponse.json(errorResponse("Falta 'config' (objeto)."), { status: 400 });
    }

    // Validación superficial — evita basura obvia; el resto lo defiende el UI.
    const src = nuevo as Record<string, unknown>;
    function alertaOk(key: string, numKey: string): true | string {
      const a = src[key];
      if (a == null) return true; // permitimos ausencia → toma default
      if (typeof a !== "object" || Array.isArray(a)) return `${key}: debe ser objeto`;
      const obj = a as Record<string, unknown>;
      if ("activa" in obj && typeof obj.activa !== "boolean") return `${key}.activa`;
      if (numKey in obj && (typeof obj[numKey] !== "number" || (obj[numKey] as number) < 0)) return `${key}.${numKey}`;
      if ("titulo" in obj && typeof obj.titulo !== "string") return `${key}.titulo`;
      if ("mensaje" in obj && typeof obj.mensaje !== "string") return `${key}.mensaje`;
      return true;
    }
    for (const [key, numKey] of [
      ["prendas_caras", "precio_min"],
      ["prendas_baratas", "precio_max"],
      ["pocas_prendas", "cantidad_max"],
    ] as const) {
      const v = alertaOk(key, numKey);
      if (v !== true) return NextResponse.json(errorResponse(`Config inválida en ${v}.`), { status: 400 });
    }
    if ("beneficios" in src) {
      if (!Array.isArray(src.beneficios)) {
        return NextResponse.json(errorResponse("beneficios debe ser lista."), { status: 400 });
      }
      for (const b of src.beneficios as unknown[]) {
        if (!b || typeof b !== "object") return NextResponse.json(errorResponse("beneficio inválido."), { status: 400 });
        const bo = b as Record<string, unknown>;
        if (typeof bo.id !== "string" || !bo.id) return NextResponse.json(errorResponse("beneficio.id"), { status: 400 });
        if (typeof bo.label !== "string" || !bo.label) return NextResponse.json(errorResponse("beneficio.label"), { status: 400 });
        if (typeof bo.tipo_evento !== "string" || !TIPOS_EVENTO_VALIDOS.has(bo.tipo_evento)) {
          return NextResponse.json(errorResponse("beneficio.tipo_evento inválido."), { status: 400 });
        }
      }
    }

    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const empresasT = quoteSchemaTable(schema, "empresas");
    const client = await pool.connect();
    try {
      const r = await client.query<{ alertas_atencion_config: unknown }>(
        `UPDATE ${empresasT} SET alertas_atencion_config = $2
         WHERE id = $1
         RETURNING alertas_atencion_config`,
        [ctx.auth.empresa_id, JSON.stringify(nuevo)],
      );
      return NextResponse.json(
        successResponse({ config: r.rows[0]?.alertas_atencion_config ?? nuevo }),
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/configuracion/atencion-alertas PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la configuración."), { status: 500 });
  }
}
