import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { normalizarCarteraConfig, CARTERA_CONFIG_DEFAULT } from "@/lib/cartera/cartera-config";

/**
 * GET/PATCH de la config de cartera (vencimiento del cashback).
 * Guardado en empresas.cartera_config (jsonb).
 */

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const empresasT = quoteSchemaTable(schema, "empresas");
    const r = await pool.query<{ cartera_config: unknown }>(
      `SELECT cartera_config FROM ${empresasT} WHERE id = $1 LIMIT 1`,
      [ctx.auth.empresa_id],
    ).catch((e) => {
      if (e?.code === "42703") return { rows: [{ cartera_config: CARTERA_CONFIG_DEFAULT }] };
      throw e;
    });
    return NextResponse.json(successResponse({ config: normalizarCarteraConfig(r.rows[0]?.cartera_config) }));
  } catch (err) {
    console.error("[/api/configuracion/cartera GET]", err);
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
    const cfg = normalizarCarteraConfig(body.config);
    if (cfg.cashback_vencimiento_dias > 3650) {
      return NextResponse.json(errorResponse("El vencimiento no puede superar 3650 días."), { status: 400 });
    }

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const empresasT = quoteSchemaTable(schema, "empresas");
    const r = await pool.query<{ cartera_config: unknown }>(
      `UPDATE ${empresasT} SET cartera_config = $2::jsonb WHERE id = $1 RETURNING cartera_config`,
      [ctx.auth.empresa_id, JSON.stringify(cfg)],
    ).catch((e) => {
      if (e?.code === "42703") {
        throw new Error("Aplicá la migración 20260922_cartera_config antes de guardar.");
      }
      throw e;
    });
    return NextResponse.json(successResponse({ config: normalizarCarteraConfig(r.rows[0]?.cartera_config) }));
  } catch (err) {
    console.error("[/api/configuracion/cartera PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "No se pudo guardar."), { status: 500 });
  }
}
