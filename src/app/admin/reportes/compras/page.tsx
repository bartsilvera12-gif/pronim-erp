"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

/**
 * Dashboard de compras y evaluaciones. Panel dedicado con:
 *   - Valor pagado, prendas totales, con delta vs período anterior
 *   - Ya ingresado vs pendiente (recuento y valor)
 *   - Markup promedio (valor venta estimado / valor pagado)
 *   - Detalle por sucursal + drill al detalle de cada evaluación
 */

type Resumen = {
  recepciones_count: number; prendas_total: number; valor_pagado: number;
  ingresadas_count: number; prendas_ingresadas: number; valor_ingresado: number;
  pendientes_count: number; prendas_pendientes: number; valor_pendiente: number;
  valor_venta_estimado: number; markup_promedio_pct: number;
  comparativa_periodo_anterior: {
    valor_prev: number; prendas_prev: number;
    valor_pct: number | null; prendas_pct: number | null;
  };
};
type Suc = { sucursal_id: string | null; sucursal_nombre: string; recepciones: number; prendas: number; valor: number; pendientes: number };
type Eval = { id: string; numero_control: string; fecha: string; estado: string; total_credito: number; cliente_id: string; cliente_nombre: string; sucursal_nombre: string | null; usuario_nombre: string | null; prendas: number };

