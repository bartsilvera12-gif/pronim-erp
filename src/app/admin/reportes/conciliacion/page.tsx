"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

type Pago = {
  id: string; venta_id: string | null; numero_control: string | null;
  metodo_pago: string; entidad_nombre_snapshot: string | null;
  monto: number; referencia: string | null; titular: string | null;
  fecha_acreditacion: string | null; observacion: string | null;
  conciliacion_estado: string;
  conciliado_at: string | null; conciliado_by_nombre: string | null;
  conciliacion_nota: string | null; created_at: string;
  sucursal_nombre: string | null;
};

type Tot = { estado: string; metodo: string; total: number; count: number };

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const ESTADOS = ["pendiente", "en_proceso", "confirmada", "conciliada", "descartada"] as const;
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente", en_proceso: "En proceso", confirmada: "Confirmada",
  conciliada: "Conciliada", descartada: "Descartada",
};
const ESTADO_COLOR: Record<string, string> = {
  pendiente:  "text-amber-700 bg-amber-50 border-amber-200",
  en_proceso: "text-sky-700 bg-sky-50 border-sky-200",
  confirmada: "text-emerald-700 bg-emerald-50 border-emerald-200",
  conciliada: "text-emerald-800 bg-emerald-100 border-emerald-300",
  descartada: "text-slate-500 bg-slate-100 border-slate-200",
};

type ColKey = "fecha" | "venta" | "metodo" | "entidad" | "referencia" | "titular" | "sucursal" | "estado" | "conciliado_por" | "nota" | "monto";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "fecha",           label: "Fecha", alwaysShow: true },
  { key: "venta",           label: "N° Venta" },
  { key: "metodo",          label: "Método" },
  { key: "entidad",         label: "Entidad" },
  { key: "referencia",      label: "Referencia" },
  { key: "titular",         label: "Titular" },
  { key: "sucursal",        label: "Sucursal" },
  { key: "estado",          label: "Estado", alwaysShow: true },
  { key: "conciliado_por",  label: "Conciliado por" },
  { key: "nota",            label: "Nota" },
  { key: "monto",           label: "Monto", alwaysShow: true },
];

