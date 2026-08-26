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
  dias_anterior?: number;
  comparacion_manual?: boolean;
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

  // Período de comparación elegido a mano (ej: diciembre de este año contra
  // diciembre del año pasado). Si `manual` es false, lo calcula el backend.
  const [manual, setManual] = useState(false);
  const [prevDesde, setPrevDesde] = useState("");
  const [prevHasta, setPrevHasta] = useState("");

  /** Corre la fecha `iso` (YYYY-MM-DD) N años hacia atrás. */
  function menosAnios(iso: string, n: number): string {
    const d = new Date(iso + "T12:00:00");
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  }

  function activarManual() {
    // Se arranca desde lo que ya venía calculado, así el usuario ajusta en vez
    // de completar de cero.
    setPrevDesde(data?.periodo_anterior.desde ?? menosAnios(desde, 1));
    setPrevHasta(data?.periodo_anterior.hasta ?? menosAnios(hasta, 1));
    setManual(true);
  }

  function mismoPeriodoAnioPasado() {
    setPrevDesde(menosAnios(desde, 1));
    setPrevHasta(menosAnios(hasta, 1));
  }

  function mesAnterior() {
    const d = new Date(desde + "T12:00:00");
    const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const fin = new Date(d.getFullYear(), d.getMonth(), 0);
    const iso = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    setPrevDesde(iso(ini));
    setPrevHasta(iso(fin));
  }

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams({ desde, hasta });
    if (manual && prevDesde && prevHasta) {
      qs.set("prev_desde", prevDesde);
      qs.set("prev_hasta", prevHasta);
    }
    fetchWithSupabaseSession(`/api/reportes/comparativo?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setData(j.data as Data); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, manual, prevDesde, prevHasta]);

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
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
        {/* Período A — el que se analiza */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Período</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
          {data && <span className="text-[11px] text-slate-500">{data.dias} día(s)</span>}
        </div>

        {/* Período B — contra qué se compara */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Comparar con</span>
          {manual ? (
            <>
              <input type="date" value={prevDesde} onChange={(e) => setPrevDesde(e.target.value)}
                className="rounded-lg border border-[#4FAEB2] bg-white px-2 py-1.5 text-sm" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={prevHasta} onChange={(e) => setPrevHasta(e.target.value)}
                className="rounded-lg border border-[#4FAEB2] bg-white px-2 py-1.5 text-sm" />
              {data && <span className="text-[11px] text-slate-500">{data.dias_anterior ?? "—"} día(s)</span>}
              <button type="button" onClick={() => setManual(false)}
                className="text-[11px] text-slate-500 underline hover:text-slate-700">
                Volver al automático
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-600">
                {data
                  ? <>Período anterior: <strong>{fmtFecha(data.periodo_anterior.desde)}</strong> → <strong>{fmtFecha(data.periodo_anterior.hasta)}</strong></>
                  : "Período anterior (automático)"}
              </span>
              <button type="button" onClick={activarManual}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                Elegir otro período
              </button>
            </>
          )}
        </div>

        {/* Atajos frecuentes */}
        {manual && (
          <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-[6.5rem]">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Atajos</span>
            <button type="button" onClick={mismoPeriodoAnioPasado}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
              Mismo período del año pasado
            </button>
            <button type="button" onClick={mesAnterior}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
              Mes anterior completo
            </button>
          </div>
        )}

        {manual && data && data.dias !== (data.dias_anterior ?? data.dias) && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            Los períodos tienen distinta duración ({data.dias} vs {data.dias_anterior} días): las variaciones pueden no ser comparables.
          </p>
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
