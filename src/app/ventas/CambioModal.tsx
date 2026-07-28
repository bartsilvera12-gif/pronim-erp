"use client";

/**
 * Modal "Cambio" simple para /ventas. Reemplaza al link a /atencion/nueva
 * en el caso frecuente: cliente devuelve items de una venta y se lleva
 * otros (por franja de precio). La diferencia se cobra en un método
 * (efectivo / transferencia / tarjeta) o se devuelve en efectivo si es
 * negativa. Todo va como una atención atómica al endpoint /api/atencion/confirmar.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Venta } from "@/lib/ventas/types";

type Franja = { id: string; nombre: string; precio_venta: number | string };
type CajaAbierta = { id: string; numero_caja?: number; punto_caja_nombre?: string | null };

type DevuelveLinea = { producto_id: string; producto_nombre: string; precio: number; cantidad: number; max: number };
type LlevaLinea = { franja_id: string; nombre: string; precio: number; cantidad: number };

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}

export default function CambioModal({
  venta,
  onClose,
  onDone,
}: {
  venta: Venta;
  onClose: () => void;
  onDone: () => void;
}) {
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [cajas, setCajas] = useState<CajaAbierta[]>([]);
  const [cajaId, setCajaId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errCarga, setErrCarga] = useState<string | null>(null);

  // Devuelve: pre-cargado con los items de la venta, cantidad = 0 (elegís
  // cuánto devuelve). max = lo que se vendió en esa línea.
  const [devuelve, setDevuelve] = useState<DevuelveLinea[]>(() =>
    venta.items.map((it) => ({
      producto_id: it.producto_id,
      producto_nombre: it.producto_nombre,
      precio: it.precio_venta,
      cantidad: 0,
      max: it.cantidad,
    }))
  );
  const [lleva, setLleva] = useState<LlevaLinea[]>([]);

  const [metodo, setMetodo] = useState<"efectivo" | "transferencia" | "tarjeta">("efectivo");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    Promise.all([
      fetchWithSupabaseSession("/api/franjas/publicas", { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession("/api/caja/abierta", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([jf, jc]) => {
        if (cancel) return;
        const fr = (jf?.data?.franjas as Franja[] | undefined) ?? [];
        setFranjas(
          fr
            .map((f) => ({ ...f, precio_venta: Number(f.precio_venta) || 0 }))
            .sort((a, b) => (a.precio_venta as number) - (b.precio_venta as number)),
        );
        const abiertas = (jc?.data?.cajas as CajaAbierta[] | undefined) ?? [];
        const alt = (jc?.data?.caja as CajaAbierta | null | undefined) ?? null;
        const list = abiertas.length > 0 ? abiertas : alt ? [alt] : [];
        setCajas(list);
        if (list.length === 1) setCajaId(list[0].id);
      })
      .catch((e) => setErrCarga(e instanceof Error ? e.message : "Error cargando datos."))
      .finally(() => {
        if (!cancel) setCargando(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const totalDevuelve = useMemo(
    () => devuelve.reduce((s, l) => s + l.precio * l.cantidad, 0),
    [devuelve],
  );
  const totalLleva = useMemo(
    () => lleva.reduce((s, l) => s + l.precio * l.cantidad, 0),
    [lleva],
  );
  const diferencia = totalLleva - totalDevuelve;
  const clientePaga = diferencia > 0 ? diferencia : 0;
  const tiendaDevuelve = diferencia < 0 ? -diferencia : 0;

  function agregarFranjaLleva(f: Franja) {
    const precio = Number(f.precio_venta) || 0;
    setLleva((prev) => {
      const idx = prev.findIndex((l) => l.franja_id === f.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
        return copy;
      }
      return [...prev, { franja_id: f.id, nombre: f.nombre, precio, cantidad: 1 }];
    });
  }

  async function confirmar() {
    setErr(null);
    if (!cajaId) {
      setErr(cajas.length > 1
        ? "Hay más de una caja abierta. Elegí cuál usar."
        : "No hay una caja abierta. Abrí caja antes de registrar el cambio.");
      return;
    }
    if (!venta.cliente_id) {
      setErr("Esta venta no tiene un cliente asignado, no se puede registrar un cambio.");
      return;
    }
    const devuelveActivo = devuelve.filter((l) => l.cantidad > 0);
    const llevaActivo = lleva.filter((l) => l.cantidad > 0);
    if (devuelveActivo.length === 0 && llevaActivo.length === 0) {
      setErr("Cargá al menos algo en 'Devuelve' o 'Se lleva'.");
      return;
    }
    if (devuelveActivo.some((l) => l.cantidad > l.max)) {
      setErr("No podés devolver más unidades de las que se vendieron en esa línea.");
      return;
    }

    setEnviando(true);
    try {
      const traePayload = devuelveActivo.length > 0
        ? {
            items: devuelveActivo.map((l) => ({
              producto_id: l.producto_id,
              cantidad: l.cantidad,
              precio_compra_unitario: l.precio,
              tipo_prenda_id: null,
            })),
            total_final_evaluado: totalDevuelve,
            ingresar_al_stock: true,
          }
        : null;

      const llevaPayload = llevaActivo.length > 0
        ? {
            items: llevaActivo.map((l) => ({
              producto_id: l.franja_id,
              cantidad: l.cantidad,
              tipo_iva: "EXENTA" as const,
            })),
            credito_usado: 0,
            pago_detalle: clientePaga > 0
              ? [{
                  metodo_pago: metodo,
                  monto: clientePaga,
                  referencia: referencia.trim() || null,
                }]
              : [],
            moneda: "GS" as const,
            tipo_cambio: 1,
          }
        : null;

      const r = await fetchWithSupabaseSession("/api/atencion/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          caja_id: cajaId,
          cliente_id: venta.cliente_id,
          trae: traePayload,
          lleva: llevaPayload,
          origen_venta_id: venta.id,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo registrar el cambio (${r.status}).`);
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado al registrar el cambio.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!enviando) onClose(); }}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">Cambio de la venta {venta.numero_control}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              El cliente devuelve prendas de esta venta y se lleva otras. La diferencia se cobra o se devuelve.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={enviando}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="overflow-auto flex-1 p-5 space-y-4">
          {cargando && <p className="py-6 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>}
          {errCarga && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errCarga}
            </div>
          )}

          {!cargando && !errCarga && (
            <>
              {cajas.length > 1 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-[11px] font-semibold uppercase text-amber-800 mb-1.5">
                    Caja
                  </label>
                  <select
                    value={cajaId ?? ""}
                    onChange={(e) => setCajaId(e.target.value || null)}
                    className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">— Elegí caja —</option>
                    {cajas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.punto_caja_nombre ?? `Caja ${c.numero_caja ?? ""}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DEVUELVE — items reales de la venta */}
                <div className="rounded-xl border-2 border-sky-200 overflow-hidden">
                  <div className="bg-sky-50 px-3 py-2 border-b border-sky-200">
                    <h4 className="text-xs font-bold uppercase text-sky-800">Devuelve</h4>
                    <p className="text-[10px] text-sky-700">Elegí cuántas prendas devuelve el cliente</p>
                  </div>
                  <ul className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                    {devuelve.map((l, i) => (
                      <li key={`${l.producto_id}-${i}`} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {l.producto_nombre}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {fmtGs(l.precio)} c/u · vendidas: {l.max}
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={l.max}
                          value={l.cantidad === 0 ? "" : l.cantidad}
                          onChange={(e) => {
                            const n = Math.max(0, Math.min(l.max, Math.floor(Number(e.target.value) || 0)));
                            setDevuelve((prev) => {
                              const c = [...prev];
                              c[i] = { ...c[i], cantidad: n };
                              return c;
                            });
                          }}
                          placeholder="0"
                          className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                        />
                        <div className="w-24 text-right text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                          {fmtGs(l.precio * l.cantidad)}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-sky-200 bg-sky-50/60 px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] uppercase font-semibold text-sky-800">Total devuelve</span>
                    <span className="text-sm font-bold text-sky-900 tabular-nums">{fmtGs(totalDevuelve)}</span>
                  </div>
                </div>

                {/* SE LLEVA — franjas de precio */}
                <div className="rounded-xl border-2 border-emerald-200 overflow-hidden">
                  <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200">
                    <h4 className="text-xs font-bold uppercase text-emerald-800">Se lleva</h4>
                    <p className="text-[10px] text-emerald-700">Tocá una franja para agregar una prenda de ese precio</p>
                  </div>
                  {franjas.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-400">
                      No hay franjas de precio configuradas.
                    </p>
                  ) : (
                    <div className="p-3 grid grid-cols-3 gap-2 border-b border-slate-100">
                      {franjas.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => agregarFranjaLleva(f)}
                          className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors active:scale-95"
                        >
                          <p className="text-sm font-bold text-slate-800">{fmtGs(Number(f.precio_venta) || 0)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                    {lleva.length === 0 ? (
                      <li className="px-3 py-6 text-center text-[11px] italic text-slate-400">
                        Todavía no hay nada. Tocá una franja para agregar.
                      </li>
                    ) : (
                      lleva.map((l, i) => (
                        <li key={`${l.franja_id}-${i}`} className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 min-w-0 text-sm text-slate-700 tabular-nums">
                            {fmtGs(l.precio)}
                          </div>
                          <input
                            type="number"
                            min={0}
                            value={l.cantidad === 0 ? "" : l.cantidad}
                            onChange={(e) => {
                              const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                              setLleva((prev) => {
                                const c = [...prev];
                                c[i] = { ...c[i], cantidad: n };
                                return c;
                              });
                            }}
                            onBlur={() => {
                              if (l.cantidad <= 0) {
                                setLleva((prev) => prev.filter((_, k) => k !== i));
                              }
                            }}
                            className="w-14 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <div className="w-24 text-right text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                            {fmtGs(l.precio * l.cantidad)}
                          </div>
                          <button
                            type="button"
                            onClick={() => setLleva((prev) => prev.filter((_, k) => k !== i))}
                            className="text-slate-400 hover:text-rose-600 text-lg leading-none"
                          >
                            ×
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="border-t border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] uppercase font-semibold text-emerald-800">Total se lleva</span>
                    <span className="text-sm font-bold text-emerald-900 tabular-nums">{fmtGs(totalLleva)}</span>
                  </div>
                </div>
              </div>

              {/* Diferencia + método de pago */}
              <div className={`rounded-xl border-2 p-4 ${
                diferencia === 0
                  ? "border-slate-200 bg-slate-50"
                  : diferencia > 0
                  ? "border-emerald-300 bg-emerald-50/60"
                  : "border-amber-300 bg-amber-50/60"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Diferencia
                  </span>
                  <span className={`text-2xl font-bold tabular-nums ${
                    diferencia === 0 ? "text-slate-700" : diferencia > 0 ? "text-emerald-800" : "text-amber-800"
                  }`}>
                    {diferencia === 0 ? "Cambio a la par" : fmtGs(Math.abs(diferencia))}
                  </span>
                </div>
                {clientePaga > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-800">
                      El cliente <strong>paga {fmtGs(clientePaga)}</strong> por la diferencia.
                    </p>
                    <div className="flex gap-2">
                      {(["efectivo", "transferencia", "tarjeta"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMetodo(m)}
                          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase transition-colors ${
                            metodo === m
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {metodo !== "efectivo" && (
                      <input
                        type="text"
                        value={referencia}
                        onChange={(e) => setReferencia(e.target.value)}
                        placeholder="Referencia (opcional)"
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    )}
                  </div>
                )}
                {tiendaDevuelve > 0 && (
                  <p className="text-xs text-amber-900">
                    La tienda <strong>devuelve {fmtGs(tiendaDevuelve)}</strong> en efectivo al cliente.
                  </p>
                )}
              </div>

              {err && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {err}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviando || cargando || (totalDevuelve === 0 && totalLleva === 0)}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold px-6 py-2 shadow-sm"
          >
            {enviando ? "Registrando…" : "Confirmar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}
