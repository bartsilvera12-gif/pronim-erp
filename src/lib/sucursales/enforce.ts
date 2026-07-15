/**
 * Helpers de "sucursal estricta" para endpoints operativos del ERP.
 *
 * Regla general:
 *   - Si `auth.sucursal_id` está definido → ese id manda para TODA la operación.
 *     Cualquier `sucursal_id` distinto que venga desde el body/frontend se
 *     rechaza (no se confía en lo que el navegador manda).
 *   - Si `auth.sucursal_id` es null → el usuario es admin global; puede pasar
 *     `sucursal_id` explícito en el body para elegir sobre qué sucursal opera.
 *   - Si el usuario no es admin y no tiene sucursal → 403 con mensaje claro.
 *
 * NO valida pertenencia a la empresa (las tablas ya llevan empresa_id + FK
 * a sucursales(empresa_id) para eso). Solo garantiza aislamiento por sucursal.
 */

import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

export const SIN_SUCURSAL_MENSAJE =
  "Tu usuario no tiene una sucursal asignada. Solicitá al administrador que configure tu sucursal.";

export type SucursalEnforceOk = {
  ok: true;
  /** Sucursal que debe usarse para persistir/consultar. `null` solo si el usuario es admin global sin body y el endpoint acepta consolidado. */
  sucursal_id: string | null;
  /** true si `auth.sucursal_id` estaba fijo (operación no puede cambiar). */
  usuarioFijo: boolean;
};

export type SucursalEnforceErr = {
  ok: false;
  /** HTTP status sugerido. */
  status: 400 | 403;
  /** Mensaje ya en español, listo para devolver al cliente. */
  error: string;
};

/**
 * Resuelve la sucursal_id a usar en la operación aplicando las reglas de
 * "sucursal estricta". Pensado para endpoints /api/ventas, /api/compras,
 * /api/caja, recepciones, stock-sucursal, etc.
 */
export function enforceSucursalForOperation(input: {
  /** `auth.sucursal_id` del contexto autenticado. */
  authSucursalId: string | null | undefined;
  /** Rol del usuario autenticado (usuario | supervisor | administrador | admin | super_admin…). */
  rol: string | null | undefined;
  /** sucursal_id que vino en el body de la request (opcional). */
  bodySucursalId?: string | null | undefined;
  /**
   * Si true, cuando el usuario es admin global y no manda body, se acepta
   * `sucursal_id = null` (operación consolidada). Si false, se exige que la
   * sucursal quede resuelta a un uuid.
   */
  allowNullForAdmin?: boolean;
}): SucursalEnforceOk | SucursalEnforceErr {
  const authSuc = input.authSucursalId ? String(input.authSucursalId) : null;
  const bodySuc =
    typeof input.bodySucursalId === "string" && input.bodySucursalId.trim() !== ""
      ? input.bodySucursalId.trim()
      : null;
  const esAdmin = esRolAdminEmpresaOGlobal(input.rol ?? undefined);

  if (authSuc) {
    // Usuario con sucursal fija: manda auth.
    if (bodySuc && bodySuc !== authSuc) {
      return {
        ok: false,
        status: 400,
        error:
          "Tu usuario está asignado a una sucursal específica; no podés operar en otra sucursal.",
      };
    }
    return { ok: true, sucursal_id: authSuc, usuarioFijo: true };
  }

  // Sin auth.sucursal_id: sólo admins globales pueden llegar acá legítimamente.
  if (!esAdmin) {
    return { ok: false, status: 403, error: SIN_SUCURSAL_MENSAJE };
  }

  if (bodySuc) return { ok: true, sucursal_id: bodySuc, usuarioFijo: false };

  if (input.allowNullForAdmin) {
    return { ok: true, sucursal_id: null, usuarioFijo: false };
  }

  return {
    ok: false,
    status: 400,
    error: "Sucursal requerida: especificá sucursal_id para esta operación.",
  };
}
