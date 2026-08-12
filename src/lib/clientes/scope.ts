/**
 * Helpers para filtrar clientes/créditos por scope de cartera de sucursal.
 *
 * Regla: sucursales pueden compartir o aislar su cartera de clientes según
 * el valor de `sucursales.scope_clientes`. El cliente lleva la misma
 * columna y se filtra por igualdad.
 *
 * - scope === null → usuario admin sin sucursal asignada → NO se aplica
 *   filtro (mantiene el comportamiento previo a la feature).
 * - scope === "…"  → se agrega `.eq('scope_clientes', scope)` (Supabase)
 *   o un fragmento WHERE parametrizado (pg directo).
 */

import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Verifica que el scope de una fila de clientes sea el que el usuario puede ver.
 * Devuelve true si:
 *   - el usuario no tiene scope (admin sin sucursal) → puede ver todos.
 *   - la fila no tiene scope (tenant sin migration) → no filtramos.
 *   - ambos scopes son iguales.
 */
export function rowMatchesClientesScope(
  row: { scope_clientes?: string | null } | null | undefined,
  userScope: string | null | undefined,
): boolean {
  if (!userScope) return true;
  const rowScope = row?.scope_clientes;
  if (rowScope == null) return true;
  return rowScope === userScope;
}

/**
 * Chequea que el cliente `clienteId` (de la empresa `empresaId`) esté dentro
 * del scope del usuario. Devuelve:
 *   - true si está en scope (o si el usuario no tiene scope, o si la
 *     columna no existe todavía en el tenant).
 *   - false si está en otra cartera → el caller debe responder 404.
 *
 * Best-effort: si la consulta falla por columna inexistente, deja pasar.
 */
export async function ensureClienteEnScope(
  supabase: AppSupabaseClient,
  empresaId: string,
  clienteId: string,
  userScope: string | null | undefined,
): Promise<boolean> {
  if (!userScope) return true;
  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("scope_clientes")
      .eq("id", clienteId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (error) {
      if (/scope_clientes/i.test(error.message ?? "")) return true;
      return false;
    }
    if (!data) return false;
    const rowScope = (data as { scope_clientes?: string | null }).scope_clientes;
    if (rowScope == null) return true;
    return rowScope === userScope;
  } catch {
    return true;
  }
}

/**
 * Devuelve `{ frag, param }` para adjuntar a un WHERE en pg directo.
 * Uso:
 *   const { frag, param } = clientesScopeSqlFrag(scope, "c");
 *   if (frag) { whereParts.push(frag); params.push(param); }
 *   // frag ya usa $N para el índice correcto (pasar params.length + 1 en `nextParamIndex`)
 */
export function clientesScopeSqlFrag(
  scope: string | null | undefined,
  alias: string,
  nextParamIndex: number,
): { frag: string | null; param: string | null } {
  if (!scope) return { frag: null, param: null };
  return { frag: `${alias}.scope_clientes = $${nextParamIndex}`, param: scope };
}
