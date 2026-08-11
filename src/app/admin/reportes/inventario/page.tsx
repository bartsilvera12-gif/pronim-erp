"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

type Kpis = { productos_total: number; unidades_total: number; valor_stock: number; bajo_stock_count: number; sin_stock_count: number };
type PorCat = { cat_id: string; cat_nombre: string; cnt: number; unidades: number; valor: number };
type PorTP = { tp_id: string | null; tp_nombre: string; cnt: number; unidades: number; valor: number };
type PorSuc = { suc_id: string; suc_nombre: string; unidades: number; valor: number };
type Prod = {
  id: string; sku: string | null; nombre: string;
  costo: number; precio: number; stock: number; stock_min: number;
  categorias: string; tipo_prenda: string;
  imagen_url: string | null;
};

type ColKey = "sku" | "nombre" | "categorias" | "tipo" | "stock" | "stock_min" | "costo" | "precio" | "valor";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "sku",        label: "SKU", alwaysShow: true },
  { key: "nombre",     label: "Producto", alwaysShow: true },
  { key: "categorias", label: "Categorías" },
  { key: "tipo",       label: "Tipo prenda" },
  { key: "stock",      label: "Stock", alwaysShow: true },
  { key: "stock_min",  label: "Stock mín." },
  { key: "costo",      label: "Costo prom." },
  { key: "precio",     label: "Precio venta" },
  { key: "valor",      label: "Valor stock" },
];

