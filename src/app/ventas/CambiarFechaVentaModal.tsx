"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Venta } from "@/lib/ventas/types";

/** Cambia solo la fecha de una venta, sin anularla ni crear otra. */
export default function CambiarFechaVentaModal({
  venta,
  onClose,
  onDone,
}: {
  venta: Venta;
  onClose: () => void;
  onDone: () => void;
}) {
  const hoy = new Date().toLocaleDateString("sv-SE");
  const inicial = /^\d{4}-\d{2}-\d{2}/.test(String(venta.fecha ?? "")) ? String(venta.fecha).slice(0, 10) : hoy;
  const [fecha, setFecha] = useState(inicial);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (!fecha) { setError("Elegí la fecha."); return; }
    setGuardando(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/ventas/${venta.id}/fecha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, motivo: motivo.trim() || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Error ${r.status}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la fecha.");
    } finally {
      setGuardando(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Cambiar fecha de la venta {venta.numero_control}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Solo cambia la fecha. La venta mantiene su número, el stock, el crédito y los cobros.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        <label className="mt-4 mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nueva fecha</label>
        <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        <label className="mt-3 mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Motivo (opcional)</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: fecha mal cargada" className={inputCls} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando}
            className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar fecha"}
          </button>
        </div>
      </div>
    </div>
  );
}
