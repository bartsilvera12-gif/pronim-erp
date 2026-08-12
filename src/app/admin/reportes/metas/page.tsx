"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";
import { ActiveFiltersBar, type ActiveChip } from "@/components/reportes/ActiveFiltersBar";

type Kpis = { ventas_total: number; dias_operados: number; dias_meta_alcanzada: number; comision_total: number };
type Dia = { fecha: string; sucursal_id: string | null; sucursal_nombre: string; meta: number; ventas: number; alcanzada: boolean; comision_pct: number; comision_total: number };
type PorSuc = { sucursal_id: string | null; sucursal_nombre: string; dias_op: number; dias_alc: number; ventas: number; comision: number };
type PorUsr = { usuario_id: string | null; usuario_nombre: string; ventas: number; comision_estimada: number };

function fmtFecha(iso: string) {
  try { return new Date(iso + "T12:00:00").toLocaleDateString("es-PY", { weekday: "short", day: "2-digit", month: "short" }); }
  catch { return iso; }
}

type ColKey = "fecha" | "sucursal" | "meta" | "ventas" | "diferencia" | "estado" | "pct" | "comision";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "fecha",      label: "Fecha", alwaysShow: true },
  { key: "sucursal",   label: "Sucursal" },
  { key: "meta",       label: "Meta diaria" },
  { key: "ventas",     label: "Ventas", alwaysShow: true },
  { key: "diferencia", label: "Diferencia" },
  { key: "estado",     label: "Estado" },
  { key: "pct",        label: "% Comisión" },
  { key: "comision",   label: "Comisión total", alwaysShow: true },
];

