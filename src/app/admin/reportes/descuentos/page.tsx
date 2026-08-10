"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

/**
 * Reporte de descuentos aplicados por motivo. Permite ver cuánto se
 * descontó por Redondeo / Negociación / Defecto / Promoción / Cortesía /
 * Intercambio / Otro (o cualquier motivo custom) en un período dado,
 * con desglose por sucursal y drill al detalle de cada venta.
 */

type PorMotivo = { motivo: string; label: string; total_descuento: number; ventas_count: number; ticket_promedio: number; pct: number };
type PorSucursal = { sucursal_id: string | null; sucursal_nombre: string; total_descuento: number; ventas_count: number };
type VentaConDesc = { id: string; numero_control: string; fecha: string; total: number; descuento_general: number; descuento_motivo: string | null; motivo_label: string | null; sucursal_nombre: string | null };

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const COLORS = ["#4FAEB2", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#3b82f6", "#ec4899", "#64748b"];

export default function ReporteDescuentosPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);
  const [porMotivo, setPorMotivo] = useState<PorMotivo[]>([]);
  const [porSucursal, setPorSucursal] = useState<PorSucursal[]>([]);
  const [ventas, setVentas] = useState<VentaConDesc[]>([]);
  const [total, setTotal] = useState(0);
  const [ventasCount, setVentasCount] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  const [desde, setDesde] = useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [motivoFiltro, setMotivoFiltro] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/descuentos?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setPorMotivo(j.data?.por_motivo ?? []);
        setPorSucursal(j.data?.por_sucursal ?? []);
        setVentas(j.data?.ventas ?? []);
        setTotal(Number(j.data?.total_general ?? 0));
        setVentasCount(Number(j.data?.ventas_con_descuento_count ?? 0));
        setWarning(j.data?.warning ?? null);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const ventasFiltradas = useMemo(() =>
    motivoFiltro ? ventas.filter((v) => v.descuento_motivo === motivoFiltro) : ventas,
  [ventas, motivoFiltro]);

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    rows.push(["Fecha","N° Venta","Sucursal","Motivo","Total venta (Gs)","Descuento (Gs)"].join(";"));
    ventasFiltradas.forEach((v) => {
      rows.push([
        fmtFecha(v.fecha),
        v.numero_control,
        v.sucursal_nombre ?? "",
        v.motivo_label ?? v.descuento_motivo ?? "",
        String(v.total),
        String(v.descuento_general),
      ].map(esc).join(";"));
    });
    // Fila de totales
    const totalVentas = ventasFiltradas.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalDesc = ventasFiltradas.reduce((s, v) => s + Number(v.descuento_general || 0), 0);
    rows.push("");
    rows.push(["","","","TOTAL", String(totalVentas), String(totalDesc)].map(esc).join(";"));
    // BOM UTF-8 para que Excel abra bien acentos
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `descuentos_${desde}_a_${hasta}${motivoFiltro ? `_${motivoFiltro}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function imprimir() {
    window.print();
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Reporte de descuentos</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reporte de descuentos</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cuánto se descontó por cada motivo. Hacé click en un motivo para filtrar las ventas.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        {motivoFiltro && (
          <button type="button" onClick={() => setMotivoFiltro("")}
            className="ml-2 text-xs text-slate-500 hover:text-slate-800 underline">Ver todos los motivos</button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {ventasCount} venta(s) con descuento · <strong className="text-slate-700">{fmt(total)}</strong> descontado
        </span>
        <div className="w-full flex gap-2 print:hidden">
          <button type="button" onClick={exportarCsv}
            disabled={ventasFiltradas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z"/><path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"/></svg>
            Exportar CSV ({ventasFiltradas.length})
          </button>
          <button type="button" onClick={imprimir}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5 2.75A.75.75 0 0 1 5.75 2h8.5a.75.75 0 0 1 .75.75V5.5h1a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1V17.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V13.5H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1V2.75Zm1.5.75V5.5h7V3.5h-7Zm7 10h-7v3.5h7V13.5Zm2-6.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z" clipRule="evenodd"/></svg>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{warning}</div>}

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Por motivo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Por motivo</h2>
            </header>
            {porMotivo.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin ventas con descuento en el período.</p>
            ) : (
              <div className="p-4 space-y-3">
                {porMotivo.map((m, idx) => (
                  <button
                    key={m.motivo}
                    type="button"
                    onClick={() => setMotivoFiltro(motivoFiltro === m.motivo ? "" : m.motivo)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      motivoFiltro === m.motivo
                        ? "border-[#4FAEB2] bg-[#4FAEB2]/5 ring-2 ring-[#4FAEB2]/20"
                        : "border-slate-200 hover:border-[#4FAEB2] hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <p className="text-sm font-bold text-slate-800">{m.label}</p>
                        <span className="text-[10px] font-mono text-slate-400">{m.motivo}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-800">{fmt(m.total_descuento)}</p>
                        <p className="text-[10px] text-slate-500">{m.ventas_count} vta(s) · prom. {fmt(m.ticket_promedio)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{m.pct}% del total</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Por sucursal */}
          {porSucursal.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Por sucursal</h2>
              </header>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                    <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Ventas</th>
                    <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Total descontado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porSucursal.map((s) => (
                    <tr key={s.sucursal_id ?? "sin"}>
                      <td className="px-4 py-2 text-slate-800">{s.sucursal_nombre}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.ventas_count}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{fmt(s.total_descuento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ventas detalle */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">
                Ventas con descuento
                {motivoFiltro && (
                  <span className="ml-2 text-xs font-normal text-[#3F8E91]">
                    filtro: {porMotivo.find((m) => m.motivo === motivoFiltro)?.label ?? motivoFiltro}
                  </span>
                )}
              </h2>
              <span className="text-xs text-slate-400">{ventasFiltradas.length} venta(s)</span>
            </header>
            {ventasFiltradas.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin ventas para mostrar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Fecha</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Venta</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Motivo</th>
                      <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Total venta</th>
                      <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Descuento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ventasFiltradas.slice(0, 200).map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(v.fecha)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link href={`/ventas/${v.id}`} className="text-[#3F8E91] hover:underline">{v.numero_control}</Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.sucursal_nombre ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className="inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px]">
                            {v.motivo_label ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(v.total)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">−{fmt(v.descuento_general)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ventasFiltradas.length > 200 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 200 de {ventasFiltradas.length}. Achicá el rango para ver más.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
