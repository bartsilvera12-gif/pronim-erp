"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Muestra dos secciones del dashboard de inventario DESGLOSADAS POR
 * SUCURSAL:
 *   - Recepciones y evaluaciones — detalle
 *   - Inventario — detalle
 *
 * Fuente: /api/dashboard/inventario-desglose (dedicado para este panel).
 * Por defecto pide los últimos 30 días — el DashInventario legacy no
 * propaga desde/hasta, así que fijamos ese rango aquí.
 *
 * Estética alineada con SucursalCard (Akakua'a): tarjetas blancas con
 * bordes suaves y fondos cálidos por categoría (rosa, lavanda, durazno,
 * verde). Solo cambios visuales — datos, filtros y lógica intactos.
 */

type Suc = {
  sucursal_id: string;
  nombre: string;
  recepciones: {
    cantidad: number;
    subtotal_evaluado: number;
    ajuste_positivo: number;
    ajuste_negativo: number;
    total_final: number;
    ratio_ajuste_pct: number | null;
    eval_prom_prenda: number | null;
    prendas_recibidas: number;
    evaluadores: { usuario: string; recepciones: number; total_final: number }[];
  };
  inventario: {
    prendas_entradas: number;
    prendas_salidas: number;
    diferencia_neta: number;
    stock_actual: number;
    antig_dias_prom: number | null;
    rotacion_pct: number | null;
  };
};

function fmtGsCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `Gs. ${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `Gs. ${(n / 1_000).toFixed(0)}K`;
  return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
}
function fmtN(n: number): string { return (n || 0).toLocaleString("es-PY"); }

export default function InventarioPorSucursalPanels() {
  const [sucursales, setSucursales] = useState<Suc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchWithSupabaseSession("/api/dashboard/inventario-desglose", { cache: "no-store" })
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

  if (loading) return <div className="text-sm text-slate-500">Cargando desglose por sucursal…</div>;
  if (err) return <div className="text-sm text-rose-700">{err}</div>;
  if (sucursales.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* ─── Recepciones y evaluaciones por sucursal ─── */}
      <SectionCard
        titulo="Recepciones y evaluaciones — por sucursal"
        hint="Últimos 30 días"
      >
        {sucursales.map(s => {
          const activa = s.recepciones.cantidad > 0 || s.recepciones.prendas_recibidas > 0;
          return (
            <SucursalPanel key={s.sucursal_id} nombre={s.nombre} activa={activa}>
              {/* Volumen — rosa */}
              <MetricBlock tone="rose" titulo="Volumen">
                <Metric icon="package" label="Recepciones" value={fmtN(s.recepciones.cantidad)} />
                <Metric icon="shirt" label="Prendas" value={fmtN(s.recepciones.prendas_recibidas)} />
              </MetricBlock>

              {/* Evaluación económica — durazno */}
              <MetricBlock tone="peach" titulo="Evaluación">
                <Metric icon="money" label="Subtotal" value={fmtGsCompact(s.recepciones.subtotal_evaluado)} />
                <Metric icon="check" label="Total final" value={fmtGsCompact(s.recepciones.total_final)} />
                <Metric icon="plus" label="Ajuste +" tone="pos" value={fmtGsCompact(s.recepciones.ajuste_positivo)} />
                <Metric icon="minus" label="Ajuste −" tone="neg" value={fmtGsCompact(s.recepciones.ajuste_negativo)} />
                <Metric icon="percent" label="Ratio ajuste" value={s.recepciones.ratio_ajuste_pct != null ? `${s.recepciones.ratio_ajuste_pct}%` : "—"} />
                <Metric icon="tag" label="Eval / prenda" value={s.recepciones.eval_prom_prenda != null ? fmtGsCompact(s.recepciones.eval_prom_prenda) : "—"} />
              </MetricBlock>

              {/* Evaluadores — lavanda */}
              {s.recepciones.evaluadores.length > 0 && (
                <MetricBlock tone="lavender" titulo="Evaluadores" cols={1}>
                  <ul className="space-y-1">
                    {s.recepciones.evaluadores.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs bg-white/70 rounded-md px-2 py-1 border border-white/60">
                        <span className="flex-1 truncate text-slate-700 font-medium">{e.usuario}</span>
                        <span className="text-slate-500 tabular-nums text-[10px]">{e.recepciones} rec.</span>
                        <span className="text-slate-800 font-semibold tabular-nums w-20 text-right">
                          {fmtGsCompact(e.total_final)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </MetricBlock>
              )}
            </SucursalPanel>
          );
        })}
      </SectionCard>

      {/* ─── Inventario detalle por sucursal ─── */}
      <SectionCard
        titulo="Inventario — por sucursal"
        hint="Movimientos de los últimos 30 días · stock actual"
      >
        {sucursales.map(s => {
          const activa =
            s.inventario.prendas_entradas > 0 ||
            s.inventario.prendas_salidas > 0 ||
            s.inventario.stock_actual > 0;
          return (
            <SucursalPanel key={s.sucursal_id} nombre={s.nombre} activa={activa}>
              {/* Movimientos — durazno (entradas verde, salidas azul) */}
              <MetricBlock tone="peach" titulo="Movimientos">
                <Metric icon="arrowDown" label="Ingresadas" tone="pos" value={fmtN(s.inventario.prendas_entradas)} />
                <Metric icon="arrowUp" label="Salidas" tone="info" value={fmtN(s.inventario.prendas_salidas)} />
                <Metric
                  icon="delta"
                  label="Diferencia neta"
                  tone={s.inventario.diferencia_neta >= 0 ? "pos" : "neg"}
                  value={(s.inventario.diferencia_neta >= 0 ? "+" : "") + fmtN(s.inventario.diferencia_neta)}
                />
              </MetricBlock>

              {/* Stock — verde con stock actual en verde azulado */}
              <MetricBlock tone="green" titulo="Stock">
                <Metric icon="boxes" label="Stock actual" tone="teal" value={fmtN(s.inventario.stock_actual)} />
                <Metric
                  icon="rotate"
                  label="Rotación"
                  value={s.inventario.rotacion_pct != null ? `${s.inventario.rotacion_pct}%` : "—"}
                />
              </MetricBlock>
            </SucursalPanel>
          );
        })}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Componentes reutilizables (Akakua'a warm palette)
// ═══════════════════════════════════════════════════════════════════

/** Wrapper de sección: card blanca con título + grid responsivo interno. */
function SectionCard({ titulo, hint, children }: {
  titulo: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800">{titulo}</h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  );
}

/** Panel por sucursal — card blanca con header, badge y contenido. */
function SucursalPanel({ nombre, activa, children }: {
  nombre: string; activa: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm ${
      !activa ? "opacity-60" : ""
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-[#0F5D60] to-[#4FAEB2] flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l2-6h14l2 6M4 22V9h16v13M9 22v-6h6v6" />
          </svg>
        </div>
        <h4 className="text-sm font-bold text-slate-900 truncate flex-1">{nombre}</h4>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
          activa
            ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
        }`}>
          <span className={`h-1 w-1 rounded-full ${activa ? "bg-emerald-500" : "bg-slate-400"}`} />
          {activa ? "Activa" : "Sin actividad"}
        </span>
      </div>
      {children}
    </div>
  );
}

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

