"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Config = {
  dias_nuevo: number;
  dias_semana: number;
  dias_sin_volver: number;
  dias_dormido: number;
  vip_min_compras: number;
  vip_top_pct: number;
};

const DEFAULTS: Config = {
  dias_nuevo: 30, dias_semana: 7, dias_sin_volver: 60, dias_dormido: 90,
  vip_min_compras: 5, vip_top_pct: 15,
};

export default function CategoriasClientesPage() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [draft, setDraft] = useState<Config>(DEFAULTS);
  const [cargando, setCargando] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/categorias-clientes", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      const c = { ...DEFAULTS, ...(j.data?.config ?? {}) };
      setCfg(c); setDraft(c);
      setWarning(j.data?.warning ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setSaving(true); setErr(null); setOk(null);
    try {
      const r = await fetchWithSupabaseSession("/api/categorias-clientes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setCfg(j.data?.config ?? draft);
      setOk("Umbrales actualizados.");
      setTimeout(() => setOk(null), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar.");
    } finally { setSaving(false); }
  }

  const dirty = JSON.stringify(cfg) !== JSON.stringify(draft);
  const setN = (k: keyof Config, v: string) => {
    const n = Number(v);
    setDraft((p) => ({ ...p, [k]: Number.isFinite(n) && n > 0 ? Math.floor(n) : p[k] }));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Categorías de clientes</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Categorías de clientes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Umbrales usados por los chips en <Link href="/clientes" className="text-[#3F8E91] hover:underline">/clientes</Link>: Nuevos / Compró esta semana / Sin volver / Dormidos / VIP.
        </p>
      </div>

      {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{warning}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{ok}</div>}

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-6 text-center">Cargando…</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
          <Grupo titulo="Antigüedad del cliente">
            <Campo label="Nuevo (días desde alta)" hint="Los últimos N días → chip 'Nuevos'"
              value={draft.dias_nuevo} onChange={(v) => setN("dias_nuevo", v)} />
            <Campo label="Compró esta semana (días)" hint="Días recientes con al menos una compra"
              value={draft.dias_semana} onChange={(v) => setN("dias_semana", v)} />
            <Campo label="Sin volver (días)" hint="Sin comprar hace ≥ N días → 'Sin volver +Xd'"
              value={draft.dias_sin_volver} onChange={(v) => setN("dias_sin_volver", v)} />
            <Campo label="Dormido (días)" hint="Sin comprar hace ≥ N días → chip 'Dormidos'"
              value={draft.dias_dormido} onChange={(v) => setN("dias_dormido", v)} />
          </Grupo>

          <Grupo titulo="Cliente VIP">
            <Campo label="Mínimo de compras" hint="Con N+ compras entra al chip VIP"
              value={draft.vip_min_compras} onChange={(v) => setN("vip_min_compras", v)} />
            <Campo label="Top % por total gastado" hint="También son VIP los clientes en el top N% del total comprado"
              value={draft.vip_top_pct} onChange={(v) => setN("vip_top_pct", v)} sufijo="%" />
          </Grupo>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            {dirty && (
              <button type="button" onClick={() => setDraft(cfg)}
                className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2">Descartar</button>
            )}
            <button type="button" onClick={guardar} disabled={saving || !dirty}
              className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase font-semibold text-slate-500 mb-2">{titulo}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Campo({ label, hint, value, onChange, sufijo }: {
  label: string; hint: string; value: number; onChange: (v: string) => void; sufijo?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      <div className="relative">
        <input type="number" min={1} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
        {sufijo && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{sufijo}</span>}
      </div>
      <span className="block text-[10px] text-slate-500 mt-1">{hint}</span>
    </label>
  );
}
