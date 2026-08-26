"use client";
import { confirm } from "@/components/ui/dialog";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getGastos, deleteGasto } from "@/lib/gastos/actions";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Gasto } from "@/lib/gastos/actions";

function formatGs(valor: number) {
  return `${valor.toLocaleString("es-PY")} ₲`;
}

function formatFecha(fecha: string) {
  try {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

const tipoBadge: Record<string, string> = {
  fijo: "bg-blue-50 text-blue-700",
  variable: "bg-slate-100 text-slate-700",
};

export default function GastosPage() {
  const router = useRouter();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [sucursales, setSucursales] = useState<{ id: string; nombre: string }[]>([]);
  // "" = todas · "sin" = gastos generales (sin sucursal) · <uuid> = una sucursal
  const [filtroSucursal, setFiltroSucursal] = useState("");

  useEffect(() => {
    getGastos()
      .then(setGastos)
      .catch(() => setGastos([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        setSucursales((j?.data?.sucursales ?? j?.sucursales ?? []) as { id: string; nombre: string }[]);
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  const nombreSucursal = (id?: string | null) =>
    id ? (sucursales.find((s) => s.id === id)?.nombre ?? "—") : null;

  const gastosFiltrados = useMemo(() => {
    if (!filtroSucursal) return gastos;
    if (filtroSucursal === "sin") return gastos.filter((g) => !g.sucursal_id);
    return gastos.filter((g) => g.sucursal_id === filtroSucursal);
  }, [gastos, filtroSucursal]);

  const totalFiltrado = useMemo(
    () => gastosFiltrados.reduce((s, g) => s + Number(g.monto || 0), 0),
    [gastosFiltrados],
  );

  async function handleEliminar(g: Gasto) {
    if (!(await confirm({ title: `¿Eliminar el gasto "${g.descripcion || g.categoria || "sin descripción"}"?`, message: "Esta acción no se puede deshacer.", variant: "danger", confirmText: "Eliminar" }))) return;
    setEliminando(g.id);
    try {
      await deleteGasto(g.id);
      setGastos((prev) => prev.filter((x) => x.id !== g.id));
    } catch {
      setEliminando(null);
    } finally {
      setEliminando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Egresos
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Gastos operativos</h1>
          <p className="mt-0.5 text-xs text-slate-500">Registro de gastos de la empresa</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sucursales.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="filtro-sucursal" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sucursal
              </label>
              <select
                id="filtro-sucursal"
                value={filtroSucursal}
                onChange={(e) => setFiltroSucursal(e.target.value)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30 ${
                  filtroSucursal
                    ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <option value="">Todas las sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
                <option value="sin">— Generales (sin sucursal) —</option>
              </select>
            </div>
          )}
          <Link
            href="/gastos/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
          >
            <span>+</span>
            Nuevo gasto
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm ring-1 ring-[#4FAEB2]/15">
        {cargando ? (
          <div className="py-16 text-center text-sm text-slate-400">
            <div className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Cargando gastos…
            </div>
          </div>
        ) : gastos.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium text-gray-600">No hay gastos registrados</p>
            <Link
              href="/gastos/nuevo"
              className="mt-4 inline-block text-sm text-[#4FAEB2] hover:underline"
            >
              Registrar primer gasto
            </Link>
          </div>
        ) : gastosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="font-medium text-gray-600">
              No hay gastos en {filtroSucursal === "sin" ? "gastos generales" : nombreSucursal(filtroSucursal)}
            </p>
            <button
              type="button"
              onClick={() => setFiltroSucursal("")}
              className="mt-3 text-sm text-[#4FAEB2] hover:underline"
            >
              Ver todas las sucursales
            </button>
          </div>
        ) : (
          /* overflow-x-auto + min-w fuerza scroll horizontal en mobile;
              Categoria + Tipo se ocultan en pantallas chicas. */
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] sm:min-w-0">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Fecha</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3 hidden md:table-cell">Categoría</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Descripción</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Sucursal</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Monto</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {gastosFiltrados.map((g) => (
                <tr key={g.id} className="hover:bg-[#4FAEB2]/[0.04] transition-colors">
                  <td className="px-5 py-3.5 text-sm text-gray-600">{formatFecha(g.fecha)}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-800 hidden md:table-cell">{g.categoria || "—"}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[200px] truncate">
                    {g.descripcion || "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {g.sucursal_id ? (
                      <span className="inline-flex rounded-full bg-[#4FAEB2]/10 px-2 py-0.5 text-xs font-medium text-[#3F8E91] ring-1 ring-[#4FAEB2]/25">
                        {nombreSucursal(g.sucursal_id)}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        General
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-gray-800 tabular-nums">
                    {formatGs(g.monto)}
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tipoBadge[g.tipo] ?? "bg-slate-100"}`}
                    >
                      {g.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2">
                      <Link
                        href={`/gastos/${g.id}/editar`}
                        className="inline-flex items-center min-h-[40px] text-xs text-gray-500 hover:text-gray-800 underline"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleEliminar(g)}
                        disabled={eliminando === g.id}
                        className="inline-flex items-center min-h-[40px] text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                      >
                        {eliminando === g.id ? "…" : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {gastosFiltrados.length > 0 && (
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{gastosFiltrados.length}</span> gasto
          {gastosFiltrados.length === 1 ? "" : "s"}
          {filtroSucursal && (
            <> en <span className="font-semibold text-[#3F8E91]">
              {filtroSucursal === "sin" ? "gastos generales" : nombreSucursal(filtroSucursal)}
            </span> (de {gastos.length})</>
          )}
          {" · Total: "}
          <span className="font-semibold text-gray-800 tabular-nums">{formatGs(totalFiltrado)}</span>
        </p>
      )}
    </div>
  );
}
