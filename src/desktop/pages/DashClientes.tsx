"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import PendientesEvaluacionBanner from "./PendientesEvaluacionBanner";

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


export default function DashClientes({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true); setErr(null);
    // Retry silencioso ante 502/503/504 o abort (cold start Vercel).
    const attempt = async (): Promise<Payload> => {
      const params = new URLSearchParams({ desde, hasta });
      if (q.trim()) params.set("q", q.trim());
      if (segmento) params.set("segmento", segmento);
      const url = `/api/dashboard/clientes?${params.toString()}`;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 55_000);
      let r: Response;
      try {
        r = await fetchWithSupabaseSession(url, { cache: "no-store", signal: ctrl.signal });
      } finally { clearTimeout(to); }
      if (r.status === 502 || r.status === 503 || r.status === 504) {
        throw new Error(`__RETRY__:${r.status}`);
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        console.error("[DashClientes] fetch failed", { status: r.status, body: j, url });
        throw new Error((j && (j as { error?: string }).error) || `Error HTTP ${r.status}`);
      }
      const payload = (j as { data?: Payload }).data;
      if (!payload) throw new Error("El endpoint devolvió una respuesta vacía.");
      return payload;
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
      console.error("[DashClientes] cargar()", e);
      const msg = e instanceof Error ? e.message : "Error";
      setErr(msg.startsWith("__RETRY__") ? "El servidor tardó demasiado. Reintentá." : msg);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, q, segmento]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (loading && !data) {
    return <div className="py-10 text-center text-sm text-slate-500">Cargando…</div>;
  }
  if (err) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p className="font-semibold mb-1">No se pudo cargar el dashboard de clientes.</p>
        <p className="text-rose-800">{err}</p>
        <button
          type="button"
          onClick={() => cargar()}
          className="mt-2 rounded border border-rose-300 bg-white px-3 py-1 text-xs text-rose-700 hover:bg-rose-100"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (!data) {
    return <div className="py-6 text-center text-sm text-slate-400">Sin datos.</div>;
  }

  const k = data.kpis;

  return (
    <div className="space-y-6">
      {/* Banner de recepciones pendientes de evaluar — va acá porque
          conceptualmente pertenece al recorrido del cliente: 'esta ropa
          la trajo el cliente X, todavía no la evaluaste'. */}
      <PendientesEvaluacionBanner />

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

      {/* KPIs de segmentos — cada uno con tooltip que explica la fórmula.
          Docs completos en docs/dashboards-formulas.md. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <Kpi label="Total clientes" value={fmtN(k.total)} tip="Total de clientes que matchean el filtro actual (segmento, sucursal, búsqueda)." />
        <Kpi label="VIP" value={fmtN(k.vip)} tip="total_historico ≥ Gs. 5.000.000 o ≥ 6 compras en 90 días." />
        <Kpi label="Frecuentes" value={fmtN(k.habitual)} tip="Con compras pero no VIP y no Dormido." />
        <Kpi label="Nuevos" value={fmtN(k.nuevo)} tip="Sin compras históricas registradas." />
        <Kpi label="Dormidos" value={fmtN(k.dormido)} tip="Con compras pero > 120 días sin visita." />
        <Kpi label="Solo traen" value={fmtN(k.solo_trae)} tip="Clientes con recepciones pero ninguna venta." />
        <Kpi label="Solo compran" value={fmtN(k.solo_lleva)} tip="Clientes con ventas pero ninguna recepción." />
        <Kpi label="Ambos (trae + lleva)" value={fmtN(k.ambos)} tip="Clientes con recepciones y ventas." />
        <Kpi label="Crédito disponible total" value={fmtGs(k.credito_disponible_total)} tip="SUM de saldos > 0 de todos los clientes en el filtro." />
        <Kpi label="Prom. días desde última visita"
             value={k.prom_dias_entre_visitas != null ? `${k.prom_dias_entre_visitas} días` : "—"}
             tip="AVG de días desde la última visita, sobre clientes con al menos 1 visita." />
      </div>

      {/* Distribución por segmento — donut compacto que reemplaza la
          tabla plana de clientes (que era una lista sin agregación). */}
      <DistribucionSegmentos kpis={k} />


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

function DistribucionSegmentos({ kpis }: { kpis: Payload["kpis"] }) {
  // 4 segmentos canónicos. El total del donut = suma de segmentos (no
  // kpis.total, que puede incluir clientes sin actividad todavía).
  const segs = [
    { key: "vip",       label: "VIP",       n: kpis.vip,      color: "#f59e0b" },
    { key: "habitual",  label: "Frecuente", n: kpis.habitual, color: "#10b981" },
    { key: "nuevo",     label: "Nuevo",     n: kpis.nuevo,    color: "#38bdf8" },
    { key: "dormido",   label: "Dormido",   n: kpis.dormido,  color: "#a78bfa" },
  ];
  const total = segs.reduce((s, x) => s + x.n, 0);

  // Construimos los arcos del donut (SVG). Radio interno 40, externo 60.
  const R = 60, r = 40, cx = 70, cy = 70;
  let acc = 0;
  const arcs = segs.filter(s => s.n > 0).map((s) => {
    const start = acc / Math.max(1, total);
    const end = (acc + s.n) / Math.max(1, total);
    acc += s.n;
    // Ángulos: 0° arriba, sentido horario.
    const a0 = start * 2 * Math.PI - Math.PI / 2;
    const a1 = end   * 2 * Math.PI - Math.PI / 2;
    const large = (end - start) > 0.5 ? 1 : 0;
    const x0o = cx + R * Math.cos(a0), y0o = cy + R * Math.sin(a0);
    const x1o = cx + R * Math.cos(a1), y1o = cy + R * Math.sin(a1);
    const x0i = cx + r * Math.cos(a1), y0i = cy + r * Math.sin(a1);
    const x1i = cx + r * Math.cos(a0), y1i = cy + r * Math.sin(a0);
    const d = [
      `M ${x0o} ${y0o}`,
      `A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o}`,
      `L ${x0i} ${y0i}`,
      `A ${r} ${r} 0 ${large} 0 ${x1i} ${y1i}`,
      "Z",
    ].join(" ");
    return { d, color: s.color, key: s.key };
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
          Distribución de clientes
        </h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">Por segmento (según actividad reciente).</p>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative shrink-0">
          <svg viewBox="0 0 140 140" className="w-40 h-40">
            {total === 0 ? (
              <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="#e2e8f0" strokeWidth={R - r} />
            ) : (
              arcs.map(a => <path key={a.key} d={a.d} fill={a.color} />)
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-2xl font-bold text-slate-800 tabular-nums leading-none">{fmtN(total)}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">clientes</p>
          </div>
        </div>
        <ul className="flex-1 min-w-[180px] space-y-1.5">
          {segs.map(s => {
            const pct = total > 0 ? (s.n / total) * 100 : 0;
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="flex-1 text-slate-700">{s.label}</span>
                <span className="tabular-nums font-semibold text-slate-800">{fmtN(s.n)}</span>
                <span className="tabular-nums text-slate-400 text-xs w-14 text-right">
                  {pct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Kpi({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5" title={tip}>
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