export default function ReporteConciliacionPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [totales, setTotales] = useState<Tot[]>([]);
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [estF, setEstF] = useState("");
  const [metF, setMetF] = useState("");
  const [q, setQ] = useState("");

  const [colsVis, setColsVis] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (estF) qs.set("estado", estF);
    if (metF) qs.set("metodo", metF);
    if (q.trim()) qs.set("q", q.trim());
    qs.set("limit", "1000");
    fetchWithSupabaseSession(`/api/conciliacion?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setPagos((j.data?.pagos ?? []) as Pago[]);
        setTotales((j.data?.totales ?? []) as Tot[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, estF, metF, q]);

  const hayFiltros = Boolean(estF || metF || q.trim());
  function limpiar() { setEstF(""); setMetF(""); setQ(""); }

  // KPIs por estado
  const kpisEstado = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    ESTADOS.forEach((e) => m.set(e, { count: 0, total: 0 }));
    totales.forEach((t) => {
      const bag = m.get(t.estado) ?? { count: 0, total: 0 };
      bag.count += t.count; bag.total += t.total;
      m.set(t.estado, bag);
    });
    return m;
  }, [totales]);

  // Por método (agrupa todos los estados)
  const porMetodo = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    totales.forEach((t) => {
      const bag = m.get(t.metodo) ?? { count: 0, total: 0 };
      bag.count += t.count; bag.total += t.total;
      m.set(t.metodo, bag);
    });
    return Array.from(m.entries())
      .map(([metodo, v]) => ({ metodo, count: v.count, total: v.total }))
      .sort((a, b) => b.total - a.total);
  }, [totales]);

  const columnasVis = useMemo(() => COLUMNAS.filter((c) => colsVis.has(c.key)), [colsVis]);

  function toggleCol(k: ColKey) {
    setColsVis((prev) => {
      const s = new Set(prev);
      if (s.has(k)) {
        if (COLUMNAS.find((c) => c.key === k)?.alwaysShow) return prev;
        s.delete(k);
      } else s.add(k);
      return s;
    });
  }

  function valorPara(p: Pago, k: ColKey): string {
    switch (k) {
      case "fecha":          return fmtFecha(p.created_at);
      case "venta":          return p.numero_control ?? "";
      case "metodo":         return p.metodo_pago;
      case "entidad":        return p.entidad_nombre_snapshot ?? "";
      case "referencia":     return p.referencia ?? "";
      case "titular":        return p.titular ?? "";
      case "sucursal":       return p.sucursal_nombre ?? "";
      case "estado":         return ESTADO_LABEL[p.conciliacion_estado] ?? p.conciliacion_estado;
      case "conciliado_por": return p.conciliado_by_nombre ?? "";
      case "nota":           return p.conciliacion_nota ?? p.observacion ?? "";
      case "monto":          return String(p.monto);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    pagos.forEach((p) => rows.push(columnasVis.map((c) => esc(valorPara(p, c.key))).join(";")));
    const total = pagos.reduce((s, p) => s + p.monto, 0);
    rows.push("");
    rows.push(columnasVis.map((c) => {
      if (c.key === "fecha") return "TOTAL";
      if (c.key === "monto") return String(total);
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacion_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const KpiTile = ({ estado }: { estado: string }) => {
    const bag = kpisEstado.get(estado) ?? { count: 0, total: 0 };
    const activa = estF === estado;
    const cls = `text-left w-full rounded-xl border p-3 shadow-sm transition ${ESTADO_COLOR[estado] ?? "border-slate-200 bg-white"} ${activa ? "ring-2 ring-[#4FAEB2]" : "hover:shadow"}`;
    return (
      <button type="button" onClick={() => setEstF(activa ? "" : estado)} className={cls}>
        <p className="text-[10px] uppercase font-semibold opacity-80">{ESTADO_LABEL[estado]}</p>
        <p className="text-lg font-bold tabular-nums mt-0.5">{bag.count}</p>
        <p className="text-[10px] opacity-75 mt-0.5">{fmt(bag.total)}</p>
      </button>
    );
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400 print:hidden">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Conciliación bancaria — reporte</span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conciliación bancaria</h1>
          <p className="text-sm text-slate-500 mt-0.5 print:hidden">
            Click en un estado o método para filtrar la lista. Exportá o imprimí para conferir contra extractos bancarios.
          </p>
        </div>
        <Link href="/admin/conciliacion" className="print:hidden text-xs text-[#3F8E91] hover:underline font-semibold">
          Ir al panel operativo →
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <select value={estF} onChange={(e) => setEstF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
        </select>
        {porMetodo.length > 0 && (
          <select value={metF} onChange={(e) => setMetF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los métodos</option>
            {porMetodo.map((m) => <option key={m.metodo} value={m.metodo}>{m.metodo}</option>)}
          </select>
        )}
        <input type="text" placeholder="Buscar N° venta / referencia / titular / obs…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[220px]" />
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="ml-1 text-xs text-slate-500 hover:text-slate-800 underline">Limpiar</button>
        )}
      </div>

      {/* KPIs por estado (clickeables) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {ESTADOS.map((e) => <KpiTile key={e} estado={e} />)}
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Por método (clickeable) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Por método de pago</h2>
              <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar.</p>
            </header>
            {porMetodo.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Sin pagos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Método</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Pagos</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porMetodo.map((m) => {
                    const activa = metF === m.metodo;
                    return (
                      <tr key={m.metodo}
                          onClick={() => setMetF(activa ? "" : m.metodo)}
                          className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                        <td className="px-3 py-2 text-xs text-slate-800 font-mono">{m.metodo}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{m.count}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(m.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Listado */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Pagos {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{pagos.length} en el listado</span>
              </h2>
              <div className="flex flex-wrap gap-2 print:hidden relative">
                <button type="button" onClick={() => setPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Columnas ({colsVis.size})
                </button>
                {pickerOpen && (
                  <div className="absolute right-0 top-9 z-10 rounded-lg border border-slate-200 bg-white shadow-lg p-3 min-w-[200px] space-y-1">
                    {COLUMNAS.map((c) => (
                      <label key={c.key} className={`flex items-center gap-2 text-xs cursor-pointer ${c.alwaysShow ? "opacity-50 cursor-not-allowed" : ""}`}>
                        <input type="checkbox" checked={colsVis.has(c.key)} disabled={c.alwaysShow} onChange={() => toggleCol(c.key)} className="h-3.5 w-3.5" />
                        {c.label}{c.alwaysShow && <span className="text-[9px] text-slate-400">(fija)</span>}
                      </label>
                    ))}
                  </div>
                )}
                <button type="button" onClick={exportarCsv} disabled={pagos.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({pagos.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {pagos.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin pagos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVis.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${c.key === "monto" ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagos.slice(0, 500).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        {columnasVis.map((c) => {
                          if (c.key === "fecha")          return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(p.created_at)}</td>;
                          if (c.key === "venta")          return <td key={c.key} className="px-3 py-2 font-mono text-xs">{p.venta_id ? <Link href={`/ventas/${p.venta_id}`} className="text-[#3F8E91] hover:underline">{p.numero_control ?? "—"}</Link> : (p.numero_control ?? "—")}</td>;
                          if (c.key === "metodo")         return <td key={c.key} className="px-3 py-2 text-xs text-slate-700 font-mono">{p.metodo_pago}</td>;
                          if (c.key === "entidad")        return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{p.entidad_nombre_snapshot ?? "—"}</td>;
                          if (c.key === "referencia")     return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 font-mono">{p.referencia ?? "—"}</td>;
                          if (c.key === "titular")        return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{p.titular ?? "—"}</td>;
                          if (c.key === "sucursal")       return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{p.sucursal_nombre ?? "—"}</td>;
                          if (c.key === "estado")         return <td key={c.key} className="px-3 py-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADO_COLOR[p.conciliacion_estado] ?? "text-slate-700 bg-slate-100 border-slate-200"}`}>{ESTADO_LABEL[p.conciliacion_estado] ?? p.conciliacion_estado}</span></td>;
                          if (c.key === "conciliado_por") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{p.conciliado_by_nombre ?? "—"}</td>;
                          if (c.key === "nota")           return <td key={c.key} className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate" title={p.conciliacion_nota ?? p.observacion ?? ""}>{p.conciliacion_nota ?? p.observacion ?? "—"}</td>;
                          if (c.key === "monto")          return <td key={c.key} className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmt(p.monto)}</td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pagos.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {pagos.length}. Achicá el rango (CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
