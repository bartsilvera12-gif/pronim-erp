"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

type Kpis = {
  turnos_total: number; turnos_cerrados: number; turnos_abiertos: number;
  total_apertura: number; total_contado: number; total_esperado: number;
  diferencia_neta: number; diferencia_abs: number;
};
type PorUsr = { usuario_id: string | null; usuario_nombre: string; cnt: number; contado: number; esperado: number; diferencia: number };
type PorDia = { dia: string; cnt: number; contado: number; diferencia: number };
type Caja = {
  id: string; numero_caja: number; estado: string;
  fecha_apertura: string; fecha_cierre: string | null;
  abierta_por: string | null; abierta_por_nombre: string | null;
  cerrada_por: string | null; cerrada_por_nombre: string | null;
  monto_apertura: number; monto_esperado: number; monto_contado: number; diferencia: number;
  observacion_apertura: string | null; observacion_cierre: string | null;
  movs_count: number;
};

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function fmtDia(iso: string) {
  try { return new Date(iso + "T12:00:00").toLocaleDateString("es-PY", { weekday: "short", day: "2-digit", month: "short" }); }
  catch { return iso; }
}

type ColKey = "numero" | "estado" | "abierta_por" | "cerrada_por" | "apertura" | "cierre" | "monto_apertura" | "esperado" | "contado" | "diferencia" | "movs";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "numero",         label: "N° Caja", alwaysShow: true },
  { key: "estado",         label: "Estado" },
  { key: "abierta_por",    label: "Abrió" },
  { key: "cerrada_por",    label: "Cerró" },
  { key: "apertura",       label: "Apertura", alwaysShow: true },
  { key: "cierre",         label: "Cierre" },
  { key: "monto_apertura", label: "Monto apertura" },
  { key: "esperado",       label: "Esperado" },
  { key: "contado",        label: "Contado" },
  { key: "diferencia",     label: "Diferencia", alwaysShow: true },
  { key: "movs",           label: "Movs" },
];

const ESTADO_COLOR: Record<string, string> = {
  abierta: "text-emerald-700 bg-emerald-50 border-emerald-200",
  cerrada: "text-slate-700 bg-slate-50 border-slate-200",
};

