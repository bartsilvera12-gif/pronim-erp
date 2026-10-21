import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import DashboardSucursalSimple from "@/desktop/pages/DashboardSucursalSimple";

/**
 * El panel de UNA sucursal, visto por el admin.
 *
 * Es exactamente la misma pantalla que ve la gente del local — no una
 * versión aparte — para que cuando el admin acompañe a una cajera estén
 * mirando lo mismo. Trae su propio filtro de fechas.
 *
 * Solo admin: quien tiene sucursal fija entra por `/`, que ya le muestra la
 * suya. Si llegara acá, la API le devuelve igual su sucursal y no la ajena.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthWithRol(null).catch(() => null);

  if (!auth || !isAdmin(auth)) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">
            Esta vista es para administradores. Entrá a{" "}
            <a href="/" className="font-medium text-[#4FAEB2] hover:underline">tu panel</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardSucursalSimple
      sucursalId={id}
      volverA={{ href: "/", label: "Volver al dashboard" }}
    />
  );
}
