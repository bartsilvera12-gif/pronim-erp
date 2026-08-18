"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * DataExplorer — explorador de datos tipo Excel, entity-agnostic.
 *
 * El usuario:
 *   1. Elige qué columnas ver (column picker).
 *   2. Aplica filtros por columna (texto / número con operador / fecha / enum).
 *   3. Los filtros se acumulan (AND).
 *   4. Ordena por cualquier columna (asc/desc) clickeando el encabezado.
 *   5. Ve el count + una fila de totales.
 *   6. Exporta a CSV o imprime.
 *   7. Opcional: entra al detalle de cualquier fila.
 *
 * Todo el filtrado/orden/columnas es client-side sobre `rows` — instantáneo.
 * El padre solo trae los datos (con un rango de fechas amplio) y define columnas.
 */

export type ColType = "text" | "number" | "money" | "date" | "enum";

export type ColumnDef<T> = {
  key: string;
  label: string;
  type: ColType;
  /** Valor crudo para filtrar / ordenar / exportar. */
  get: (row: T) => string | number | null;
  /** Render visual (default: get()). */
  render?: (row: T) => ReactNode;
  sortable?: boolean;    // default true
  filterable?: boolean;  // default true
  total?: "sum" | "count"; // fila de totales
  enumOptions?: { value: string; label: string }[]; // para type enum
  defaultVisible?: boolean; // default true
  required?: boolean;       // no se puede ocultar
  align?: "left" | "right" | "center";
};

type NumOp = ">" | "<" | "=" | ">=" | "<=" | "between";
type FilterState = {
  text?: string;
  numOp?: NumOp;
  numA?: string;
  numB?: string;
  dateFrom?: string;
  dateTo?: string;
  enumSel?: Set<string>;
};

function fmtMoneyGs(n: number): string {
  return "Gs. " + Math.round(n).toLocaleString("es-PY").replace(/,/g, ".");
}
function fmtDate(v: string | number | null): string {
  if (v == null || v === "") return "";
  try { return new Date(v).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return String(v); }
}

