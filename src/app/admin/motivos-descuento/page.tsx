"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Motivo = { id: string; codigo: string; label: string; orden: number; activo: boolean };

export default function MotivosDescuentoPage() {
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Editor de fila nueva
  const [nuevoCod, setNuevoCod] = useState("");
  const [nuevoLbl, setNuevoLbl] = useState("");
  const [nuevoOrd, setNuevoOrd] = useState("100");
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/motivos-descuento?todos=1", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setMotivos((j.data?.motivos ?? []) as Motivo[]);
      setWarning(j.data?.warning ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear() {
    setErr(null); setOk(null); setSaving(true);
    try {
      const r = await fetchWithSupabaseSession("/api/motivos-descuento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: nuevoCod, label: nuevoLbl, orden: Number(nuevoOrd) || 100 }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setOk("Motivo creado");
      setNuevoCod(""); setNuevoLbl(""); setNuevoOrd("100");
      setTimeout(() => setOk(null), 2000);
      cargar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al crear.");
    } finally { setSaving(false); }
  }

  async function actualizar(m: Motivo, patch: Partial<Pick<Motivo, "label" | "orden" | "activo">>) {
    try {
      await fetchWithSupabaseSession("/api/motivos-descuento", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, ...patch }),
      });
      cargar();
    } catch { /* silencioso */ }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Motivos de descuento</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Motivos de descuento</h1>
        <p className="text-sm text-slate-500 mt-0.5">Editá la lista que aparece en el <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Descuento general</code> al cerrar una venta. Los códigos ya usados en ventas pasadas se preservan.</p>
      </div>

      {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{warning}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* Alta */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Nuevo motivo</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input type="text" value={nuevoCod} onChange={(e) => setNuevoCod(e.target.value)}
            placeholder="Código (ej: promo_verano)" maxLength={40}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input type="text" value={nuevoLbl} onChange={(e) => setNuevoLbl(e.target.value)}
            placeholder="Texto visible (ej: Promo verano)" maxLength={80}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2" />
          <div className="flex gap-2">
            <input type="number" value={nuevoOrd} onChange={(e) => setNuevoOrd(e.target.value)}
              placeholder="Orden" min={0} className="w-20 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            <button type="button" onClick={crear} disabled={saving || !nuevoCod || !nuevoLbl}
              className="flex-1 rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
              {saving ? "…" : "Agregar"}
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <p className="py-10 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
        ) : motivos.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Sin motivos configurados.</p>
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
              {motivos.map((m) => (
                <tr key={m.id} className={m.activo ? "" : "opacity-50"}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{m.codigo}</td>
                  <td className="px-4 py-2">
                    <input type="text" defaultValue={m.label} maxLength={80}
                      onBlur={(e) => e.target.value !== m.label && actualizar(m, { label: e.target.value })}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" defaultValue={m.orden} min={0}
                      onBlur={(e) => Number(e.target.value) !== m.orden && actualizar(m, { orden: Number(e.target.value) })}
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={m.activo} onChange={() => actualizar(m, { activo: !m.activo })}
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
