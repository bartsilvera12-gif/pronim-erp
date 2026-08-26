"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProveedores, deleteProveedor } from "@/lib/proveedores/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { alert, confirm } from "@/components/ui/dialog";
import type { Proveedor } from "@/lib/proveedores/types";

function fmtGs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function fmtFecha(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function ProveedoresPage() {
  const { isAdmin } = useIsAdmin();
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  type ProvStats = {
    evaluaciones: number; total_pagado: number; total_ingresado: number;
    markup_medio: number | null; ultima_evaluacion: string | null;
  };
  const [stats, setStats] = useState<Record<string, ProvStats>>({});

  useEffect(() => {
    let cancel = false;
    fetch("/api/proveedores/estadisticas", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel) setStats((j?.data?.stats ?? {}) as Record<string, ProvStats>); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getProveedores().then((rows) => {
      if (!cancel) {
        setLista(rows);
        setCargando(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, [refreshKey]);

  async function handleBorrar(p: Proveedor) {
    const ok = await confirm({
      title: "Borrar proveedor",
      message: `¿Borrar "${p.nombre}"? Si tiene compras asociadas se desactivará en lugar de eliminarse.`,
      confirmText: "Borrar",
      variant: "danger",
    });
    if (!ok) return;
    const res = await deleteProveedor(p.id);
    if (!res.ok) { void alert({ message: res.error, variant: "warning" }); return; }
    if (res.mode === "soft") {
      void alert({
        message: `"${p.nombre}" tiene compras asociadas, así que se desactivó (no se puede borrar del todo para conservar el historial).`,
        variant: "warning",
      });
    }
    setRefreshKey((k) => k + 1);
  }

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((p) => {
      const cats = (p.categorias ?? []).map((c) => c.nombre.toLowerCase()).join(" ");
      return (
        p.nombre.toLowerCase().includes(t) ||
        (p.ruc ?? "").toLowerCase().includes(t) ||
        (p.email ?? "").toLowerCase().includes(t) ||
        cats.includes(t)
      );
    });
  }, [lista, busqueda]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Proveedores</h1>
          <p className="text-gray-600">
            Maestro de abastecimiento: categorías, condiciones de pago y vínculo futuro con compras.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportExcelButton url="/api/proveedores/export" />
          <ImportExcelButton
            entidad="Proveedores"
            previewUrl="/api/proveedores/import/preview"
            commitUrl="/api/proveedores/import/commit"
            templateUrl="/api/proveedores/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
          <Link
            href="/proveedores/categorias"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Categorías
          </Link>
          <Link
            href="/proveedores/nuevo"
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3F8E91]"
          >
            + Nuevo proveedor
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Buscar por nombre, RUC, email o categoría…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <span className="text-sm text-slate-400">
            {filtradas.length} de {lista.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-600">
                <th className="py-3 pr-4 font-semibold">Nombre / Contacto</th>
                <th className="py-3 pr-4 font-semibold text-right">Evaluaciones</th>
                <th className="py-3 pr-4 font-semibold text-right">Total evaluaciones</th>
                <th className="py-3 pr-4 font-semibold">Última evaluación</th>
                <th className="py-3 pr-4 font-semibold text-right">Markup medio</th>
                <th className="py-3 pr-4 font-semibold">Estado</th>
                <th className="py-3 font-semibold w-44 text-right pr-1">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Cargando proveedores…
                    </div>
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {lista.length === 0 ? "No hay proveedores cargados." : "Sin resultados."}
                  </td>
                </tr>
              ) : (
                filtradas.map((p) => {
                  const st = stats[p.id];
                  return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">{p.nombre}</div>
                      <div className="text-xs text-slate-500">
                        {p.contacto || p.nombre_comercial || "—"}
                        {p.telefono ? ` · ${p.telefono}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-700">
                      {st ? st.evaluaciones : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-800">
                      {st && st.total_pagado > 0 ? fmtGs(st.total_pagado) : <span className="font-normal text-slate-300">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-slate-600">
                      {st?.ultima_evaluacion ? fmtFecha(st.ultima_evaluacion) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {st?.markup_medio != null ? (
                        <span className={`font-semibold ${
                          st.markup_medio >= 100 ? "text-emerald-700"
                          : st.markup_medio >= 50 ? "text-amber-700"
                          : "text-rose-700"
                        }`}>
                          {st.markup_medio.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.estado === "activo"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {p.estado === "activo" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/proveedores/${p.id}/editar`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#4FAEB2]/40 bg-[#4FAEB2]/10 px-2.5 py-1.5 text-xs font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/20 active:scale-95"
                        >
                          ✏️ Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleBorrar(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 active:scale-95"
                        >
                          🗑 Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
