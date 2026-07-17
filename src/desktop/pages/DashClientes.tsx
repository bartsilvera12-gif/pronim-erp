"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Fila = {
  cliente_id: string; nombre: string;
  segmento: "vip" | "habitual" | "nuevo" | "dormido";
  total_historico: number; compras_90d: number;
  ultima_visita: string | null; dias_desde_ultima: number | null;
  prendas_traidas_periodo: number; compras_periodo: number;
  saldo_credito: number;
  sucursal_preferida_id: string | null; sucursal_preferida_nombre: string | null;
  actividad: "solo_trae" | "solo_lleva" | "ambos" | "sin_actividad";
};

type Payload = {
  periodo: { desde: string; hasta: string };
  alcance: { es_admin: boolean; sucursal_forzada: string | null };
  kpis: {
    total: number; vip: number; habitual: number; nuevo: number; dormido: number;
    solo_trae: number; solo_lleva: number; ambos: number;
    credito_disponible_total: number; prom_dias_entre_visitas: number | null;
  };
  filas: Fila[];
  rankings: {
    por_compras: Fila[]; por_prendas: Fila[]; por_visitas: Fila[];
  };
};

function fmtGs(n: number) { return "Gs. " + Math.round(n || 0).toLocaleString("es-PY"); }
function fmtN(n: number) { return (n || 0).toLocaleString("es-PY"); }

const SEGMENTO_LABEL: Record<Fila["segmento"], string> = {
  vip: "VIP",
  habitual: "Frecuente",
  nuevo: "Nuevo",
  dormido: "Dormido",
};
const SEG_COLOR: Record<Fila["segmento"], string> = {
  vip: "bg-amber-100 text-amber-800 ring-amber-200",
  habitual: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  nuevo: "bg-sky-100 text-sky-800 ring-sky-200",
  dormido: "bg-violet-100 text-violet-800 ring-violet-200",
};

export default function DashClientes({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (q.trim()) params.set("q", q.trim());
      if (segmento) params.set("segmento", segmento);
      const r = await fetchWithSupabaseSession(`/api/dashboard/clientes?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Error");
      setData(j.data as Payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, q, segmento]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (loading && !data) return <div className="py-10 text-center text-sm text-slate-500">Cargando…</div>;
  if (err) return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>;
  if (!data) return null;

  const k = data.kpis;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre…"
          className="flex-1 min-w-[180px] max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        >
          <option value="">Todos los segmentos</option>
          <option value="vip">VIP</option>
          <option value="habitual">Frecuentes</option>
          <option value="nuevo">Nuevos</option>
          <option value="dormido">Dormidos</option>
        </select>
      </div>

      {/* KPIs de segmentos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <Kpi label="Total clientes" value={fmtN(k.total)} />
        <Kpi label="VIP" value={fmtN(k.vip)} />
        <Kpi label="Frecuentes" value={fmtN(k.habitual)} />
        <Kpi label="Nuevos" value={fmtN(k.nuevo)} />
        <Kpi label="Dormidos" value={fmtN(k.dormido)} />
        <Kpi label="Solo traen" value={fmtN(k.solo_trae)} />
        <Kpi label="Solo compran" value={fmtN(k.solo_lleva)} />
        <Kpi label="Ambos (trae + lleva)" value={fmtN(k.ambos)} />
        <Kpi label="Crédito disponible total" value={fmtGs(k.credito_disponible_total)} />
        <Kpi label="Prom. días desde última visita"
             value={k.prom_dias_entre_visitas != null ? `${k.prom_dias_entre_visitas} días` : "—"} />
      </div>

      {/* Tabla principal */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Segmento</th>
              <th className="px-3 py-2 text-right">Última visita</th>
              <th className="px-3 py-2 text-right">Días desde</th>
              <th className="px-3 py-2 text-right">Prendas traídas</th>
              <th className="px-3 py-2 text-right">Compras (período)</th>
              <th className="px-3 py-2 text-right">Crédito</th>
              <th className="px-3 py-2">Sucursal preferida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.filas.map((c) => (
              <tr key={c.cliente_id}>
                <td className="px-3 py-2">
                  <Link href={`/clientes/${c.cliente_id}`} className="font-medium text-slate-800 hover:underline">
                    {c.nombre}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEG_COLOR[c.segmento]}`}>
                    {SEGMENTO_LABEL[c.segmento]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {c.ultima_visita ? new Date(c.ultima_visita).toLocaleDateString("es-PY") : "—"}
                </td>
                <td className="px-3 py-2 text-right">{c.dias_desde_ultima ?? "—"}</td>
                <td className="px-3 py-2 text-right">{fmtN(c.prendas_traidas_periodo)}</td>
                <td className="px-3 py-2 text-right">{fmtN(c.compras_periodo)}</td>
                <td className="px-3 py-2 text-right">{fmtGs(Math.max(0, c.saldo_credito))}</td>
                <td className="px-3 py-2 text-slate-600">{c.sucursal_preferida_nombre ?? "—"}</td>
              </tr>
            ))}
            {data.filas.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Sin clientes en el filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Ranking titulo="Top 10 por compras (histórico)" filas={data.rankings.por_compras}
          getVal={(c) => fmtGs(c.total_historico)} />
        <Ranking titulo="Top 10 por prendas entregadas" filas={data.rankings.por_prendas}
          getVal={(c) => `${fmtN(c.prendas_traidas_periodo)} u.`} />
        <Ranking titulo="Top 10 por visitas recientes" filas={data.rankings.por_visitas}
          getVal={(c) => `${fmtN(c.compras_periodo)} en período`} />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Ranking({ titulo, filas, getVal }: { titulo: string; filas: Fila[]; getVal: (c: Fila) => string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xs uppercase tracking-wide font-bold text-slate-500 mb-3">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos.</p>
      ) : (
        <ol className="space-y-1">
          {filas.map((c, i) => (
            <li key={c.cliente_id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-400 tabular-nums w-5 shrink-0">{i + 1}.</span>
              <Link href={`/clientes/${c.cliente_id}`} className="flex-1 truncate text-slate-700 hover:underline">
                {c.nombre}
              </Link>
              <span className="text-slate-500 tabular-nums text-xs">{getVal(c)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
