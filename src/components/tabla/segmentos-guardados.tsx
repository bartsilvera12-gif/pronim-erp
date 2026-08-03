"use client";

import { useEffect, useState } from "react";

/**
 * Hook + panel reutilizable de "segmentos guardados" para cualquier tabla.
 *
 * Un segmento es un snapshot arbitrario de filtros (objeto plano JSON-serializable)
 * que se persiste en localStorage bajo `storageKey`. El componente muestra:
 *   - chips de segmentos guardados (click = aplicar; ✕ = borrar)
 *   - botón "＋ Guardar filtro actual" cuando `puedeGuardar === true`
 *
 * Consumer:
 *   const { segmentos, guardar, aplicar: onAplicar, borrar } = useSegmentosGuardados<MiFiltro>(storageKey);
 *   <SegmentosGuardadosBar
 *     segmentos={segmentos}
 *     puedeGuardar={hayFiltros}
 *     onGuardar={() => guardar(filtrosActuales)}
 *     onAplicar={(s) => setFiltros(s.data)}
 *     onBorrar={borrar}
 *   />
 */

export type SegmentoGuardadoGenerico<T> = {
  id: string;
  nombre: string;
  data: T;
};

export function useSegmentosGuardados<T>(storageKey: string) {
  const [segmentos, setSegmentos] = useState<SegmentoGuardadoGenerico<T>[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setSegmentos(JSON.parse(raw) as SegmentoGuardadoGenerico<T>[]);
    } catch { /* ignore */ }
  }, [storageKey]);

  function persist(next: SegmentoGuardadoGenerico<T>[]) {
    setSegmentos(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function guardar(data: T, nombreSugerido?: string) {
    const nombre = window.prompt("Nombre del segmento:", nombreSugerido ?? "");
    if (!nombre || !nombre.trim()) return;
    persist([...segmentos, {
      id: `seg-${Date.now()}`,
      nombre: nombre.trim().slice(0, 40),
      data,
    }]);
  }

  function borrar(id: string) {
    persist(segmentos.filter((s) => s.id !== id));
  }

  return { segmentos, guardar, borrar };
}

export function SegmentosGuardadosBar<T>({
  segmentos, puedeGuardar, onGuardar, onAplicar, onBorrar,
}: {
  segmentos: SegmentoGuardadoGenerico<T>[];
  puedeGuardar: boolean;
  onGuardar: () => void;
  onAplicar: (s: SegmentoGuardadoGenerico<T>) => void;
  onBorrar: (id: string) => void;
}) {
  if (segmentos.length === 0 && !puedeGuardar) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {segmentos.map((s) => (
        <div key={s.id} className="inline-flex items-center rounded-full border border-[#4FAEB2]/40 bg-[#4FAEB2]/5 pl-2 pr-1 py-0.5 text-xs">
          <button type="button" onClick={() => onAplicar(s)}
            className="text-[#3F8E91] hover:text-[#2A6668] font-semibold mr-1" title="Aplicar este segmento">
            ★ {s.nombre}
          </button>
          <button type="button" onClick={() => onBorrar(s.id)}
            className="text-slate-400 hover:text-rose-600 px-1" title="Borrar segmento">✕</button>
        </div>
      ))}
      {puedeGuardar && (
        <button type="button" onClick={onGuardar}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-3 py-0.5 text-xs text-slate-500 hover:border-[#4FAEB2] hover:text-[#3F8E91]"
          title="Guardar los filtros actuales como segmento reutilizable">
          ＋ Guardar filtro actual
        </button>
      )}
    </div>
  );
}

/**
 * Componente reutilizable para "Columnas" — usa un array de definiciones
 * con show/hide + reorden. localStorage bajo `storageKey`.
 */

export type ColumnaDef<K extends string> = {
  key: K;
  label: string;
  required?: boolean;
};

export function useColumnasPersistidas<K extends string>(
  storageKey: string,
  todas: ColumnaDef<K>[],
  defaultVisibles: K[],
) {
  const [visibles, setVisibles] = useState<K[]>(defaultVisibles);
  const [inicializado, setInicializado] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const validKeys = new Set(todas.map((c) => c.key));
      const requiredKeys = todas.filter((c) => c.required).map((c) => c.key);
      const source = Array.isArray(parsed) ? parsed : defaultVisibles;
      const filtered = (source as unknown[]).filter((k): k is K =>
        typeof k === "string" && validKeys.has(k as K),
      );
      for (const rk of requiredKeys) if (!filtered.includes(rk)) filtered.push(rk);
      setVisibles(filtered.length > 0 ? filtered : [...defaultVisibles]);
    } catch {
      setVisibles([...defaultVisibles]);
    } finally {
      setInicializado(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!inicializado) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(visibles)); } catch { /* ignore */ }
  }, [visibles, inicializado, storageKey]);

  function toggle(key: K) {
    const col = todas.find((c) => c.key === key);
    if (!col || col.required) return;
    setVisibles((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  function mover(key: K, direccion: "arriba" | "abajo") {
    setVisibles((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const nueva = [...prev];
      const target = direccion === "arriba" ? idx - 1 : idx + 1;
      if (target < 0 || target >= nueva.length) return prev;
      [nueva[idx], nueva[target]] = [nueva[target], nueva[idx]];
      return nueva;
    });
  }

  function reset() { setVisibles([...defaultVisibles]); }

  const visibleSet = new Set(visibles);
  return { visibles, visibleSet, toggle, mover, reset };
}

export function ColumnasDropdown<K extends string>({
  abierto, onToggle, todas, visibles, onToggleColumna, onMover, onReset, label = "Columnas",
}: {
  abierto: boolean; onToggle: () => void;
  todas: ColumnaDef<K>[];
  visibles: K[];
  onToggleColumna: (k: K) => void;
  onMover: (k: K, d: "arriba" | "abajo") => void;
  onReset: () => void;
  label?: string;
}) {
  const colByKey = new Map(todas.map((c) => [c.key, c]));
  const ocultas = todas.filter((c) => !visibles.includes(c.key));
  return (
    <div className="relative">
      <button type="button" onClick={onToggle}
        className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium shadow-sm transition-colors"
        aria-expanded={abierto}>
        <span>{label}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          {visibles.length}/{todas.length}
        </span>
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="p-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Personalizar columnas</p>
            <p className="text-xs text-slate-500 mt-1">Reordená con ▲▼ · Quitá con ✕ · Agregá tildando abajo.</p>
          </div>
          <div className="p-2 max-h-64 overflow-y-auto border-b border-slate-100">
            <p className="px-2 py-1 text-[10px] uppercase font-semibold tracking-wide text-slate-400">Visibles ({visibles.length})</p>
            {visibles.map((k, idx) => {
              const col = colByKey.get(k);
              if (!col) return null;
              return (
                <div key={k} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="flex-1 text-sm text-slate-700">{col.label}</span>
                  <button type="button" disabled={idx === 0} onClick={() => onMover(k, "arriba")}
                    className="p-1 text-slate-400 hover:text-[#3F8E91] disabled:opacity-30 disabled:cursor-not-allowed" title="Subir">▲</button>
                  <button type="button" disabled={idx === visibles.length - 1} onClick={() => onMover(k, "abajo")}
                    className="p-1 text-slate-400 hover:text-[#3F8E91] disabled:opacity-30 disabled:cursor-not-allowed" title="Bajar">▼</button>
                  <button type="button" disabled={col.required} onClick={() => onToggleColumna(k)}
                    className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={col.required ? "Requerida" : "Ocultar"}>✕</button>
                </div>
              );
            })}
          </div>
          {ocultas.length > 0 && (
            <div className="p-2 max-h-40 overflow-y-auto border-b border-slate-100">
              <p className="px-2 py-1 text-[10px] uppercase font-semibold tracking-wide text-slate-400">Ocultas ({ocultas.length})</p>
              {ocultas.map((col) => (
                <button key={col.key} type="button" onClick={() => onToggleColumna(col.key)}
                  className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                  <span className="text-slate-400 text-xs">＋</span>{col.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 p-3">
            <p className="text-[11px] text-slate-400">Se guarda por usuario en este navegador.</p>
            <button type="button" onClick={onReset}
              className="text-xs font-medium text-slate-600 hover:text-slate-900">Restablecer</button>
          </div>
        </div>
      )}
    </div>
  );
}
