"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

type Metricas = { facturacion: number; cnt_ventas: number; prendas: number; clientes: number; ticket_prom: number; precio_prenda: number };
type Suc = {
  sucursal_id: string | null; sucursal: string;
  actual: Metricas; anterior: Metricas;
  delta_facturacion: number; delta_facturacion_pct: number;
  delta_clientes: number; delta_ticket_pct: number;
  delta_prendas: number; delta_precio_prenda_pct: number;
};
type Data = {
  periodo_actual: { desde: string; hasta: string };
  periodo_anterior: { desde: string; hasta: string };
  dias: number;
  sucursales: Suc[];
  total: { actual: Metricas; anterior: Metricas; delta_facturacion: number; delta_facturacion_pct: number };
};

function fmtFecha(s: string) {
  try { return new Date(s + "T12:00:00").toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); } catch { return s; }
}

export default function ExplorarComparativoPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(Math.round(n) || 0);
  const [data, setData] = useState<Data | null>(null);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams({ desde, hasta });
    fetchWithSupabaseSession(`/api/reportes/comparativo?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setData(j.data as Data); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  function DeltaPct({ v }: { v: number }) {
    const cls = v > 0 ? "text-emerald-700 bg-emerald-50" : v < 0 ? "text-rose-700 bg-rose-50" : "text-slate-500 bg-slate-50";
    const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "→";
    return <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>{arrow} {Math.abs(v)}%</span>;
  }

  function porQue(s: Suc): string {
    const partes: string[] = [];
    if (s.delta_clientes !== 0) partes.push(`${s.delta_clientes > 0 ? "+" : ""}${s.delta_clientes} cliente(s)`);
    if (Math.abs(s.delta_ticket_pct) >= 1) partes.push(`ticket ${s.delta_ticket_pct > 0 ? "+" : ""}${s.delta_ticket_pct}%`);
    if (Math.abs(s.delta_precio_prenda_pct) >= 1) partes.push(`precio/prenda ${s.delta_precio_prenda_pct > 0 ? "+" : ""}${s.delta_precio_prenda_pct}%`);
    if (s.delta_prendas !== 0) partes.push(`${s.delta_prendas > 0 ? "+" : ""}${s.delta_prendas} prendas`);
    return partes.length ? partes.join(" · ") : "sin cambios relevantes";
  }

  return (
    <div className="max-w-full space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Comparar período:</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <span className="text-slate-400 text-xs">→</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        {data && (
          <span className="text-xs text-slate-500">
            vs período anterior de {data.dias} día(s): <strong>{fmtFecha(data.periodo_anterior.desde)}</strong> → <strong>{fmtFecha(data.periodo_anterior.hasta)}</strong>
          </span>
        )}
      </div>

      {cargando ? (
        <p className="py-12 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
      ) : !data ? (
        <p className="py-12 text-center text-sm text-slate-400">Sin datos.</p>
      ) : (
        <>
          {/* Resumen total */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-500">Facturación del período</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmt(data.total.actual.facturacion)}</p>
              <p className="text-xs text-slate-500">anterior: {fmt(data.total.anterior.facturacion)}</p>
            </div>
            <div className="text-3xl"><DeltaPct v={data.total.delta_facturacion_pct} /></div>
            <p className="text-sm text-slate-600 ml-auto max-w-md">
              {data.total.delta_facturacion >= 0
                ? `Creció ${fmt(data.total.delta_facturacion)} respecto al período anterior.`
                : `Cayó ${fmt(Math.abs(data.total.delta_facturacion))} respecto al período anterior.`}
            </p>
          </div>

          {/* Tabla por sucursal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Facturación</th>
                  <th className="text-center px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Δ%</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Ventas</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Clientes</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Ticket prom.</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Prendas</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Precio/prenda</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">¿De dónde vino?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.sucursales.map((s) => (
                  <tr key={s.sucursal_id ?? "sin"} className={`hover:bg-slate-50 ${s.delta_facturacion > 0 ? "bg-emerald-50/20" : s.delta_facturacion < 0 ? "bg-rose-50/20" : ""}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{s.sucursal}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmt(s.actual.facturacion)}<div className="text-[10px] font-normal text-slate-400">ant. {fmt(s.anterior.facturacion)}</div></td>
                    <td className="px-3 py-2 text-center"><DeltaPct v={s.delta_facturacion_pct} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.actual.cnt_ventas}<div className="text-[10px] text-slate-400">ant. {s.anterior.cnt_ventas}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.actual.clientes}<div className="text-[10px] text-slate-400">{s.delta_clientes >= 0 ? "+" : ""}{s.delta_clientes}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(s.actual.ticket_prom)}<div className="text-[10px] text-slate-400">{s.delta_ticket_pct >= 0 ? "+" : ""}{s.delta_ticket_pct}%</div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.actual.prendas}<div className="text-[10px] text-slate-400">{s.delta_prendas >= 0 ? "+" : ""}{s.delta_prendas}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(s.actual.precio_prenda)}<div className="text-[10px] text-slate-400">{s.delta_precio_prenda_pct >= 0 ? "+" : ""}{s.delta_precio_prenda_pct}%</div></td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-[220px]">{porQue(s)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <td className="px-3 py-2 text-xs font-bold text-slate-700 uppercase">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900">{fmt(data.total.actual.facturacion)}</td>
                  <td className="px-3 py-2 text-center"><DeltaPct v={data.total.delta_facturacion_pct} /></td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{data.total.actual.cnt_ventas}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{data.total.actual.clientes}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{fmt(data.total.actual.ticket_prom)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{data.total.actual.prendas}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{fmt(data.total.actual.precio_prenda)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            El período anterior se calcula automáticamente con la misma cantidad de días, terminando el día antes de que empiece el período elegido.
          </p>
        </>
      )}
    </div>
  );
}
