import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { isAdmin } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "sucursal";
}

/**
 * GET /api/sucursales — lista de sucursales activas de la empresa del usuario.
 *
 * Si el schema no tiene la tabla `sucursales` (deploys Elevate viejos),
 * devuelve un array vacío sin error. Se puede pedir el listado completo
 * (incluyendo inactivas) con `?incluir_inactivas=1`.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const url = new URL(request.url);
    const incluirInactivas = url.searchParams.get("incluir_inactivas") === "1";
    try {
      let q = ctx.supabase
        .from("sucursales")
        .select("id,nombre,slug,es_principal,activo")
        .eq("empresa_id", empresaId);
      if (!incluirInactivas) q = q.eq("activo", true);
      const { data, error } = await q
        .order("es_principal", { ascending: false })
        .order("nombre", { ascending: true });
      if (error) {
        // Log server-side pero no romper el cliente. Antes se tragaba el
        // error silencioso y el dropdown quedaba vacío sin explicación.
        console.error("[/api/sucursales GET] query", {
          empresaId,
          message: error.message,
          code: (error as { code?: string }).code,
        });
        return NextResponse.json(
          successResponse({ sucursales: [], warning: error.message }),
        );
      }
      return NextResponse.json(successResponse({ sucursales: data ?? [] }));
    } catch (e) {
      console.error("[/api/sucursales GET] catch", e instanceof Error ? e.message : e);
      return NextResponse.json(successResponse({ sucursales: [] }));
    }
  } catch (err) {
    console.error("[/api/sucursales GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las sucursales."), { status: 500 });
  }
}

/**
 * POST /api/sucursales (admin-only) — crea una sucursal para la empresa
 * del usuario. Body: { nombre, slug?, es_principal? }.
 *
 * - `slug` se autogenera desde `nombre` si no viene.
 * - Si `es_principal=true` y ya hay otra principal, se degrada la anterior
 *   (índice único parcial `sucursales_una_principal_por_empresa`).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo administradores pueden crear sucursales."), { status: 403 });
    }
    // Un admin con sucursal fija no puede crear sucursales de la empresa
    // (mismo criterio que los otros endpoints operativos).
    if (ctx.auth.sucursal_id) {
      return NextResponse.json(
        errorResponse("Tu usuario está asignado a una sucursal específica; no podés crear otras."),
        { status: 403 },
      );
    }

    let body: { nombre?: string; slug?: string; es_principal?: boolean };
    try { body = await request.json(); } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) {
      return NextResponse.json(errorResponse("El nombre de la sucursal es obligatorio."), { status: 400 });
    }
    if (nombre.length > 80) {
      return NextResponse.json(errorResponse("El nombre no puede superar 80 caracteres."), { status: 400 });
    }
    const slugRaw = String(body.slug ?? "").trim();
    const slug = slugRaw ? slugify(slugRaw) : slugify(nombre);
    const esPrincipal = body.es_principal === true;

    const empresaId = ctx.auth.empresa_id;

    // Si es_principal=true, primero degradamos cualquier principal existente
    // para no chocar con el índice único parcial.
    if (esPrincipal) {
      const upd = await ctx.supabase
        .from("sucursales")
        .update({ es_principal: false })
        .eq("empresa_id", empresaId)
        .eq("es_principal", true);
      if (upd.error) {
        return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
      }
    }

    const ins = await ctx.supabase
      .from("sucursales")
      .insert({
        empresa_id: empresaId,
        nombre,
        slug,
        es_principal: esPrincipal,
        activo: true,
      })
      .select("id,nombre,slug,es_principal,activo")
      .single();

    if (ins.error) {
      const code = (ins.error as { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json(
          errorResponse("Ya existe una sucursal con ese slug en la empresa. Probá otro nombre."),
          { status: 409 },
        );
      }
      return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    }

    // Seed automático: crear "Caja 1" para la sucursal recién creada, si
    // aún no existiera. Deja la sucursal lista para abrir caja.
    try {
      const sid = (ins.data as { id: string }).id;
      const { data: yaPunto } = await ctx.supabase
        .from("puntos_caja")
        .select("id")
        .eq("sucursal_id", sid)
        .limit(1)
        .maybeSingle();
      if (!yaPunto) {
        await ctx.supabase.from("puntos_caja").insert({
          empresa_id: empresaId,
          sucursal_id: sid,
          nombre: "Caja 1",
          orden: 1,
          activo: true,
        });
      }
    } catch { /* si el schema no tiene puntos_caja aún, no bloquea */ }

    return NextResponse.json(successResponse({ sucursal: ins.data }));
  } catch (err) {
    console.error("[/api/sucursales POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo crear la sucursal."), { status: 500 });
  }
}

/**
 * PATCH /api/sucursales (admin-only) — actualiza una sucursal.
 * Body: { id, nombre?, es_principal?, activo? }.
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(ctx.auth)) {
      return NextResponse.json(errorResponse("Solo administradores pueden modificar sucursales."), { status: 403 });
    }
    if (ctx.auth.sucursal_id) {
      return NextResponse.json(
        errorResponse("Tu usuario está asignado a una sucursal específica; no podés modificar otras."),
        { status: 403 },
      );
    }

    let body: { id?: string; nombre?: string; es_principal?: boolean; activo?: boolean };
    try { body = await request.json(); } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json(errorResponse("Falta el id de la sucursal."), { status: 400 });

    // Verificar pertenencia a la empresa.
    const { data: existente } = await ctx.supabase
      .from("sucursales")
      .select("id, empresa_id, es_principal")
      .eq("id", id)
      .maybeSingle();
    if (!existente || (existente as { empresa_id: string }).empresa_id !== ctx.auth.empresa_id) {
      return NextResponse.json(errorResponse("La sucursal no pertenece a tu empresa."), { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.nombre === "string") {
      const n = body.nombre.trim();
      if (!n) return NextResponse.json(errorResponse("El nombre no puede estar vacío."), { status: 400 });
      updates.nombre = n;
    }
    if (typeof body.activo === "boolean") updates.activo = body.activo;
    if (typeof body.es_principal === "boolean" && body.es_principal === true) {
      const upd = await ctx.supabase
        .from("sucursales")
        .update({ es_principal: false })
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("es_principal", true)
        .neq("id", id);
      if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
      updates.es_principal = true;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(errorResponse("No hay cambios que guardar."), { status: 400 });
    }

    const upd = await ctx.supabase
      .from("sucursales")
      .update(updates)
      .eq("id", id)
      .select("id,nombre,slug,es_principal,activo")
      .single();
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ sucursal: upd.data }));
  } catch (err) {
    console.error("[/api/sucursales PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar la sucursal."), { status: 500 });
  }
}
