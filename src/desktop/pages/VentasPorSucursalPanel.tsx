"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Sección "Ventas — por sucursal" para el dashboard de Ventas.
 *
 * Cada card es una sucursal con: costo, margen bruto y %, ventas,
 * prendas, ticket, prendas/venta, promos, cashback, descuentos,
 * beneficios, cambios, anulaciones y formas de pago.
 *
 * Estética alineada con SucursalCard + InventarioPorSucursalPanels
 * (Akakua'a): tarjetas blancas + fondos cálidos por categoría, iconos
 * pequeños, sucursales sin ventas atenuadas. Solo cambios visuales:
 * datos, filtros y lógica intactos.
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800">Ventas — por sucursal</h3>
        <span className="text-[11px] text-slate-400">Últimos 30 días</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sucursales.map(s => {
          const v = s.ventas;
          const totalPagos = v.pagos.reduce((a, x) => a + x.total, 0);
          const activa = v.cantidad > 0 || v.total > 0;
          return (
            <div key={s.sucursal_id} className={`rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm ${
              !activa ? "opacity-60" : ""
            }`}>
              {/* Header con ícono + nombre + badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-[#0F5D60] to-[#4FAEB2] flex items-center justify-center shadow-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l2-6h14l2 6M4 22V9h16v13M9 22v-6h6v6" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-slate-900 truncate flex-1">{s.nombre}</h4>
                <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  activa
                    ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                }`}>
                  <span className={`h-1 w-1 rounded-full ${activa ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {activa ? "Activa" : "Sin actividad"}
                </span>
              </div>

              {/* Rentabilidad — verde (margen destacado) */}
              <MetricBlock tone="green" titulo="Rentabilidad">
                <Metric icon="money" label="Costo" value={fmtGsCompact(v.costo_total)} />
                <Metric
                  icon="check"
                  label="Margen"
                  value={fmtGsCompact(v.margen_bruto)}
                  tone={v.margen_bruto >= 0 ? "pos" : "neg"}
                />
                <Metric
                  icon="percent"
                  label="Margen %"
                  value={v.margen_pct != null ? `${v.margen_pct}%` : "—"}
                  tone={v.margen_pct != null && v.margen_pct >= 0 ? "pos" : "neg"}
                />
              </MetricBlock>

              {/* Ventas — rosa */}
              <MetricBlock tone="rose" titulo="Ventas">
                <Metric icon="cart" label="Ventas" value={fmtN(v.cantidad)} />
                <Metric icon="shirt" label="Prendas" value={fmtN(v.prendas)} />
                <Metric icon="ticket" label="Ticket prom" value={fmtGsCompact(v.ticket_promedio)} />
                <Metric
                  icon="delta"
                  label="Prendas/venta"
                  value={v.prendas_por_venta != null ? String(v.prendas_por_venta) : "—"}
                />
                <Metric icon="money" label="Total vendido" value={fmtGsCompact(v.total)} />
                <Metric icon="tag" label="Promociones" value={fmtN(v.promociones_aplicadas)} />
              </MetricBlock>

              {/* Beneficios y descuentos — lavanda (solo si hay) */}
              {(v.cashback_total > 0 || v.descuento_total > 0 || v.beneficios_entregados > 0) && (
                <MetricBlock tone="lavender" titulo="Beneficios">
                  <Metric icon="gift" label="Cashback" value={fmtGsCompact(v.cashback_total)} tone="info" />
                  <Metric icon="minus" label="Descuentos" value={fmtGsCompact(v.descuento_total)} tone="info" />
                  <Metric icon="star" label="Beneficios" value={fmtN(v.beneficios_entregados)} tone="info" />
                </MetricBlock>
              )}

              {/* Cambios y anulaciones — durazno (solo si hay) */}
              {(v.cambios > 0 || v.anulaciones_venta > 0 || v.anulaciones_recep > 0) && (
                <MetricBlock tone="peach" titulo="Cambios / Anulaciones">
                  <Metric icon="rotate" label="Cambios" value={fmtN(v.cambios)} />
                  <Metric
                    icon="x"
                    label="Anul. venta"
                    value={fmtN(v.anulaciones_venta)}
                    tone={v.anulaciones_venta > 0 ? "neg" : undefined}
                  />
                  <Metric
                    icon="x"
                    label="Anul. recep."
                    value={fmtN(v.anulaciones_recep)}
                    tone={v.anulaciones_recep > 0 ? "neg" : undefined}
                  />
                </MetricBlock>
              )}

              {/* Formas de pago — barras con paleta cálida (naranja → rosa) */}
              {v.pagos.length > 0 && (
                <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-orange-600 font-bold mb-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 8h20v10H2Zm0 4h20M6 16h2" />
                    </svg>
                    Formas de pago
                  </p>
                  <div className="space-y-1.5">
                    {v.pagos.map((p, i) => {
                      const pct = totalPagos > 0 ? Math.round((p.total / totalPagos) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs bg-white/70 rounded-md px-2 py-1 border border-white/60">
                          <span className="w-16 shrink-0 capitalize text-slate-700 font-medium truncate">{p.metodo}</span>
                          <div className="flex-1 h-2 bg-orange-100/70 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400"
                              style={{ width: `${pct}%` }}
                            />
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
                <p className="text-xs text-slate-400 italic mt-1">Sin ventas en el período.</p>
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

// ═══════════════════════════════════════════════════════════════════
// Componentes reutilizables (Akakua'a warm palette)
// ═══════════════════════════════════════════════════════════════════

type Tone = "rose" | "lavender" | "peach" | "green";
const TONE_BG: Record<Tone, string> = {
  rose:     "bg-rose-50/70 border-rose-100",
  lavender: "bg-violet-50/70 border-violet-100",
  peach:    "bg-orange-50/70 border-orange-100",
  green:    "bg-emerald-50/70 border-emerald-100",
};
const TONE_TXT: Record<Tone, string> = {
  rose:     "text-rose-600",
  lavender: "text-violet-600",
  peach:    "text-orange-600",
  green:    "text-emerald-600",
};

function MetricBlock({ tone, titulo, children }: {
  tone: Tone; titulo: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${TONE_BG[tone]} p-3`}>
      <p className={`text-[10px] uppercase tracking-wide font-bold mb-2 ${TONE_TXT[tone]}`}>
        {titulo}
      </p>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

type MetricTone = "pos" | "neg" | "info" | "teal";
type MetricIcon =
  | "money" | "check" | "percent" | "cart" | "shirt" | "ticket" | "delta"
  | "tag" | "gift" | "minus" | "star" | "rotate" | "x";
const METRIC_TONE_TXT: Record<MetricTone, string> = {
  pos:  "text-emerald-700",
  neg:  "text-rose-700",
  info: "text-sky-700",
  teal: "text-teal-700",
};
function Metric({ label, value, tone, icon }: {
  label: string; value: string; tone?: MetricTone; icon?: MetricIcon;
}) {
  const valueClass = tone ? METRIC_TONE_TXT[tone] : "text-slate-800";
  return (
    <div className="rounded-lg bg-white/80 backdrop-blur-sm px-2.5 py-1.5 border border-white/60 shadow-sm">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500">
        {icon && <MetricIconSvg name={icon} />}
        <span className="truncate">{label}</span>
      </p>
      <p className={`text-sm font-semibold tabular-nums truncate ${valueClass}`}>{value}</p>
    </div>
  );
}

function MetricIconSvg({ name }: { name: MetricIcon }) {
  const common = { className: "h-3 w-3 shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 2, viewBox: "0 0 24 24" } as const;
  switch (name) {
    case "money":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6" /></svg>;
    case "check":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" /></svg>;
    case "percent": return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19 5 5 19M6.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm11 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
    case "cart":    return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l3 12h11l3-9H6M10 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" /></svg>;
    case "shirt":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4-3 4 2 4-2 4 3-3 4v11H7V10L4 6Z" /></svg>;
    case "ticket":  return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8V6h18v2a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Zm10 0v8" /></svg>;
    case "delta":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3 22 20H2Z" /></svg>;
    case "tag":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12 12 20l-9-9V3h8l9 9Z M7 7h.01" /></svg>;
    case "gift":    return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12v10H4V12M2 7h20v5H2Zm10 15V7m0 0-3-3a2 2 0 1 0-3 3h6Zm0 0 3-3a2 2 0 1 1 3 3h-6Z" /></svg>;
    case "minus":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>;
    case "star":    return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="m12 2 3 7 7 .8-5.2 4.9L18 22l-6-3.5L6 22l1.2-7.3L2 9.8 9 9Z" /></svg>;
    case "rotate":  return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3-6.7L21 8V3m0 5h-5" /></svg>;
    case "x":       return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18 18 6" /></svg>;
  }
}