const ESTADO_LABEL: Record<string, { label: string; cls: string }> = {
  pendiente_ingreso: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  ingresada:         { label: "Ingresada", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  anulada:           { label: "Anulada",   cls: "bg-rose-100 text-rose-800 border-rose-200" },
};

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function DashboardComprasPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [porSuc, setPorSuc] = useState<Suc[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Eval[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<"" | "pendiente_ingreso" | "ingresada">("");

  const [desde, setDesde] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams({ desde, hasta });
    fetchWithSupabaseSession(`/api/dashboard/compras?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setResumen(j.data?.resumen ?? null);
        setPorSuc(j.data?.por_sucursal ?? []);
        setEvaluaciones(j.data?.evaluaciones ?? []);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const evalFiltradas = filtroEstado ? evaluaciones.filter((e) => e.estado === filtroEstado) : evaluaciones;
  const cmp = resumen?.comparativa_periodo_anterior;

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Compras y evaluaciones</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard de compras y evaluaciones</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cuánto se compró, cuánto ya entró al stock y cuánto sigue pendiente. Markup promedio contra el precio de venta actual.
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
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
      ) : !resumen ? (
        <p className="py-10 text-center text-sm text-slate-400">Sin datos.</p>
      ) : (
        <>
          {/* KPI principales — 4 cards + delta */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Valor pagado"
              value={fmt(resumen.valor_pagado)}
              sub={`${resumen.recepciones_count} evaluación(es)`}
              tone="sky"
              delta={cmp?.valor_pct ?? null}
            />
            <KpiCard
              label="Prendas compradas"
              value={String(resumen.prendas_total)}
              sub="en el período"
              tone="slate"
              delta={cmp?.prendas_pct ?? null}
            />
            <KpiCard
              label="Markup promedio"
              value={`${resumen.markup_promedio_pct.toFixed(1)}%`}
              sub={`Valor venta est.: ${fmt(resumen.valor_venta_estimado)}`}
              tone={resumen.markup_promedio_pct >= 100 ? "emerald" : resumen.markup_promedio_pct >= 40 ? "amber" : "rose"}
            />
            <KpiCard
              label="Pendiente de ingresar"
              value={fmt(resumen.valor_pendiente)}
              sub={`${resumen.pendientes_count} evaluación(es) · ${resumen.prendas_pendientes} prendas`}
              tone={resumen.pendientes_count > 0 ? "amber" : "emerald"}
              onClick={() => setFiltroEstado(filtroEstado === "pendiente_ingreso" ? "" : "pendiente_ingreso")}
              active={filtroEstado === "pendiente_ingreso"}
            />
          </div>

          {/* Ya ingresado vs pendiente — 2 cards paralelas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Panel titulo="Ya ingresado al stock" tone="emerald"
              onClick={() => setFiltroEstado(filtroEstado === "ingresada" ? "" : "ingresada")}
              active={filtroEstado === "ingresada"}>
              <ResumenRow label="Evaluaciones ingresadas" value={String(resumen.ingresadas_count)} />
              <ResumenRow label="Prendas ingresadas" value={String(resumen.prendas_ingresadas)} />
              <ResumenRow label="Valor pagado ingresado" value={fmt(resumen.valor_ingresado)} bold />
            </Panel>
            <Panel titulo="Pendiente de ingreso" tone="amber"
              onClick={() => setFiltroEstado(filtroEstado === "pendiente_ingreso" ? "" : "pendiente_ingreso")}
              active={filtroEstado === "pendiente_ingreso"}>
              <ResumenRow label="Evaluaciones pendientes" value={String(resumen.pendientes_count)} />
              <ResumenRow label="Prendas pendientes" value={String(resumen.prendas_pendientes)} />
              <ResumenRow label="Valor pendiente" value={fmt(resumen.valor_pendiente)} bold />
            </Panel>
          </div>

          {/* Por sucursal */}
          {porSuc.length > 1 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Por sucursal</h2>
              </header>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                    <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Evaluaciones</th>
                    <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Prendas</th>
                    <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Valor</th>
                    <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porSuc.map((s) => (
                    <tr key={s.sucursal_id ?? "sin"}>
                      <td className="px-4 py-2 text-slate-800">{s.sucursal_nombre}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.recepciones}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.prendas}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{fmt(s.valor)}</td>
                      <td className="px-4 py-2 text-right">
                        {s.pendientes > 0 ? (
                          <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">{s.pendientes}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Lista de evaluaciones */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">
                Evaluaciones{filtroEstado && (
                  <span className="ml-2 text-xs font-normal text-[#3F8E91]">
                    filtro: {ESTADO_LABEL[filtroEstado]?.label ?? filtroEstado}
                    <button type="button" onClick={() => setFiltroEstado("")}
                      className="ml-2 text-slate-400 hover:text-slate-800 underline">quitar</button>
                  </span>
                )}
              </h2>
              <span className="text-xs text-slate-400">{evalFiltradas.length} de {evaluaciones.length}</span>
            </header>
            {evalFiltradas.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin evaluaciones en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Fecha</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Nº</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Cliente</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Responsable</th>
                      <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Prendas</th>
                      <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Valor pagado</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evalFiltradas.slice(0, 200).map((e) => {
                      const meta = ESTADO_LABEL[e.estado] ?? { label: e.estado, cls: "bg-slate-100 text-slate-700 border-slate-200" };
                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(e.fecha)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{e.numero_control}</td>
                          <td className="px-3 py-2">
                            <Link href={`/clientes/${e.cliente_id}`} className="text-[#3F8E91] hover:underline text-sm">
                              {e.cliente_nombre}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{e.sucursal_nombre ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{e.usuario_nombre ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{e.prendas}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{fmt(e.total_credito)}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, tone, delta, onClick, active }: {
  label: string; value: string; sub: string;
  tone: "sky" | "emerald" | "amber" | "rose" | "slate";
  delta?: number | null; onClick?: () => void; active?: boolean;
}) {
  const bg = tone === "emerald" ? "border-emerald-200 bg-emerald-50/60"
    : tone === "sky" ? "border-sky-200 bg-sky-50/60"
    : tone === "amber" ? "border-amber-200 bg-amber-50/60"
    : tone === "rose" ? "border-rose-200 bg-rose-50/60"
    : "border-slate-200 bg-white";
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
        {delta != null && (
          <span className={`text-[10px] font-bold ${delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </>
  );
  const ring = active ? "ring-2 ring-[#4FAEB2]" : "";
  const base = `rounded-xl border p-3 shadow-sm ${bg} ${ring}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} text-left transition hover:-translate-y-0.5 hover:shadow-md hover:border-[#4FAEB2]`}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

function Panel({ titulo, tone, children, onClick, active }: {
  titulo: string; tone: "emerald" | "amber";
  children: React.ReactNode; onClick?: () => void; active?: boolean;
}) {
  const border = tone === "emerald" ? "border-emerald-200" : "border-amber-200";
  const bg = tone === "emerald" ? "bg-emerald-50/40" : "bg-amber-50/40";
  const ring = active ? "ring-2 ring-[#4FAEB2]" : "";
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 ${ring} cursor-pointer transition hover:shadow-md`}
      onClick={onClick} role={onClick ? "button" : undefined}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">{titulo}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ResumenRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold text-slate-900 text-base" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
