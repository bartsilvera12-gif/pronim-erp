import { getDeviceTypeFromRequest } from "@/shared/device/server";
import { fetchDashboardMobileSummary } from "@/lib/dashboard/mobile-summary";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
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
 * Sucursales no-admin: reciben `DashboardSucursalSimple` — dashboard reducido
 * con sólo sus propias ventas y clientes, sin las secciones cruzadas de
 * multi-sucursal / cobranzas globales / inventario.
 */
export default async function Page() {
  const device = await getDeviceTypeFromRequest();

  // Gate por rol/sucursal — usuarios con sucursal fija y sin rol admin
  // ven el dashboard simple, en desktop y en mobile. resolveApiAuthContext
  // lee cookies() de next/headers, así que no hace falta pasar Request.
  const auth = await getAuthWithRol(null).catch(() => null);
  const soloSucursal = !!auth?.sucursal_id && !isAdmin(auth);

  if (device === "mobile") {
    if (soloSucursal) return <DashboardSucursalSimple />;
    const initialData = await fetchDashboardMobileSummary(null).catch(() => null);
    return <DashboardMobile initialData={initialData ?? undefined} />;
  }
  if (soloSucursal) return <DashboardSucursalSimple />;
  return <DashboardDesktop />;
}
