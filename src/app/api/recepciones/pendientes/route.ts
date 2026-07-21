import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/recepciones/pendientes
 *
 * Devuelve las recepciones que aún NO ingresaron al stock
 * (ingresada_at IS NULL, estado != 'anulada'). Filtradas por
 * sucursal si el usuario tiene una fija; scope por empresa siempre.
 *
 * Cada fila incluye el cliente, número de control, fecha, total y
 * hace_horas para poder resaltar las que superan las 72h.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const sb = createServiceRoleClientWithDbSchema(schema);

    let q = sb
      .from("cliente_recepciones")
      .select("id, numero_control, cliente_id, fecha, total_compra, total_credito, observaciones, sucursal_id, ingresada_at, estado, created_by, usuario_nombre")
      .eq("empresa_id", auth.empresa_id)
      .is("ingresada_at", null)
      .neq("estado", "anulada")
      .order("fecha", { ascending: false })
      .limit(200);

    if (auth.sucursal_id) q = q.eq("sucursal_id", auth.sucursal_id);

    const { data, error } = await q;
    if (error) {
      const msg = error.message ?? "";
      if (/does not exist|no existe|42P01/i.test(msg)) {
        return NextResponse.json(successResponse({ recepciones: [], clientes: {} }));
      }
      console.error("[recepciones/pendientes GET]", msg);
      return NextResponse.json(errorResponse("No se pudieron cargar las recepciones pendientes."), { status: 500 });
    }
    const rows = (data ?? []) as Array<{ id: string; cliente_id: string; fecha: string; sucursal_id: string | null }>;

    // Hidratar nombres de clientes involucrados.
    const clienteIds = Array.from(new Set(rows.map((r) => r.cliente_id).filter(Boolean)));
    const clientesMap: Record<string, string> = {};
    if (clienteIds.length > 0) {
      const { data: cs } = await sb
        .from("clientes")
        .select("id, empresa, nombre_contacto, nombre")
        .in("id", clienteIds);
      for (const c of (cs ?? []) as Array<{ id: string; empresa: string | null; nombre_contacto: string | null; nombre: string | null }>) {
        clientesMap[c.id] =
          (c.empresa ?? "").trim() ||
          (c.nombre_contacto ?? "").trim() ||
          (c.nombre ?? "").trim() ||
          "Cliente";
      }
    }

    // Hidratar nombres de sucursales — el admin ve las pendientes de
    // TODAS las sucursales; sin este dato no sabe dónde cae cada bolsa.
    const sucursalIds = Array.from(new Set(rows.map((r) => r.sucursal_id).filter((x): x is string => !!x)));
    const sucursalesMap: Record<string, string> = {};
    if (sucursalIds.length > 0) {
      const { data: ss } = await sb
        .from("sucursales")
        .select("id, nombre")
        .in("id", sucursalIds);
      for (const s of (ss ?? []) as Array<{ id: string; nombre: string | null }>) {
        sucursalesMap[s.id] = (s.nombre ?? "").trim() || "Sucursal";
      }
    }

    return NextResponse.json(successResponse({
      recepciones: rows,
      clientes: clientesMap,
      sucursales: sucursalesMap,
      generated_at: new Date().toISOString(),
    }));
  } catch (e) {
    console.error("[recepciones/pendientes GET] catch", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron cargar las recepciones pendientes."), { status: 500 });
  }
}
