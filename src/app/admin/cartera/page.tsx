"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type CarteraConfig = {
  cashback_vencimiento_dias: number;
  credito_vence: boolean;
};

export default function ConfigCarteraPage() {
  const [dias, setDias] = useState<string>("30");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/configuracion/cartera", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        const cfg = j.data?.config as CarteraConfig;
        setDias(String(cfg?.cashback_vencimiento_dias ?? 30));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, []);

  async function guardar() {
    setGuardando(true); setMsg(null); setError(null);
    try {
      const n = Math.max(0, Math.floor(Number(dias) || 0));
      const r = await fetchWithSupabaseSession("/api/configuracion/cartera", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { cashback_vencimiento_dias: n, credito_vence: false } }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      setDias(String(j.data?.config?.cashback_vencimiento_dias ?? n));
      setMsg("Configuración guardada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const diasN = Math.max(0, Math.floor(Number(dias) || 0));

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Cartera (crédito y cashback)</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cartera: crédito y cashback</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Definí cuánto dura el cashback antes de vencer. El crédito a favor no vence nunca.
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</div>}

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-8 text-center">Cargando…</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800">Vencimiento del cashback</label>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">
                Días de vigencia desde que se acredita. Poné <strong>0</strong> para que el cashback no venza.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={3650}
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                />
                <span className="text-sm text-slate-600">días</span>
                {diasN === 0
                  ? <span className="ml-2 text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">Sin vencimiento</span>
                  : <span className="ml-2 text-xs rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 border border-amber-200">Vence a los {diasN} días</span>}
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-700">Crédito a favor</p>
              <p className="text-xs text-slate-500 mt-0.5">
                No vence. El saldo de crédito (de evaluaciones, devoluciones o ajustes) queda disponible indefinidamente.
              </p>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={guardar} disabled={guardando}
                className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold px-5 py-2 disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-4 py-3 text-xs text-sky-800">
            <p className="font-semibold mb-1">¿Qué pasa con el cashback ya entregado?</p>
            <p>
              El vencimiento se fija al momento de acreditar cada cashback. Cambiar este valor afecta
              solo a los cashbacks que se entreguen de ahora en adelante — los ya emitidos conservan la
              fecha que tenían.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
