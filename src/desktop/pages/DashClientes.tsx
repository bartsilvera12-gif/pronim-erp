"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Crown, Star, UserPlus, Moon, Truck, ShoppingBag,
  ArrowLeftRight, Wallet, CalendarDays, TrendingUp, ShoppingCart,
  BarChart3,
} from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Dashboard operativo de Clientes con la estética cálida de Akakua'a:
 * KPIs con íconos suaves por segmento, donut de distribución con barras
 * de progreso, rankings con badges de posición coloreados.
 *
 * Datos, cálculos, consultas y filtros intactos — solo cambio visual.
 * Docs de fórmulas: docs/dashboards-formulas.md.
 */

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
  void setQ; void setSegmento; void q; void segmento;

  const cargar = useCallback(async () => {
    setLoading(true); setErr(null);
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
      {/* Fila 1: segmentos (Total + 4 categorías) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Users className="h-5 w-5" />} tone="rose"
          label="Total clientes" value={fmtN(k.total)}
          tip="Total de clientes que matchean el filtro actual (segmento, sucursal, búsqueda)." />
        <KpiCard icon={<Crown className="h-5 w-5" />} tone="amber"
          label="VIP" value={fmtN(k.vip)}
          tip="total_historico ≥ Gs. 5.000.000 o ≥ 6 compras en 90 días." />
        <KpiCard icon={<Star className="h-5 w-5" />} tone="emerald"
          label="Frecuentes" value={fmtN(k.habitual)}
          tip="Con compras pero no VIP y no Dormido." />
        <KpiCard icon={<UserPlus className="h-5 w-5" />} tone="sky"
          label="Nuevos" value={fmtN(k.nuevo)}
          tip="Sin compras históricas registradas." />
        <KpiCard icon={<Moon className="h-5 w-5" />} tone="lavender"
          label="Dormidos" value={fmtN(k.dormido)}
          tip="Con compras pero > 120 días sin visita." />
      </div>

      {/* Fila 2: actividad + crédito + cadencia */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Truck className="h-5 w-5" />} tone="sky"
          label="Solo traen" value={fmtN(k.solo_trae)}
          tip="Clientes con recepciones pero ninguna venta." />
        <KpiCard icon={<ShoppingBag className="h-5 w-5" />} tone="emerald"
          label="Solo compran" value={fmtN(k.solo_lleva)}
          tip="Clientes con ventas pero ninguna recepción." />
        <KpiCard icon={<ArrowLeftRight className="h-5 w-5" />} tone="peach"
          label="Ambos (trae + lleva)" value={fmtN(k.ambos)}
          tip="Clientes con recepciones y ventas." />
        <KpiCard icon={<Wallet className="h-5 w-5" />} tone="amber"
          label="Crédito disponible total" value={fmtGs(k.credito_disponible_total)}
          tip="SUM de saldos > 0 de todos los clientes en el filtro." />
        <KpiCard icon={<CalendarDays className="h-5 w-5" />} tone="lavender"
          label="Prom. días desde última visita"
          value={k.prom_dias_entre_visitas != null ? `${k.prom_dias_entre_visitas} días` : "—"}
          tip="AVG de días desde la última visita, sobre clientes con al menos 1 visita." />
      </div>

      {/* Distribución donut + barras + segmento principal */}
      <DistribucionSegmentos kpis={k} />

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Ranking
          titulo="Top 10 por compras (histórico)"
          icon={<ShoppingCart className="h-4 w-4" />}
          headerTone="rose"
          filas={data.rankings.por_compras}
          getVal={(c) => fmtGs(c.total_historico)}
        />
        <Ranking
          titulo="Top 10 por prendas entregadas"
          icon={<ShoppingBag className="h-4 w-4" />}
          headerTone="emerald"
          filas={data.rankings.por_prendas}
          getVal={(c) => `${fmtN(c.prendas_traidas_periodo)} u.`}
        />
        <Ranking
          titulo="Top 10 por visitas recientes"
          icon={<Users className="h-4 w-4" />}
          headerTone="lavender"
          filas={data.rankings.por_visitas}
          getVal={(c) => `${fmtN(c.compras_periodo)} en período`}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Componentes (Akakua'a warm palette)
// ═══════════════════════════════════════════════════════════════════

type Tone = "rose" | "amber" | "emerald" | "sky" | "lavender" | "peach";
const TONE_ICON_BG: Record<Tone, string> = {
  rose:     "bg-rose-100 text-rose-600 ring-1 ring-rose-200",
  amber:    "bg-amber-100 text-amber-600 ring-1 ring-amber-200",
  emerald:  "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200",
  sky:      "bg-sky-100 text-sky-600 ring-1 ring-sky-200",
  lavender: "bg-violet-100 text-violet-600 ring-1 ring-violet-200",
  peach:    "bg-orange-100 text-orange-600 ring-1 ring-orange-200",
};

function KpiCard({ icon, tone, label, value, tip }: {
  icon: React.ReactNode; tone: Tone; label: string; value: string; tip?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition" title={tip}>
      <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${TONE_ICON_BG[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold truncate">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums truncate">{value}</p>
      </div>
    </div>
  );
}

function DistribucionSegmentos({ kpis }: { kpis: Payload["kpis"] }) {
  const segs = [
    { key: "vip",       label: "VIP",       n: kpis.vip,      color: "#f59e0b", icon: <Crown className="h-3.5 w-3.5" />, chipBg: "bg-amber-50 text-amber-700 ring-amber-200" },
    { key: "habitual",  label: "Frecuente", n: kpis.habitual, color: "#10b981", icon: <Star className="h-3.5 w-3.5" />,  chipBg: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    { key: "nuevo",     label: "Nuevo",     n: kpis.nuevo,    color: "#38bdf8", icon: <UserPlus className="h-3.5 w-3.5" />, chipBg: "bg-sky-50 text-sky-700 ring-sky-200" },
    { key: "dormido",   label: "Dormido",   n: kpis.dormido,  color: "#a78bfa", icon: <Moon className="h-3.5 w-3.5" />,  chipBg: "bg-violet-50 text-violet-700 ring-violet-200" },
  ];
  const total = segs.reduce((s, x) => s + x.n, 0);
  const principal = segs.slice().sort((a, b) => b.n - a.n).find(s => s.n > 0) ?? null;

  const R = 60, r = 40, cx = 70, cy = 70;
  let acc = 0;
  const arcs = segs.filter(s => s.n > 0).map((s) => {
    const start = acc / Math.max(1, total);
    const end = (acc + s.n) / Math.max(1, total);
    acc += s.n;
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="h-4 w-4 text-slate-500" />
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-bold">
          Distribución de clientes
        </h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">Por segmento (según actividad reciente).</p>
      <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr,auto] gap-6 items-center">
        {/* Donut */}
        <div className="relative shrink-0 mx-auto">
          <svg viewBox="0 0 140 140" className="w-40 h-40">
            {total === 0 ? (
              <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="#e2e8f0" strokeWidth={R - r} />
            ) : (
              arcs.map(a => <path key={a.key} d={a.d} fill={a.color} />)
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{fmtN(total)}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">clientes</p>
          </div>
        </div>

        {/* Barras con porcentaje */}
        <ul className="min-w-[220px] space-y-2.5">
          {segs.map(s => {
            const pct = total > 0 ? (s.n / total) * 100 : 0;
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 shrink-0 ${s.chipBg}`}>
                  {s.icon}
                  {s.label}
                </span>
                <span className="tabular-nums font-bold text-slate-800 w-8 text-right">{fmtN(s.n)}</span>
                <span className="tabular-nums text-slate-500 text-xs w-14 text-right">{pct.toFixed(1)}%</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: s.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {/* Segmento principal */}
        {principal && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 shrink-0 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                Segmento principal:
              </p>
              <p className="text-sm font-bold text-emerald-900">{principal.label}s</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const RANK_BADGE: Record<number, string> = {
  1: "bg-amber-500 text-white shadow-sm shadow-amber-300/50",
  2: "bg-rose-400 text-white shadow-sm shadow-rose-300/50",
  3: "bg-emerald-500 text-white shadow-sm shadow-emerald-300/50",
};

function Ranking({ titulo, icon, headerTone, filas, getVal }: {
  titulo: string;
  icon: React.ReactNode;
  headerTone: Tone;
  filas: Fila[];
  getVal: (c: Fila) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${TONE_ICON_BG[headerTone]}`}>
          {icon}
        </div>
        <h3 className="text-[11px] uppercase tracking-wide font-bold text-slate-600 flex-1 truncate">
          {titulo}
        </h3>
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-400 py-3">Sin datos.</p>
      ) : (
        <ol className="space-y-1.5">
          {filas.map((c, i) => {
            const pos = i + 1;
            const badgeCls = RANK_BADGE[pos]
              ?? "bg-slate-100 text-slate-500";
            return (
              <li key={c.cliente_id} className="flex items-center gap-2 text-xs">
                <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums ${badgeCls}`}>
                  {pos}
                </span>
                <Link
                  href={`/clientes/${c.cliente_id}`}
                  className="flex-1 truncate text-slate-700 hover:text-slate-900 hover:underline"
                >
                  {c.nombre}
                </Link>
                <span className="text-slate-600 tabular-nums font-medium">{getVal(c)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
