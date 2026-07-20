"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Vista DIARIA operativa de una sucursal — inspirada en la planilla
 * "YO CRECI DIARIO" (bitácora del día).
 *
 * Layout:
 *   - Header: selector de fecha + sucursal + KPIs del día
 *   - Panel izquierdo: Caja del día (ingresos + egresos por método)
 *   - Panel derecho: Corrida de operaciones cronológica con stock running
 */

type Payload = {
  fecha: string;
  sucursal_id: string;
  sucursal_nombre: string;
  resumen: {
    operaciones: number; evaluaciones: number; ventas: number; trae_lleva: number;
    prendas_recibidas: number; prendas_vendidas: number;
    stock_inicial: number; stock_final: number;
    ventas_total: number; evaluado_total: number;
    costo_total: number; margen_bruto: number; margen_pct: number | null;
  };
  caja_del_dia: {
    ingresos: { metodo: string; total: number; ops: number }[];
    egresos: { metodo: string; total: number; ops: number }[];
    credito_generado: number;
    credito_usado: number;
  };
  operaciones: {
    id: string; fecha: string; tipo: string; cliente: string;
    forma_pago: string; monto: number; qtde: number;
    cambio: number | null; stock_running: number;
  }[];
};

function fmtGs(n: number) { return "Gs. " + Math.round(n || 0).toLocaleString("es-PY"); }
function fmtGsCompact(n: number) {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return "Gs. " + (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return "Gs. " + (v / 1_000).toFixed(0) + "K";
  return "Gs. " + v.toLocaleString("es-PY");
}
function fmtN(n: number) { return (n || 0).toLocaleString("es-PY"); }
function fmtHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}

