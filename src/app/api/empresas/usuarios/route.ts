import { NextResponse } from "next/server";
import { getServiceAuthUsuario } from "@/lib/auth/get-service-auth-usuario";

/** Lista usuarios de la empresa del usuario autenticado (para /usuarios) */
export async function GET(request: Request) {
  try {
    const r = await getServiceAuthUsuario(request);
    if (!r.ok) {
      return NextResponse.json({ error: "No autenticado" }, { status: r.status });
    }
    const { supabaseSr, catalogUsuario } = r;
    if (!catalogUsuario) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    const empresaId = catalogUsuario.empresa_id ?? null;
    const rol = (catalogUsuario.rol ?? "").trim();
    if (!empresaId && rol !== "super_admin") {
      return NextResponse.json({ usuarios: [] });
    }

    let query = supabaseSr
      .from("usuarios")
      .select("id, nombre, email, telefono, fecha_nacimiento, rol, estado, created_at, sucursal_id, empresa_id")
      .order("created_at", { ascending: false });

    if (rol !== "super_admin") {
      query = query.eq("empresa_id", empresaId as string);
    }

    const { data: usuarios, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Hidratamos el nombre de la sucursal para el listado (columna Sucursal).
    // Sólo consultamos ids realmente presentes (evita traer todo el catálogo).
    const usuariosArr = usuarios ?? [];
    const sucursalIds = Array.from(
      new Set(
        usuariosArr
          .map((u: Record<string, unknown>) => u.sucursal_id as string | null | undefined)
          .filter((v: string | null | undefined): v is string => typeof v === "string" && v.length > 0)
      )
    );
    const sucursalById = new Map<string, string>();
    if (sucursalIds.length > 0) {
      const { data: sucs } = await supabaseSr
        .from("sucursales")
        .select("id, nombre")
        .in("id", sucursalIds);
      for (const s of (sucs ?? []) as Array<{ id: string; nombre: string | null }>) {
        sucursalById.set(s.id, s.nombre ?? "");
      }
    }

    const usuariosOut = usuariosArr.map((u: Record<string, unknown>) => {
      const sid = (u.sucursal_id as string | null | undefined) ?? null;
      const nombreSuc = sid ? (sucursalById.get(sid) ?? null) : null;
      return {
        ...u,
        sucursal_nombre: nombreSuc,
      };
    });

    return NextResponse.json({ usuarios: usuariosOut });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
