import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/caja/ultimo-cierre?punto_caja_id=...
 *
 * Devuelve el `monto_cierre_contado` (y fecha) del último cierre de caja
 * para el scope del usuario. Se usa para prellenar el monto de apertura
 * del día siguiente — la plata que quedó en la caja al cerrar es la que
 * debería quedar al abrir.
 *
 * Scope:
 *   - Usuario con sucursal fija: sólo cajas de su sucursal.
 *   - Admin global: cajas de la empresa (opcional filtro por sucursal via
 *     ?sucursal_id).
 *   - Filtro opcional por punto_caja_id — así el prefill respeta el punto
 *     de caja específico que se va a abrir (importante en multi-caja).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const url = new URL(request.url);
    const puntoCajaId = url.searchParams.get("punto_caja_id");
    const sucursalParam = url.searchParams.get("sucursal_id");
    const sucursalIdFinal = auth.sucursal_id
      ? auth.sucursal_id
      : (sucursalParam?.trim()
          || (await resolveSucursalIdForUserPg(schema, auth.empresa_id, null)));

    const sb = createServiceRoleClientWithDbSchema(schema);
    let q = sb
      .from("cajas")
      .select("id, fecha_cierre, monto_cierre_contado, punto_caja_id, sucursal_id")
      .eq("empresa_id", auth.empresa_id)
      .eq("estado", "cerrada");
    if (sucursalIdFinal) q = q.eq("sucursal_id", sucursalIdFinal);
    if (puntoCajaId) q = q.eq("punto_caja_id", puntoCajaId);
    const r = await q
      .order("fecha_cierre", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (r.error) throw new Error(r.error.message);
    const row = r.data as
      | { id: string; fecha_cierre: string | null; monto_cierre_contado: number | string | null }
      | null;

    if (!row) {
      return NextResponse.json(successResponse({
        monto: 0,
        fecha_cierre: null,
        caja_id: null,
      }));
    }
    const monto = row.monto_cierre_contado == null ? 0 : Number(row.monto_cierre_contado) || 0;
    return NextResponse.json(successResponse({
      monto,
      fecha_cierre: row.fecha_cierre,
      caja_id: row.id,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo obtener el último cierre.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