export function DataExplorer<T>(props: {
  titulo: string;
  descripcion?: string;
  rows: T[];
  columns: ColumnDef<T>[];
  cargando?: boolean;
  /** Link al detalle de una fila (opcional). */
  detailHref?: (row: T) => string;
  /** Nombre base del archivo CSV. */
  csvName?: string;
  /** Barra extra (ej. rango de fechas del fetch). */
  toolbarExtra?: ReactNode;
  /** Encabezado extra (ej. KPIs clickeables). */
  headerExtra?: ReactNode;
}) {
  const { titulo, descripcion, rows, columns, cargando, detailHref, csvName = "export", toolbarExtra, headerExtra } = props;

  const [visibles, setVisibles] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultVisible !== false || c.required).map((c) => c.key)),
  );
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [filtros, setFiltros] = useState<Record<string, FilterState>>({});
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const colsVis = useMemo(() => columns.filter((c) => visibles.has(c.key)), [columns, visibles]);

  function toggleCol(k: string) {
    setVisibles((prev) => {
      const s = new Set(prev);
      const col = columns.find((c) => c.key === k);
      if (s.has(k)) { if (col?.required) return prev; s.delete(k); }
      else s.add(k);
      return s;
    });
  }

  function setFiltro(key: string, patch: Partial<FilterState>) {
    setFiltros((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function limpiarFiltro(key: string) {
    setFiltros((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }
  function limpiarTodo() { setFiltros({}); setQ(""); }

  // ── Aplicar filtros + búsqueda global ──────────────────────────────
  const filtradas = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return rows.filter((row) => {
      // Búsqueda global sobre todas las columnas visibles (texto).
      if (qLower) {
        const hit = colsVis.some((c) => {
          const v = c.get(row);
          return v != null && String(v).toLowerCase().includes(qLower);
        });
        if (!hit) return false;
      }
      // Filtros por columna.
      for (const c of columns) {
        const f = filtros[c.key];
        if (!f) continue;
        const raw = c.get(row);
        if (c.type === "text") {
          if (f.text && f.text.trim()) {
            if (raw == null || !String(raw).toLowerCase().includes(f.text.trim().toLowerCase())) return false;
          }
        } else if (c.type === "number" || c.type === "money") {
          const n = Number(raw);
          const a = f.numA !== undefined && f.numA !== "" ? Number(f.numA) : null;
          const b = f.numB !== undefined && f.numB !== "" ? Number(f.numB) : null;
          const op = f.numOp ?? ">";
          if (a != null) {
            if (op === ">" && !(n > a)) return false;
            if (op === "<" && !(n < a)) return false;
            if (op === "=" && !(n === a)) return false;
            if (op === ">=" && !(n >= a)) return false;
            if (op === "<=" && !(n <= a)) return false;
            if (op === "between" && !(n >= a && (b == null || n <= b))) return false;
          }
        } else if (c.type === "date") {
          const t = raw ? new Date(raw).getTime() : NaN;
          if (f.dateFrom) { const ft = new Date(f.dateFrom).getTime(); if (isNaN(t) || t < ft) return false; }
          if (f.dateTo) { const tt = new Date(f.dateTo).getTime() + 86400000; if (isNaN(t) || t >= tt) return false; }
        } else if (c.type === "enum") {
          if (f.enumSel && f.enumSel.size > 0) {
            if (raw == null || !f.enumSel.has(String(raw))) return false;
          }
        }
      }
      return true;
    });
  }, [rows, columns, colsVis, filtros, q]);

  // ── Ordenar ────────────────────────────────────────────────────────
  const ordenadas = useMemo(() => {
    if (!sortKey) return filtradas;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtradas;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtradas].sort((ra, rb) => {
      const a = col.get(ra), b = col.get(rb);
      if (col.type === "number" || col.type === "money") return ((Number(a) || 0) - (Number(b) || 0)) * dir;
      if (col.type === "date") {
        const ta = a ? new Date(a).getTime() : 0, tb = b ? new Date(b).getTime() : 0;
        return (ta - tb) * dir;
      }
      return String(a ?? "").localeCompare(String(b ?? ""), "es") * dir;
    });
  }, [filtradas, columns, sortKey, sortDir]);

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  // ── Totales ────────────────────────────────────────────────────────
  const totales = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of colsVis) {
      if (c.total === "sum") out[c.key] = ordenadas.reduce((s, r) => s + (Number(c.get(r)) || 0), 0);
      else if (c.total === "count") out[c.key] = ordenadas.length;
    }
    return out;
  }, [colsVis, ordenadas]);
  const hayTotales = colsVis.some((c) => c.total);

  const filtrosActivos = Object.entries(filtros).filter(([, f]) =>
    (f.text && f.text.trim()) || (f.numA !== undefined && f.numA !== "") ||
    f.dateFrom || f.dateTo || (f.enumSel && f.enumSel.size > 0));

  // ── Render de celda ────────────────────────────────────────────────
  function celda(c: ColumnDef<T>, row: T): ReactNode {
    if (c.render) return c.render(row);
    const v = c.get(row);
    if (c.type === "money") return fmtMoneyGs(Number(v) || 0);
    if (c.type === "date") return fmtDate(v);
    return v == null || v === "" ? "—" : String(v);
  }
  function valorCsv(c: ColumnDef<T>, row: T): string {
    const v = c.get(row);
    if (v == null) return "";
    if (c.type === "date") return fmtDate(v);
    return String(v);
  }
  function alignCls(c: ColumnDef<T>): string {
    const a = c.align ?? ((c.type === "number" || c.type === "money") ? "right" : "left");
    return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  }

  function exportarCsv() {
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const lines: string[] = [];
    lines.push(colsVis.map((c) => esc(c.label)).join(";"));
    ordenadas.forEach((r) => lines.push(colsVis.map((c) => esc(valorCsv(c, r))).join(";")));
    if (hayTotales) {
      lines.push("");
      lines.push(colsVis.map((c, i) => {
        if (c.total === "sum") return esc(String(Math.round(totales[c.key])));
        if (i === 0) return "TOTAL";
        return "";
      }).join(";"));
    }
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${csvName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
        {descripcion && <p className="text-sm text-slate-500 mt-0.5 print:hidden">{descripcion}</p>}
      </div>

      {headerExtra}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {toolbarExtra}
        <input type="text" placeholder="Buscar en todo…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm min-w-[180px]" />

        <div className="relative">
          <button type="button" onClick={() => { setColPickerOpen((v) => !v); setFiltrosOpen(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Columnas ({colsVis.length})
          </button>
          {colPickerOpen && (
            <div className="absolute left-0 top-9 z-20 rounded-lg border border-slate-200 bg-white shadow-lg p-3 min-w-[200px] max-h-[360px] overflow-y-auto space-y-1">
              {columns.map((c) => (
                <label key={c.key} className={`flex items-center gap-2 text-xs cursor-pointer ${c.required ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <input type="checkbox" checked={visibles.has(c.key)} disabled={c.required} onChange={() => toggleCol(c.key)} className="h-3.5 w-3.5" />
                  {c.label}{c.required && <span className="text-[9px] text-slate-400">(fija)</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => { setFiltrosOpen((v) => !v); setColPickerOpen(false); }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${filtrosActivos.length > 0 ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            Filtros{filtrosActivos.length > 0 ? ` (${filtrosActivos.length})` : ""}
          </button>
          {filtrosOpen && (
            <div className="absolute left-0 top-9 z-20 rounded-lg border border-slate-200 bg-white shadow-lg p-3 w-[320px] max-h-[460px] overflow-y-auto space-y-3">
              {colsVis.filter((c) => c.filterable !== false).map((c) => (
                <div key={c.key} className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-600">{c.label}</p>
                  {c.type === "text" && (
                    <input type="text" placeholder="contiene…" value={filtros[c.key]?.text ?? ""}
                      onChange={(e) => setFiltro(c.key, { text: e.target.value })}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                  )}
                  {(c.type === "number" || c.type === "money") && (
                    <div className="flex items-center gap-1">
                      <select value={filtros[c.key]?.numOp ?? ">"} onChange={(e) => setFiltro(c.key, { numOp: e.target.value as NumOp })}
                        className="rounded-md border border-slate-200 px-1 py-1 text-xs">
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value="=">=</option>
                        <option value=">=">&ge;</option>
                        <option value="<=">&le;</option>
                        <option value="between">entre</option>
                      </select>
                      <input type="number" placeholder="valor" value={filtros[c.key]?.numA ?? ""}
                        onChange={(e) => setFiltro(c.key, { numA: e.target.value })}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      {filtros[c.key]?.numOp === "between" && (
                        <input type="number" placeholder="y" value={filtros[c.key]?.numB ?? ""}
                          onChange={(e) => setFiltro(c.key, { numB: e.target.value })}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      )}
                    </div>
                  )}
                  {c.type === "date" && (
                    <div className="flex items-center gap-1">
                      <input type="date" value={filtros[c.key]?.dateFrom ?? ""} onChange={(e) => setFiltro(c.key, { dateFrom: e.target.value })}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      <span className="text-slate-400 text-xs">→</span>
                      <input type="date" value={filtros[c.key]?.dateTo ?? ""} onChange={(e) => setFiltro(c.key, { dateTo: e.target.value })}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                    </div>
                  )}
                  {c.type === "enum" && (
                    <div className="flex flex-wrap gap-1">
                      {(c.enumOptions ?? []).map((o) => {
                        const sel = filtros[c.key]?.enumSel?.has(o.value) ?? false;
                        return (
                          <button key={o.value} type="button"
                            onClick={() => {
                              const cur = new Set(filtros[c.key]?.enumSel ?? []);
                              if (cur.has(o.value)) cur.delete(o.value); else cur.add(o.value);
                              setFiltro(c.key, { enumSel: cur });
                            }}
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${sel ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] font-semibold" : "border-slate-200 text-slate-600"}`}>
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {filtros[c.key] && (
                    <button type="button" onClick={() => limpiarFiltro(c.key)} className="text-[10px] text-slate-400 hover:text-slate-700 underline">quitar</button>
                  )}
                </div>
              ))}
              {colsVis.filter((c) => c.filterable !== false).length === 0 && (
                <p className="text-xs text-slate-400 italic">Mostrá columnas para poder filtrarlas.</p>
              )}
            </div>
          )}
        </div>

        {(filtrosActivos.length > 0 || q.trim()) && (
          <button type="button" onClick={limpiarTodo} className="text-xs text-slate-500 hover:text-slate-800 underline">Limpiar todo</button>
        )}

        <button type="button" onClick={exportarCsv} disabled={ordenadas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
          Exportar CSV
        </button>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Imprimir / PDF
        </button>

        <span className="ml-auto text-sm text-slate-800">
          <strong className="text-lg tabular-nums">{ordenadas.length}</strong>
          <span className="text-xs text-slate-500 ml-1">resultado(s){(filtrosActivos.length || q.trim()) ? " (filtrado)" : ""}</span>
        </span>
      </div>

      {/* Chips de filtros activos */}
      {filtrosActivos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 print:hidden">
          {filtrosActivos.map(([key, f]) => {
            const col = columns.find((c) => c.key === key);
            if (!col) return null;
            let txt = "";
            if (f.text) txt = `contiene "${f.text}"`;
            else if (f.numA !== undefined && f.numA !== "") txt = `${f.numOp ?? ">"} ${f.numA}${f.numOp === "between" && f.numB ? ` y ${f.numB}` : ""}`;
            else if (f.dateFrom || f.dateTo) txt = `${f.dateFrom || "…"} → ${f.dateTo || "…"}`;
            else if (f.enumSel && f.enumSel.size) txt = Array.from(f.enumSel).join(", ");
            return (
              <span key={key} className="inline-flex items-center gap-1 rounded-full bg-[#4FAEB2]/10 border border-[#4FAEB2]/30 px-2 py-0.5 text-xs text-[#3F8E91] font-semibold">
                {col.label}: {txt}
                <button type="button" onClick={() => limpiarFiltro(key)} className="ml-1 text-[#3F8E91] hover:text-[#2a6a6d]">×</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        {cargando ? (
          <p className="py-12 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
        ) : ordenadas.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">Sin resultados con los filtros actuales.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {colsVis.map((c) => (
                  <th key={c.key}
                    onClick={() => (c.sortable !== false) && toggleSort(c.key)}
                    className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 whitespace-nowrap ${alignCls(c)} ${c.sortable !== false ? "cursor-pointer select-none hover:text-slate-900" : ""}`}>
                    {c.label}
                    {sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                ))}
                {detailHref && <th className="px-3 py-2 print:hidden" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ordenadas.slice(0, 1000).map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {colsVis.map((c) => (
                    <td key={c.key} className={`px-3 py-2 text-xs text-slate-700 ${alignCls(c)} ${(c.type === "number" || c.type === "money") ? "tabular-nums" : ""}`}>
                      {celda(c, row)}
                    </td>
                  ))}
                  {detailHref && (
                    <td className="px-3 py-2 print:hidden">
                      <a href={detailHref(row)} className="text-[#3F8E91] hover:underline text-xs font-medium">Ver</a>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {hayTotales && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  {colsVis.map((c, i) => (
                    <td key={c.key} className={`px-3 py-2 text-xs font-bold text-slate-800 ${alignCls(c)} ${(c.type === "number" || c.type === "money") ? "tabular-nums" : ""}`}>
                      {c.total === "sum" ? (c.type === "money" ? fmtMoneyGs(totales[c.key]) : totales[c.key])
                        : i === 0 ? `TOTAL (${ordenadas.length})` : ""}
                    </td>
                  ))}
                  {detailHref && <td className="print:hidden" />}
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {ordenadas.length > 1000 && (
          <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 1000 de {ordenadas.length}. Refiná filtros (el CSV incluye todo).</p>
        )}
      </div>
    </div>
  );
}
