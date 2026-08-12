"use client";

import type { ReactNode } from "react";

export type ActiveChip = {
  key: string;
  label: string;
  emoji?: string;
  /** Undefined ⇒ chip no removible (ej. rango de fechas base). */
  onRemove?: () => void;
};

/**
 * Barra de filtros activos con chips removibles + count en vivo de resultados.
 * Usada en todos los reportes con drill-down para que sea evidente qué
 * criterios están apilados (todos AND) y cuántos registros coinciden con la
 * combinación total.
 */
export function ActiveFiltersBar(props: {
  chips: ActiveChip[];
  /** Cuántos registros hay AHORA en el listado (después de aplicar TODOS los filtros). */
  resultCount: number;
  /** Total sin filtros — opcional, se muestra "de N" cuando no hay filtros. */
  totalCount?: number;
  /** Etiqueta plural del recurso (ej. "clientes", "ventas", "movimientos"). */
  resourceLabel?: string;
  onClearAll?: () => void;
  /** Contenido extra al final (ej. search input compacto). */
  right?: ReactNode;
}) {
  const { chips, resultCount, totalCount, resourceLabel = "registros", onClearAll, right } = props;
  const hayChips = chips.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 print:border-0 print:shadow-none print:p-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 font-semibold">Filtros activos:</span>
        {!hayChips ? (
          <span className="text-xs text-slate-400 italic">ninguno</span>
        ) : (
          <>
            {chips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full bg-[#4FAEB2]/10 border border-[#4FAEB2]/30 px-2 py-0.5 text-xs text-[#3F8E91] font-semibold"
              >
                {c.emoji && <span aria-hidden>{c.emoji}</span>}
                {c.label}
                {c.onRemove && (
                  <button
                    type="button"
                    onClick={c.onRemove}
                    className="ml-1 text-[#3F8E91] hover:text-[#2a6a6d] print:hidden"
                    aria-label={`Quitar ${c.label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {onClearAll && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-slate-500 hover:text-slate-800 underline print:hidden"
              >
                Limpiar todo
              </button>
            )}
          </>
        )}
        <span className="ml-auto text-sm text-slate-800">
          <strong className="text-lg tabular-nums">{resultCount}</strong>
          <span className="text-xs text-slate-500 ml-1">
            {resourceLabel}
            {hayChips ? " coinciden" : totalCount != null ? ` de ${totalCount}` : ""}
          </span>
        </span>
        {right}
      </div>
    </div>
  );
}
