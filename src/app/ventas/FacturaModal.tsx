"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fmtActive } from "@/lib/i18n/currency";
import type { Venta } from "@/lib/ventas/types";
import { tt } from "@/lib/i18n/dict";

/**
 * Emitir (o reimprimir) la factura con timbrado de una venta.
 *
 * Antes esto era un `window.confirm` del navegador. Además de feo, no dejaba
 * ver ni corregir el RUC, que es el dato que de verdad hay que mirar: una
 * factura emitida con el RUC equivocado no se corrige, hay que anularla con
 * nota de crédito.
 *
 * Al confirmar se abre `?factura=1`, que es lo único que consume un número del
 * rango autorizado. Si la venta ya tiene número, se reimprime el mismo.
 */
export default function FacturaModal({
  venta, onClose, onEmitida,
}: {
  venta: Venta;
  onClose: () => void;
  onEmitida: () => void;
}) {
  const yaFacturada = Boolean(venta.factura_numero);

  const [ruc, setRuc] = useState("");
  const [rucOriginal, setRucOriginal] = useState<string | null>(null);
  const [cargando, setCargando] = useState(Boolean(venta.cliente_id) && !yaFacturada);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Para una venta nueva hay que confirmar el RUC a mano, siempre. */
  const [confirmado, setConfirmado] = useState(yaFacturada);

  // El RUC no viene en el listado: se busca al abrir el modal.
  useEffect(() => {
    if (yaFacturada || !venta.cliente_id) { setCargando(false); return; }
    let cancel = false;
    fetchWithSupabaseSession(`/api/clientes/${venta.cliente_id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const c = (j?.data ?? j) as { ruc?: string | null } | null;
        const v = (c?.ruc ?? "").trim();
        setRucOriginal(v || null);
        setRuc(v);
      })
      .catch(() => { if (!cancel) setRucOriginal(null); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [venta.cliente_id, yaFacturada]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !guardando) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, guardando]);

  function imprimir() {
    window.open(`/api/ventas/${venta.id}/ticket?w=80&factura=1`, "_blank", "noopener");
    onEmitida();
  }

  async function guardarRucYFacturar() {
    if (!venta.cliente_id) { setError("La venta no tiene cliente asociado."); return; }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${venta.cliente_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruc: ruc.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        setError(j?.error ?? "No se pudo guardar el RUC.");
        return;
      }
      imprimir();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el RUC.");
    } finally {
      setGuardando(false);
    }
  }

  const rucValido = ruc.trim().length >= 5;
  const cambioElRuc = (rucOriginal ?? "") !== ruc.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      onClick={() => { if (!guardando) onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={yaFacturada ? "Reimprimir factura" : "Emitir factura"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {yaFacturada ? "Reimprimir factura" : "Emitir factura"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {yaFacturada
                ? "Esta venta ya tiene factura. Se reimprime la misma, no se usa otro número."
                : "Se le asigna un número correlativo del rango autorizado."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Qué venta es */}
          <dl className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tt("Venta")}</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-800">{venta.numero_control}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tt("Cliente")}</dt>
              <dd className="mt-0.5 truncate text-sm text-slate-800">{venta.cliente_nombre ?? "—"}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tt("Total")}</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmtActive(Number(venta.total) || 0)}</dd>
            </div>
          </dl>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {yaFacturada ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{tt("Número de factura")}</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-emerald-900">{venta.factura_numero}</p>
            </div>
          ) : cargando ? (
            <p className="animate-pulse py-4 text-center text-sm text-slate-400">{tt("Buscando el RUC del cliente…")}</p>
          ) : confirmado ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-900">
                {tt("Se factura con RUC")} <strong className="font-mono">{ruc.trim()}</strong>
              </p>
              <button type="button" onClick={() => setConfirmado(false)}
                className="text-xs font-semibold text-slate-600 underline hover:text-slate-800">
                Cambiar
              </button>
            </div>
          ) : rucOriginal ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">{tt("Confirmá el RUC")}</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {venta.cliente_nombre ?? "El cliente"} tiene cargado el RUC{" "}
                <strong className="font-mono">{rucOriginal}</strong>{tt(". ¿Facturamos con ese?")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setRuc(rucOriginal); setConfirmado(true); }}
                  className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]">
                  {tt("Sí, usar ese RUC")}
                </button>
                <button type="button" onClick={() => { setRucOriginal(null); setRuc(""); }}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                  {tt("No, es otro")}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">{tt("Falta el RUC para facturar")}</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {venta.cliente_id
                  ? "Este cliente no tiene RUC cargado. Ingresalo para poder emitir la factura; queda guardado en su ficha."
                  : "Esta venta no tiene cliente asociado, así que no se le puede emitir factura."}
              </p>
              {venta.cliente_id && (
                <input
                  type="text"
                  autoFocus
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  placeholder="Ej: 80012345-6"
                  className="mt-3 w-48 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button type="button" onClick={onClose} disabled={guardando}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {tt("Cancelar")}
          </button>
          <button
            type="button"
            disabled={guardando || cargando || (!yaFacturada && (!confirmado ? !rucValido : false))}
            onClick={() => {
              if (yaFacturada) { imprimir(); return; }
              if (confirmado && !cambioElRuc) { imprimir(); return; }
              void guardarRucYFacturar();
            }}
            className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:bg-slate-300"
          >
            {guardando ? "Guardando…" : yaFacturada ? "Imprimir factura" : "Emitir factura"}
          </button>
        </div>
      </div>
    </div>
  );
}
