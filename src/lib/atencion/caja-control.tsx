"use client";

// ═══════════════════════════════════════════════════════════════════════
// Control de caja compartido entre /venta/nueva y /evaluacion/nueva.
//
// Encapsula el mismo comportamiento que la caja original (/atencion/nueva):
//   - Detección de caja(s) abiertas + selector si hay más de una.
//   - Selección de punto de caja (autoseleccionar el primero).
//   - Modales: abrir caja, cerrar caja (con resumen), movimiento manual.
//
// La caja original NO importa este archivo — sigue teniendo su
// implementación in-line para no romper su flujo atómico trae+lleva.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import MontoInput from "@/components/ui/MontoInput";
import { useT, useMoney } from "@/lib/i18n/context";
import { fmtGs, ResumenRow } from "./shared";

type CajaAbierta = {
  id: string;
  numero_caja?: number;
  fecha_apertura?: string;
  monto_apertura?: number | string;
  punto_caja_nombre?: string | null;
};

type CierreResumen = {
  cantidad_ventas: number;
  total_vendido: number;
  total_efectivo: number;
  total_transferencia: number;
  total_tarjeta: number;
  monto_apertura: number;
  efectivo_esperado: number;
};

export type CajaState = {
  cajaChecked: boolean;
  cajaAbiertaId: string | null;
  cajasAbiertas: CajaAbierta[];
  cajaSeleccionadaId: string | null;
  setCajaSeleccionadaId: (id: string | null) => void;
  cajaEnUsoId: string | null;
  refrescar: () => Promise<void>;
};