export default function ReporteInventarioPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [kpis, setKpis] = useState<Kpis>({ productos_total: 0, unidades_total: 0, valor_stock: 0, bajo_stock_count: 0, sin_stock_count: 0 });
  const [porCat, setPorCat] = useState<PorCat[]>([]);
  const [porTP, setPorTP] = useState<PorTP[]>([]);
  const [porSuc, setPorSuc] = useState<PorSuc[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [opciones, setOpciones] = useState<{ categorias: { id: string; nombre: string }[]; tipos_prenda: { id: string; nombre: string }[]; sucursales: { id: string; nombre: string }[] }>({ categorias: [], tipos_prenda: [], sucursales: [] });
  const [cargando, setCargando] = useState(true);

  const [catF, setCatF] = useState("");
  const [tpF, setTpF] = useState("");
  const [sucF, setSucF] = useState("");
  const [soloBajo, setSoloBajo] = useState(false);
  const [sinStock, setSinStock] = useState(false);
  const [q, setQ] = useState("");

  const [colsVis, setColsVis] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (catF) qs.set("categoria_id", catF);
    if (tpF) qs.set("tipo_prenda_id", tpF);
    if (sucF) qs.set("sucursal_id", sucF);
    if (soloBajo) qs.set("solo_bajo_stock", "1");
    if (sinStock) qs.set("sin_stock", "1");
    if (q.trim()) qs.set("q", q.trim());
    fetchWithSupabaseSession(`/api/reportes/inventario-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setKpis(j.data?.kpis ?? kpis);
        setPorCat(j.data?.por_categoria ?? []);
        setPorTP(j.data?.por_tipo_prenda ?? []);
        setPorSuc(j.data?.por_sucursal ?? []);
        setProds(j.data?.productos ?? []);
        setOpciones(j.data?.opciones ?? { categorias: [], tipos_prenda: [], sucursales: [] });
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catF, tpF, sucF, soloBajo, sinStock, q]);

  const hayFiltros = Boolean(catF || tpF || sucF || soloBajo || sinStock || q.trim());
  function limpiar() { setCatF(""); setTpF(""); setSucF(""); setSoloBajo(false); setSinStock(false); setQ(""); }

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

  function valorPara(p: Prod, k: ColKey): string {
    switch (k) {
      case "sku":        return p.sku ?? "";
      case "nombre":     return p.nombre;
      case "categorias": return p.categorias;
      case "tipo":       return p.tipo_prenda;
      case "stock":      return String(p.stock);
      case "stock_min":  return String(p.stock_min);
      case "costo":      return String(p.costo);
      case "precio":     return String(p.precio);
      case "valor":      return String(p.stock * p.costo);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    prods.forEach((p) => rows.push(columnasVis.map((c) => esc(valorPara(p, c.key))).join(";")));
    const totalUnid = prods.reduce((s, p) => s + p.stock, 0);
    const totalValor = prods.reduce((s, p) => s + p.stock * p.costo, 0);
    rows.push("");
    rows.push(columnasVis.map((c) => {
      if (c.key === "sku")    return "TOTAL";
      if (c.key === "stock")  return String(totalUnid);
      if (c.key === "valor")  return String(totalValor);
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario_${new Date().toISOString().slice(0,10)}.csv`;
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
        <span className="text-gray-700 font-medium">Reporte de inventario</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
        <p className="text-sm text-slate-500 mt-0.5 print:hidden">
          Stock y valor por categoría, tipo y sucursal. Click en KPI o agregado para filtrar el listado.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        {opciones.categorias.length > 0 && (
          <select value={catF} onChange={(e) => setCatF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las categorías</option>
            {opciones.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        {opciones.tipos_prenda.length > 0 && (
          <select value={tpF} onChange={(e) => setTpF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los tipos</option>
            {opciones.tipos_prenda.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        {opciones.sucursales.length > 0 && (
          <select value={sucF} onChange={(e) => setSucF(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Stock global</option>
            {opciones.sucursales.map((s) => <option key={s.id} value={s.id}>Stock en {s.nombre}</option>)}
          </select>
        )}
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} className="h-3.5 w-3.5" />
          Bajo stock
        </label>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={sinStock} onChange={(e) => setSinStock(e.target.checked)} className="h-3.5 w-3.5" />
          Sin stock
        </label>
        <input type="text" placeholder="Buscar SKU o nombre…" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[180px]" />
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="ml-1 text-xs text-slate-500 hover:text-slate-800 underline">Limpiar</button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Productos"    value={String(kpis.productos_total)}  tone="slate" />
        <KpiTile label="Unidades"     value={String(kpis.unidades_total)}   tone="sky" />
        <KpiTile label="Valor stock"  value={fmt(kpis.valor_stock)}         sub="a costo promedio" tone="emerald" />
        <KpiTile label="Bajo stock"   value={String(kpis.bajo_stock_count)} tone="amber"
          onClick={() => setSoloBajo(!soloBajo)} active={soloBajo} />
        <KpiTile label="Sin stock"    value={String(kpis.sin_stock_count)}  tone="rose"
          onClick={() => setSinStock(!sinStock)} active={sinStock} />
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Agregados clickeables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { title: "Por categoría", rows: porCat.map((c) => ({ label: c.cat_nombre, id: c.cat_id, right1: c.cnt, right2: c.valor })), active: catF, setActive: setCatF },
              { title: "Por tipo prenda", rows: porTP.map((t) => ({ label: t.tp_nombre, id: t.tp_id, right1: t.cnt, right2: t.valor })), active: tpF, setActive: setTpF },
              { title: "Por sucursal (global)", rows: porSuc.map((s) => ({ label: s.suc_nombre, id: s.suc_id, right1: s.unidades, right2: s.valor })), active: sucF, setActive: setSucF },
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
                          <th className="text-right px-4 py-2 text-[10px] uppercase font-semibold text-slate-600">Prods/Und</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase font-semibold text-slate-600">Valor</th>
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
                Productos {hayFiltros && <span className="text-xs font-normal text-[#3F8E91] ml-1">(filtrado)</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">{prods.length} en el listado</span>
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
                <button type="button" onClick={exportarCsv} disabled={prods.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({prods.length})
                </button>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {prods.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin productos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVis.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${["stock","stock_min","costo","precio","valor"].includes(c.key) ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prods.slice(0, 500).map((p) => {
                      const bajo = p.stock <= p.stock_min && p.stock_min > 0;
                      const sin = p.stock <= 0;
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50 ${sin ? "bg-rose-50/30" : bajo ? "bg-amber-50/30" : ""}`}>
                          {columnasVis.map((c) => {
                            if (c.key === "sku")        return <td key={c.key} className="px-3 py-2 font-mono text-xs text-slate-700">{p.sku ?? "—"}</td>;
                            if (c.key === "nombre")     return <td key={c.key} className="px-3 py-2 text-xs text-slate-800"><Link href={`/inventario/${p.id}`} className="hover:underline">{p.nombre}</Link></td>;
                            if (c.key === "categorias") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 max-w-[180px] truncate" title={p.categorias}>{p.categorias || "—"}</td>;
                            if (c.key === "tipo")       return <td key={c.key} className="px-3 py-2 text-xs text-slate-600">{p.tipo_prenda || "—"}</td>;
                            if (c.key === "stock")      return <td key={c.key} className={`px-3 py-2 text-right tabular-nums font-semibold ${sin ? "text-rose-700" : bajo ? "text-amber-700" : "text-slate-800"}`}>{p.stock}</td>;
                            if (c.key === "stock_min")  return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-500">{p.stock_min}</td>;
                            if (c.key === "costo")      return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{fmt(p.costo)}</td>;
                            if (c.key === "precio")     return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-700">{fmt(p.precio)}</td>;
                            if (c.key === "valor")      return <td key={c.key} className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{fmt(p.stock * p.costo)}</td>;
                            return null;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {prods.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {prods.length}. Refiná filtros para el resto (el CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
