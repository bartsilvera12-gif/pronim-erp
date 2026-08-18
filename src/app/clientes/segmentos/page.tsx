"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";
import { VistasGuardadasBar } from "@/components/reportes/VistasGuardadasBar";

type SegmentoSlug =
  | "vip" | "con_credito" | "con_cashback"
  | "inactivos_90d" | "nuevos_mes" | "en_riesgo";

type Segmento = {
  slug: SegmentoSlug;
  label: string;
  descripcion: string;
  emoji: string;
  count: number; // baseline (sin filtros)
};

type ClienteSeg = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  es_vip: boolean;
  ultima_venta_at: string | null;
  total_comprado: string;
  cnt_ventas: number;
  saldo_credito: string;
  saldo_cashback: string;
};

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "Sin compras";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffD = Math.floor(diffMs / 86400000);
    if (diffD === 0) return "Hoy";
    if (diffD === 1) return "Ayer";
    if (diffD < 30) return `hace ${diffD}d`;
    if (diffD < 365) return `hace ${Math.floor(diffD / 30)}m`;
    return `hace ${Math.floor(diffD / 365)}a`;
  } catch { return iso; }
}

function fmtFechaAbs(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

type ColKey = "nombre" | "contacto" | "vip" | "ultima" | "compras" | "total_comprado" | "credito" | "cashback";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "nombre",         label: "Cliente", alwaysShow: true },
  { key: "contacto",       label: "Contacto" },
  { key: "vip",            label: "VIP" },
  { key: "ultima",         label: "Última compra" },
  { key: "compras",        label: "Compras" },
  { key: "total_comprado", label: "Total comprado" },
  { key: "credito",        label: "Crédito", alwaysShow: true },
  { key: "cashback",       label: "Cashback", alwaysShow: true },
];

