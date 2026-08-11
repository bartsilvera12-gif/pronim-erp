"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

type Kpis = { total_facturado: number; cantidad_ventas: number; ticket_promedio: number; total_descuento: number; con_descuento_count: number };
type PorSuc = { sucursal_id: string | null; sucursal_nombre: string; total: number; cnt: number };
type PorUsr = { usuario_id: string | null; usuario_nombre: string; total: number; cnt: number };
type PorMet = { metodo_pago: string | null; total: number; cnt: number };
type Venta = {
  id: string; numero_control: string; fecha: string; total: number;
  descuento_general: number; metodo_pago: string | null; estado: string | null;
  sucursal_id: string | null; sucursal_nombre: string | null;
  cliente_id: string | null; cliente_nombre: string | null;
  usuario_id: string | null; usuario_nombre: string | null;
};
type Opciones = {
  sucursales: { id: string; nombre: string }[];
  usuarios: { id: string; nombre: string }[];
  metodos_pago: string[];
};

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

type ColKey = "fecha" | "venta" | "sucursal" | "usuario" | "cliente" | "metodo" | "total" | "descuento";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "fecha",     label: "Fecha", alwaysShow: true },
  { key: "venta",     label: "N° Venta", alwaysShow: true },
  { key: "sucursal",  label: "Sucursal" },
  { key: "usuario",   label: "Usuario" },
  { key: "cliente",   label: "Cliente" },
  { key: "metodo",    label: "Método pago" },
  { key: "total",     label: "Total", alwaysShow: true },
  { key: "descuento", label: "Descuento" },
];

