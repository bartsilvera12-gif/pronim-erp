import { NextResponse } from "next/server";
import { getServiceAuthUsuario } from "@/lib/auth/get-service-auth-usuario";

type UsuarioMeRow = {
  nombre: string | null;
  email: string | null;
  rol: string | null;
  sucursal_id?: string | null;
  lang?: string | null;
};

function pickAuthMetadataName(authUser: { user_metadata?: Record<string, unknown> | null }): string | null {
  const meta = authUser.user_metadata ?? {};
  const candidates = [meta.full_name, meta.name, meta.nombre];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * GET /api/usuarios/me
 *
 * Perfil mínimo para el header: resuelve el usuario autenticado server-side y
 * evita leer `usuarios` desde el navegador.
 */
export async function GET(request: Request) {
  try {
    const r = await getServiceAuthUsuario(request);
    if (!r.ok) {
      return NextResponse.json({ error: "No autenticado" }, { status: r.status });
    }

    const { authUser, catalogUsuario, supabaseSr } = r;
    let row: UsuarioMeRow | null = null;

    if (catalogUsuario?.id) {
      const { data, error } = await supabaseSr
        .from("usuarios")
        .select("nombre, email, rol, sucursal_id, lang")
        .eq("id", catalogUsuario.id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      row = (data ?? null) as UsuarioMeRow | null;
    }

    const nombre = (row?.nombre ?? pickAuthMetadataName(authUser) ?? "").trim() || null;
    const email = (row?.email ?? authUser.email ?? "").trim() || null;
    const rol = (row?.rol ?? catalogUsuario?.rol ?? "").trim() || null;
    const sucursalId = row?.sucursal_id ?? catalogUsuario?.sucursal_id ?? null;

    // Marca es_principal + moneda para gate de UI y formateo.
    let sucursalEsPrincipal = false;
    let sucursalMoneda: string | null = null;
    if (sucursalId) {
      const { data: suc } = await supabaseSr
        .from("sucursales")
        .select("es_principal, moneda")
        .eq("id", sucursalId)
        .maybeSingle();
      const s = suc as { es_principal?: boolean; moneda?: string } | null;
      sucursalEsPrincipal = s?.es_principal === true;
      sucursalMoneda = typeof s?.moneda === "string" ? s.moneda : null;
    }

    return NextResponse.json({
      usuario: {
        nombre,
        rol,
        email,
        sucursal_id: sucursalId,
        sucursal_es_principal: sucursalEsPrincipal,
        sucursal_moneda: sucursalMoneda,
        lang: (row?.lang ?? "").trim() || "es",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener el usuario actual";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
