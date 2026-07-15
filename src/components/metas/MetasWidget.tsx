"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Meta = {
  sucursal_id: string;
  sucursal_nombre: string;
  meta_diaria: number;
  meta_semanal: number;
  vendido_hoy: number;
  vendido_semana: number;
  pct_dia: number;
  pct_semana: number;
  falta_hoy: number;
  falta_semana: number;
  alcanza_semana: boolean;
  comision_estimada: number;
  records: {
    mejor_dia: { fecha: string; total: number } | null;
    mejor_semana: { desde: string; total: number } | null;
    mejor_mes: { mes: string; total: number } | null;
  };
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}

/**
 * Widget compacto de metas para embeder en el dashboard principal.
 * Muestra progreso día + semana + comisión estimada por cada sucursal.
 * Degrada silenciosamente si el módulo no está configurado (no rompe el
 * dashboard).
 */
export default function MetasWidget() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/metas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        setMetas((j?.data?.metas as Meta[] | undefined) ?? []);
        setWarn(j?.data?.warning ?? null);
      })
      .catch(() => { if (!cancel) setMetas([]); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, []);

  if (cargando) return null;
  if (warn) return null; // no molestar; la página /admin/metas ya lo avisa
  if (metas.length === 0) return null;

  const hayMetaConfigurada = metas.some((m) => m.meta_diaria > 0);
  if (!hayMetaConfigurada) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Metas de venta</p>
          <p className="text-xs text-slate-500 mt-0.5">Todavía no configuraste las metas diarias por sucursal.</p>
        </div>
        <Link
          href="/admin/metas"
          className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold px-4 py-2 shadow-sm"
        >
          Configurar metas
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">🎯 Metas de venta</h3>
          <p className="text-xs text-slate-500 mt-0.5">Progreso del día y de la semana por sucursal.</p>
        </div>
        <Link href="/admin/metas" className="text-xs text-[#3F8E91] hover:underline font-medium">
          Configurar →
        </Link>
      </div>

      <div className={`grid grid-cols-1 ${metas.length >= 2 ? "md:grid-cols-2" : ""} gap-3`}>
        {metas.map((m) => (
          <MetaCard key={m.sucursal_id} meta={m} />
        ))}
      </div>
    </div>
  );
}

function MetaCard({ meta }: { meta: Meta }) {
  const pctDia = Math.min(100, Math.max(0, meta.pct_dia));
  const pctSem = Math.min(100, Math.max(0, meta.pct_semana));
  const colorDia = meta.pct_dia >= 100 ? "bg-emerald-500" : meta.pct_dia >= 70 ? "bg-sky-500" : "bg-amber-500";
  const colorSem = meta.pct_semana >= 100 ? "bg-emerald-500" : meta.pct_semana >= 70 ? "bg-sky-500" : "bg-amber-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{meta.sucursal_nombre}</p>
        {meta.alcanza_semana && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            ✓ META SEMANAL
          </span>
        )}
      </div>

      {/* Progreso día */}
      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-500">Hoy</span>
          <span className="text-slate-500">Meta {fmtGs(meta.meta_diaria)}</span>
        </div>
        <div className="flex items-baseline justify-between mt-0.5">
          <p className="text-base font-bold text-slate-800">{fmtGs(meta.vendido_hoy)}</p>
          <p className="text-xs font-medium text-slate-600">{meta.pct_dia}%</p>
        </div>
        <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${colorDia}`} style={{ width: `${pctDia}%` }} />
        </div>
        {meta.meta_diaria > 0 && meta.pct_dia < 100 && (
          <p className="text-[10px] text-slate-400 mt-0.5">Faltan {fmtGs(meta.falta_hoy)}</p>
        )}
      </div>

      {/* Progreso semana */}
      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-500">Esta semana</span>
          <span className="text-slate-500">Meta {fmtGs(meta.meta_semanal)}</span>
        </div>
        <div className="flex items-baseline justify-between mt-0.5">
          <p className="text-base font-bold text-slate-800">{fmtGs(meta.vendido_semana)}</p>
          <p className="text-xs font-medium text-slate-600">{meta.pct_semana}%</p>
        </div>
        <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${colorSem}`} style={{ width: `${pctSem}%` }} />
        </div>
      </div>

      {/* Comisión */}
      <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-xs">
        <span className="text-slate-500">Comisión estimada</span>
        <span className="font-bold text-slate-800">{fmtGs(meta.comision_estimada)}</span>
      </div>

      {/* Récord mejor día si aplica */}
      {meta.records.mejor_dia && (
        <p className="text-[10px] text-amber-700 pt-0.5">
          🥇 Récord: {fmtGs(meta.records.mejor_dia.total)}
          {meta.vendido_hoy > 0 && meta.vendido_hoy > meta.records.mejor_dia.total && (
            <span className="ml-1 font-bold">— hoy lo estás superando!</span>
          )}
        </p>
      )}
    </div>
  );
}