export default function ReporteVentasDrillPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [kpis, setKpis] = useState<Kpis>({ total_facturado: 0, cantidad_ventas: 0, ticket_promedio: 0, total_descuento: 0, con_descuento_count: 0 });
  const [porSuc, setPorSuc] = useState<PorSuc[]>([]);
  const [porUsr, setPorUsr] = useState<PorUsr[]>([]);
  const [porMet, setPorMet] = useState<PorMet[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [opciones, setOpciones] = useState<Opciones>({ sucursales: [], usuarios: [], metodos_pago: [] });
  const [cargando, setCargando] = useState(true);

  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [sucursalF, setSucursalF] = useState("");
  const [usuarioF, setUsuarioF] = useState("");
  const [metodoF, setMetodoF] = useState("");
  const [conDesc, setConDesc] = useState(false);
  const [q, setQ] = useState("");

  const [colsVis, setColsVis] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (sucursalF) qs.set("sucursal_id", sucursalF);
    if (usuarioF) qs.set("usuario_id", usuarioF);
    if (metodoF) qs.set("metodo_pago", metodoF);
    if (conDesc) qs.set("con_descuento", "1");
    if (q.trim()) qs.set("q", q.trim());
    fetchWithSupabaseSession(`/api/reportes/ventas-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setKpis(j.data?.kpis ?? kpis);
        setPorSuc(j.data?.por_sucursal ?? []);
        setPorUsr(j.data?.por_usuario ?? []);
        setPorMet(j.data?.por_metodo_pago ?? []);
        setVentas(j.data?.ventas ?? []);
        setOpciones(j.data?.opciones ?? { sucursales: [], usuarios: [], metodos_pago: [] });
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursalF, usuarioF, metodoF, conDesc, q]);

  const hayFiltros = Boolean(sucursalF || usuarioF || metodoF || conDesc || q.trim());
  function limpiar() { setSucursalF(""); setUsuarioF(""); setMetodoF(""); setConDesc(false); setQ(""); }

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

  function valorPara(v: Venta, k: ColKey): string {
    switch (k) {
      case "fecha":     return fmtFecha(v.fecha);
      case "venta":     return v.numero_control;
      case "sucursal":  return v.sucursal_nombre ?? "";
      case "usuario":   return v.usuario_nombre ?? "";
      case "cliente":   return v.cliente_nombre ?? "";
      case "metodo":    return v.metodo_pago ?? "";
      case "total":     return String(v.total);
      case "descuento": return String(v.descuento_general);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    ventas.forEach((v) => rows.push(columnasVis.map((c) => esc(valorPara(v, c.key))).join(";")));
    const totalT = ventas.reduce((s, v) => s + v.total, 0);
    const totalD = ventas.reduce((s, v) => s + v.descuento_general, 0);
    rows.push("");
    rows.push(columnasVis.map((c) => {
      if (c.key === "total")     return String(totalT);
      if (c.key === "descuento") return String(totalD);
      if (c.key === "fecha")     return "TOTAL";
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_${desde}_a_${hasta}.csv`;
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
        <span className="text-gray-700 font-medium">Reporte de ventas</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reporte de ventas</h1>
        <p className="text-sm text-slate-500 mt-0.5 print:hidden">
          Click en KPI o en cualquier sucursal/usuario/método para filtrar el listado. Exportá CSV o imprimí para reuniones.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        {opciones.sucursales.length > 0 && (
          <select value={sucursalF} onChange={(e) => setSucursalF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las sucursales</option>
            {opciones.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        {opciones.usuarios.length > 0 && (
          <select value={usuarioF} onChange={(e) => setUsuarioF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los usuarios</option>
            {opciones.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
        {opciones.metodos_pago.length > 0 && (
          <select value={metodoF} onChange={(e) => setMetodoF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los métodos</option>
            {opciones.metodos_pago.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={conDesc} onChange={(e) => setConDesc(e.target.checked)} className="h-3.5 w-3.5" />
          Solo con descuento
        </label>
        <input type="text" placeholder="Buscar cliente / N° venta…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[180px]" />
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="ml-1 text-xs text-slate-500 hover:text-slate-800 underline">Limpiar</button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Facturado" value={fmt(kpis.total_facturado)} sub={`${kpis.cantidad_ventas} venta(s)`} tone="emerald" />
        <KpiTile label="Ticket promedio" value={fmt(kpis.ticket_promedio)} tone="sky" />
        <KpiTile label="Con descuento" value={String(kpis.con_descuento_count)}
          sub={`${fmt(kpis.total_descuento)} descontado`}
          tone="amber"
          onClick={() => setConDesc(!conDesc)}
          active={conDesc} />
        <KpiTile label="Cant. ventas" value={String(kpis.cantidad_ventas)} tone="slate" />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Agregados clickeables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { title: "Por sucursal", rows: porSuc.map((s) => ({ label: s.sucursal_nombre, id: s.sucursal_id, total: s.total, cnt: s.cnt })), active: sucursalF, setActive: setSucursalF },
              { title: "Por usuario",  rows: porUsr.map((u) => ({ label: u.usuario_nombre,  id: u.usuario_id,  total: u.total, cnt: u.cnt })), active: usuarioF,  setActive: setUsuarioF  },
              { title: "Por método",   rows: porMet.map((m) => ({ label: m.metodo_pago ?? "sin_metodo", id: m.metodo_pago, total: m.total, cnt: m.cnt })), active: metodoF, setActive: setMetodoF },
            ].map((blk) => (
              <div key={blk.title} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800">{blk.title}</h2>
                  <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar.</p>
                </header>
                {blk.rows.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {blk.rows.map((r) => {
                        const activa = blk.active === r.id;
                        return (
                          <tr key={String(r.id ?? r.label)}
                              onClick={() => r.id != null && blk.setActive(activa ? "" : String(r.id))}
                              className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                            <td className="px-4 py-2 text-xs text-slate-800">{r.label}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600 text-xs">{r.cnt}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-800 text-xs">{fmt(r.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          {/* Ventas detalle */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Ventas {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{ventas.length} en el listado</span>
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
                <button type="button" onClick={exportarCsv} disabled={ventas.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({ventas.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {ventas.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin ventas para mostrar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVis.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${c.key === "total" || c.key === "descuento" ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ventas.slice(0, 500).map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        {columnasVis.map((c) => {
                          if (c.key === "fecha")     return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(v.fecha)}</td>;
                          if (c.key === "venta")     return <td key={c.key} className="px-3 py-2 font-mono text-xs"><Link href={`/ventas/${v.id}`} className="text-[#3F8E91] hover:underline">{v.numero_control}</Link></td>;
                          if (c.key === "sucursal")  return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.sucursal_nombre ?? "—"}</td>;
                          if (c.key === "usuario")   return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.usuario_nombre ?? "—"}</td>;
                          if (c.key === "cliente")   return <td key={c.key} className="px-3 py-2 text-xs text-slate-700">{v.cliente_nombre ? <Link href={`/clientes/${v.cliente_id}`} className="text-[#3F8E91] hover:underline">{v.cliente_nombre}</Link> : "—"}</td>;
                          if (c.key === "metodo")    return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{v.metodo_pago ?? "—"}</td>;
                          if (c.key === "total")     return <td key={c.key} className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmt(v.total)}</td>;
                          if (c.key === "descuento") return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-emerald-700">{v.descuento_general > 0 ? `−${fmt(v.descuento_general)}` : "—"}</td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ventas.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {ventas.length}. Achicá el rango para ver el resto (el CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
