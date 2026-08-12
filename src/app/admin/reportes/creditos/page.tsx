"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";
import { ActiveFiltersBar, type ActiveChip } from "@/components/reportes/ActiveFiltersBar";
import { VistasGuardadasBar } from "@/components/reportes/VistasGuardadasBar";

type Kpis = {
  entradas_periodo: number; salidas_periodo: number; ajustes_periodo: number; neto_periodo: number;
  saldo_credito_global: number; saldo_cashback_global: number;
};
type PorCli = { cliente_id: string | null; cliente_nombre: string; saldo_credito: number; saldo_cashback: number; movs_periodo: number };
type PorOri = { origen: string; entradas: number; salidas: number; cnt: number };
type PorTipo = { tipo: string; total: number; cnt: number };
type Mov = {
  id: string; created_at: string;
  cliente_id: string | null; cliente_nombre: string | null;
  tipo: string; monto: number; origen: string | null; categoria: string | null;
  referencia_tipo: string | null; referencia_numero: string | null;
  observaciones: string | null; usuario_nombre: string | null;
};

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

type ColKey = "fecha" | "cliente" | "tipo" | "categoria" | "origen" | "referencia" | "observaciones" | "usuario" | "monto";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "fecha",         label: "Fecha", alwaysShow: true },
  { key: "cliente",       label: "Cliente", alwaysShow: true },
  { key: "tipo",          label: "Tipo" },
  { key: "categoria",     label: "Categoría" },
  { key: "origen",        label: "Origen" },
  { key: "referencia",    label: "Referencia" },
  { key: "observaciones", label: "Observaciones" },
  { key: "usuario",       label: "Usuario" },
  { key: "monto",         label: "Monto", alwaysShow: true },
];

const TIPO_COLOR: Record<string, string> = {
  ENTRADA: "text-emerald-700 bg-emerald-50 border-emerald-200",
  SALIDA:  "text-rose-700 bg-rose-50 border-rose-200",
  AJUSTE:  "text-slate-700 bg-slate-50 border-slate-200",
};
const CAT_COLOR: Record<string, string> = {
  credito:      "text-slate-700 bg-slate-100",
  cashback:     "text-pink-700 bg-pink-50",
  consignacion: "text-sky-700 bg-sky-50",
};

