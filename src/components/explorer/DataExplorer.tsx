"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
// xlsx se carga dinámicamente al exportar (chunk aparte) para no inflar el
// bundle de cada página de explorador ni la memoria del build.

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
  const [groupKey, setGroupKey] = useState<string>(""); // "" = sin agrupar
  const [printOrient, setPrintOrient] = useState<"portrait" | "landscape">("landscape");

  // Cerrar los dropdowns (Columnas / Filtros) al hacer click fuera o con Escape.
  const colPickerRef = useRef<HTMLDivElement>(null);
  const filtrosRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colPickerOpen && !filtrosOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (colPickerOpen && colPickerRef.current && !colPickerRef.current.contains(t)) setColPickerOpen(false);
      if (filtrosOpen && filtrosRef.current && !filtrosRef.current.contains(t)) setFiltrosOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setColPickerOpen(false); setFiltrosOpen(false); } }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [colPickerOpen, filtrosOpen]);

  const colsVis = useMemo(() => columns.filter((c) => visibles.has(c.key)), [columns, visibles]);
  // Columnas por las que tiene sentido agrupar (texto / enum / fecha).
  const groupables = useMemo(() => columns.filter((c) => c.type === "text" || c.type === "enum" || c.type === "date"), [columns]);

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
  const sumCols = colsVis.filter((c) => c.total === "sum");

  // ── Agrupación (tipo tabla dinámica) ────────────────────────────────
  // Si groupKey está activo, dividimos las filas por el valor de esa columna,
  // con subtotal + media (promedio) por grupo. Los grupos se ordenan por el
  // primer subtotal (sum) descendente; si no hay sum, por cantidad.
  const grupos = useMemo(() => {
    if (!groupKey) return null;
    const gcol = columns.find((c) => c.key === groupKey);
    if (!gcol) return null;
    const map = new Map<string, T[]>();
    for (const row of ordenadas) {
      const raw = gcol.get(row);
      const label = gcol.type === "date" ? fmtDate(raw) : (raw == null || raw === "" ? "— (sin dato)" : String(raw));
      const arr = map.get(label) ?? [];
      arr.push(row);
      map.set(label, arr);
    }
    const primeraSum = sumCols[0];
    const lista = Array.from(map.entries()).map(([label, rows]) => {
      const subt: Record<string, number> = {};
      const media: Record<string, number> = {};
      for (const c of sumCols) {
        const s = rows.reduce((acc, r) => acc + (Number(c.get(r)) || 0), 0);
        subt[c.key] = s;
        media[c.key] = rows.length > 0 ? s / rows.length : 0;
      }
      return { label, rows, subt, media, count: rows.length };
    });
    lista.sort((a, b) => {
      if (primeraSum) return (b.subt[primeraSum.key] ?? 0) - (a.subt[primeraSum.key] ?? 0);
      return b.count - a.count;
    });
    return lista;
  }, [groupKey, columns, ordenadas, sumCols]);

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

  // Valor tipado para Excel: números/montos como number, fechas como Date, resto texto.
  function valorXlsx(c: ColumnDef<T>, row: T): string | number | Date {
    const v = c.get(row);
    if (v == null || v === "") return "";
    if (c.type === "number" || c.type === "money") return Number(v) || 0;
    if (c.type === "date") { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d; }
    return String(v);
  }

  async function exportarXlsx() {
    // Interop CJS: el import dinámico puede envolver el módulo en .default.
    // Usamos xlsx-js-style (fork con estilos) para que la tabla salga con
    // encabezado de color, filas alternadas, bordes y autofiltro.
    const mod = await import("xlsx-js-style");
    const XLSX = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
    const aoa: (string | number | Date)[][] = [];
    aoa.push(colsVis.map((c) => c.label));
    ordenadas.forEach((r) => aoa.push(colsVis.map((c) => valorXlsx(c, r))));
    const totalRowIdx = hayTotales ? aoa.length : -1;
    if (hayTotales) {
      aoa.push(colsVis.map((c, i) => {
        if (c.total === "sum") return Math.round(totales[c.key]);
        if (i === 0) return "TOTAL";
        return "";
      }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Ancho de columnas + formato de moneda / fecha por columna.
    ws["!cols"] = colsVis.map((c) => ({ wch: c.type === "money" ? 16 : c.type === "date" ? 13 : 20 }));
    const nRows = aoa.length;
    colsVis.forEach((c, ci) => {
      if (c.type !== "money" && c.type !== "date") return;
      for (let ri = 1; ri < nRows; ri++) {
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        const cell = ws[addr];
        if (!cell || cell.v === "" || cell.v == null) continue;
        if (c.type === "money") { cell.t = "n"; cell.z = "#,##0"; }
        else if (c.type === "date" && cell.v instanceof Date) { cell.t = "d"; cell.z = "dd/mm/yyyy"; }
      }
    });
    // ── Estilos (mismo look que el export del servidor) ──────────────────────
    const border = {
      top: { style: "thin", color: { rgb: "D8E3E3" } },
      bottom: { style: "thin", color: { rgb: "D8E3E3" } },
      left: { style: "thin", color: { rgb: "D8E3E3" } },
      right: { style: "thin", color: { rgb: "D8E3E3" } },
    };
    for (let ci = 0; ci < colsVis.length; ci++) {
      const numeric = colsVis[ci].type === "money" || colsVis[ci].type === "number";
      for (let ri = 0; ri < nRows; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (!cell) continue;
        if (ri === 0) {
          cell.s = {
            font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
            fill: { patternType: "solid", fgColor: { rgb: "4FAEB2" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border,
          };
        } else if (ri === totalRowIdx) {
          cell.s = {
            font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
            fill: { patternType: "solid", fgColor: { rgb: "0B3A3D" } },
            alignment: { horizontal: numeric ? "right" : "left", vertical: "center" },
            border,
          };
        } else {
          cell.s = {
            font: { sz: 10, color: { rgb: "1F2937" } },
            ...(ri % 2 === 1 ? { fill: { patternType: "solid", fgColor: { rgb: "EAF6F6" } } } : {}),
            alignment: { horizontal: numeric ? "right" : "left", vertical: "center" },
            border,
          };
        }
      }
    }
    ws["!rows"] = [{ hpt: 22 }];
    if (colsVis.length > 0) {
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, ordenadas.length), c: colsVis.length - 1 } }) };
    }
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    // writeFile en el browser dispara la descarga. Algunos navegadores/entornos
    // bloquean writeFile; en ese caso generamos el blob y descargamos a mano.
    try {
      XLSX.writeFile(wb, `${csvName}_${new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true });
    } catch {
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true }) as ArrayBuffer;
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${csvName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  async function exportarXlsxSafe() {
    try { await exportarXlsx(); }
    catch (e) {
      console.error("[DataExplorer] export xlsx", e);
      // Fallback duro a CSV para no dejar al usuario sin export.
      exportarCsv();
    }
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
    <div className="dx-print-root max-w-full space-y-4">
      {/* Orientación y ajuste de hoja al imprimir (el usuario elige Horizontal/Vertical).
          margin:0 en @page + padding propio → Chrome no dibuja el pie con la URL/fecha. */}
      <style>{`@media print {
        @page { size: A4 ${printOrient}; margin: 0; }
        .dx-print-root table { font-size: 8.5px !important; width: 100% !important; table-layout: auto; }
        .dx-print-root th, .dx-print-root td { padding: 2px 4px !important; white-space: normal !important; word-break: break-word; }
        .dx-print-root .overflow-x-auto { overflow: visible !important; }
      }`}</style>
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

        {groupables.length > 0 && (
          <div className="inline-flex items-center gap-1">
            <span className="text-[11px] text-slate-500 whitespace-nowrap">Agrupar por:</span>
            <select value={groupKey} onChange={(e) => setGroupKey(e.target.value)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${groupKey ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]" : "border-slate-200 bg-white text-slate-700"}`}>
              <option value="">— sin agrupar —</option>
              {groupables.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        )}

        <div className="relative" ref={colPickerRef}>
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

        <div className="relative" ref={filtrosRef}>
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

        <button type="button" onClick={exportarXlsxSafe} disabled={ordenadas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          title="Descargar en Excel (.xlsx)">
          Exportar Excel
        </button>
        <button type="button" onClick={exportarCsv} disabled={ordenadas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          title="Descargar en CSV">
          CSV
        </button>
        <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200">
          <select value={printOrient} onChange={(e) => setPrintOrient(e.target.value as "portrait" | "landscape")}
            title="Orientación de la hoja al imprimir / guardar PDF"
            className="border-0 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 focus:outline-none">
            <option value="landscape">Horizontal</option>
            <option value="portrait">Vertical</option>
          </select>
          <button type="button" onClick={() => window.print()}
            className="border-l border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Imprimir / PDF
          </button>
        </div>

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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-900/[0.03] overflow-auto max-h-[70vh] print:max-h-none print:overflow-visible">
        {cargando ? (
          <p className="py-12 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
        ) : ordenadas.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">Sin resultados con los filtros actuales.</p>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-0">
            {/* Encabezado fijo: al scrollear tablas largas no se pierde de vista
                qué columna es cada una. */}
            <thead className="sticky top-0 z-10">
              <tr>
                {colsVis.map((c) => (
                  <th key={c.key}
                    onClick={() => (c.sortable !== false) && toggleSort(c.key)}
                    className={`bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 px-3.5 py-2.5 text-[10px] uppercase tracking-wider font-bold whitespace-nowrap ${alignCls(c)} ${
                      sortKey === c.key ? "text-[#3F8E91]" : "text-slate-500"
                    } ${c.sortable !== false ? "cursor-pointer select-none hover:text-slate-800 transition-colors" : ""}`}>
                    {c.label}
                    <span className={`ml-1 text-[9px] ${sortKey === c.key ? "opacity-100" : "opacity-0"}`}>
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  </th>
                ))}
                {detailHref && <th className="bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 px-3 py-2.5 print:hidden" />}
              </tr>
            </thead>
            {grupos ? (
              /* ── Vista AGRUPADA: subtotal + media por grupo ── */
              <tbody className="divide-y divide-slate-100">
                {grupos.map((g) => (
                  <Fragment key={g.label}>
                    <tr className="bg-[#4FAEB2]/10 border-t border-[#4FAEB2]/30">
                      <td colSpan={colsVis.length + (detailHref ? 1 : 0)} className="px-3 py-2 text-xs font-bold text-[#3F8E91]">
                        {g.label} <span className="font-normal text-slate-500">· {g.count} {g.count === 1 ? "registro" : "registros"}</span>
                      </td>
                    </tr>
                    {g.rows.slice(0, 500).map((row, i) => (
                      <tr key={i} className={`transition-colors even:bg-slate-50/40 hover:bg-[#4FAEB2]/[0.07] ${detailHref ? "cursor-pointer" : ""}`}
                        onClick={detailHref ? (e) => {
                          // No robamos el click de links/botones internos
                          // (ej. la estrella de VIP o el propio "Ver").
                          const t = e.target as HTMLElement;
                          if (t.closest("a,button,input,select,label")) return;
                          const href = detailHref(row);
                          if (href && href !== "#") window.location.href = href;
                        } : undefined}
                      >
                        {colsVis.map((c) => (
                          <td key={c.key} className={`border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-700 ${alignCls(c)} ${(c.type === "number" || c.type === "money") ? "tabular-nums font-medium" : ""}`}>
                            {celda(c, row)}
                          </td>
                        ))}
                        {detailHref && (
                          <td className="border-b border-slate-100 px-3 py-2 text-center print:hidden">
                            <a href={detailHref(row)} title="Ver detalle" aria-label="Ver detalle"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#4FAEB2]/15 hover:text-[#3F8E91]">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </a>
                          </td>
                        )}
                      </tr>
                    ))}
                    {sumCols.length > 0 && (
                      <tr className="bg-slate-100/80 border-t-2 border-slate-300 text-[11px]">
                        {colsVis.map((c, i) => (
                          <td key={c.key} className={`px-3 py-1.5 font-semibold text-slate-700 ${alignCls(c)} ${(c.type === "number" || c.type === "money") ? "tabular-nums" : ""}`}>
                            {c.total === "sum"
                              ? <div><div>{c.type === "money" ? fmtMoneyGs(g.subt[c.key]) : g.subt[c.key]}</div><div className="text-[9px] font-normal text-slate-400">media {c.type === "money" ? fmtMoneyGs(g.media[c.key]) : Math.round(g.media[c.key] * 10) / 10}</div></div>
                              : i === 0 ? `Subtotal ${g.label}` : ""}
                          </td>
                        ))}
                        {detailHref && <td className="print:hidden" />}
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-100">
                {ordenadas.slice(0, 1000).map((row, i) => (
                  <tr key={i} className={`transition-colors even:bg-slate-50/40 hover:bg-[#4FAEB2]/[0.07] ${detailHref ? "cursor-pointer" : ""}`}
                        onClick={detailHref ? (e) => {
                          // No robamos el click de links/botones internos
                          // (ej. la estrella de VIP o el propio "Ver").
                          const t = e.target as HTMLElement;
                          if (t.closest("a,button,input,select,label")) return;
                          const href = detailHref(row);
                          if (href && href !== "#") window.location.href = href;
                        } : undefined}
                      >
                    {colsVis.map((c) => (
                      <td key={c.key} className={`border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-700 ${alignCls(c)} ${(c.type === "number" || c.type === "money") ? "tabular-nums font-medium" : ""}`}>
                        {celda(c, row)}
                      </td>
                    ))}
                    {detailHref && (
                      <td className="border-b border-slate-100 px-3 py-2 text-center print:hidden">
                        <a href={detailHref(row)} title="Ver detalle" aria-label="Ver detalle"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#4FAEB2]/15 hover:text-[#3F8E91]">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </a>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            )}
            {hayTotales && (
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100/95 backdrop-blur-sm print:static">
                <tr>
                  {colsVis.map((c, i) => (
                    <td key={c.key} className={`border-t border-slate-300 px-3.5 py-2.5 text-xs font-bold text-slate-900 ${alignCls(c)} ${(c.type === "number" || c.type === "money") ? "tabular-nums" : ""}`}>
                      {c.total === "sum"
                        ? <div><div>{c.type === "money" ? fmtMoneyGs(totales[c.key]) : totales[c.key]}</div><div className="text-[9px] font-normal text-slate-500">media {c.type === "money" ? fmtMoneyGs(ordenadas.length ? totales[c.key] / ordenadas.length : 0) : Math.round((ordenadas.length ? totales[c.key] / ordenadas.length : 0) * 10) / 10}</div></div>
                        : i === 0 ? `TOTAL GENERAL (${ordenadas.length})` : ""}
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
