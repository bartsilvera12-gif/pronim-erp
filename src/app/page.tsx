import { getDeviceTypeFromRequest } from "@/shared/device/server";
import { fetchDashboardMobileSummary } from "@/lib/dashboard/mobile-summary";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import DashboardDesktop from "@/desktop/pages/DashboardDesktop";
import DashboardMobile from "@/mobile/pages/DashboardMobile";
import DashboardSucursalSimple from "@/desktop/pages/DashboardSucursalSimple";

/**
 * Home / Dashboard.
 *
 * Optimización: para mobile, pre-fetchamos los KPIs server-side y los pasamos como
 * `initialData` al cliente. SWR los muestra ANTES de hidratar — sin skeleton flash.
 * Desktop sigue intacto, monta su componente client como antes.
 *
 * Gate del dashboard:
 *   - Usuario con `sucursal_id` fija → dashboard simple (Painel de sucursal),
 *     independientemente de su rol (admin_empresa incluido). El scope
 *     server-side ya filtra sus datos a esa sucursal, así que mostrarle el
 *     multi-sucursal completo confundía y filtraba KPIs cruzados.
 *   - Sólo super_admin (o cuenta sin sucursal fija) ve el dashboard completo
 *     de Zentra multi-sucursal.
 */
export default async function Page() {
  const device = await getDeviceTypeFromRequest();

  // resolveApiAuthContext lee cookies() de next/headers → no hace falta Request.
  const auth = await getAuthWithRol(null).catch(() => null);
  // Regla simple: si tiene sucursal fija → panel simple. El rol (admin_empresa
  // o vendedor) es irrelevante para esa distinción — la elegimos por scope.
  const soloSucursal = !!auth?.sucursal_id && !isSuperAdmin(auth);

  if (device === "mobile") {
    if (soloSucursal) return <DashboardSucursalSimple />;
    const initialData = await fetchDashboardMobileSummary(null).catch(() => null);
    return <DashboardMobile initialData={initialData ?? undefined} />;
  }
  if (soloSucursal) return <DashboardSucursalSimple />;
  return <DashboardDesktop />;
}