export default function ClientesSegmentosPage() {
  const money = useMoney();
  const fmt = (n: number | string) => money.format(Number(n) || 0);

  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [clientes, setClientes] = useState<ClienteSeg[]>([]);
  const [cargando, setCargando] = useState(true);

  // Filtros combinables (todos AND)
  const [filtros, setFiltros] = useState<Set<SegmentoSlug>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [colsVis, setColsVis] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Vistas guardadas: usa el componente + endpoint generico /api/reportes/vistas
  const FLAGS_POS = ["vip","con_credito","con_cashback","inactivos_90d","nuevos_mes","en_riesgo"] as const;
  function aplicarVistaGuardada(f: Record<string, unknown>) {
    const s = new Set<SegmentoSlug>();
    for (const k of FLAGS_POS) if (f[k] === true) s.add(k);
    setFiltros(s);
    setQ(typeof f.q === "string" ? f.q : "");
  }
  const filtrosActualesObj = useMemo(() => {
    const o: Record<string, unknown> = {};
    filtros.forEach((k) => { o[k] = true; });
    if (q.trim()) o.q = q.trim();
    return o;
  }, [filtros, q]);

  function toggleFiltro(slug: SegmentoSlug) {
    setFiltros((prev) => {
      const s = new Set(prev);
      if (s.has(slug)) s.delete(slug); else s.add(slug);
      return s;
    });
  }
  function limpiarFiltros() { setFiltros(new Set()); setQ(""); }

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    filtros.forEach((slug) => qs.set(slug, "1"));
    if (q.trim()) qs.set("q", q.trim());
    fetchWithSupabaseSession(`/api/clientes/segmentos?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setSegmentos(j.data?.segmentos ?? []);
        setTotalClientes(Number(j.data?.total_clientes ?? 0));
        setClientes((j.data?.clientes ?? []) as ClienteSeg[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [filtros, q]);

  const columnasVis = useMemo(() => COLUMNAS.filter((c) => colsVis.has(c.key)), [colsVis]);
  const filtrosActivos = useMemo(() => segmentos.filter((s) => filtros.has(s.slug)), [segmentos, filtros]);

  // Ordenar por última compra (fecha), más reciente primero; sin compras al final.
  const clientesOrdenados = useMemo(() => {
    return [...clientes].sort((a, b) => {
      const ta = a.ultima_venta_at ? new Date(a.ultima_venta_at).getTime() : 0;
      const tb = b.ultima_venta_at ? new Date(b.ultima_venta_at).getTime() : 0;
      return tb - ta;
    });
  }, [clientes]);

  // Totales de las columnas monetarias / conteo (para la fila final).
  const totales = useMemo(() => ({
    compras: clientes.reduce((s, c) => s + (Number(c.cnt_ventas) || 0), 0),
    total_comprado: clientes.reduce((s, c) => s + (Number(c.total_comprado) || 0), 0),
    credito: clientes.reduce((s, c) => s + (Number(c.saldo_credito) || 0), 0),
    cashback: clientes.reduce((s, c) => s + (Number(c.saldo_cashback) || 0), 0),
  }), [clientes]);

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

  function valorPara(c: ClienteSeg, k: ColKey): string {
    switch (k) {
      case "nombre":         return c.nombre;
      case "contacto":       return [c.telefono, c.email].filter(Boolean).join(" · ");
      case "vip":            return c.es_vip ? "VIP" : "";
      case "ultima":         return fmtFechaAbs(c.ultima_venta_at);
      case "compras":        return String(c.cnt_ventas);
      case "total_comprado": return c.total_comprado;
      case "credito":        return c.saldo_credito;
      case "cashback":       return c.saldo_cashback;
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVis.map((c) => esc(c.label)).join(";"));
    clientes.forEach((c) => rows.push(columnasVis.map((col) => esc(valorPara(c, col.key))).join(";")));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const suffix = Array.from(filtros).join("+") || "todos";
    a.href = url;
    a.download = `clientes_${suffix}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleVip(cliente: ClienteSeg) {
    const nuevoVip = !cliente.es_vip;
    setClientes((prev) => prev.map((c) => c.id === cliente.id ? { ...c, es_vip: nuevoVip } : c));
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${cliente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ es_vip: nuevoVip }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
    } catch (e) {
      setClientes((prev) => prev.map((c) => c.id === cliente.id ? { ...c, es_vip: !nuevoVip } : c));
      setError(e instanceof Error ? e.message : "No se pudo actualizar VIP.");
    }
  }

  const hayFiltros = filtros.size > 0 || q.trim().length > 0;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Segmentos de clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Combiná criterios para acotar la lista. Los filtros son <strong>acumulativos</strong> — tildá varios para ver la intersección.
          </p>
        </div>
        <VistasGuardadasBar
          reporteKey="segmentos_clientes"
          hayFiltros={filtros.size > 0 || q.trim().length > 0}
          filtrosActuales={filtrosActualesObj}
          nombreSugerido={filtrosActivos.map((s) => s.label).join(" + ") + (q.trim() ? ` · "${q.trim()}"` : "")}
          onAplicar={aplicarVistaGuardada}
          onError={(msg) => setError(msg)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 flex items-start justify-between gap-2 print:hidden">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-600 hover:underline text-xs">Cerrar</button>
        </div>
      )}

      {/* Tarjetas de filtro combinables */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
        {segmentos.length === 0 && cargando ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 h-24 animate-pulse" />
          ))
        ) : segmentos.map((s) => {
          const activo = filtros.has(s.slug);
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => toggleFiltro(s.slug)}
              title={s.descripcion}
              className={`text-left rounded-xl border p-3 transition shadow-sm ${
                activo
                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10 ring-2 ring-[#4FAEB2]/30"
                  : "border-slate-200 bg-white hover:border-[#4FAEB2]/50 hover:shadow"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">{s.emoji}</span>
                <span className={`text-xl font-bold tabular-nums ${activo ? "text-[#3F8E91]" : "text-slate-700"}`}>{s.count}</span>
              </div>
              <p className={`text-xs font-bold ${activo ? "text-[#3F8E91]" : "text-slate-800"}`}>{s.label}</p>
              {activo && (
                <p className="text-[10px] text-[#3F8E91] mt-1 font-semibold">✓ filtro activo</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Chips de filtros activos + estado global */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 print:border-0 print:shadow-none print:p-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">Filtros activos:</span>
          {filtrosActivos.length === 0 && q.trim().length === 0 ? (
            <span className="text-xs text-slate-400 italic">ninguno (mostrando todos los clientes)</span>
          ) : (
            <>
              {filtrosActivos.map((f) => (
                <span key={f.slug} className="inline-flex items-center gap-1 rounded-full bg-[#4FAEB2]/10 border border-[#4FAEB2]/30 px-2 py-0.5 text-xs text-[#3F8E91] font-semibold">
                  {f.emoji} {f.label}
                  <button type="button" onClick={() => toggleFiltro(f.slug)} className="ml-1 text-[#3F8E91] hover:text-[#2a6a6d] print:hidden" aria-label={`Quitar ${f.label}`}>×</button>
                </span>
              ))}
              {q.trim() && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-700 font-semibold">
                  búsqueda: &ldquo;{q.trim()}&rdquo;
                  <button type="button" onClick={() => setQ("")} className="ml-1 text-slate-600 hover:text-slate-900 print:hidden" aria-label="Quitar búsqueda">×</button>
                </span>
              )}
              <button type="button" onClick={limpiarFiltros} className="text-xs text-slate-500 hover:text-slate-800 underline print:hidden">
                Limpiar todo
              </button>
            </>
          )}
          <span className="ml-auto text-sm text-slate-800">
            <strong className="text-xl tabular-nums">{clientes.length}</strong>
            <span className="text-xs text-slate-500 ml-1">cliente(s){hayFiltros ? " coinciden" : ` de ${totalClientes}`}</span>
          </span>
        </div>
        <div className="mt-2 print:hidden">
          <input
            type="text"
            placeholder="Búsqueda por nombre / teléfono / email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Listado */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">
            Clientes
            <span className="ml-2 text-xs font-normal text-slate-400">{clientes.length} en el listado</span>
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
            <button type="button" onClick={exportarCsv} disabled={clientes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
              Exportar CSV ({clientes.length})
            </button>
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Imprimir / PDF
            </button>
          </div>
        </header>
        {cargando ? (
          <p className="py-10 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
        ) : clientes.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Ningún cliente cumple {filtrosActivos.length > 1 ? "todos los filtros" : "el filtro"} seleccionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {columnasVis.map((c) => (
                    <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${["compras","total_comprado","credito","cashback"].includes(c.key) ? "text-right" : c.key === "vip" ? "text-center" : "text-left"}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 print:hidden">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientesOrdenados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    {columnasVis.map((col) => {
                      if (col.key === "nombre")         return <td key={col.key} className="px-3 py-2 text-xs text-slate-800 font-medium">{c.nombre}</td>;
                      if (col.key === "contacto")       return <td key={col.key} className="px-3 py-2 text-xs text-slate-600"><div>{c.telefono ?? ""}</div>{c.email && <div className="text-[10px] text-slate-400">{c.email}</div>}</td>;
                      if (col.key === "vip")            return <td key={col.key} className="px-3 py-2 text-center"><button type="button" onClick={() => toggleVip(c)} title={c.es_vip ? "Quitar VIP" : "Marcar VIP"} className={`text-lg leading-none transition print:hidden ${c.es_vip ? "opacity-100" : "opacity-30 hover:opacity-70"}`}>{c.es_vip ? "⭐" : "☆"}</button><span className="hidden print:inline text-slate-700">{c.es_vip ? "VIP" : ""}</span></td>;
                      if (col.key === "ultima")         return <td key={col.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFechaAbs(c.ultima_venta_at)}</td>;
                      if (col.key === "compras")        return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{c.cnt_ventas}</td>;
                      if (col.key === "total_comprado") return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs text-slate-700">{fmt(c.total_comprado)}</td>;
                      if (col.key === "credito")        return <td key={col.key} className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{Number(c.saldo_credito) > 0 ? fmt(c.saldo_credito) : "—"}</td>;
                      if (col.key === "cashback")       return <td key={col.key} className="px-3 py-2 text-right tabular-nums font-semibold text-pink-700">{Number(c.saldo_cashback) > 0 ? fmt(c.saldo_cashback) : "—"}</td>;
                      return null;
                    })}
                    <td className="px-3 py-2 print:hidden">
                      <Link href={`/clientes/${c.id}`} className="text-[#3F8E91] hover:underline text-xs font-medium">
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  {columnasVis.map((col, i) => {
                    if (col.key === "compras")        return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs font-bold text-slate-800">{totales.compras}</td>;
                    if (col.key === "total_comprado") return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs font-bold text-slate-800">{fmt(totales.total_comprado)}</td>;
                    if (col.key === "credito")        return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs font-bold text-emerald-700">{fmt(totales.credito)}</td>;
                    if (col.key === "cashback")       return <td key={col.key} className="px-3 py-2 text-right tabular-nums text-xs font-bold text-pink-700">{fmt(totales.cashback)}</td>;
                    // Primera celda: etiqueta TOTAL
                    if (i === 0)                      return <td key={col.key} className="px-3 py-2 text-xs font-bold text-slate-700 uppercase">Total ({clientes.length})</td>;
                    return <td key={col.key} className="px-3 py-2" />;
                  })}
                  <td className="px-3 py-2 print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
