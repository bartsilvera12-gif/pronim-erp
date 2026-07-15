"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type MetaSucursal = {
  sucursal_id: string;
  sucursal_nombre: string;
  meta_diaria: number;
  meta_semanal: number;
  meta_semanal_prorrateada: number;
  comision_alcanza_pct: number;
  comision_no_alcanza_pct: number;
  vendido_hoy: number;
  vendido_semana: number;
  pct_dia: number;
  pct_semana: number;
  falta_hoy: number;
  falta_semana: number;
  alcanza_semana: boolean;
  comision_pct_actual: number;
  comision_estimada: number;
  records: {
    mejor_dia: { fecha: string; total: number } | null;
    mejor_semana: { desde: string; total: number } | null;
    mejor_mes: { mes: string; total: number } | null;
  };
};

function fmtGs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return "Gs. " + Math.round(Number(n)).toLocaleString("es-PY");
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function AdminMetasPage() {
  const [metas, setMetas] = useState<MetaSucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  // Edición inline por sucursal (drafts)
  const [drafts, setDrafts] = useState<Record<string, { meta: string; comAlc: string; comNo: string; saving: boolean }>>({});

  const cargar = useCallback(async () => {
    setError(null);
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/metas", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Error ${r.status}`);
      setMetas((j.data?.metas ?? []) as MetaSucursal[]);
      setWarn(j.data?.warning ?? null);
      const nextDrafts: typeof drafts = {};
      for (const m of (j.data?.metas ?? []) as MetaSucursal[]) {
        nextDrafts[m.sucursal_id] = {
          meta: String(m.meta_diaria),
          comAlc: String(m.comision_alcanza_pct),
          comNo: String(m.comision_no_alcanza_pct),
          saving: false,
        };
      }
      setDrafts(nextDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar metas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(m: MetaSucursal) {
    const d = drafts[m.sucursal_id];
    if (!d) return;
    setDrafts((p) => ({ ...p, [m.sucursal_id]: { ...d, saving: true } }));
    setOk(null); setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/metas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal_id: m.sucursal_id,
          monto_meta_diaria: Number(d.meta) || 0,
          comision_alcanza_pct: Number(d.comAlc) || 0,
          comision_no_alcanza_pct: Number(d.comNo) || 0,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Error ${r.status}`);
      setOk(`Meta actualizada para ${m.sucursal_nombre}.`);
      setTimeout(() => setOk(null), 3500);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setDrafts((p) => ({ ...p, [m.sucursal_id]: { ...p[m.sucursal_id], saving: false } }));
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin/sucursales" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Metas de venta</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Metas de venta por sucursal</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configurá la meta diaria de cada sucursal y el % de comisión semanal. La meta semanal se calcula como 7× la diaria.
        </p>
      </div>

      {warn && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warn}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>}

      {cargando ? (
        <div className="py-16 text-center text-sm text-gray-400 animate-pulse">Cargando…</div>
      ) : metas.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Sin sucursales activas todavía.</div>
      ) : (
        <div className="space-y-4">
          {metas.map((m) => {
            const d = drafts[m.sucursal_id];
            return (
              <div key={m.sucursal_id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">{m.sucursal_nombre}</h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    m.alcanza_semana
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"
                  }`}>
                    {m.alcanza_semana ? "Alcanzó la meta semanal" : "No alcanza aún"}
                  </span>
                </div>

                {/* Progreso día y semana */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ProgresoCard
                    label="Hoy"
                    total={m.vendido_hoy}
                    meta={m.meta_diaria}
                    pct={m.pct_dia}
                    falta={m.falta_hoy}
                  />
                  <ProgresoCard
                    label="Esta semana (lun–dom)"
                    total={m.vendido_semana}
                    meta={m.meta_semanal}
                    pct={m.pct_semana}
                    falta={m.falta_semana}
                  />
                </div>

                {/* Comisión */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap justify-between items-center gap-2 text-sm">
                  <div>
                    <p className="text-xs uppercase font-semibold text-slate-500">Comisión estimada de la semana</p>
                    <p className="text-lg font-bold text-slate-800">{fmtGs(m.comision_estimada)}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {m.comision_pct_actual}% sobre lo vendido — {m.alcanza_semana ? `alcanza (${m.comision_alcanza_pct}%)` : `no alcanza (${m.comision_no_alcanza_pct}%)`}
                    </p>
                  </div>
                </div>

                {/* Configuración */}
                {d && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Configuración</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Meta diaria (Gs.)</label>
                        <input
                          type="number" min={0} step="1000"
                          value={d.meta}
                          onChange={(e) => setDrafts((p) => ({ ...p, [m.sucursal_id]: { ...p[m.sucursal_id], meta: e.target.value } }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Comisión si alcanza (%)</label>
                        <input
                          type="number" min={0} max={100} step="0.1"
                          value={d.comAlc}
                          onChange={(e) => setDrafts((p) => ({ ...p, [m.sucursal_id]: { ...p[m.sucursal_id], comAlc: e.target.value } }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Comisión si NO alcanza (%)</label>
                        <input
                          type="number" min={0} max={100} step="0.1"
                          value={d.comNo}
                          onChange={(e) => setDrafts((p) => ({ ...p, [m.sucursal_id]: { ...p[m.sucursal_id], comNo: e.target.value } }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <button
                        type="button"
                        onClick={() => guardar(m)}
                        disabled={d.saving}
                        className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                      >
                        {d.saving ? "Guardando…" : "Guardar cambios"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Records */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <RecordCard label="🥇 Mejor día"    valor={m.records.mejor_dia?.total    ?? null} extra={fmtFecha(m.records.mejor_dia?.fecha ?? null)} />
                  <RecordCard label="🥇 Mejor semana" valor={m.records.mejor_semana?.total ?? null} extra={m.records.mejor_semana ? `desde ${fmtFecha(m.records.mejor_semana.desde)}` : ""} />
                  <RecordCard label="🥇 Mejor mes"    valor={m.records.mejor_mes?.total    ?? null} extra={m.records.mejor_mes?.mes ?? ""} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgresoCard({ label, total, meta, pct, falta }: { label: string; total: number; meta: number; pct: number; falta: number }) {
  const ancho = Math.min(100, Math.max(0, pct));
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-sky-500" : "bg-amber-500";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase font-semibold text-slate-500">{label}</p>
        <p className="text-xs text-slate-500">Meta: <strong className="text-slate-700">{fmtGs(meta)}</strong></p>
      </div>
      <p className="mt-1 text-xl font-bold text-slate-800">{fmtGs(total)} <span className="text-sm font-medium text-slate-500">({pct}%)</span></p>
      <div className="h-2 mt-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${ancho}%` }} />
      </div>
      {meta > 0 && (
        <p className="text-[11px] text-slate-500 mt-1">
          {pct >= 100 ? `¡Superó la meta por ${fmtGs(total - meta)}!` : `Faltan ${fmtGs(falta)}`}
        </p>
      )}
    </div>
  );
}

function RecordCard({ label, valor, extra }: { label: string; valor: number | null; extra: string }) {
  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
      <p className="text-xs uppercase font-semibold text-amber-700">{label}</p>
      <p className="text-base font-bold text-slate-800 mt-0.5">{valor != null ? fmtGs(valor) : "—"}</p>
      {extra && <p className="text-[11px] text-slate-500 mt-0.5">{extra}</p>}
    </div>
  );
}
