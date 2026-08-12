"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";
import { ActiveFiltersBar, type ActiveChip } from "@/components/reportes/ActiveFiltersBar";

type Kpis = {
  total_pagado: number; cantidad_evaluaciones: number; prendas_evaluadas: number;
  ticket_promedio: number; pendientes_ingreso_count: number; pendientes_ingreso_total: number;
};
type PorSuc = { sucursal_id: string | null; sucursal_nombre: string; total: number; cnt: number };
type PorUsr = { usuario_id: string | null; usuario_nombre: string; total: number; cnt: number };
type PorEst = { estado: string; total: number; cnt: number };
type PorTP  = { tipo_id: string | null; tipo_nombre: string; prendas: number; total: number };
type Eval = {
  id: string; numero_control: string; fecha: string;
  cliente_id: string | null; cliente_nombre: string | null;
  sucursal_id: string | null; sucursal_nombre: string | null;
  usuario_id: string | null; usuario_nombre: string | null;
  estado: string | null;
  subtotal: number; ajuste: number; total: number; prendas: number;
};

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

type ColKey = "fecha" | "numero" | "cliente" | "sucursal" | "usuario" | "prendas" | "subtotal" | "ajuste" | "total" | "estado";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "fecha",    label: "Fecha", alwaysShow: true },
  { key: "numero",   label: "N° Recepción", alwaysShow: true },
  { key: "cliente",  label: "Cliente" },
  { key: "sucursal", label: "Sucursal" },
  { key: "usuario",  label: "Evaluadora" },
  { key: "prendas",  label: "Prendas" },
  { key: "subtotal", label: "Subtotal" },
  { key: "ajuste",   label: "Ajuste" },
  { key: "total",    label: "Total pagado", alwaysShow: true },
  { key: "estado",   label: "Estado" },
];

const ESTADO_COLOR: Record<string, string> = {
  pendiente_ingreso: "text-amber-700 bg-amber-50 border-amber-200",
  ingresada:         "text-emerald-700 bg-emerald-50 border-emerald-200",
  anulada:           "text-rose-700 bg-rose-50 border-rose-200",
};