export default function ReporteCreditosPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [kpis, setKpis] = useState<Kpis>({ entradas_periodo: 0, salidas_periodo: 0, ajustes_periodo: 0, neto_periodo: 0, saldo_credito_global: 0, saldo_cashback_global: 0 });
  const [porCli, setPorCli] = useState<PorCli[]>([]);
  const [porOri, setPorOri] = useState<PorOri[]>([]);
  const [porTipo, setPorTipo] = useState<PorTipo[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [soportaCategoria, setSoportaCategoria] = useState(true);
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tipoF, setTipoF] = useState("");
  const [origenF, setOrigenF] = useState("");
  const [categoriaF, setCategoriaF] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [q, setQ] = useState("");

  const [colsVis, setColsVis] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (tipoF) qs.set("tipo", tipoF);
    if (origenF) qs.set("origen", origenF);
    if (categoriaF) qs.set("categoria", categoriaF);
    if (clienteF) qs.set("cliente_id", clienteF);
    if (q.trim()) qs.set("q", q.trim());
    fetchWithSupabaseSession(`/api/reportes/creditos-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setKpis(j.data?.kpis ?? kpis);
        setPorCli(j.data?.por_cliente ?? []);
        setPorOri(j.data?.por_origen ?? []);
        setPorTipo(j.data?.por_tipo ?? []);
        setMovs(j.data?.movimientos ?? []);
        setSoportaCategoria(Boolean(j.data?.soporta_categoria));
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, tipoF, origenF, categoriaF, clienteF, q]);

  const hayFiltros = Boolean(tipoF || origenF || categoriaF || clienteF || q.trim());
  function limpiar() { setTipoF(""); setOrigenF(""); setCategoriaF(""); setClienteF(""); setQ(""); }

  const clienteFObj = useMemo(() => porCli.find((c) => c.cliente_id === clienteF) ?? null, [clienteF, porCli]);

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

  function valorPara(m: Mov, k: ColKey): string {
    switch (k) {
      case "fecha":         return fmtFecha(m.created_at);
      case "cliente":       return m.cliente_nombre ?? "—";
      case "tipo":          return m.tipo;
      case "categoria":     return m.categoria ?? "credito";
      case "origen":        return m.origen ?? "";
      case "referencia":    return [m.referencia_tipo, m.referencia_numero].filter(Boolean).join(" ");
      case "observaciones": return m.observaciones ?? "";
      case "usuario":       return m.usuario_nombre ?? "";
      case "monto":         return (m.tipo === "SALIDA" ? "-" : "") + String(m.monto);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    movs.forEach((m) => rows.push(columnasVis.map((c) => esc(valorPara(m, c.key))).join(";")));
    const totalE = movs.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + m.monto, 0);
    const totalS = movs.filter((m) => m.tipo === "SALIDA").reduce((s, m) => s + m.monto, 0);
    rows.push("");
    rows.push(columnasVis.map((c) => {
      if (c.key === "fecha") return "TOTAL";
      if (c.key === "monto") return String(totalE - totalS);
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creditos_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const KpiTile = ({ label, value, sub, tone = "slate", onClick, active }: { label: string; value: string; sub?: string; tone?: "slate" | "emerald" | "rose" | "amber" | "pink"; onClick?: () => void; active?: boolean }) => {
    const toneMap = {
      slate:   "border-slate-200",
      emerald: "border-emerald-200 bg-emerald-50/40",
      rose:    "border-rose-200 bg-rose-50/40",
      amber:   "border-amber-200 bg-amber-50/40",
      pink:    "border-pink-200 bg-pink-50/40",
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
        <span className="text-gray-700 font-medium">Reporte de créditos y cashback</span>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Créditos y cashback</h1>
          <p className="text-sm text-slate-500 mt-0.5 print:hidden">
            Movimientos y saldos. Click en un cliente / origen / tipo para filtrar. Exportá CSV o imprimí.
          </p>
        </div>
        <VistasGuardadasBar
          reporteKey="creditos"
          hayFiltros={hayFiltros}
          filtrosActuales={{ tipo: tipoF, origen: origenF, categoria: categoriaF, cliente_id: clienteF, q }}
          nombreSugerido="Vista de créditos"
          onAplicar={(f) => {
            setTipoF(typeof f.tipo === "string" ? f.tipo : "");
            setOrigenF(typeof f.origen === "string" ? f.origen : "");
            setCategoriaF(typeof f.categoria === "string" ? f.categoria : "");
            setClienteF(typeof f.cliente_id === "string" ? f.cliente_id : "");
            setQ(typeof f.q === "string" ? f.q : "");
          }}
        />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <select value={tipoF} onChange={(e) => setTipoF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Todos los tipos</option>
          <option value="ENTRADA">ENTRADA</option>
          <option value="SALIDA">SALIDA</option>
          <option value="AJUSTE">AJUSTE</option>
        </select>
        {soportaCategoria && (
          <select value={categoriaF} onChange={(e) => setCategoriaF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las categorías</option>
            <option value="credito">Crédito</option>
            <option value="cashback">Cashback</option>
            <option value="consignacion">Consignación</option>
          </select>
        )}
        {porOri.length > 0 && (
          <select value={origenF} onChange={(e) => setOrigenF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los orígenes</option>
            {porOri.map((o) => <option key={o.origen} value={o.origen}>{o.origen}</option>)}
          </select>
        )}
        <input type="text" placeholder="Buscar cliente / referencia / obs…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[180px]" />
      </div>

      <ActiveFiltersBar
        resourceLabel="movimientos"
        resultCount={movs.length}
        onClearAll={hayFiltros ? limpiar : undefined}
        chips={([
          tipoF && { key: "tipo", emoji: "↕️", label: `Tipo: ${tipoF}`, onRemove: () => setTipoF("") },
          categoriaF && { key: "cat", emoji: "🏷️", label: `Categoría: ${categoriaF}`, onRemove: () => setCategoriaF("") },
          origenF && { key: "ori", emoji: "📍", label: `Origen: ${origenF}`, onRemove: () => setOrigenF("") },
          clienteFObj && { key: "cli", emoji: "👥", label: `Cliente: ${clienteFObj.cliente_nombre}`, onRemove: () => setClienteF("") },
          q.trim() && { key: "q", label: `Búsqueda: "${q.trim()}"`, onRemove: () => setQ("") },
        ].filter(Boolean) as ActiveChip[])}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Crédito activo (global)"   value={fmt(kpis.saldo_credito_global)}   sub="Disponible sin usar" tone="emerald" />
        <KpiTile label="Cashback pendiente (global)" value={fmt(kpis.saldo_cashback_global)} sub="Sin canjear" tone="pink" />
        <KpiTile label="Entradas del período"      value={fmt(kpis.entradas_periodo)}       sub="Créditos generados" tone="emerald"
          onClick={() => setTipoF(tipoF === "ENTRADA" ? "" : "ENTRADA")} active={tipoF === "ENTRADA"} />
        <KpiTile label="Salidas del período"       value={fmt(kpis.salidas_periodo)}        sub="Aplicado a ventas" tone="rose"
          onClick={() => setTipoF(tipoF === "SALIDA" ? "" : "SALIDA")} active={tipoF === "SALIDA"} />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Por cliente + Por origen */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Saldos por cliente</h2>
                <p className="text-[11px] text-slate-500 print:hidden">Click en un cliente para filtrar sus movimientos.</p>
              </header>
              {porCli.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin clientes con saldo o movimientos en el período.</p>
              ) : (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Cliente</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Crédito</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Cashback</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Movs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {porCli.map((c) => {
                        const activa = clienteF === c.cliente_id;
                        return (
                          <tr key={c.cliente_id ?? "sin"}
                              onClick={() => c.cliente_id && setClienteF(activa ? "" : c.cliente_id)}
                              className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                            <td className="px-3 py-2 text-xs text-slate-800">{c.cliente_nombre}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-emerald-700">{c.saldo_credito > 0 ? fmt(c.saldo_credito) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-pink-700">{c.saldo_cashback > 0 ? fmt(c.saldo_cashback) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] text-slate-500">{c.movs_periodo}</td>
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
                <h2 className="text-sm font-bold text-slate-800">Por origen</h2>
                <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar por origen del movimiento.</p>
              </header>
              {porOri.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sin movimientos en el período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Origen</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Entradas</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Salidas</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase font-semibold text-slate-600">Movs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {porOri.map((o) => {
                      const activa = origenF === o.origen;
                      return (
                        <tr key={o.origen}
                            onClick={() => setOrigenF(activa ? "" : o.origen)}
                            className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-2 text-xs text-slate-800 font-mono">{o.origen}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-emerald-700">{fmt(o.entradas)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-rose-700">{fmt(o.salidas)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[11px] text-slate-500">{o.cnt}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Movimientos detalle */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Movimientos {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{movs.length} en el listado</span>
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
                <button type="button" onClick={exportarCsv} disabled={movs.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({movs.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {movs.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin movimientos.</p>
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
                    {movs.slice(0, 500).map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        {columnasVis.map((c) => {
                          if (c.key === "fecha")     return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(m.created_at)}</td>;
                          if (c.key === "cliente")   return <td key={c.key} className="px-3 py-2 text-xs text-slate-700">{m.cliente_id ? <Link href={`/clientes/${m.cliente_id}`} className="text-[#3F8E91] hover:underline">{m.cliente_nombre ?? "—"}</Link> : (m.cliente_nombre ?? "—")}</td>;
                          if (c.key === "tipo")      return <td key={c.key} className="px-3 py-2"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIPO_COLOR[m.tipo] ?? "text-slate-700 bg-slate-100 border-slate-200"}`}>{m.tipo}</span></td>;
                          if (c.key === "categoria") return <td key={c.key} className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_COLOR[m.categoria ?? "credito"] ?? "text-slate-700 bg-slate-100"}`}>{m.categoria ?? "credito"}</span></td>;
                          if (c.key === "origen")    return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 font-mono">{m.origen ?? "—"}</td>;
                          if (c.key === "referencia") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{[m.referencia_tipo, m.referencia_numero].filter(Boolean).join(" ") || "—"}</td>;
                          if (c.key === "observaciones") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 max-w-[220px] truncate" title={m.observaciones ?? ""}>{m.observaciones ?? "—"}</td>;
                          if (c.key === "usuario")   return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{m.usuario_nombre ?? "—"}</td>;
                          if (c.key === "monto")     return <td key={c.key} className={`px-3 py-2 text-right tabular-nums font-semibold ${m.tipo === "SALIDA" ? "text-rose-700" : "text-emerald-700"}`}>{m.tipo === "SALIDA" ? "−" : ""}{fmt(m.monto)}</td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {movs.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {movs.length}. Achicá el rango para el resto (el CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
