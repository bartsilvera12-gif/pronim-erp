"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Ranking = {
  cliente_id: string;
  nombre: string | null;
  total: number;
  cantidad?: number;
  ultima_compra?: string;
  dias?: number;
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
function fmtFecha(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PY"); } catch { return iso; }
}

export default function RankingClientesPage() {
  const [top, setTop] = useState<Ranking[]>([]);
  const [vend, setVend] = useState<Ranking[]>([]);
  const [inact, setInact] = useState<Ranking[]>([]);
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      qs.set("limit", "20");
      const r = await fetchWithSupabaseSession(`/api/reportes/ranking-clientes?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) {
        setTop(j.data?.top_compradores ?? []);
        setVend(j.data?.top_vendedores ?? []);
        setInact(j.data?.inactivos ?? []);
      }
    } finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ranking de clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Los que más gastaron, los que más aportaron mercadería y los que hace tiempo no vuelven.
          </p>
        </div>
        <Link href="/reportes" className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          ← Reportes
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <button type="button" onClick={cargar} className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold px-4 py-2">
          Aplicar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel titulo="🏆 Mejores compradores" descripcion="Los que más gastaron en la tienda en el período.">
          <TablaTop rows={top} etiqueta="Total comprado" cantidadLabel="ventas" cargando={cargando} vacio="Sin ventas en el período." />
        </Panel>
        <Panel titulo="🎽 Mejores vendedores a la tienda" descripcion="Los que más aportaron mercadería (recepciones).">
          <TablaTop rows={vend} etiqueta="Total aportado" cantidadLabel="recepciones" cargando={cargando} vacio="Sin recepciones en el período." />
        </Panel>
      </div>

      <Panel titulo="💤 Clientes inactivos" descripcion="Con historial de compras pero sin volver hace más de 90 días.">
        {cargando ? (
          <p className="py-6 text-center text-sm text-gray-400 animate-pulse">Cargando…</p>
        ) : inact.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nadie está inactivo. 👏</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase">Cliente</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase">Última compra</th>
                <th className="text-right text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase">Días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inact.map((r) => (
                <tr key={r.cliente_id}>
                  <td className="px-3 py-2">
                    <Link href={`/clientes/${r.cliente_id}`} className="font-medium text-slate-800 hover:underline">
                      {r.nombre ?? "Cliente"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{fmtFecha(r.ultima_compra)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                      {r.dias} días
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Panel({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{titulo}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

function TablaTop({ rows, etiqueta, cantidadLabel, cargando, vacio }: {
  rows: Ranking[]; etiqueta: string; cantidadLabel: string; cargando: boolean; vacio: string;
}) {
  if (cargando) return <p className="py-6 text-center text-sm text-gray-400 animate-pulse">Cargando…</p>;
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-gray-400">{vacio}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="text-left text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase w-8">#</th>
          <th className="text-left text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase">Cliente</th>
          <th className="text-right text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase">{etiqueta}</th>
          <th className="text-right text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase">{cantidadLabel}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={r.cliente_id}>
            <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
            <td className="px-3 py-2">
              <Link href={`/clientes/${r.cliente_id}`} className="font-medium text-slate-800 hover:underline">
                {r.nombre ?? "Cliente"}
              </Link>
            </td>
            <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtGs(r.total)}</td>
            <td className="px-3 py-2 text-right text-slate-500">{r.cantidad ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
