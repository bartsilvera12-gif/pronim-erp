import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const DEFAULTS = [
  { codigo: "redondeo",    label: "Redondeo",             orden: 10 },
  { codigo: "negociacion", label: "Negociación",          orden: 20 },
  { codigo: "defecto",     label: "Producto con defecto", orden: 30 },
  { codigo: "promocion",   label: "Promoción",            orden: 40 },
  { codigo: "cortesia",    label: "Cortesía",             orden: 50 },
  { codigo: "intercambio", label: "Intercambio (BR)",     orden: 60 },
  { codigo: "otro",        label: "Otro",                 orden: 90 },
];

/**
 * GET  /api/motivos-descuento         → lista activos (para <select>)
 * POST /api/motivos-descuento         → { codigo, label, orden? } admin
 * PATCH /api/motivos-descuento        → { id, label?, orden?, activo? } admin
 *
 * Si la tabla no existe todavía (migración no corrida), GET devuelve la
 * lista default hardcodeada — el UI sigue funcionando sin degradación
 * visible.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "motivos_descuento");
    const soloActivos = request.nextUrl.searchParams.get("todos") !== "1";
    const filtro = soloActivos ? "AND activo = true" : "";
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
      return NextResponse.json(successResponse({ motivos: rows }));
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "42P01") {
        // Tabla no existe → defaults en memoria
        return NextResponse.json(successResponse({
          motivos: DEFAULTS.map((d) => ({ id: d.codigo, ...d, activo: true })),
          warning: "Tabla motivos_descuento no existe. Aplicá la migración para editarlos desde admin.",
        }));
      }
      throw e;
    }
  } catch (err) {
    console.error("[/api/motivos-descuento GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });

    let body: { codigo?: string; label?: string; orden?: number } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const codigo = String(body.codigo ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 40);
    const label  = String(body.label ?? "").trim().slice(0, 80);
    const orden  = Number.isFinite(body.orden) ? Number(body.orden) : 100;
    if (!codigo || !label) return NextResponse.json(errorResponse("codigo y label requeridos."), { status: 400 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "motivos_descuento");
    const r = await pool.query<{ id: string }>(
      `INSERT INTO ${t} (empresa_id, codigo, label, orden)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, codigo) DO UPDATE
         SET label = EXCLUDED.label, orden = EXCLUDED.orden,
             activo = true, updated_at = now()
       RETURNING id`,
      [auth.empresa_id, codigo, label, orden],
    );
    return NextResponse.json(successResponse({ id: r.rows[0]?.id }));
  } catch (err) {
    console.error("[/api/motivos-descuento POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });

    let body: { id?: string; label?: string; orden?: number; activo?: boolean } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json(errorResponse("id requerido."), { status: 400 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const t = quoteSchemaTable(schema, "motivos_descuento");
    await pool.query(
      `UPDATE ${t} SET
         label  = COALESCE($2, label),
         orden  = COALESCE($3, orden),
         activo = COALESCE($4, activo),
         updated_at = now()
       WHERE empresa_id = $1 AND id = $5::uuid`,
      [
        auth.empresa_id,
        typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null,
        Number.isFinite(body.orden) ? Number(body.orden) : null,
        typeof body.activo === "boolean" ? body.activo : null,
        id,
      ],
    );
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/motivos-descuento PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