/** Bloque de métricas: contenedor con tinte de fondo + título coloreado. */
function MetricBlock({ tone, titulo, cols = 2, children }: {
  tone: Tone; titulo: string; cols?: 1 | 2 | 3; children: React.ReactNode;
}) {
  const gridCls = cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`rounded-xl border ${TONE_BG[tone]} p-3`}>
      <p className={`text-[10px] uppercase tracking-wide font-bold mb-2 ${TONE_TXT[tone]}`}>
        {titulo}
      </p>
      <div className={`grid gap-2 ${gridCls}`}>{children}</div>
    </div>
  );
}

/** Chip de métrica: label + valor con ícono pequeño y tono opcional. */
type MetricTone = "pos" | "neg" | "info" | "teal";
type MetricIcon = "package" | "shirt" | "money" | "check" | "plus" | "minus" | "percent" | "tag" | "arrowDown" | "arrowUp" | "delta" | "boxes" | "rotate";
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
    case "package":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8v13H3V8m18 0-2-5H5L3 8m18 0H3m8 4h2" /></svg>;
    case "shirt":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4-3 4 2 4-2 4 3-3 4v11H7V10L4 6Z" /></svg>;
    case "money":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6" /></svg>;
    case "check":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" /></svg>;
    case "plus":      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>;
    case "minus":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>;
    case "percent":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19 5 5 19M6.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm11 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
    case "tag":       return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12 12 20l-9-9V3h8l9 9Z M7 7h.01" /></svg>;
    case "arrowDown": return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-6-6 6 6 6-6" /></svg>;
    case "arrowUp":   return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-6 6 6-6 6 6" /></svg>;
    case "delta":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3 22 20H2Z" /></svg>;
    case "boxes":     return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10l9 4 9-4V7l-9-4-9 4Zm9 4v10m0-10L3 7m9 4 9-4" /></svg>;
    case "rotate":    return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3-6.7L21 8V3m0 5h-5" /></svg>;
  }
}