export default function ReporteEvaluacionesPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [kpis, setKpis] = useState<Kpis>({ total_pagado: 0, cantidad_evaluaciones: 0, prendas_evaluadas: 0, ticket_promedio: 0, pendientes_ingreso_count: 0, pendientes_ingreso_total: 0 });
  const [porSuc, setPorSuc] = useState<PorSuc[]>([]);
  const [porUsr, setPorUsr] = useState<PorUsr[]>([]);
  const [porEst, setPorEst] = useState<PorEst[]>([]);
  const [porTP, setPorTP] = useState<PorTP[]>([]);
  const [evals, setEvals] = useState<Eval[]>([]);
  const [opciones, setOpciones] = useState<{ sucursales: { id: string; nombre: string }[]; usuarios: { id: string; nombre: string }[]; tipos_prenda: { id: string; nombre: string }[] }>({ sucursales: [], usuarios: [], tipos_prenda: [] });
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [sucF, setSucF] = useState("");
  const [usrF, setUsrF] = useState("");
  const [estF, setEstF] = useState("");
  const [tpF, setTpF] = useState("");
  const [q, setQ] = useState("");

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
    if (estF) qs.set("estado", estF);
    if (tpF) qs.set("tipo_prenda_id", tpF);
    if (q.trim()) qs.set("q", q.trim());
    fetchWithSupabaseSession(`/api/reportes/evaluaciones-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setKpis(j.data?.kpis ?? kpis);
        setPorSuc(j.data?.por_sucursal ?? []);
        setPorUsr(j.data?.por_usuario ?? []);
        setPorEst(j.data?.por_estado ?? []);
        setPorTP(j.data?.por_tipo_prenda ?? []);
        setEvals(j.data?.evaluaciones ?? []);
        setOpciones(j.data?.opciones ?? { sucursales: [], usuarios: [], tipos_prenda: [] });
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucF, usrF, estF, tpF, q]);

  const hayFiltros = Boolean(sucF || usrF || estF || tpF || q.trim());
  function limpiar() { setSucF(""); setUsrF(""); setEstF(""); setTpF(""); setQ(""); }

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

  function valorPara(e: Eval, k: ColKey): string {
    switch (k) {
      case "fecha":    return fmtFecha(e.fecha);
      case "numero":   return e.numero_control;
      case "cliente":  return e.cliente_nombre ?? "";
      case "sucursal": return e.sucursal_nombre ?? "";
      case "usuario":  return e.usuario_nombre ?? "";
      case "prendas":  return String(e.prendas);
      case "subtotal": return String(e.subtotal);
      case "ajuste":   return String(e.ajuste);
      case "total":    return String(e.total);
      case "estado":   return e.estado ?? "";
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    evals.forEach((e) => rows.push(columnasVis.map((c) => esc(valorPara(e, c.key))).join(";")));
    const tot = evals.reduce((s, e) => s + e.total, 0);
    const prendas = evals.reduce((s, e) => s + e.prendas, 0);
    rows.push("");
    rows.push(columnasVis.map((c) => {
      if (c.key === "fecha")   return "TOTAL";
      if (c.key === "prendas") return String(prendas);
      if (c.key === "total")   return String(tot);
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evaluaciones_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const KpiTile = ({ label, value, sub, tone = "slate", onClick, active }: { label: string; value: string; sub?: string; tone?: "slate" | "emerald" | "amber" | "sky"; onClick?: () => void; active?: boolean }) => {
    const toneMap = {
      slate:   "border-slate-200",
      emerald: "border-emerald-200 bg-emerald-50/40",
      amber:   "border-amber-200 bg-amber-50/40",
      sky:     "border-sky-200 bg-sky-50/40",
    } as const;
    const cls = `text-left w-full rounded-xl border p-3 shadow-sm transition ${toneMap[tone]} ${active ? "ring-2 ring-[#4FAEB2] bg-[#4FAEB2]/5" : "bg-white hover:shadow"}`;
    return onClick ? (
      <button type="button" onClick={onClick} className={cls}>
        <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </button>
    ) : (
      <div className={cls.replace("hover:shadow", "")}>
        <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    );
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400 print:hidden">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Reporte de compras / evaluaciones</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compras / evaluaciones</h1>
        <p className="text-sm text-slate-500 mt-0.5 print:hidden">
          Recepciones de prendas evaluadas. Click en KPI, sucursal, evaluadora, estado o tipo de prenda para filtrar.
        </p>
      </div>

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
            <option value="">Todas las evaluadoras</option>
            {opciones.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
        {opciones.tipos_prenda.length > 0 && (
          <select value={tpF} onChange={(e) => setTpF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los tipos</option>
            {opciones.tipos_prenda.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        <select value={estF} onChange={(e) => setEstF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          <option value="pendiente_ingreso">Pendiente ingreso</option>
          <option value="ingresada">Ingresada</option>
        </select>
        <input type="text" placeholder="Buscar cliente / N° recepción / evaluadora…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[220px]" />
      </div>

      <ActiveFiltersBar
        resourceLabel="evaluaciones"
        resultCount={evals.length}
        totalCount={kpis.cantidad_evaluaciones}
        onClearAll={hayFiltros ? limpiar : undefined}
        chips={([
          sucF && { key: "suc", emoji: "🏬", label: `Sucursal: ${opciones.sucursales.find((s) => s.id === sucF)?.nombre ?? sucF}`, onRemove: () => setSucF("") },
          usrF && { key: "usr", emoji: "👤", label: `Evaluadora: ${opciones.usuarios.find((u) => u.id === usrF)?.nombre ?? usrF}`, onRemove: () => setUsrF("") },
          tpF && { key: "tp", emoji: "👕", label: `Tipo: ${opciones.tipos_prenda.find((t) => t.id === tpF)?.nombre ?? tpF}`, onRemove: () => setTpF("") },
          estF && { key: "est", emoji: "🏷️", label: `Estado: ${estF}`, onRemove: () => setEstF("") },
          q.trim() && { key: "q", label: `Búsqueda: "${q.trim()}"`, onRemove: () => setQ("") },
        ].filter(Boolean) as ActiveChip[])}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total pagado"        value={fmt(kpis.total_pagado)}       sub={`${kpis.cantidad_evaluaciones} evaluación(es)`} tone="emerald" />
        <KpiTile label="Prendas evaluadas"   value={String(kpis.prendas_evaluadas)} tone="sky" />
        <KpiTile label="Ticket promedio"     value={fmt(kpis.ticket_promedio)}    tone="slate" />
        <KpiTile label="Pendientes ingreso"  value={String(kpis.pendientes_ingreso_count)}
          sub={fmt(kpis.pendientes_ingreso_total)} tone="amber"
          onClick={() => setEstF(estF === "pendiente_ingreso" ? "" : "pendiente_ingreso")}
          active={estF === "pendiente_ingreso"} />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Agregados clickeables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { title: "Por sucursal", rows: porSuc.map((s) => ({ label: s.sucursal_nombre, id: s.sucursal_id, right1: s.cnt, right2: s.total })), active: sucF, setActive: setSucF, r1: "Ev.", r2: "Total" },
              { title: "Por evaluadora",  rows: porUsr.map((u) => ({ label: u.usuario_nombre,  id: u.usuario_id,  right1: u.cnt, right2: u.total })), active: usrF,  setActive: setUsrF,  r1: "Ev.", r2: "Total" },
              { title: "Por estado",   rows: porEst.map((e) => ({ label: e.estado, id: e.estado, right1: e.cnt, right2: e.total })), active: estF, setActive: setEstF, r1: "Ev.", r2: "Total" },
              { title: "Por tipo de prenda", rows: porTP.map((t) => ({ label: t.tipo_nombre, id: t.tipo_id, right1: t.prendas, right2: t.total })), active: tpF, setActive: setTpF, r1: "Prendas", r2: "Pagado" },
            ].map((blk) => (
              <div key={blk.title} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800">{blk.title}</h2>
                  <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar.</p>
                </header>
                {blk.rows.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 text-[10px] uppercase font-semibold text-slate-600">Nombre</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase font-semibold text-slate-600">{blk.r1}</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase font-semibold text-slate-600">{blk.r2}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {blk.rows.map((r) => {
                          const activa = blk.active === r.id;
                          return (
                            <tr key={String(r.id ?? r.label)}
                                onClick={() => r.id != null && blk.setActive(activa ? "" : String(r.id))}
                                className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                              <td className="px-4 py-2 text-xs text-slate-800">{r.label}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-slate-600 text-xs">{r.right1}</td>
                              <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-800 text-xs">{fmt(r.right2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Listado */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Evaluaciones {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{evals.length} en el listado</span>
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
                <button type="button" onClick={exportarCsv} disabled={evals.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({evals.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {evals.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin evaluaciones.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVis.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${["prendas","subtotal","ajuste","total"].includes(c.key) ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evals.slice(0, 500).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        {columnasVis.map((c) => {
                          if (c.key === "fecha")    return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(e.fecha)}</td>;
                          if (c.key === "numero")   return <td key={c.key} className="px-3 py-2 font-mono text-xs text-slate-700">{e.numero_control}</td>;
                          if (c.key === "cliente")  return <td key={c.key} className="px-3 py-2 text-xs text-slate-700">{e.cliente_id ? <Link href={`/clientes/${e.cliente_id}`} className="text-[#3F8E91] hover:underline">{e.cliente_nombre ?? "—"}</Link> : (e.cliente_nombre ?? "—")}</td>;
                          if (c.key === "sucursal") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{e.sucursal_nombre ?? "—"}</td>;
                          if (c.key === "usuario")  return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{e.usuario_nombre ?? "—"}</td>;
                          if (c.key === "prendas")  return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-700">{e.prendas}</td>;
                          if (c.key === "subtotal") return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{fmt(e.subtotal)}</td>;
                          if (c.key === "ajuste")   return <td key={c.key} className={`px-3 py-2 text-right tabular-nums text-xs ${e.ajuste < 0 ? "text-rose-700" : e.ajuste > 0 ? "text-emerald-700" : "text-slate-500"}`}>{e.ajuste !== 0 ? (e.ajuste > 0 ? "+" : "") + fmt(e.ajuste) : "—"}</td>;
                          if (c.key === "total")    return <td key={c.key} className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmt(e.total)}</td>;
                          if (c.key === "estado")   return <td key={c.key} className="px-3 py-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADO_COLOR[e.estado ?? ""] ?? "text-slate-700 bg-slate-100 border-slate-200"}`}>{e.estado ?? "—"}</span></td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evals.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {evals.length}. Achicá el rango para el resto (el CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