export default function DashSucursalDiario({
  sucursales,
  sucursalId,
  onChangeSucursal,
}: {
  sucursales: { id: string; nombre: string }[];
  sucursalId: string;
  onChangeSucursal: (id: string) => void;
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!sucursalId) { setData(null); setLoading(false); return; }
    setLoading(true); setErr(null);
    const attempt = async (): Promise<Payload> => {
      const params = new URLSearchParams({ fecha, sucursal_id: sucursalId });
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 55_000);
      let r: Response;
      try {
        r = await fetchWithSupabaseSession(`/api/dashboard/sucursales/dia?${params.toString()}`, {
          cache: "no-store", signal: ctrl.signal,
        });
      } finally { clearTimeout(to); }
      if (r.status === 502 || r.status === 503 || r.status === 504) {
        throw new Error(`__RETRY__:${r.status}`);
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${r.status}`);
      return j.data as Payload;
    };
    try {
      let payload: Payload;
      try { payload = await attempt(); }
      catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.startsWith("__RETRY__") || msg.includes("aborted") || msg.includes("AbortError")) {
          await new Promise(res => setTimeout(res, 1500));
          payload = await attempt();
        } else { throw e; }
      }
      setData(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setErr(msg.startsWith("__RETRY__") ? "El servidor tardó demasiado. Reintentá." : msg);
    } finally { setLoading(false); }
  }, [fecha, sucursalId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (!sucursalId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Elegí una sucursal en el filtro para ver su bitácora diaria.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase">Sucursal</label>
          <select
            value={sucursalId}
            onChange={(e) => onChangeSucursal(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <button
            type="button"
            onClick={() => setFecha(new Date().toISOString().slice(0, 10))}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >Hoy</button>
        </div>
      </div>

      {loading && !data && <div className="py-10 text-center text-sm text-slate-500">Cargando bitácora…</div>}
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}
          <button type="button" onClick={cargar} className="ml-2 text-xs underline">Reintentar</button>
        </div>
      )}
      {data && (
        <>
          {/* KPIs del día */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniKpi label="Operaciones" value={fmtN(data.resumen.operaciones)} color="slate" />
            <MiniKpi label="Evaluaciones" value={fmtN(data.resumen.evaluaciones)} color="emerald" />
            <MiniKpi label="Ventas" value={fmtN(data.resumen.ventas)} color="sky" />
            <MiniKpi label="Trae + lleva" value={fmtN(data.resumen.trae_lleva)} color="violet" />
            <MiniKpi label="Prendas recibidas" value={fmtN(data.resumen.prendas_recibidas)} color="emerald" />
            <MiniKpi label="Prendas vendidas" value={fmtN(data.resumen.prendas_vendidas)} color="sky" />
          </div>

          {/* Stock del día */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Stock inicial" value={fmtN(data.resumen.stock_inicial)} tone="slate" />
            <StatCard label="Stock final" value={fmtN(data.resumen.stock_final)} tone="emerald"
              extra={`Δ ${data.resumen.stock_final - data.resumen.stock_inicial >= 0 ? "+" : ""}${data.resumen.stock_final - data.resumen.stock_inicial}`} />
            <StatCard label="Total vendido" value={fmtGs(data.resumen.ventas_total)} tone="sky" />
            <StatCard label="Total evaluado" value={fmtGs(data.resumen.evaluado_total)} tone="amber" />
          </div>

          {/* Margen de ganancia del día — compra vs venta.
              Fórmula: SUM(precio_venta) − SUM(costo_unitario_snapshot × cantidad).
              El costo unitario viene del WACP guardado al crear la venta. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Costo de venta" value={fmtGs(data.resumen.costo_total)} tone="slate"
              extra="Costo WACP de las prendas vendidas hoy" />
            <StatCard
              label="Margen bruto"
              value={fmtGs(data.resumen.margen_bruto)}
              tone={data.resumen.margen_bruto >= 0 ? "emerald" : "slate"}
              extra="Ventas − costo de venta"
            />
            <StatCard
              label="Margen %"
              value={data.resumen.margen_pct != null ? `${data.resumen.margen_pct}%` : "—"}
              tone={data.resumen.margen_pct != null && data.resumen.margen_pct >= 0 ? "emerald" : "slate"}
              extra="Margen bruto ÷ ventas × 100"
            />
          </div>

          {/* 2 columnas: Caja del día + Bitácora */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Caja del día */}
            <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Caja del día</h3>
              <div>
                <p className="text-[10px] uppercase font-semibold text-emerald-700 mb-1">Ingresos</p>
                {data.caja_del_dia.ingresos.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-3">Sin ingresos.</p>
                ) : (
                  <table className="w-full text-xs mb-3">
                    <tbody className="divide-y divide-slate-100">
                      {data.caja_del_dia.ingresos.map((i, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 capitalize text-slate-700">{i.metodo}</td>
                          <td className="py-1.5 text-right text-[10px] text-slate-400">{i.ops} ops</td>
                          <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">{fmtGsCompact(i.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200">
                        <td className="py-1.5 font-semibold text-emerald-800">Total ingresos</td>
                        <td></td>
                        <td className="py-1.5 text-right font-bold text-emerald-800 tabular-nums">
                          {fmtGsCompact(data.caja_del_dia.ingresos.reduce((s, x) => s + x.total, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-rose-700 mb-1">Egresos (evaluaciones pagadas)</p>
                {data.caja_del_dia.egresos.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-3">Sin egresos.</p>
                ) : (
                  <table className="w-full text-xs mb-3">
                    <tbody className="divide-y divide-slate-100">
                      {data.caja_del_dia.egresos.map((e, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 capitalize text-slate-700">{e.metodo}</td>
                          <td className="py-1.5 text-right text-[10px] text-slate-400">{e.ops} ops</td>
                          <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">{fmtGsCompact(e.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Crédito generado hoy</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{fmtGsCompact(data.caja_del_dia.credito_generado)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Crédito usado hoy</span>
                  <span className="font-semibold text-sky-700 tabular-nums">{fmtGsCompact(data.caja_del_dia.credito_usado)}</span>
                </div>
              </div>
            </div>

            {/* Bitácora de operaciones */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Bitácora del día</h3>
                <span className="text-[11px] text-slate-400">{data.operaciones.length} operaciones · corrida de stock</span>
              </div>
              {data.operaciones.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">Sin operaciones en este día.</p>
              ) : (
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0 text-left text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Hora</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2">Forma pago</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.operaciones.map(o => (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 tabular-nums text-slate-500">{fmtHora(o.fecha)}</td>
                          <td className="px-3 py-1.5">
                            <TipoBadge tipo={o.tipo} />
                          </td>
                          <td className="px-3 py-1.5 text-slate-700 truncate max-w-[180px]" title={o.cliente}>{o.cliente}</td>
                          <td className="px-3 py-1.5 text-slate-500 capitalize text-[11px]">{o.forma_pago}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-slate-800 tabular-nums">
                            {fmtGsCompact(o.monto)}
                            {o.cambio && o.cambio > 0 && (
                              <div className="text-[10px] text-emerald-600">+ eval {fmtGsCompact(o.cambio)}</div>
                            )}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${o.qtde >= 0 ? "text-emerald-700" : "text-sky-700"}`}>
                            {o.qtde > 0 ? "+" : ""}{o.qtde}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-bold text-slate-800">{fmtN(o.stock_running)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    "trae":       { bg: "bg-emerald-100", text: "text-emerald-800", label: "Trae" },
    "lleva":      { bg: "bg-sky-100",     text: "text-sky-800",     label: "Lleva" },
    "trae+lleva": { bg: "bg-violet-100",  text: "text-violet-800",  label: "Trae + Lleva" },
  };
  const s = styles[tipo] ?? { bg: "bg-slate-100", text: "text-slate-700", label: tipo };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text}`}>{s.label}</span>;
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: "emerald" | "sky" | "violet" | "slate" | "amber" }) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200",
    sky:     "bg-sky-50 border-sky-200",
    violet:  "bg-violet-50 border-violet-200",
    slate:   "bg-slate-50 border-slate-200",
    amber:   "bg-amber-50 border-amber-200",
  };
  return (
    <div className={`rounded-xl border ${bg[color]} px-3 py-2`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-800 tabular-nums">{value}</p>
    </div>
  );
}

function StatCard({ label, value, extra, tone }: { label: string; value: string; extra?: string; tone: "slate" | "emerald" | "sky" | "amber" }) {
  const border: Record<string, string> = {
    slate: "border-slate-200", emerald: "border-emerald-200",
    sky: "border-sky-200", amber: "border-amber-200",
  };
  return (
    <div className={`rounded-xl border ${border[tone]} bg-white px-3 py-2.5`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      {extra && <p className="text-[11px] text-slate-500 mt-0.5">{extra}</p>}
    </div>
  );
}
