import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { cerrarCajaPg, getCajaAbiertaPg } from "@/lib/caja/server/caja-pg";
import { SIN_SUCURSAL_MENSAJE } from "@/lib/sucursales/enforce";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** POST /api/caja/cerrar — cierra la caja con efectivo contado y calcula diferencia. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!auth.sucursal_id && !esRolAdminEmpresaOGlobal(auth.rol ?? undefined)) {
      return NextResponse.json(errorResponse(SIN_SUCURSAL_MENSAJE), { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const o = (body ?? {}) as Record<string, unknown>;
    const montoCierre = Number(o.monto_cierre_contado);
    if (!Number.isFinite(montoCierre) || montoCierre < 0) {
      return NextResponse.json(errorResponse("Monto contado inválido."), { status: 400 });
    }
    const observacion =
      o.observacion == null || o.observacion === "" ? null : String(o.observacion).slice(0, 2000);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    let cajaId = o.caja_id == null || o.caja_id === "" ? null : String(o.caja_id);
    if (!cajaId) {
      const abierta = await getCajaAbiertaPg(schema, auth.empresa_id, auth.sucursal_id ?? null);
      if (!abierta) {
        return NextResponse.json(errorResponse("No hay ninguna caja abierta para cerrar."), { status: 409 });
      }
      cajaId = abierta.id;
    } else if (auth.sucursal_id) {
      // Vendedor con sucursal fija: la caja indicada debe pertenecer a su sucursal.
      const sb0 = createServiceRoleClientWithDbSchema(schema);
      const { data: cajaRow } = await sb0
        .from("cajas")
        .select("id, sucursal_id, empresa_id")
        .eq("id", cajaId)
        .maybeSingle();
      if (
        !cajaRow ||
        cajaRow.empresa_id !== auth.empresa_id ||
        cajaRow.sucursal_id !== auth.sucursal_id
      ) {
        return NextResponse.json(
          errorResponse("La caja indicada no pertenece a tu sucursal."),
          { status: 403 },
        );
      }
    }

    const resumen = await cerrarCajaPg({
      schema,
      empresaId: auth.empresa_id,
      cajaId,
      montoCierreContado: montoCierre,
      observacion,
      usuarioId: auth.usuarioCatalogId ?? null,
    });
    return NextResponse.json(successResponse({ resumen }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cerrar la caja.";
    const status = msg.includes("no encontrada") || msg.includes("ya está cerrada") ? 409 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
