import { createServiceRoleClient } from "@/lib/supabase/service-admin";

/**
 * Acciones granulares que un usuario puede tener por módulo.
 *
 * Convención:
 *   - Los 4 base (ver/crear/editar/eliminar) tienen default true si el
 *     usuario tiene acceso al módulo (compat con permisos anteriores que
 *     solo miraban acceso módulo sí/no).
 *   - Acciones custom (anular, descontar, conciliar) tienen default false —
 *     hay que setearlas explícitamente en `usuario_modulos.acciones`.
 */
export type AccionModulo =
  | "ver" | "crear" | "editar" | "eliminar"
  | "anular" | "descontar" | "conciliar" | "autorizar";

const DEFAULTS_BASE = new Set<AccionModulo>(["ver", "crear", "editar", "eliminar"]);

/**
 * Devuelve true si el usuario puede ejecutar `accion` sobre el módulo con
 * slug `moduloSlug`. Admin de empresa y super_admin siempre true.
 *
 * Best-effort: cualquier error (schema sin `acciones`, sin conexión, etc.)
 * degrada a "permitir" para no romper flujos existentes durante la
 * transición.
 */
export async function hasPermission(
  auth: { user: { id?: string | null; email?: string | null }; empresa_id: string; rol?: string | null } | null,
  moduloSlug: string,
  accion: AccionModulo,
): Promise<boolean> {
  if (!auth?.user?.id) return false;
  if (auth.rol === "super_admin" || auth.rol === "admin_empresa") return true;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("usuario_modulos")
      .select("acciones, modulos!inner(slug)")
      .eq("usuario_id", auth.user.id)
      .eq("modulos.slug", moduloSlug)
      .maybeSingle();
    if (error || !data) return DEFAULTS_BASE.has(accion); // degradar
    const acciones = (data as { acciones?: Record<string, unknown> }).acciones ?? {};
    if (accion in acciones) return acciones[accion] === true;
    return DEFAULTS_BASE.has(accion);
  } catch {
    return DEFAULTS_BASE.has(accion);
  }
}