export default function ReporteMetasPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [kpis, setKpis] = useState<Kpis>({ ventas_total: 0, dias_operados: 0, dias_meta_alcanzada: 0, comision_total: 0 });
  const [dias, setDias] = useState<Dia[]>([]);
  const [porSuc, setPorSuc] = useState<PorSuc[]>([]);
  const [porUsr, setPorUsr] = useState<PorUsr[]>([]);
  const [opciones, setOpciones] = useState<{ sucursales: { id: string; nombre: string }[]; usuarios: { id: string; nombre: string }[] }>({ sucursales: [], usuarios: [] });
  const [hayMetas, setHayMetas] = useState(true);
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [sucF, setSucF] = useState("");
  const [usrF, setUsrF] = useState("");

  const [colsVis, setColsVis] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (sucF) qs.set("sucursal_id", sucF);
    if (usrF) qs.set("usuario_id", usrF);
    fetchWithSupabaseSession(`/api/reportes/metas-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setKpis(j.data?.kpis ?? kpis);
        setDias(j.data?.por_dia ?? []);
        setPorSuc(j.data?.por_sucursal ?? []);
        setPorUsr(j.data?.por_usuario ?? []);
        setOpciones(j.data?.opciones ?? { sucursales: [], usuarios: [] });
        setHayMetas(Boolean(j.data?.hay_metas_configuradas));
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucF, usrF]);

  const hayFiltros = Boolean(sucF || usrF);
  function limpiar() { setSucF(""); setUsrF(""); }

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

  function valorPara(d: Dia, k: ColKey): string {
    switch (k) {
      case "fecha":      return d.fecha;
      case "sucursal":   return d.sucursal_nombre;
      case "meta":       return String(d.meta);
      case "ventas":     return String(d.ventas);
      case "diferencia": return String(d.ventas - d.meta);
      case "estado":     return d.meta > 0 ? (d.alcanzada ? "Alcanzada" : "No alcanzada") : "Sin meta";
      case "pct":        return String(d.comision_pct);
      case "comision":   return String(d.comision_total);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    dias.forEach((d) => rows.push(columnasVis.map((c) => esc(valorPara(d, c.key))).join(";")));
    const tv = dias.reduce((s, d) => s + d.ventas, 0);
    const tc = dias.reduce((s, d) => s + d.comision_total, 0);
    rows.push("");
    rows.push(columnasVis.map((c) => {
      if (c.key === "fecha")    return "TOTAL";
      if (c.key === "ventas")   return String(tv);
      if (c.key === "comision") return String(tc);
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const KpiTile = ({ label, value, sub, tone = "slate" }: { label: string; value: string; sub?: string; tone?: "slate" | "emerald" | "amber" | "sky" }) => {
    const toneMap = {
      slate:   "border-slate-200",
      emerald: "border-emerald-200 bg-emerald-50/40",
      amber:   "border-amber-200 bg-amber-50/40",
      sky:     "border-sky-200 bg-sky-50/40",
    } as const;
    return (
      <div className={`rounded-xl border p-3 shadow-sm bg-white ${toneMap[tone]}`}>
        <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    );
  };

  const tasaAlcance = kpis.dias_operados > 0 ? Math.round((kpis.dias_meta_alcanzada / kpis.dias_operados) * 100) : 0;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400 print:hidden">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Metas y comisiones</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Metas y comisiones</h1>
        <p className="text-sm text-slate-500 mt-0.5 print:hidden">
          Días con meta alcanzada, ventas vs meta y comisiones estimadas por vendedora.
        </p>
      </div>

      {!hayMetas && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 print:hidden">
          No hay metas configuradas todavía. Configuralas en <Link href="/admin" className="underline font-semibold">Administración → Metas</Link> para que aparezcan las comisiones.
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        {opciones.sucursales.length > 0 && (
          <select value={sucF} onChange={(e) => setSucF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las sucursales</option>
            {opciones.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        {opciones.usuarios.length > 0 && (
          <select value={usrF} onChange={(e) => setUsrF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las vendedoras</option>
            {opciones.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
      </div>

      <ActiveFiltersBar
        resourceLabel="filas día×sucursal"
        resultCount={dias.length}
        onClearAll={hayFiltros ? limpiar : undefined}
        chips={([
          sucF && { key: "suc", emoji: "🏬", label: `Sucursal: ${opciones.sucursales.find((s) => s.id === sucF)?.nombre ?? sucF}`, onRemove: () => setSucF("") },
          usrF && { key: "usr", emoji: "👤", label: `Vendedora: ${opciones.usuarios.find((u) => u.id === usrF)?.nombre ?? usrF}`, onRemove: () => setUsrF("") },
        ].filter(Boolean) as ActiveChip[])}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Ventas del período"     value={fmt(kpis.ventas_total)}                                   tone="emerald" />
        <KpiTile label="Días operados"          value={String(kpis.dias_operados)}                              tone="slate" />
        <KpiTile label="Días con meta alcanzada" value={`${kpis.dias_meta_alcanzada} / ${kpis.dias_operados}`} sub={`${tasaAlcance}% de días`} tone="sky" />
        <KpiTile label="Comisión estimada total" value={fmt(kpis.comision_total)}                              tone="amber" />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Por sucursal + Por vendedora */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Por sucursal</h2>
                <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar el detalle.</p>
              </header>
              {porSuc.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Sucursal</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Días alc/op</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Ventas</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Comisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {porSuc.map((s) => {
                      const activa = sucF === s.sucursal_id;
                      return (
                        <tr key={s.sucursal_id ?? "sin"}
                            onClick={() => s.sucursal_id && setSucF(activa ? "" : s.sucursal_id)}
                            className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-2 text-xs text-slate-800">{s.sucursal_nombre}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{s.dias_alc}/{s.dias_op}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(s.ventas)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-amber-700">{fmt(s.comision)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Por vendedora / cajera</h2>
                <p className="text-[11px] text-slate-500 print:hidden">Comisión estimada proporcional a lo que vendió.</p>
              </header>
              {porUsr.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Vendedora</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Ventas</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Comisión estim.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {porUsr.map((u) => {
                      const activa = usrF === u.usuario_id;
                      return (
                        <tr key={u.usuario_id ?? "sin"}
                            onClick={() => u.usuario_id && setUsrF(activa ? "" : u.usuario_id)}
                            className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-2 text-xs text-slate-800">{u.usuario_nombre}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(u.ventas)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-amber-700">{fmt(u.comision_estimada)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Detalle día × sucursal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Detalle día × sucursal {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{dias.length} filas</span>
              </h2>
              <div className="flex flex-wrap gap-2 print:hidden relative">
                <button type="button" onClick={() => setPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Columnas ({colsVis.size})
                </button>
                {pickerOpen && (
                  <div className="absolute right-0 top-9 z-10 rounded-lg border border-slate-200 bg-white shadow-lg p-3 min-w-[180px] space-y-1">
                    {COLUMNAS.map((c) => (
                      <label key={c.key} className={`flex items-center gap-2 text-xs cursor-pointer ${c.alwaysShow ? "opacity-50 cursor-not-allowed" : ""}`}>
                        <input type="checkbox" checked={colsVis.has(c.key)} disabled={c.alwaysShow} onChange={() => toggleCol(c.key)} className="h-3.5 w-3.5" />
                        {c.label}{c.alwaysShow && <span className="text-[9px] text-slate-400">(fija)</span>}
                      </label>
                    ))}
                  </div>
                )}
                <button type="button" onClick={exportarCsv} disabled={dias.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({dias.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {dias.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin datos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVis.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${["meta","ventas","diferencia","pct","comision"].includes(c.key) ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dias.slice(0, 500).map((d, i) => {
                      const diff = d.ventas - d.meta;
                      return (
                        <tr key={`${d.fecha}-${d.sucursal_id ?? i}`} className={`hover:bg-slate-50 ${d.meta > 0 && d.alcanzada ? "bg-emerald-50/30" : d.meta > 0 && !d.alcanzada ? "bg-rose-50/20" : ""}`}>
                          {columnasVis.map((c) => {
                            if (c.key === "fecha")      return <td key={c.key} className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">{fmtFecha(d.fecha)}</td>;
                            if (c.key === "sucursal")   return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{d.sucursal_nombre}</td>;
                            if (c.key === "meta")       return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{d.meta > 0 ? fmt(d.meta) : "—"}</td>;
                            if (c.key === "ventas")     return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(d.ventas)}</td>;
                            if (c.key === "diferencia") return <td key={c.key} className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${diff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{d.meta > 0 ? (diff >= 0 ? "+" : "") + fmt(diff) : "—"}</td>;
                            if (c.key === "estado")     return <td key={c.key} className="px-3 py-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${d.meta === 0 ? "text-slate-500 bg-slate-50 border-slate-200" : d.alcanzada ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"}`}>{d.meta === 0 ? "Sin meta" : d.alcanzada ? "Alcanzada" : "No alcanzada"}</span></td>;
                            if (c.key === "pct")        return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{d.comision_pct}%</td>;
                            if (c.key === "comision")   return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-amber-700">{fmt(d.comision_total)}</td>;
                            return null;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {dias.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {dias.length}. Achicá el rango (CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
