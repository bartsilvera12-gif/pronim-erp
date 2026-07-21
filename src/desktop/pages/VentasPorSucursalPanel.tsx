"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Sección "Ventas — por sucursal" para el dashboard de Ventas.
 *
 * Reemplaza la sección global "Ventas — detalle" que Karen tenía en el
 * dash de sucursales. Consume /api/dashboard/ventas-desglose (últimos
 * 30 días). Cada card es una sucursal con: costo, margen bruto y %,
 * ventas, prendas, ticket, prendas/venta, promos, cashback, descuentos,
 * beneficios, cambios, anulaciones y las formas de pago.
 */

type Suc = {
  sucursal_id: string;
  nombre: string;
  ventas: {
    cantidad: number; total: number; prendas: number;
    ticket_promedio: number; prendas_por_venta: number | null;
    costo_total: number; margen_bruto: number; margen_pct: number | null;
    promociones_aplicadas: number; cashback_total: number;
    descuento_total: number; beneficios_entregados: number;
    cambios: number; anulaciones_venta: number; anulaciones_recep: number;
    pagos: { metodo: string; ops: number; total: number }[];
  };
};

function fmtGsCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `Gs. ${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `Gs. ${(n / 1_000).toFixed(0)}K`;
  return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
}
function fmtN(n: number): string { return (n || 0).toLocaleString("es-PY"); }

export default function VentasPorSucursalPanel() {
  const [sucursales, setSucursales] = useState<Suc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchWithSupabaseSession("/api/dashboard/ventas-desglose", { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (cancel) return;
        if (!j?.success) { setErr(j?.error ?? "Error"); return; }
        setSucursales((j.data?.sucursales as Suc[]) ?? []);
      })
      .catch(e => { if (!cancel) setErr(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  if (loading) return <div className="text-sm text-slate-500">Cargando ventas por sucursal…</div>;
  if (err) return <div className="text-sm text-rose-700">{err}</div>;
  if (sucursales.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800">Ventas — por sucursal</h3>
        <span className="text-[11px] text-slate-400">Últimos 30 días</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sucursales.map(s => {
          const v = s.ventas;
          const totalPagos = v.pagos.reduce((a, x) => a + x.total, 0);
          return (
            <div key={s.sucursal_id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/40">
              <h4 className="text-sm font-bold text-slate-900 mb-3">{s.nombre}</h4>

              {/* Bloque destacado: margen */}
              <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-slate-50 p-3 mb-3">
                <div className="grid grid-cols-3 gap-2">
                  <MetricPill label="Costo" value={fmtGsCompact(v.costo_total)} />
                  <MetricPill
                    label="Margen"
                    value={fmtGsCompact(v.margen_bruto)}
                    tone={v.margen_bruto >= 0 ? "pos" : "neg"}
                  />
                  <MetricPill
                    label="Margen %"
                    value={v.margen_pct != null ? `${v.margen_pct}%` : "—"}
                    tone={v.margen_pct != null && v.margen_pct >= 0 ? "pos" : "neg"}
                  />
                </div>
              </div>

              {/* Base: ventas / prendas / ticket / promos */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MetricPill label="Ventas" value={fmtN(v.cantidad)} />
                <MetricPill label="Prendas" value={fmtN(v.prendas)} />
                <MetricPill label="Ticket prom" value={fmtGsCompact(v.ticket_promedio)} />
                <MetricPill
                  label="Prendas/venta"
                  value={v.prendas_por_venta != null ? String(v.prendas_por_venta) : "—"}
                />
                <MetricPill label="Total vendido" value={fmtGsCompact(v.total)} />
                <MetricPill label="Promociones" value={fmtN(v.promociones_aplicadas)} />
              </div>

              {/* Beneficios/cashback si hay */}
              {(v.cashback_total > 0 || v.descuento_total > 0 || v.beneficios_entregados > 0) && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <MetricPill label="Cashback" value={fmtGsCompact(v.cashback_total)} tone="info" />
                  <MetricPill label="Descuentos" value={fmtGsCompact(v.descuento_total)} tone="info" />
                  <MetricPill label="Beneficios" value={fmtN(v.beneficios_entregados)} tone="info" />
                </div>
              )}

              {/* Cambios + anulaciones */}
              {(v.cambios > 0 || v.anulaciones_venta > 0 || v.anulaciones_recep > 0) && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <MetricPill label="Cambios" value={fmtN(v.cambios)} />
                  <MetricPill
                    label="Anul. venta"
                    value={fmtN(v.anulaciones_venta)}
                    tone={v.anulaciones_venta > 0 ? "neg" : undefined}
                  />
                  <MetricPill
                    label="Anul. recep."
                    value={fmtN(v.anulaciones_recep)}
                    tone={v.anulaciones_recep > 0 ? "neg" : undefined}
                  />
                </div>
              )}

              {/* Formas de pago */}
              {v.pagos.length > 0 && (
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
                    Formas de pago
                  </p>
                  <div className="space-y-1">
                    {v.pagos.map((p, i) => {
                      const pct = totalPagos > 0 ? Math.round((p.total / totalPagos) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 capitalize text-slate-700">{p.metodo}</span>
                          <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                            <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right text-[10px] text-slate-500 tabular-nums">{p.ops}</span>
                          <span className="w-16 text-right text-xs font-semibold text-slate-800 tabular-nums">
                            {fmtGsCompact(p.total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nota si no hay ventas */}
              {v.cantidad === 0 && (
                <p className="text-xs text-slate-400 italic mt-2">Sin ventas en el período.</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-3 italic">
        Costo = SUM(cantidad × costo_unitario_snapshot). Margen bruto = Total − Costo. Margen % = Margen / Total × 100.
      </p>
    </section>
  );
}

function MetricPill({
  label, value, tone,
}: {
  label: string; value: string; tone?: "pos" | "neg" | "info";
}) {
  const cls = tone === "pos" ? "text-emerald-700"
    : tone === "neg" ? "text-rose-700"
    : tone === "info" ? "text-sky-700"
    : "text-slate-800";
  return (
    <div className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums truncate ${cls}`}>{value}</p>
    </div>
  );
}
