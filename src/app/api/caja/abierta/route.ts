import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getCajaAbiertaPg, getCajasAbiertasPg } from "@/lib/caja/server/caja-pg";
import { resolveSucursalIdForUserPg } from "@/lib/sucursales/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/caja/abierta — cajas abiertas ahora.
 *
 * Con multi-caja por sucursal puede haber varias abiertas simultáneas
 * (una por punto). El endpoint devuelve:
 *   - `caja`: primera caja abierta (compat con UI legacy).
 *   - `cajas`: TODAS las abiertas visibles al usuario.
 *
 * Alcance:
 *   - Usuario con `sucursal_id` fija → sólo cajas de su sucursal.
 *   - Admin global → todas las de la empresa (o filtrado por ?sucursal_id).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    const url = new URL(request.url);
    const sucursalBody = url.searchParams.get("sucursal_id");
    const sucursalIdFinal = auth.sucursal_id
      ? auth.sucursal_id
      : (sucursalBody?.trim() ||
          (await resolveSucursalIdForUserPg(schema, auth.empresa_id, null)));

    const cajas = await getCajasAbiertasPg(schema, auth.empresa_id, {
      sucursalId: sucursalIdFinal ?? null,
    });
    // Compat: `caja` = la primera abierta (o null). El cliente moderno debe
    // usar `cajas` y elegir por punto_caja_id.
    const caja = cajas[0] ?? (await getCajaAbiertaPg(schema, auth.empresa_id, sucursalIdFinal));
    return NextResponse.json(successResponse({ caja, cajas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo obtener la caja.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
