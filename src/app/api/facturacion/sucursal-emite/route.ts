import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/facturacion/sucursal-emite[?sucursal_id=…]
 *
 * ¿La sucursal donde estoy parado emite factura con timbrado?
 *
 * Lo consulta el POS para decidir si muestra el selector Ticket / Factura.
 * A diferencia de /api/configuracion/autoimpresor/sucursales (que es de
 * administración y solo para admin), este lo puede llamar cualquier cajero:
 * devuelve un booleano, ningún dato fiscal.
 *
 * La sucursal se resuelve como en el resto del ERP: si el usuario tiene una
 * fija manda esa; si es admin, la que venga por query (el selector del header).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const sucursalId = auth.sucursal_id ?? request.nextUrl.searchParams.get("sucursal_id");

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ emite: false, emiten: [] }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tCfg = quoteSchemaTable(schema, "sucursal_autoimpresor_config");
    // Se devuelven TODAS las que facturan, no solo la actual: el historial las
    // necesita para no ofrecer "Factura" en ventas de sucursales que no emiten.
    const r = await pool.query<{ sucursal_id: string }>(
      `SELECT sucursal_id::text
         FROM ${tCfg}
        WHERE empresa_id = $1::uuid AND activo = true`,
      [auth.empresa_id],
    );
    const emiten = r.rows.map((x) => x.sucursal_id);
    return NextResponse.json(successResponse({
      emite: sucursalId ? emiten.includes(String(sucursalId)) : false,
      emiten,
    }));
  } catch (e) {
    // Si la tabla todavía no existe (migración sin aplicar), la respuesta
    // honesta es "no emite": el POS muestra solo ticket y nadie se traba.
    console.error("[facturacion/sucursal-emite]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ emite: false, emiten: [] }));
  }
}
