"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fmtActive } from "@/lib/i18n/currency";

type PagoFila = { id: string; metodo_pago: string; monto: number; opciones: string[] };

const ETIQUETA: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
  consignacion: "Consignación",
};
const etiqueta = (m: string) => ETIQUETA[m] ?? m;

/**
 * Cambia la forma de pago de una venta o de una evaluación ya registrada.
 * Solo administrador (el servidor lo vuelve a validar). `url` es la ruta
 * /pagos del registro: GET lista los cobros y POST guarda el cambio.
 */
export default function CambiarFormaPagoModal({
  titulo,
  url,
  onClose,
  onDone,
}: {
  titulo: string;
  url: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pagos, setPagos] = useState<PagoFila[]>([]);
  const [nuevos, setNuevos] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success === false) throw new Error(j?.error ?? "No se pudieron cargar los pagos.");
        const lista = (j?.data?.pagos as PagoFila[]) ?? [];
        setPagos(lista);
        setNuevos(Object.fromEntries(lista.map((p) => [p.id, p.metodo_pago])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los pagos."))
      .finally(() => setCargando(false));
  }, [url]);

  async function guardar() {
    setError(null);
    const cambios = pagos
      .filter((p) => nuevos[p.id] && nuevos[p.id] !== p.metodo_pago)
      .map((p) => ({ id: p.id, metodo_pago: nuevos[p.id] }));
    if (cambios.length === 0) { setError("Elegí una forma de pago distinta a la actual."); return; }
    setGuardando(true);
    try {
      const r = await fetchWithSupabaseSession(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagos: cambios, motivo: motivo.trim() || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Error ${r.status}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la forma de pago.");
    } finally {
      setGuardando(false);
    }
  }

  const inputCls =
    "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">{titulo}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Solo cambia la forma de pago. Los montos, el stock y el crédito no se tocan.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        <div className="mt-4 space-y-2">
          {cargando && <p className="text-sm text-slate-400">Cargando pagos…</p>}
          {!cargando && pagos.length === 0 && !error && (
            <p className="text-sm text-slate-400">Este registro no tiene pagos para editar.</p>
          )}
          {pagos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium tabular-nums text-slate-800">{fmtActive(p.monto)}</span>
              {p.opciones.length > 1 ? (
                <select
                  value={nuevos[p.id] ?? p.metodo_pago}
                  onChange={(e) => setNuevos((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  aria-label={`Forma de pago de ${fmtActive(p.monto)}`}
                  className={inputCls}
                >
                  {p.opciones.map((o) => (
                    <option key={o} value={o}>{etiqueta(o)}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-slate-500">{etiqueta(p.metodo_pago)} (no se puede cambiar)</span>
              )}
            </div>
          ))}
        </div>
        <label className="mt-4 mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Motivo (opcional)</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: error al cargar / renegociación" className={`w-full ${inputCls}`} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || cargando || pagos.length === 0}
            className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar forma de pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
