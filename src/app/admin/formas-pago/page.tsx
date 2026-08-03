"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Forma = { id: string; codigo: string; label: string; orden: number; activo: boolean };

export default function FormasPagoPage() {
  const [formas, setFormas] = useState<Forma[]>([]);
  const [cargando, setCargando] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/formas-pago?todos=1", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setFormas((j.data?.formas ?? []) as Forma[]);
      setWarning(j.data?.warning ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function actualizar(f: Forma, patch: Partial<Pick<Forma, "label" | "orden" | "activo">>) {
    try {
      await fetchWithSupabaseSession("/api/formas-pago", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: f.codigo, ...patch }),
      });
      cargar();
    } catch { /* silencioso */ }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Formas de pago</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Formas de pago</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Renombrá, reordená o desactivá las formas de pago que aparecen en los flujos de venta. El código interno no se puede cambiar (mantiene compat con ventas históricas).
        </p>
      </div>

      {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{warning}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <p className="py-10 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
        ) : formas.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Sin formas configuradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Código</th>
                <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Texto visible</th>
                <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600 w-24">Orden</th>
                <th className="text-center px-4 py-2 text-[11px] uppercase font-semibold text-slate-600 w-24">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {formas.map((f) => (
                <tr key={f.id} className={f.activo ? "" : "opacity-50"}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{f.codigo}</td>
                  <td className="px-4 py-2">
                    <input type="text" defaultValue={f.label} maxLength={40}
                      onBlur={(e) => e.target.value !== f.label && actualizar(f, { label: e.target.value })}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" defaultValue={f.orden} min={0}
                      onBlur={(e) => Number(e.target.value) !== f.orden && actualizar(f, { orden: Number(e.target.value) })}
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={f.activo} onChange={() => actualizar(f, { activo: !f.activo })}
                      className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
