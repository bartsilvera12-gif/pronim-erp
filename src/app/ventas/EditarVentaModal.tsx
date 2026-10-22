"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fmtActive } from "@/lib/i18n/currency";
import MontoInput from "@/components/ui/MontoInput";
import type { Venta } from "@/lib/ventas/types";

/**
 * Corrección de una venta ya registrada.
 *
 * Por dentro el servidor anula la venta y crea una corregida en una sola
 * transacción (ver editar-venta-pg.ts), así que acá se arma la venta NUEVA
 * entera: líneas, cantidades, descuento, fecha y forma de pago.
 *
 * El número de control cambia a propósito: la venta vieja queda anulada
 * apuntando a la nueva, que es lo que deja el rastro de qué se corrigió.
 */

type Franja = { id: string; nombre: string; sku: string | null; precio_venta: number | string };
type LineaEdit = {
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento_unitario: number;
};
type MetodoPago = "efectivo" | "tarjeta" | "transferencia";

function hoyISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}
function soloFecha(iso: string | null | undefined): string {
  const t = String(iso ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : hoyISO();
}

export default function EditarVentaModal({
  venta,
  onClose,
  onDone,
}: {
  venta: Venta;
  onClose: () => void;
  onDone: (numeroNuevo: string) => void;
}) {
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lineas, setLineas] = useState<LineaEdit[]>(
    venta.items.map((i) => ({
      producto_id: i.producto_id,
      producto_nombre: i.producto_nombre,
      cantidad: Number(i.cantidad) || 0,
      precio_unitario: Number(i.precio_venta) || 0,
      descuento_unitario: 0,
    })),
  );
  const [fecha, setFecha] = useState(soloFecha(venta.fecha));
  const [observaciones, setObservaciones] = useState("");
  const [descuentoGeneral, setDescuentoGeneral] = useState(
    String(Number(venta.descuento_general ?? 0) || 0),
  );
  const [metodo, setMetodo] = useState<MetodoPago>(
    venta.metodo_pago === "tarjeta" || venta.metodo_pago === "transferencia"
      ? venta.metodo_pago
      : "efectivo",
  );
  const [motivo, setMotivo] = useState("");

  const [agregar, setAgregar] = useState("");

  useEffect(() => {
    const qs = venta.sucursal_id ? `?sucursal_id=${encodeURIComponent(venta.sucursal_id)}` : "";
    fetchWithSupabaseSession(`/api/franjas/publicas${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setFranjas((j?.data?.franjas as Franja[]) ?? []))
      .catch(() => setFranjas([]))
      .finally(() => setCargando(false));
  }, [venta.sucursal_id]);

  const subtotal = useMemo(
    () => lineas.reduce((s, l) => s + Math.max(0, l.precio_unitario - l.descuento_unitario) * l.cantidad, 0),
    [lineas],
  );
  const descGeneralNum = Math.max(0, Math.min(Number(descuentoGeneral) || 0, subtotal));
  const total = Math.max(0, subtotal - descGeneralNum);
  const totalPrendas = lineas.reduce((s, l) => s + l.cantidad, 0);

  function actualizar(idx: number, patch: Partial<LineaEdit>) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function quitar(idx: number) {
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  }
  function agregarFranja(id: string) {
    const f = franjas.find((x) => x.id === id);
    if (!f) return;
    setLineas((prev) => [
      ...prev,
      {
        producto_id: f.id,
        producto_nombre: f.nombre,
        cantidad: 1,
        precio_unitario: Number(f.precio_venta) || 0,
        descuento_unitario: 0,
      },
    ]);
    setAgregar("");
  }

  async function guardar() {
    setError(null);
    if (lineas.length === 0) { setError("La venta tiene que llevar al menos un producto."); return; }
    if (lineas.some((l) => l.cantidad <= 0)) { setError("Hay líneas con cantidad en cero."); return; }
    if (!motivo.trim()) { setError("Escribí por qué se corrige: queda en el historial."); return; }

    setGuardando(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/ventas/${venta.id}/editar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: motivo.trim(),
          cliente_id: venta.cliente_id,
          sucursal_id: venta.sucursal_id,
          observaciones: observaciones.trim() || null,
          moneda: "GS",
          tipo_cambio: 1,
          tipo_venta: "CONTADO",
          plazo_dias: null,
          fecha,
          descuento_general: descGeneralNum,
          descuento_motivo: descGeneralNum > 0 ? "correccion" : null,
          credito_cliente_usado: 0,
          items: lineas.map((l) => ({
            producto_id: l.producto_id,
            cantidad: l.cantidad,
            descuento_unitario: l.descuento_unitario || 0,
          })),
          // La clave es metodo_pago, no metodo: con el nombre equivocado
          // llegaba null y la base rechazaba el pago.
          pagos: total > 0 ? [{ metodo_pago: metodo, monto: total }] : [],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Error ${r.status}`);
      onDone(j?.data?.nueva?.numeroControl ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la corrección.");
    } finally {
      setGuardando(false);
    }
  }

  const inputCls =
    "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Corregir venta {venta.numero_control}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Se anula esta venta y se crea una corregida con número nuevo. El stock y el
              crédito del cliente se rehacen solos.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-700">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha</label>
              <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Forma de pago</label>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={`w-full ${inputCls}`}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Descuento general</label>
              <MontoInput
                value={descuentoGeneral}
                decimals={false}
                onChange={(n) => setDescuentoGeneral(n > 0 ? String(n) : "")}
                className={`w-full text-right ${inputCls}`}
              />
            </div>
          </div>

          {/* Líneas */}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Producto</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-28">Cant.</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-32">Desc. c/u</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-28">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineas.map((l, idx) => (
                  <tr key={`${l.producto_id}-${idx}`}>
                    <td className="px-3 py-2 text-slate-800">
                      {l.producto_nombre}
                      <span className="block text-[11px] text-slate-400">{fmtActive(l.precio_unitario)} c/u</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => actualizar(idx, { cantidad: Math.max(1, l.cantidad - 1) })}
                          disabled={l.cantidad <= 1}
                          className="h-7 w-7 rounded-md border border-slate-200 text-base leading-none text-slate-600 disabled:opacity-35">−</button>
                        <input type="number" min={1} value={l.cantidad}
                          onChange={(e) => actualizar(idx, { cantidad: Math.max(0, Number(e.target.value) || 0) })}
                          onBlur={() => { if (l.cantidad <= 0) actualizar(idx, { cantidad: 1 }); }}
                          className="w-14 rounded-md border border-slate-200 px-2 py-1 text-center text-sm tabular-nums" />
                        <button type="button" onClick={() => actualizar(idx, { cantidad: l.cantidad + 1 })}
                          className="h-7 w-7 rounded-md border border-slate-200 text-base leading-none text-slate-600">+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <MontoInput value={String(l.descuento_unitario || "")} decimals={false}
                        onChange={(n) => actualizar(idx, { descuento_unitario: Math.max(0, Math.min(n, l.precio_unitario)) })}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-sm" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                      {fmtActive(Math.max(0, l.precio_unitario - l.descuento_unitario) * l.cantidad)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button type="button" onClick={() => quitar(idx)} title="Quitar"
                        className="text-lg leading-none text-slate-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                ))}
                {lineas.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">Sin productos.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Agregar producto */}
          <div className="mt-3">
            <select value={agregar} onChange={(e) => agregarFranja(e.target.value)} disabled={cargando} className={`w-full ${inputCls}`}>
              <option value="">{cargando ? "Cargando catálogo…" : "+ Agregar producto…"}</option>
              {franjas.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre} — {fmtActive(Number(f.precio_venta) || 0)}</option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Observaciones</label>
            <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={`w-full ${inputCls}`} />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              ¿Por qué se corrige? <span className="text-rose-500">*</span>
            </label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: se cargó una prenda de más"
              className={`w-full ${inputCls}`} />
            <p className="mt-1 text-[11px] text-slate-400">Queda guardado en la venta anulada.</p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-sm">
            <span className="mr-3 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
              {totalPrendas} {totalPrendas === 1 ? "prenda" : "prendas"}
            </span>
            <span className="text-slate-500">Total: </span>
            <strong className="text-base text-slate-900 tabular-nums">{fmtActive(total)}</strong>
            {descGeneralNum > 0 && (
              <span className="ml-2 text-[11px] text-emerald-700">−{fmtActive(descGeneralNum)} desc.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando}
              className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar corrección"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
