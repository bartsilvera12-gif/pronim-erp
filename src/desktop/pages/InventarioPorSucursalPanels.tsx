"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Muestra dos secciones del dashboard de inventario DESGLOSADAS POR
 * SUCURSAL:
 *   - Recepciones y evaluaciones — detalle
 *   - Inventario — detalle
 *
 * Fuente: /api/dashboard/inventario-desglose (creado dedicado para
 * este panel). Por defecto pide los últimos 30 días — el DashInventario
 * legacy no propaga desde/hasta, así que fijamos ese rango aquí.
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

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">Recepciones y evaluaciones — por sucursal</h3>
          <span className="text-[11px] text-slate-400">Últimos 30 días</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sucursales.map(s => (
            <div key={s.sucursal_id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/40">
              <h4 className="text-sm font-bold text-slate-900 mb-3">{s.nombre}</h4>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MetricPill label="Recepciones" value={fmtN(s.recepciones.cantidad)} />
                <MetricPill label="Prendas" value={fmtN(s.recepciones.prendas_recibidas)} />
                <MetricPill label="Subtotal" value={fmtGsCompact(s.recepciones.subtotal_evaluado)} />
                <MetricPill label="Total final" value={fmtGsCompact(s.recepciones.total_final)} />
                <MetricPill label="Ajuste +" value={fmtGsCompact(s.recepciones.ajuste_positivo)} tone="pos" />
                <MetricPill label="Ajuste −" value={fmtGsCompact(s.recepciones.ajuste_negativo)} tone="neg" />
                <MetricPill
                  label="Ratio ajuste"
                  value={s.recepciones.ratio_ajuste_pct != null ? `${s.recepciones.ratio_ajuste_pct}%` : "—"}
                />
                <MetricPill
                  label="Eval / prenda"
                  value={s.recepciones.eval_prom_prenda != null ? fmtGsCompact(s.recepciones.eval_prom_prenda) : "—"}
                />
              </div>
              {s.recepciones.evaluadores.length > 0 && (
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    Evaluadores
                  </p>
                  <ul className="space-y-0.5">
                    {s.recepciones.evaluadores.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-slate-700">{e.usuario}</span>
                        <span className="text-slate-500 tabular-nums">{e.recepciones}</span>
                        <span className="text-slate-800 font-semibold tabular-nums w-20 text-right">
                          {fmtGsCompact(e.total_final)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Inventario detalle por sucursal ─── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">Inventario — por sucursal</h3>
          <span className="text-[11px] text-slate-400">Movimientos de los últimos 30 días · stock actual</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sucursales.map(s => (
            <div key={s.sucursal_id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/40">
              <h4 className="text-sm font-bold text-slate-900 mb-3">{s.nombre}</h4>
              <div className="grid grid-cols-2 gap-2">
                <MetricPill label="Ingresadas" value={fmtN(s.inventario.prendas_entradas)} tone="pos" />
                <MetricPill label="Salidas" value={fmtN(s.inventario.prendas_salidas)} tone="info" />
                <MetricPill
                  label="Diferencia neta"
                  value={(s.inventario.diferencia_neta >= 0 ? "+" : "") + fmtN(s.inventario.diferencia_neta)}
                  tone={s.inventario.diferencia_neta >= 0 ? "pos" : "neg"}
                />
                <MetricPill label="Stock actual" value={fmtN(s.inventario.stock_actual)} />
                <MetricPill
                  label="Rotación"
                  value={s.inventario.rotacion_pct != null ? `${s.inventario.rotacion_pct}%` : "—"}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
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