/** Estado + refresco de caja. Nunca autoselecciona cuando hay >1 abierta. */
export function useCajaState(): CajaState {
  const [cajaChecked, setCajaChecked] = useState(false);
  const [cajaAbiertaId, setCajaAbiertaId] = useState<string | null>(null);
  const [cajasAbiertas, setCajasAbiertas] = useState<CajaAbierta[]>([]);
  const [cajaSeleccionadaId, setCajaSeleccionadaId] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const r = await fetchWithSupabaseSession("/api/caja/abierta", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const cajas = (j?.data?.cajas as CajaAbierta[] | undefined) ?? [];
      const c0 = cajas[0] ?? (j?.data?.caja as CajaAbierta | null | undefined) ?? null;
      setCajaAbiertaId(c0?.id ?? null);
      setCajasAbiertas(cajas);
      setCajaSeleccionadaId((prev) => {
        if (cajas.length === 1) return cajas[0].id;
        if (prev && cajas.some((c) => c.id === prev)) return prev;
        return null;
      });
    } catch { /* tolerar */ }
    finally { setCajaChecked(true); }
  }, []);

  useEffect(() => { void refrescar(); }, [refrescar]);

  const cajaEnUsoId = cajaSeleccionadaId
    ?? (cajasAbiertas.length === 1 ? cajasAbiertas[0].id : null);

  return {
    cajaChecked, cajaAbiertaId, cajasAbiertas, cajaSeleccionadaId,
    setCajaSeleccionadaId, cajaEnUsoId, refrescar,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Banner + modales
// ─────────────────────────────────────────────────────────────────────────
export function CajaControlBanner({ state }: { state: CajaState }) {
  const t = useT();
  const money = useMoney();

  const {
    cajaChecked, cajaAbiertaId, cajasAbiertas, cajaSeleccionadaId,
    setCajaSeleccionadaId, cajaEnUsoId, refrescar,
  } = state;

  // Info detallada de la caja seleccionada — solo para mostrar en el banner.
  const cajaInfo = useMemo(() => {
    const c = cajasAbiertas.find((x) => x.id === cajaEnUsoId);
    return c ?? null;
  }, [cajasAbiertas, cajaEnUsoId]);

  // Punto de caja (auto-primer para abrir cuando no hay caja).
  const [puntoCajaId, setPuntoCajaId] = useState<string | null>(null);
  const [puntoCajaNombre, setPuntoCajaNombre] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/puntos-caja", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const puntos = (j?.data?.puntos as { id: string; nombre?: string }[] | undefined) ?? [];
        setPuntoCajaId(puntos[0]?.id ?? null);
        setPuntoCajaNombre(puntos[0]?.nombre ?? null);
      } catch { /* tolerar */ }
    })();
  }, []);

  const [modal, setModal] = useState<null | "abrir" | "cerrar" | "mov">(null);

  // Apertura
  const [aperturaMonto, setAperturaMonto] = useState("");
  const [aperturaObs, setAperturaObs] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [aperturaError, setAperturaError] = useState<string | null>(null);
  // Prellenar monto de apertura con el último cierre (la plata que quedó
  // en la caja al cerrar el día anterior). Corre al abrir el modal.
  const [ultimoCierreInfo, setUltimoCierreInfo] = useState<{
    monto: number; fecha_cierre: string | null;
  } | null>(null);
  useEffect(() => {
    if (modal !== "abrir" || !puntoCajaId) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetchWithSupabaseSession(
          `/api/caja/ultimo-cierre?punto_caja_id=${encodeURIComponent(puntoCajaId)}`,
          { cache: "no-store" },
        );
        const j = await r.json().catch(() => ({}));
        if (cancel || !r.ok || j?.success === false) return;
        const monto = Number(j?.data?.monto ?? 0);
        const fechaCierre = j?.data?.fecha_cierre ?? null;
        setUltimoCierreInfo({ monto, fecha_cierre: fechaCierre });
        // Sólo prefill si el input está vacío — no pisar lo que la cajera
        // ya empezó a tipear si abre y cierra el modal.
        if (monto > 0) {
          setAperturaMonto((prev) => (prev === "" ? String(monto) : prev));
        }
      } catch { /* tolerar */ }
    })();
    return () => { cancel = true; };
  }, [modal, puntoCajaId]);

  async function abrirCaja() {
    setAperturaError(null);
    if (!puntoCajaId) {
      setAperturaError("No hay puntos de caja configurados en esta sucursal. Un administrador debe crear al menos uno.");
      return;
    }
    const monto = Number(aperturaMonto) || 0;
    if (monto < 0) { setAperturaError("El monto de apertura no puede ser negativo."); return; }
    setAbriendo(true);
    try {
      const r = await fetchWithSupabaseSession("/api/caja/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_apertura: monto,
          observacion: aperturaObs.trim() || null,
          punto_caja_id: puntoCajaId,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `No se pudo abrir la caja (${r.status}).`);
      setAperturaMonto(""); setAperturaObs("");
      setModal(null);
      await refrescar();
    } catch (e) {
      setAperturaError(e instanceof Error ? e.message : "Error al abrir la caja.");
    } finally { setAbriendo(false); }
  }

  // Cierre
  const [cierreContado, setCierreContado] = useState("");
  const [cierreObs, setCierreObs] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [cierreError, setCierreError] = useState<string | null>(null);
  const [cierreResumen, setCierreResumen] = useState<CierreResumen | null>(null);

  async function cargarResumenCierre() {
    if (!cajaEnUsoId) { setCierreResumen(null); return; }
    try {
      const r = await fetchWithSupabaseSession(`/api/caja/resumen?caja_id=${encodeURIComponent(cajaEnUsoId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const res = j?.data?.resumen;
      if (!res) { setCierreResumen(null); return; }
      setCierreResumen({
        cantidad_ventas: Number(res.cantidad_ventas ?? 0),
        total_vendido: Number(res.total_vendido ?? 0),
        total_efectivo: Number(res.total_efectivo ?? 0),
        total_transferencia: Number(res.total_transferencia ?? 0),
        total_tarjeta: Number(res.total_tarjeta ?? 0),
        monto_apertura: Number(res.caja?.monto_apertura ?? 0),
        efectivo_esperado: Number(res.efectivo_esperado ?? 0),
      });
    } catch { setCierreResumen(null); }
  }

  async function cerrarCaja() {
    setCierreError(null);
    if (!cajaEnUsoId) {
      setCierreError(cajasAbiertas.length > 1 ? "Elegí la caja a cerrar en el selector antes de continuar." : "No hay caja abierta.");
      return;
    }
    const contado = Number(cierreContado);
    if (!Number.isFinite(contado) || contado < 0) { setCierreError("Ingresá el efectivo contado (0 o más)."); return; }
    setCerrando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/caja/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caja_id: cajaEnUsoId,
          monto_cierre_contado: contado,
          observacion: cierreObs.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `No se pudo cerrar la caja (${r.status}).`);
      setCierreContado(""); setCierreObs("");
      setModal(null);
      await refrescar();
    } catch (e) {
      setCierreError(e instanceof Error ? e.message : "Error al cerrar la caja.");
    } finally { setCerrando(false); }
  }

  // Movimiento manual
  const [movTipo, setMovTipo] = useState<"ingreso" | "egreso" | "retiro" | "ajuste">("ingreso");
  const [movConcepto, setMovConcepto] = useState("");
  const [movMonto, setMovMonto] = useState("");
  const [movMedio, setMovMedio] = useState<"efectivo" | "tarjeta" | "transferencia" | "otro">("efectivo");
  const [movObs, setMovObs] = useState("");
  const [movEnviando, setMovEnviando] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);

  async function registrarMov() {
    setMovError(null);
    if (!cajaEnUsoId) { setMovError("Elegí una caja para registrar el movimiento."); return; }
    const monto = Number(movMonto);
    if (!movConcepto.trim()) { setMovError("El concepto es obligatorio."); return; }
    if (!Number.isFinite(monto) || monto === 0) { setMovError("Ingresá un monto distinto de 0."); return; }
    setMovEnviando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/caja/movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caja_id: cajaEnUsoId,
          tipo: movTipo,
          concepto: movConcepto.trim(),
          monto: Math.abs(monto),
          medio_pago: movMedio,
          observacion: movObs.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `No se pudo registrar el movimiento (${r.status}).`);
      setMovConcepto(""); setMovMonto(""); setMovObs("");
      setModal(null);
    } catch (e) {
      setMovError(e instanceof Error ? e.message : "Error al registrar movimiento.");
    } finally { setMovEnviando(false); }
  }

  if (!cajaChecked) return null;

  return (
    <>
      {cajaAbiertaId ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-900">
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-xs text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("CAJA ABIERTA")}
            </span>
            {cajasAbiertas.length > 1 ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                · Caja
                <select
                  value={cajaSeleccionadaId ?? ""}
                  onChange={(e) => setCajaSeleccionadaId(e.target.value || null)}
                  className="rounded border border-emerald-300 bg-white px-1 py-0.5 text-xs text-emerald-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  aria-label="Seleccionar caja abierta"
                >
                  <option value="">— Elegir —</option>
                  {cajasAbiertas.map((c) => (
                    <option key={c.id} value={c.id}>
                      N° {c.numero_caja ?? "?"}{c.punto_caja_nombre ? ` (${c.punto_caja_nombre})` : ""}
                    </option>
                  ))}
                </select>
              </span>
            ) : cajaInfo?.numero_caja ? (
              <span className="text-emerald-700">· N° {cajaInfo.numero_caja}</span>
            ) : null}
            {cajaInfo && (
              <span className="text-emerald-700">· {t("Monto inicial")} <strong>{money.format(Math.round(Number(cajaInfo.monto_apertura ?? 0)))}</strong></span>
            )}
            {cajaInfo?.fecha_apertura && (
              <span className="text-emerald-700/80 text-xs">
                · {t("desde")} {new Date(cajaInfo.fecha_apertura).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMovError(null); setModal("mov"); }}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
              {t("Movimiento")}
            </button>
            <button type="button" onClick={() => { setCierreError(null); setCierreResumen(null); setModal("cerrar"); void cargarResumenCierre(); }}
              className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-sm font-semibold">
              {t("Cerrar caja")}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-xs text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {t("CAJA CERRADA")}
            </span>
            <span className="ml-2 text-amber-800">{t("Abrí la caja para poder registrar atenciones.")}</span>
          </div>
          <button type="button" onClick={() => { setAperturaError(null); setModal("abrir"); }}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-4 py-1.5 text-sm font-semibold shadow-sm">
            {t("Abrir caja")}
          </button>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {modal === "abrir" && (
              <>
                <h3 className="text-base font-semibold text-slate-900">Abrir caja</h3>
                {puntoCajaNombre && <p className="mt-0.5 text-xs text-slate-500">Punto: <strong>{puntoCajaNombre}</strong></p>}
                {aperturaError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aperturaError}</div>}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{t("Monto inicial")} en efectivo ({money.symbol})</label>
                    <MontoInput value={aperturaMonto} onChange={(n) => setAperturaMonto(String(n))}
                      placeholder="Ej: 200.000" autoFocus decimals={false}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                    {ultimoCierreInfo && ultimoCierreInfo.monto > 0 && (
                      <p className="mt-1 text-[11px] text-emerald-700">
                        Prellenado con el efectivo del último cierre
                        {ultimoCierreInfo.fecha_cierre && (
                          <> ({new Date(ultimoCierreInfo.fecha_cierre).toLocaleDateString("es-PY")})</>
                        )}: <strong>{money.format(Math.round(ultimoCierreInfo.monto))}</strong>. Podés editarlo si contás distinto.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Observación (opcional)</label>
                    <input type="text" value={aperturaObs} onChange={(e) => setAperturaObs(e.target.value)}
                      placeholder="Ej: turno mañana"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </div>
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button type="button" onClick={() => setModal(null)} disabled={abriendo}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={abrirCaja} disabled={abriendo || !puntoCajaId}
                    className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 shadow-sm">
                    {abriendo ? "Abriendo…" : "Abrir caja"}
                  </button>
                </div>
              </>
            )}

            {modal === "cerrar" && (
              <div className="max-h-[85vh] overflow-y-auto pr-1">
                <h3 className="text-base font-semibold text-slate-900">Cerrar caja</h3>
                {cierreError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{cierreError}</div>}

                {cierreResumen ? (
                  <>
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Resumen de ventas del turno</p>
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
                        <ResumenRow label="Cantidad de ventas" value={String(cierreResumen.cantidad_ventas)} />
                        <ResumenRow label="Ventas en efectivo" value={fmtGs(cierreResumen.total_efectivo)} />
                        <ResumenRow label="Ventas por transferencia" value={fmtGs(cierreResumen.total_transferencia)} />
                        <ResumenRow label="Ventas con tarjeta" value={fmtGs(cierreResumen.total_tarjeta)} />
                        <ResumenRow label="Total vendido" value={fmtGs(cierreResumen.total_vendido)} bold />
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Cierre total del turno</p>
                      <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-sm">
                        <div className="flex justify-between text-slate-700"><span>Monto de apertura</span><span>{fmtGs(cierreResumen.monto_apertura)}</span></div>
                        <div className="flex justify-between text-slate-700 border-b border-sky-200 pb-2"><span>Total vendido</span><span>+ {fmtGs(cierreResumen.total_vendido)}</span></div>
                        <div className="flex justify-between items-baseline pt-2">
                          <span className="font-semibold text-sky-800">Cierre total esperado</span>
                          <span className="text-xl font-bold text-sky-900">{fmtGs(cierreResumen.monto_apertura + cierreResumen.total_vendido)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-slate-400 animate-pulse">Cargando resumen del turno…</p>
                )}

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Efectivo físico contado en caja ({money.symbol})</label>
                    <MontoInput value={cierreContado} onChange={(n) => setCierreContado(String(n))}
                      placeholder="Ej: 160.000" autoFocus decimals={false}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </div>
                  {cierreResumen && cierreContado !== "" && (() => {
                    const contado = Number(cierreContado) || 0;
                    const dif = contado - cierreResumen.efectivo_esperado;
                    return dif === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Cuadra: sin diferencia.</div>
                    ) : dif > 0 ? (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">Sobrante: <strong>{fmtGs(dif)}</strong></div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Faltante: <strong>{fmtGs(Math.abs(dif))}</strong></div>
                    );
                  })()}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Observación (opcional)</label>
                    <input type="text" value={cierreObs} onChange={(e) => setCierreObs(e.target.value)}
                      placeholder="Ej: cierre turno mañana"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </div>
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button type="button" onClick={() => setModal(null)} disabled={cerrando}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={cerrarCaja} disabled={cerrando || cierreContado === ""}
                    className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 shadow-sm">
                    {cerrando ? "Cerrando…" : "Confirmar cierre"}
                  </button>
                </div>
              </div>
            )}

            {modal === "mov" && (
              <>
                <h3 className="text-base font-semibold text-slate-900">Movimiento manual</h3>
                <p className="mt-0.5 text-xs text-slate-500">Ingreso/egreso de plata en la caja fuera de una venta (ej. pagar un delivery, retirar cambio).</p>
                {movError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{movError}</div>}
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["ingreso", "egreso", "retiro", "ajuste"] as const).map((tp) => (
                      <button key={tp} type="button" onClick={() => setMovTipo(tp)}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                          movTipo === tp
                            ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}>{tp}</button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Concepto *</label>
                    <input type="text" value={movConcepto} onChange={(e) => setMovConcepto(e.target.value)}
                      placeholder="Ej: pago delivery"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Monto ({money.symbol}) *</label>
                      <MontoInput value={movMonto} onChange={(n) => setMovMonto(String(n))}
                        placeholder="Ej: 20.000" decimals={false}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Método</label>
                      <select value={movMedio} onChange={(e) => setMovMedio(e.target.value as "efectivo"|"tarjeta"|"transferencia"|"otro")}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]">
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Observación (opcional)</label>
                    <input type="text" value={movObs} onChange={(e) => setMovObs(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
                  </div>
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button type="button" onClick={() => setModal(null)} disabled={movEnviando}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={registrarMov} disabled={movEnviando}
                    className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 shadow-sm">
                    {movEnviando ? "Registrando…" : "Registrar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
