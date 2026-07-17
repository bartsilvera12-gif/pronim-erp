"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Pestaña "Sucursales" del dashboard (slug interno `financiero` para
 * preservar permisos existentes). Consume /api/dashboard/sucursales que
 * agrega todo server-side — nada de miles de filas al navegador.
 *
 * El componente respeta el filtro de período que le pasa el wrapper y
 * agrega su propio selector de sucursal (solo visible para admin).
 */

type Fila = {
  sucursal_id: string; nombre: string;
  ventas: number; operaciones: number; ticket_promedio: number;
  clientes_atendidos: number; prendas_vendidas: number; prendas_recibidas: number;
  stock: number; cajas_abiertas: number; cajas_cerradas: number;
  meta_diaria: number | null; vendido_periodo: number; dias_periodo: number;
  pct_meta: number | null; ventas_prev: number; operaciones_prev: number;
  var_ventas_pct: number | null;
};

type Tipo = { tipo_id: string | null; tipo_nombre: string; cantidad: number };

type Payload = {
  periodo: { desde: string; hasta: string };
  alcance: { es_admin: boolean; sucursal_forzada: string | null };
  sucursales: Fila[];
  totales: {
    ventas: number; operaciones: number; prendas_vendidas: number;
    prendas_recibidas: number; stock: number; clientes_atendidos_aprox: number;
    cajas_abiertas: number; cajas_cerradas: number; ventas_prev: number;
  };
  tipos_prenda: Tipo[];
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
function fmtN(n: number): string {
  return (n || 0).toLocaleString("es-PY");
}

export default function DashSucursales({
  desde, hasta,
}: {
  desde: string;
  hasta: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [sucursalFiltro, setSucursalFiltro] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalFiltro) params.set("sucursal_id", sucursalFiltro);
      const url = `/api/dashboard/sucursales?${params.toString()}`;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 20_000);
      let r: Response;
      try {
        r = await fetchWithSupabaseSession(url, { cache: "no-store", signal: ctrl.signal });
      } finally {
        clearTimeout(to);
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        console.error("[DashSucursales] fetch failed", { status: r.status, body: j, url });
        throw new Error((j && (j as { error?: string }).error) || `Error HTTP ${r.status}`);
      }
      const payload = (j as { data?: Payload }).data;
      if (!payload) {
        console.error("[DashSucursales] empty payload", j);
        throw new Error("El endpoint devolvió una respuesta vacía.");
      }
      setData(payload);
    } catch (e) {
      console.error("[DashSucursales] cargar()", e);
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, sucursalFiltro]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (loading && !data) {
    return <div className="py-10 text-center text-sm text-slate-500">Cargando…</div>;
  }
  if (err) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p className="font-semibold mb-1">No se pudo cargar el dashboard de sucursales.</p>
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

  const t = data.totales;
  const varTotal = t.ventas_prev > 0
    ? Math.round(((t.ventas - t.ventas_prev) / t.ventas_prev) * 100)
    : null;
  const maxTipo = Math.max(1, ...data.tipos_prenda.map((x) => x.cantidad));

  return (
    <div className="space-y-6">
      {/* Filtro por sucursal — solo admin */}
      {data.alcance.es_admin && data.sucursales.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Sucursal:</label>
          <select
            value={sucursalFiltro}
            onChange={(e) => setSucursalFiltro(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            <option value="">Todas</option>
            {data.sucursales.map((s) => (
              <option key={s.sucursal_id} value={s.sucursal_id}>{s.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* KPIs consolidados */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <Kpi label="Ventas del período" value={fmtGs(t.ventas)}
          sub={varTotal != null ? `${varTotal > 0 ? "▲" : "▼"} ${Math.abs(varTotal)}% vs. anterior` : "—"}
          subTone={varTotal != null ? (varTotal >= 0 ? "up" : "down") : "neutral"} />
        <Kpi label="Operaciones" value={fmtN(t.operaciones)} />
        <Kpi label="Ticket promedio" value={fmtGs(t.operaciones > 0 ? t.ventas / t.operaciones : 0)} />
        <Kpi label="Clientes atendidos" value={fmtN(t.clientes_atendidos_aprox)} />
        <Kpi label="Prendas recibidas" value={fmtN(t.prendas_recibidas)} />
        <Kpi label="Prendas vendidas" value={fmtN(t.prendas_vendidas)} />
        <Kpi label="Stock actual" value={fmtN(t.stock)} />
        <Kpi label="Cajas abiertas / cerradas" value={`${t.cajas_abiertas} / ${t.cajas_cerradas}`} />
      </div>

      {/* Ranking / tabla por sucursal */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Sucursal</th>
              <th className="px-3 py-2 text-right">Ventas</th>
              <th className="px-3 py-2 text-right">Ops.</th>
              <th className="px-3 py-2 text-right">Ticket prom.</th>
              <th className="px-3 py-2 text-right">Clientes</th>
              <th className="px-3 py-2 text-right">Recibidas</th>
              <th className="px-3 py-2 text-right">Vendidas</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Meta</th>
              <th className="px-3 py-2 text-right">Δ vs prev.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.sucursales.map((s) => (
              <tr key={s.sucursal_id}>
                <td className="px-3 py-2 font-medium text-slate-800">{s.nombre}</td>
                <td className="px-3 py-2 text-right">{fmtGs(s.ventas)}</td>
                <td className="px-3 py-2 text-right">{fmtN(s.operaciones)}</td>
                <td className="px-3 py-2 text-right">{fmtGs(s.ticket_promedio)}</td>
                <td className="px-3 py-2 text-right">{fmtN(s.clientes_atendidos)}</td>
                <td className="px-3 py-2 text-right">{fmtN(s.prendas_recibidas)}</td>
                <td className="px-3 py-2 text-right">{fmtN(s.prendas_vendidas)}</td>
                <td className="px-3 py-2 text-right">{fmtN(s.stock)}</td>
                <td className="px-3 py-2 text-right">
                  {s.pct_meta != null ? `${s.pct_meta}%` : "—"}
                </td>
                <td className={`px-3 py-2 text-right font-semibold ${
                  s.var_ventas_pct == null ? "text-slate-400"
                  : s.var_ventas_pct >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}>
                  {s.var_ventas_pct == null ? "—" : `${s.var_ventas_pct > 0 ? "+" : ""}${s.var_ventas_pct}%`}
                </td>
              </tr>
            ))}
            {data.sucursales.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">Sin sucursales.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tipos de prenda más traídos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-xs uppercase tracking-wide font-bold text-slate-500 mb-3">
          Tipos de prenda más traídos ({data.periodo.desde} → {data.periodo.hasta})
        </h3>
        {data.tipos_prenda.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos en el período.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.tipos_prenda.map((t) => (
              <li key={t.tipo_id ?? "sin_tipo"} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-slate-700 truncate">{t.tipo_nombre}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${(t.cantidad / maxTipo) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-sm font-semibold text-slate-800 tabular-nums">{fmtN(t.cantidad)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, subTone }: {
  label: string; value: string; sub?: string;
  subTone?: "up" | "down" | "neutral";
}) {
  const subColor = subTone === "up" ? "text-emerald-700"
    : subTone === "down" ? "text-rose-700" : "text-slate-500";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-800">{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</p>}
    </div>
  );
}
