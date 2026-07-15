import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/puntos-caja
 *
 * Lista puntos de caja activos visibles al usuario:
 *   - Usuario con sucursal fija → sólo los de su sucursal.
 *   - Admin global → todos los de la empresa (o filtrado por ?sucursal_id).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const sb = createServiceRoleClientWithDbSchema(schema);
    const url = new URL(request.url);
    const sucursalFiltro = url.searchParams.get("sucursal_id");

    let q = sb
      .from("puntos_caja")
      .select("id, empresa_id, sucursal_id, nombre, orden, activo, created_at")
      .eq("empresa_id", auth.empresa_id)
      .eq("activo", true);
    if (auth.sucursal_id) q = q.eq("sucursal_id", auth.sucursal_id);
    else if (sucursalFiltro?.trim()) q = q.eq("sucursal_id", sucursalFiltro.trim());
    const r = await q.order("orden", { ascending: true }).order("nombre", { ascending: true });
    if (r.error) {
      // Schema sin tabla puntos_caja (deploys previos a la migración): degradar sin error.
      return NextResponse.json(successResponse({ puntos: [] }));
    }
    return NextResponse.json(successResponse({ puntos: r.data ?? [] }));
  } catch (err) {
    console.error("[/api/puntos-caja GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los puntos de caja."), { status: 500 });
  }
}

/**
 * POST /api/puntos-caja  (admin-only)
 *
 * Crea un punto de caja para una sucursal de la empresa. Ejemplo:
 *   { sucursal_id: <uuid>, nombre: "Caja 2", orden: 2 }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  if (!isAdmin(auth)) {
    return NextResponse.json(errorResponse("Solo administradores pueden crear puntos de caja."), { status: 403 });
  }

  let body: { sucursal_id?: string; nombre?: string; orden?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }
  const sucursalId = String(body.sucursal_id ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  const orden = Number.isFinite(Number(body.orden)) ? Math.max(1, Math.floor(Number(body.orden))) : 1;
  if (!sucursalId || !nombre) {
    return NextResponse.json(errorResponse("sucursal_id y nombre son obligatorios."), { status: 400 });
  }

  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const sb = createServiceRoleClientWithDbSchema(schema);

    // Verificar sucursal pertenece a la empresa.
    const sQ = await sb
      .from("sucursales")
      .select("id, empresa_id, activo")
      .eq("id", sucursalId)
      .maybeSingle();
    const sRow = sQ.data as { empresa_id: string; activo: boolean } | null;
    if (!sRow || sRow.empresa_id !== auth.empresa_id) {
      return NextResponse.json(errorResponse("La sucursal no pertenece a tu empresa."), { status: 400 });
    }
    if (sRow.activo !== true) {
      return NextResponse.json(errorResponse("La sucursal está inactiva."), { status: 400 });
    }

    // Si el usuario admin tiene sucursal fija, sólo puede crear puntos en la suya.
    if (auth.sucursal_id && auth.sucursal_id !== sucursalId) {
      return NextResponse.json(
        errorResponse("Tu usuario está asignado a una sucursal específica; no podés crear puntos en otra."),
        { status: 403 },
      );
    }

    const ins = await sb
      .from("puntos_caja")
      .insert({ empresa_id: auth.empresa_id, sucursal_id: sucursalId, nombre, orden, activo: true })
      .select("id, empresa_id, sucursal_id, nombre, orden, activo, created_at")
      .single();
    if (ins.error) {
      // Unique (sucursal_id, nombre) → 409.
      const code = (ins.error as { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json(
          errorResponse("Ya existe un punto de caja con ese nombre en la sucursal."),
          { status: 409 },
        );
      }
      return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ punto: ins.data }));
  } catch (err) {
    console.error("[/api/puntos-caja POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo crear el punto de caja."), { status: 500 });
  }
}