export default function ReporteCajasPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [kpis, setKpis] = useState<Kpis>({ turnos_total: 0, turnos_cerrados: 0, turnos_abiertos: 0, total_apertura: 0, total_contado: 0, total_esperado: 0, diferencia_neta: 0, diferencia_abs: 0 });
  const [porUsr, setPorUsr] = useState<PorUsr[]>([]);
  const [porDia, setPorDia] = useState<PorDia[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [opciones, setOpciones] = useState<{ usuarios: { id: string; nombre: string }[] }>({ usuarios: [] });
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [estF, setEstF] = useState("");
  const [usrF, setUsrF] = useState("");
  const [difF, setDifF] = useState("");
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
    if (usrF) qs.set("usuario_id", usrF);
    if (difF) qs.set("con_diferencia", difF);
    if (q.trim()) qs.set("q", q.trim());
    fetchWithSupabaseSession(`/api/reportes/cajas-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setKpis(j.data?.kpis ?? kpis);
        setPorUsr(j.data?.por_usuario ?? []);
        setPorDia(j.data?.por_dia ?? []);
        setCajas(j.data?.cajas ?? []);
        setOpciones(j.data?.opciones ?? { usuarios: [] });
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, estF, usrF, difF, q]);

  const hayFiltros = Boolean(estF || usrF || difF || q.trim());
  function limpiar() { setEstF(""); setUsrF(""); setDifF(""); setQ(""); }

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

  function valorPara(c: Caja, k: ColKey): string {
    switch (k) {
      case "numero":         return String(c.numero_caja);
      case "estado":         return c.estado;
      case "abierta_por":    return c.abierta_por_nombre ?? "";
      case "cerrada_por":    return c.cerrada_por_nombre ?? "";
      case "apertura":       return fmtFecha(c.fecha_apertura);
      case "cierre":         return fmtFecha(c.fecha_cierre);
      case "monto_apertura": return String(c.monto_apertura);
      case "esperado":       return String(c.monto_esperado);
      case "contado":        return String(c.monto_contado);
      case "diferencia":     return String(c.diferencia);
      case "movs":           return String(c.movs_count);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    cajas.forEach((c) => rows.push(columnasVis.map((col) => esc(valorPara(c, col.key))).join(";")));
    const totC = cajas.reduce((s, c) => s + c.monto_contado, 0);
    const totE = cajas.reduce((s, c) => s + c.monto_esperado, 0);
    const totD = cajas.reduce((s, c) => s + c.diferencia, 0);
    rows.push("");
    rows.push(columnasVis.map((col) => {
      if (col.key === "numero")     return "TOTAL";
      if (col.key === "esperado")   return String(totE);
      if (col.key === "contado")    return String(totC);
      if (col.key === "diferencia") return String(totD);
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cajas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const KpiTile = ({ label, value, sub, tone = "slate", onClick, active }: { label: string; value: string; sub?: string; tone?: "slate" | "emerald" | "amber" | "rose" | "sky"; onClick?: () => void; active?: boolean }) => {
    const toneMap = {
      slate:   "border-slate-200",
      emerald: "border-emerald-200 bg-emerald-50/40",
      amber:   "border-amber-200 bg-amber-50/40",
      rose:    "border-rose-200 bg-rose-50/40",
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
        <span className="text-gray-700 font-medium">Cierres de caja</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cierres de caja</h1>
        <p className="text-sm text-slate-500 mt-0.5 print:hidden">
          Turnos abiertos/cerrados con contado vs esperado. Click en KPI o usuario para filtrar.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <select value={estF} onChange={(e) => setEstF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          <option value="cerrada">Cerradas</option>
          <option value="abierta">Abiertas</option>
        </select>
        {opciones.usuarios.length > 0 && (
          <select value={usrF} onChange={(e) => setUsrF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los usuarios</option>
            {opciones.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
        <select value={difF} onChange={(e) => setDifF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Cualquier diferencia</option>
          <option value="1">Con diferencia (≠ 0)</option>
          <option value="pos">Sobrante (contado &gt; esperado)</option>
          <option value="neg">Faltante (contado &lt; esperado)</option>
        </select>
        <input type="text" placeholder="Buscar N° / usuario / obs…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[180px]" />
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="ml-1 text-xs text-slate-500 hover:text-slate-800 underline">Limpiar</button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Turnos"         value={String(kpis.turnos_total)}       sub={`${kpis.turnos_cerrados} cerrados · ${kpis.turnos_abiertos} abiertos`} tone="slate" />
        <KpiTile label="Total contado"  value={fmt(kpis.total_contado)}         sub={`Esperado: ${fmt(kpis.total_esperado)}`} tone="emerald" />
        <KpiTile label="Diferencia neta" value={(kpis.diferencia_neta >= 0 ? "+" : "") + fmt(kpis.diferencia_neta)}
          sub={`Absoluta: ${fmt(kpis.diferencia_abs)}`}
          tone={kpis.diferencia_neta === 0 ? "slate" : kpis.diferencia_neta > 0 ? "emerald" : "rose"} />
        <KpiTile label="Con diferencia" value={String(cajas.filter((c) => c.diferencia !== 0).length)}
          sub="Turnos filtrados en la lista"
          tone="amber"
          onClick={() => setDifF(difF === "1" ? "" : "1")}
          active={difF === "1"} />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Por usuario + Por día */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Por usuario que cerró</h2>
                <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar.</p>
              </header>
              {porUsr.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin turnos cerrados.</p>
              ) : (
                <div className="max-h-[280px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Usuario</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Turnos</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Contado</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Diferencia</th>
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
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{u.cnt}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(u.contado)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${u.diferencia === 0 ? "text-slate-500" : u.diferencia > 0 ? "text-emerald-700" : "text-rose-700"}`}>{u.diferencia !== 0 ? (u.diferencia > 0 ? "+" : "") + fmt(u.diferencia) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Por día</h2>
                <p className="text-[11px] text-slate-500 print:hidden">Contado y diferencia por fecha de apertura.</p>
              </header>
              {porDia.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
              ) : (
                <div className="max-h-[280px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Fecha</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Turnos</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Contado</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {porDia.map((d) => (
                        <tr key={d.dia} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">{fmtDia(d.dia)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{d.cnt}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(d.contado)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${d.diferencia === 0 ? "text-slate-500" : d.diferencia > 0 ? "text-emerald-700" : "text-rose-700"}`}>{d.diferencia !== 0 ? (d.diferencia > 0 ? "+" : "") + fmt(d.diferencia) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Listado */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Turnos {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{cajas.length} en el listado</span>
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
                <button type="button" onClick={exportarCsv} disabled={cajas.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({cajas.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {cajas.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin turnos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVis.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${["monto_apertura","esperado","contado","diferencia","movs"].includes(c.key) ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cajas.map((c) => (
                      <tr key={c.id} className={`hover:bg-slate-50 ${c.diferencia < 0 ? "bg-rose-50/30" : c.diferencia > 0 ? "bg-emerald-50/20" : ""}`}>
                        {columnasVis.map((col) => {
                          if (col.key === "numero")         return <td key={col.key} className="px-3 py-2 font-mono text-xs text-slate-800">#{c.numero_caja}</td>;
                          if (col.key === "estado")         return <td key={col.key} className="px-3 py-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADO_COLOR[c.estado] ?? "text-slate-700 bg-slate-100 border-slate-200"}`}>{c.estado}</span></td>;
                          if (col.key === "abierta_por")    return <td key={col.key} className="px-3 py-2 text-xs text-slate-600">{c.abierta_por_nombre ?? "—"}</td>;
                          if (col.key === "cerrada_por")    return <td key={col.key} className="px-3 py-2 text-xs text-slate-600">{c.cerrada_por_nombre ?? "—"}</td>;
                          if (col.key === "apertura")       return <td key={col.key} className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">{fmtFecha(c.fecha_apertura)}</td>;
                          if (col.key === "cierre")         return <td key={col.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(c.fecha_cierre)}</td>;
                          if (col.key === "monto_apertura") return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{fmt(c.monto_apertura)}</td>;
                          if (col.key === "esperado")       return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{fmt(c.monto_esperado)}</td>;
                          if (col.key === "contado")        return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-slate-800">{fmt(c.monto_contado)}</td>;
                          if (col.key === "diferencia")     return <td key={col.key} className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${c.diferencia === 0 ? "text-slate-500" : c.diferencia > 0 ? "text-emerald-700" : "text-rose-700"}`}>{c.diferencia !== 0 ? (c.diferencia > 0 ? "+" : "") + fmt(c.diferencia) : "—"}</td>;
                          if (col.key === "movs")           return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-500">{c.movs_count}</td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
