"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fmtActive } from "@/lib/i18n/currency";
import { getEntidadesBancarias, type EntidadBancaria } from "@/lib/entidades/storage";

type PagoActual = {
  id: string;
  metodo_pago: string;
  monto: number;
  entidad_bancaria_id: string | null;
  entidad_nombre_snapshot: string | null;
  caja_id: string | null;
};

type FilaEditable = {
  key: string;
  metodo: string;
  monto: number;
  entidad_bancaria_id: string | null;
};

const ETIQUETA: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito",
};

let FILA_SEQ = 0;
const nextKey = () => `n${++FILA_SEQ}`;

/**
 * Redistribuye los medios de pago de una evaluación (recepción) ya
 * registrada. Pensado para el caso administrativo: el total NO cambia,
 * pero se puede mover plata entre medios (ej. "300k efectivo + 300k crédito
 * → 600k efectivo") y editar monto por fila.
 *
 * Acepta efectivo, transferencia y crédito. Si una fila crédito se saca,
 * el backend revierte la ENTRADA con una SALIDA compensatoria y bloquea
 * si ese crédito ya fue consumido en una venta posterior. El motivo es
 * obligatorio y queda en la bitácora del cliente.
 */
export default function CambiarPagosRecepcionModal({
  recepcionId,
  numeroControl,
  onClose,
  onDone,
}: {
  recepcionId: string;
  numeroControl?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const url = `/api/recepciones/${recepcionId}/pagos`;
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [totalFinal, setTotalFinal] = useState(0);
  const [metodosPermitidos, setMetodosPermitidos] = useState<string[]>([
    "efectivo",
    "transferencia",
    "credito",
  ]);
  const [filas, setFilas] = useState<FilaEditable[]>([]);
  const [motivo, setMotivo] = useState("");
  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    Promise.all([
      fetchWithSupabaseSession(url, { cache: "no-store" }).then((r) => r.json()),
      getEntidadesBancarias().catch(() => [] as EntidadBancaria[]),
    ])
      .then(([j, ents]) => {
        if (cancel) return;
        if (j?.success === false) throw new Error(j?.error ?? "No se pudieron cargar los pagos.");
        const pagos = (j?.data?.pagos as PagoActual[]) ?? [];
        setTotalFinal(Number(j?.data?.total_final ?? 0));
        const permitidos = (j?.data?.metodos_permitidos as string[]) ?? [
          "efectivo",
          "transferencia",
          "credito",
        ];
        setMetodosPermitidos(permitidos);
        setFilas(
          pagos.map((p) => ({
            key: nextKey(),
            metodo: p.metodo_pago,
            monto: p.monto,
            entidad_bancaria_id: p.entidad_bancaria_id,
          })),
        );
        setEntidades(ents);
      })
      .catch((e) => {
        if (!cancel) setError(e instanceof Error ? e.message : "No se pudieron cargar los pagos.");
      })
      .finally(() => {
        if (!cancel) setCargando(false);
      });
    return () => {
      cancel = true;
    };
  }, [url]);

  const suma = useMemo(
    () => filas.reduce((acc, f) => acc + (Number(f.monto) || 0), 0),
    [filas],
  );
  const diferencia = suma - totalFinal;
  const totalOk = Math.abs(diferencia) < 0.5;

  function agregarFila() {
    const usados = new Set(filas.map((f) => f.metodo));
    const metodoDefault =
      metodosPermitidos.find((m) => !usados.has(m)) ?? metodosPermitidos[0] ?? "efectivo";
    const faltante = Math.max(0, totalFinal - suma);
    setFilas((prev) => [
      ...prev,
      { key: nextKey(), metodo: metodoDefault, monto: faltante, entidad_bancaria_id: null },
    ]);
  }

  function actualizarFila(key: string, patch: Partial<FilaEditable>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function eliminarFila(key: string) {
    setFilas((prev) => prev.filter((f) => f.key !== key));
  }

  const motivoOk = motivo.trim().length > 0;
  const filasOk =
    filas.length > 0 &&
    filas.every(
      (f) => f.monto > 0 && (f.metodo !== "transferencia" || !!f.entidad_bancaria_id),
    );
  const puedeGuardar = !cargando && !guardando && totalOk && motivoOk && filasOk;

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const r = await fetchWithSupabaseSession(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagos_nuevos: filas.map((f) => ({
            metodo: f.metodo,
            monto: Math.round(f.monto),
            entidad_bancaria_id:
              f.metodo === "transferencia" ? f.entidad_bancaria_id : null,
          })),
          motivo: motivo.trim(),
        }),
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
  const entidadesBanco = entidades.filter((e) => e.activo && e.tipo === "banco");
  const titulo = numeroControl
    ? `Cambiar forma de pago de la evaluación ${numeroControl}`
    : "Cambiar forma de pago de la evaluación";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">{titulo}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Redistribuí los medios de pago. La suma tiene que seguir siendo el total de la evaluación
          (<span className="font-semibold tabular-nums">{fmtActive(totalFinal)}</span>). El stock y el cliente no se tocan.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-4 space-y-2">
          {cargando && <p className="text-sm text-slate-400">Cargando pagos…</p>}
          {!cargando && filas.length === 0 && !error && (
            <p className="text-sm text-slate-400">
              Esta evaluación no tiene pagos registrados (histórico importado): no hay nada para redistribuir.
            </p>
          )}
          {!cargando &&
            filas.map((f) => (
              <div
                key={f.key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-slate-200 p-2"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={f.metodo}
                    onChange={(e) =>
                      actualizarFila(f.key, {
                        metodo: e.target.value,
                        entidad_bancaria_id:
                          e.target.value === "transferencia" ? f.entidad_bancaria_id : null,
                      })
                    }
                    className={inputCls}
                    aria-label="Método de pago"
                  >
                    {metodosPermitidos.map((m) => (
                      <option key={m} value={m}>
                        {ETIQUETA[m] ?? m}
                      </option>
                    ))}
                  </select>
                  {f.metodo === "transferencia" ? (
                    <select
                      value={f.entidad_bancaria_id ?? ""}
                      onChange={(e) =>
                        actualizarFila(f.key, { entidad_bancaria_id: e.target.value || null })
                      }
                      className={inputCls}
                      aria-label="Banco"
                    >
                      <option value="">— Elegí banco —</option>
                      {entidadesBanco.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="self-center pl-1 text-xs text-slate-400">
                      {f.metodo === "credito"
                        ? "Genera saldo a favor del cliente"
                        : "Va a caja abierta"}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Number.isFinite(f.monto) ? f.monto : 0}
                  onChange={(e) =>
                    actualizarFila(f.key, {
                      monto: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={`${inputCls} w-32 text-right tabular-nums`}
                  aria-label="Monto"
                />
                <button
                  type="button"
                  onClick={() => eliminarFila(f.key)}
                  className="text-sm text-rose-500 hover:text-rose-700"
                  aria-label="Quitar pago"
                  title="Quitar pago"
                >
                  ✕
                </button>
              </div>
            ))}
          {!cargando && filas.length > 0 && (
            <button
              type="button"
              onClick={agregarFila}
              className="mt-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-[#4FAEB2] hover:text-[#4FAEB2]"
            >
              + Agregar pago
            </button>
          )}
        </div>

        {!cargando && filas.length > 0 && (
          <div
            className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
              totalOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <span>Suma actual</span>
            <span className="font-semibold tabular-nums">
              {fmtActive(suma)}
              {!totalOk && (
                <span className="ml-2 text-xs">
                  ({diferencia > 0 ? "sobra " : "falta "}
                  {fmtActive(Math.abs(diferencia))})
                </span>
              )}
            </span>
          </div>
        )}

        <label className="mt-4 mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Motivo <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: error al cargar / renegociación con cliente"
          rows={2}
          className={`w-full ${inputCls}`}
        />
        {!motivoOk && (
          <p className="mt-1 text-xs text-slate-400">El motivo queda en la bitácora del cliente.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar forma de pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
