"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Recepcion = {
  id: string;
  numero_control: string | null;
  cliente_id: string;
  fecha: string;
  total_compra: number | string;
  total_credito: number | string;
  observaciones: string | null;
  sucursal_id: string | null;
  ingresada_at: string | null;
  estado: string;
  usuario_nombre: string | null;
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
function fmtFechaHora(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return iso; }
}
function horasDesde(iso: string): number {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / (1000 * 60 * 60));
  } catch { return 0; }
}

export default function PendientesIngresoPage() {
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ingresandoId, setIngresandoId] = useState<string | null>(null);
  // Modal de preview antes de ingresar: muestra items + margen estimado.
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function cargar() {
    setError(null); setCargando(true);
    try {
      const res = await fetchWithSupabaseSession("/api/recepciones/pendientes", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.success === false) throw new Error(j?.error ?? `Error ${res.status}`);
      setRecepciones((j?.data?.recepciones ?? []) as Recepcion[]);
      setClientes((j?.data?.clientes ?? {}) as Record<string, string>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las pendientes.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function ingresar(r: Recepcion) {
    setIngresandoId(r.id);
    try {
      const rr = await fetchWithSupabaseSession(
        `/api/clientes/${r.cliente_id}/recepciones/${r.id}/ingresar`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const j = await rr.json().catch(() => ({}));
      if (!rr.ok || j?.success === false) throw new Error(j?.error ?? `Error ${rr.status}`);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ingresar la recepción.");
    } finally {
      setIngresandoId(null);
    }
  }

  const vencidas = recepciones.filter((r) => horasDesde(r.fecha) > 72);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recepciones pendientes de ingreso</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Mercadería que recibiste pero todavía no fue ingresada al stock. Ingresá a medida que la vayas catalogando.
          </p>
        </div>
        <Link
          href="/atencion/nueva"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Volver a Caja
        </Link>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✓ {ok}</div>}

      {vencidas.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Hay <strong>{vencidas.length}</strong> recepción(es) con más de 72 horas sin ingresar al stock. Priorizá esas.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 overflow-x-auto">
        {cargando ? (
          <p className="py-16 text-center text-sm text-gray-400 animate-pulse">Cargando…</p>
        ) : recepciones.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">No hay recepciones pendientes de ingreso.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">N° control</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Total compra</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Antigüedad</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recepciones.map((r) => {
                const horas = horasDesde(r.fecha);
                const vencida = horas > 72;
                return (
                  <tr key={r.id} className={vencida ? "bg-amber-50/50" : ""}>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtFechaHora(r.fecha)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${r.cliente_id}`} className="font-medium text-slate-800 hover:underline">
                        {clientes[r.cliente_id] ?? "Cliente"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.numero_control ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtGs(Number(r.total_compra) || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        vencida
                          ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      }`}>
                        {horas < 1 ? "reciente" : horas < 24 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} día(s)`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPreviewId(r.id)}
                        disabled={ingresandoId === r.id}
                        className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
                      >
                        {ingresandoId === r.id ? "Ingresando…" : "Ver margen e ingresar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de preview con margen esperado */}
      {previewId && (
        <PreviewIngresoModal
          recepcionId={previewId}
          onClose={() => setPreviewId(null)}
          onConfirmar={async (cliId) => {
            const idQueSeIngresa = previewId;
            setIngresandoId(idQueSeIngresa);
            setPreviewId(null);
            setError(null); setOk(null);
            try {
              const rr = await fetchWithSupabaseSession(
                `/api/clientes/${cliId}/recepciones/${idQueSeIngresa}/ingresar`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
              );
              const j = await rr.json().catch(() => ({}));
              if (!rr.ok || j?.success === false) throw new Error(j?.error ?? `Error ${rr.status}`);
              setOk("Recepción ingresada al stock. Las prendas ya están disponibles para vender.");
              setTimeout(() => setOk(null), 6000);
              cargar();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo ingresar la recepción.");
            } finally {
              setIngresandoId(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal: preview del ingreso al stock con cálculo de MARGEN esperado.
// ─────────────────────────────────────────────────────────────────────

type PreviewItem = {
  id: string; producto_id: string; producto_nombre: string; sku: string | null;
  tipo_nombre: string | null; cantidad: number;
  costo_unit: number; venta_unit: number;
  margen_unit: number; margen_pct: number | null;
  costo_total: number; venta_total: number; margen_total: number;
};

type PreviewPayload = {
  recepcion: {
    id: string; numero_control: string; fecha: string; estado: string;
    cliente_id: string; cliente_nombre: string;
    sucursal_id: string; sucursal_nombre: string;
    total_final: number | null; ajuste_evaluacion: number;
  };
  items: PreviewItem[];
  totales: {
    prendas: number; costo_total: number;
    venta_total_esperada: number; margen_bruto_esperado: number;
    margen_pct_esperado: number | null;
  };
};

function PreviewIngresoModal({
  recepcionId,
  onClose,
  onConfirmar,
}: {
  recepcionId: string;
  onClose: () => void;
  onConfirmar: (clienteId: string) => void;
}) {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchWithSupabaseSession(`/api/recepciones/${recepcionId}/preview`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setData(j.data as PreviewPayload);
      })
      .catch(e => setErr(e instanceof Error ? e.message : "Error"))
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [recepcionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">Revisar antes de ingresar al stock</h3>
            {data && (
              <p className="text-xs text-slate-500 mt-0.5">
                {data.recepcion.numero_control} · {data.recepcion.cliente_nombre} · {data.recepcion.sucursal_nombre}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-auto flex-1 p-5">
          {loading && !data && <p className="py-8 text-center text-sm text-slate-400">Cargando detalle…</p>}
          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}
          {data && (
            <>
              {/* Bloque destacado: margen esperado */}
              <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-slate-50 p-4 mb-4">
                <h4 className="text-xs uppercase font-bold text-emerald-800 mb-3">
                  Margen de ganancia estimado si se vende TODO al precio de la franja
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MarginStat label="Prendas" value={data.totales.prendas.toLocaleString("es-PY")} />
                  <MarginStat
                    label="Costo (evaluación)"
                    value={"Gs. " + data.totales.costo_total.toLocaleString("es-PY")}
                    valueClass="text-slate-800"
                  />
                  <MarginStat
                    label="Venta esperada"
                    value={"Gs. " + data.totales.venta_total_esperada.toLocaleString("es-PY")}
                    valueClass="text-sky-800"
                  />
                  <MarginStat
                    label="Margen bruto"
                    value={"Gs. " + data.totales.margen_bruto_esperado.toLocaleString("es-PY")}
                    valueClass={data.totales.margen_bruto_esperado >= 0 ? "text-emerald-800" : "text-rose-800"}
                    sub={data.totales.margen_pct_esperado != null ? `${data.totales.margen_pct_esperado}% margen` : "—"}
                  />
                </div>
                {data.recepcion.ajuste_evaluacion !== 0 && (
                  <p className="mt-3 text-[11px] text-slate-500">
                    Nota: la evaluación tuvo un ajuste manual de{" "}
                    <strong className={data.recepcion.ajuste_evaluacion > 0 ? "text-emerald-700" : "text-rose-700"}>
                      {data.recepcion.ajuste_evaluacion > 0 ? "+" : ""}Gs. {data.recepcion.ajuste_evaluacion.toLocaleString("es-PY")}
                    </strong>.
                  </p>
                )}
              </div>

              {/* Lista simple: por cada prenda, precio de compra vs precio
                  de venta lado a lado, y el margen calculado. No hay
                  checklist ni edición — la evaluación ya se hizo y ahora
                  solo revisamos que el margen cierre antes de mandar al
                  inventario. */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center bg-slate-50 px-4 py-2 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <span>Prenda</span>
                  <span className="w-24 text-right">Compra</span>
                  <span className="w-24 text-right">Venta</span>
                  <span className="w-24 text-right">Margen</span>
                </div>
                <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                  {data.items.flatMap((it) =>
                    Array.from({ length: it.cantidad }, (_, i) => (
                      <li
                        key={`${it.id}-${i}`}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-2.5 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {it.producto_nombre}
                            {it.cantidad > 1 && (
                              <span className="ml-1.5 text-[10px] text-slate-400">({i + 1}/{it.cantidad})</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {it.tipo_nombre ?? "sin tipo"}
                          </div>
                        </div>
                        <div className="w-24 text-right text-sm text-slate-700 tabular-nums">
                          Gs. {it.costo_unit.toLocaleString("es-PY")}
                        </div>
                        <div className="w-24 text-right text-sm text-sky-700 font-medium tabular-nums">
                          Gs. {it.venta_unit.toLocaleString("es-PY")}
                        </div>
                        <div
                          className={`w-24 text-right text-sm font-bold tabular-nums ${
                            it.margen_unit >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {it.margen_unit >= 0 ? "+" : ""}Gs. {it.margen_unit.toLocaleString("es-PY")}
                          {it.margen_pct != null && (
                            <div className="text-[10px] font-normal opacity-70">{it.margen_pct}%</div>
                          )}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <p className="mt-3 text-[11px] text-slate-500">
                El precio de compra es lo que efectivamente le pagaste al cliente por cada prenda
                (prorrateado desde el total evaluado). El precio de venta es el de la franja al
                momento de la recepción. Para editarlo, actualizá la franja en el catálogo.
              </p>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={confirmando}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button
            type="button"
            onClick={() => {
              if (!data) return;
              setConfirmando(true);
              onConfirmar(data.recepcion.cliente_id);
            }}
            disabled={!data || confirmando || loading}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 shadow-sm"
          >
            {confirmando ? "Ingresando…" : "Ingresar al stock"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarginStat({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${valueClass ?? "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
