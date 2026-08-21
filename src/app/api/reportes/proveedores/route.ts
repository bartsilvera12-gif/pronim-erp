import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getReporteProveedores } from "@/lib/reportes/server/reportes-pg";
import { asuncionMesBoundsUtc } from "@/lib/fechas/asuncion-bounds";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const mes = new URL(request.url).searchParams.get("mes") ?? "";
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json(errorResponse("Parametro 'mes' invalido (YYYY-MM)."), { status: 400 });
    }
    const { start, end } = asuncionMesBoundsUtc(mes);
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const data = await getReporteProveedores(schema, empresaId, { mes, start, end, mesInicio: `${mes}-01` });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    console.error("[/api/reportes/proveedores]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el reporte de proveedores."), { status: 500 });
  }
}
