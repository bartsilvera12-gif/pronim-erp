"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type ReporteVista = {
  id: string;
  nombre: string;
  filtros: Record<string, unknown>;
  updated_at: string;
};

/**
 * Dropdown de vistas guardadas + botón "Guardar vista".
 * Usa el endpoint genérico /api/reportes/vistas.
 *
 * El padre pasa `filtrosActuales` (para saber qué guardar) y
 * `onAplicar(filtros)` (para saber cómo hidratar el estado local
 * cuando el usuario carga una vista). El nombre sugerido se arma
 * con `nombreSugerido`.
 */
export function VistasGuardadasBar(props: {
  reporteKey: string;
  filtrosActuales: Record<string, unknown>;
  onAplicar: (filtros: Record<string, unknown>) => void;
  hayFiltros: boolean;
  nombreSugerido?: string;
  onError?: (msg: string) => void;
}) {
  const { reporteKey, filtrosActuales, onAplicar, hayFiltros, nombreSugerido, onError } = props;
  const [vistas, setVistas] = useState<ReporteVista[]>([]);
  const [open, setOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [activaId, setActivaId] = useState<string | null>(null);

  async function cargar() {
    try {
      const r = await fetchWithSupabaseSession(`/api/reportes/vistas?reporte=${encodeURIComponent(reporteKey)}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) setVistas((j.data?.vistas ?? []) as ReporteVista[]);
    } catch { /* silencioso */ }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reporteKey]);

  async function guardar() {
    if (!hayFiltros) return;
    const nombre = window.prompt("Nombre para esta vista:", (nombreSugerido ?? "").slice(0, 80));
    if (!nombre || !nombre.trim()) return;
    setGuardando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/reportes/vistas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporte: reporteKey, nombre: nombre.trim(), filtros: filtrosActuales }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
      if (j.data?.vista?.id) setActivaId(j.data.vista.id);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo guardar la vista.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(v: ReporteVista, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`¿Borrar la vista "${v.nombre}"?`)) return;
    try {
      await fetchWithSupabaseSession(`/api/reportes/vistas?id=${v.id}`, { method: "DELETE" });
      await cargar();
      if (activaId === v.id) setActivaId(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "No se pudo borrar la vista.");
    }
  }

  function aplicar(v: ReporteVista) {
    onAplicar(v.filtros);
    setActivaId(v.id);
    setOpen(false);
  }

  return (
    <div className="inline-flex items-center gap-2 print:hidden relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        ⭐ Vistas ({vistas.length})
      </button>
      {open && (
        <div className="absolute right-24 top-9 z-20 rounded-lg border border-slate-200 bg-white shadow-lg p-2 min-w-[260px] max-h-[360px] overflow-y-auto">
          {vistas.length === 0 ? (
            <p className="text-xs text-slate-400 px-2 py-4 text-center italic">
              No hay vistas guardadas todavía.<br/>Aplicá filtros y hacé click en &ldquo;Guardar vista&rdquo;.
            </p>
          ) : (
            <ul className="space-y-1">
              {vistas.map((v) => (
                <li key={v.id} className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${activaId === v.id ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                  <button type="button" onClick={() => aplicar(v)} className="flex-1 text-left">
                    <p className={`text-xs font-semibold ${activaId === v.id ? "text-[#3F8E91]" : "text-slate-800"}`}>{v.nombre}</p>
                    <p className="text-[10px] text-slate-400">{Object.keys(v.filtros).length} filtro(s)</p>
                  </button>
                  <button type="button" onClick={(e) => borrar(v, e)}
                    className="opacity-0 group-hover:opacity-100 transition text-rose-500 hover:text-rose-700 text-sm px-1"
                    title="Borrar vista">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" onClick={guardar} disabled={guardando || !hayFiltros}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#3F8E91] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        title={hayFiltros ? "Guardar la combinación actual de filtros" : "Aplicá al menos un filtro para poder guardar"}>
        💾 Guardar vista
      </button>
    </div>
  );
}
