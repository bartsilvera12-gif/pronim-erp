"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
          onRefresh={() => {
            setOk("Recepción ingresada al stock. Las prendas ya están disponibles para vender.");
            setTimeout(() => setOk(null), 6000);
            cargar();
          }}
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

type Franja = { id: string; nombre: string; precio_venta: number | string };

function PreviewIngresoModal({
  recepcionId,
  onClose,
  onConfirmar,
  onRefresh,
}: {
  recepcionId: string;
  onClose: () => void;
  onConfirmar: (clienteId: string) => void; // "cargar todo así nomás"
  onRefresh: () => void;
}) {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // asignacion[unidadKey] = producto_id de la franja elegida en la
  // columna derecha para esa unidad específica. Si no se toca, queda
  // sin asignar y no se incluye en el override — usa la original.
  const [asignacion, setAsignacion] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([
      fetchWithSupabaseSession(`/api/recepciones/${recepcionId}/preview`, { cache: "no-store" }).then(r => r.json()),
      fetchWithSupabaseSession("/api/franjas/publicas", { cache: "no-store" }).then(r => r.json()),
    ])
      .then(([jp, jf]) => {
        if (cancel) return;
        if (!jp?.success) throw new Error(jp?.error ?? "Error cargando preview");
        setData(jp.data as PreviewPayload);
        const fr = (jf?.data?.franjas as Franja[] | undefined) ?? [];
        setFranjas(fr.map(f => ({ ...f, precio_venta: Number(f.precio_venta) || 0 }))
                     .sort((a, b) => (a.precio_venta as number) - (b.precio_venta as number)));
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
          {err && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}
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

              {/* 2 paneles: IZQ prendas compradas (readonly, con su costo)
                  DER franja de venta a asignar por unidad (dropdown).
                  El margen se calcula en vivo cliente-side comparando el
                  costo prorrateado con el precio_venta de la franja elegida. */}
              {(() => {
                // Aplanar items en "unidades" para poder asignar franja individual.
                const unidades = data.items.flatMap((it) =>
                  Array.from({ length: it.cantidad }, (_, i) => ({
                    key: `${it.id}-${i}`,
                    item_id: it.id,
                    idx: i + 1,
                    cantidad_total: it.cantidad,
                    producto_original_id: it.producto_id,
                    producto_original_nombre: it.producto_nombre,
                    tipo_nombre: it.tipo_nombre,
                    costo_unit: it.costo_unit,
                    venta_original: it.venta_unit,
                  }))
                );
                // Precio de venta actual por unidad (edición o valor original)
                const precioVentaDe = (u: typeof unidades[number]): number => {
                  const franjaId = asignacion[u.key];
                  if (franjaId) {
                    const f = franjas.find(f => f.id === franjaId);
                    if (f) return Number(f.precio_venta);
                  }
                  return u.venta_original;
                };
                const asignadas = unidades.filter(u => asignacion[u.key]).length;
                // Totales en vivo
                const totalCosto = unidades.reduce((s, u) => s + u.costo_unit, 0);
                const totalVenta = unidades.reduce((s, u) => s + precioVentaDe(u), 0);
                const totalMargen = totalVenta - totalCosto;
                const totalMargenPct = totalVenta > 0 ? Math.round((totalMargen / totalVenta) * 1000) / 10 : null;

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* PANEL IZQUIERDO — Lo que compraste */}
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
                          <h5 className="text-xs font-bold uppercase text-slate-600">
                            Prendas compradas
                          </h5>
                          <p className="text-[10px] text-slate-500">Costo prorrateado por unidad</p>
                        </div>
                        <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                          {unidades.map((u, i) => (
                            <li key={u.key} className="flex items-center gap-2 px-3 py-2.5">
                              <span className="w-6 text-[10px] tabular-nums text-slate-400">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">
                                  {u.producto_original_nombre}
                                  {u.cantidad_total > 1 && (
                                    <span className="ml-1 text-[10px] text-slate-400">({u.idx}/{u.cantidad_total})</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">{u.tipo_nombre ?? "sin tipo"}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-bold text-slate-800 tabular-nums">
                                  Gs. {u.costo_unit.toLocaleString("es-PY")}
                                </div>
                                <div className="text-[10px] text-slate-500">costo</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* PANEL DERECHO — Cargar franja de venta */}
                      <div className="rounded-xl border-2 border-emerald-200 overflow-hidden">
                        <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200 flex items-center justify-between">
                          <div>
                            <h5 className="text-xs font-bold uppercase text-emerald-800">
                              Asignar precio de venta
                            </h5>
                            <p className="text-[10px] text-emerald-700">
                              Elegí una franja por cada prenda; el margen se calcula en vivo
                            </p>
                          </div>
                          <span className="text-xs font-bold text-emerald-800 tabular-nums shrink-0">
                            {asignadas}/{unidades.length}
                          </span>
                        </div>
                        <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                          {unidades.map((u, i) => {
                            const asignada = Boolean(asignacion[u.key]);
                            const precioVenta = precioVentaDe(u);
                            const margen = precioVenta - u.costo_unit;
                            return (
                              <li key={u.key} className={`flex items-center gap-2 px-3 py-2.5 ${asignada ? "bg-emerald-50/50" : ""}`}>
                                <span className="w-6 text-[10px] tabular-nums text-slate-400">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <FranjaCombobox
                                    franjas={franjas}
                                    value={asignacion[u.key] ?? ""}
                                    costoUnit={u.costo_unit}
                                    onChange={(v) => setAsignacion(prev => {
                                      const next = { ...prev };
                                      if (v) next[u.key] = v;
                                      else delete next[u.key];
                                      return next;
                                    })}
                                  />
                                </div>
                                <div className={`text-right shrink-0 w-24 text-xs font-bold tabular-nums ${
                                  margen >= 0 ? "text-emerald-700" : "text-rose-700"
                                }`}>
                                  {margen >= 0 ? "+" : ""}Gs. {margen.toLocaleString("es-PY")}
                                  <div className="text-[10px] font-normal opacity-70">
                                    {precioVenta > 0 ? Math.round((margen / precioVenta) * 100) : 0}%
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>

                    {/* Totales en vivo — cambia al asignar franjas */}
                    <div className={`mt-4 rounded-xl border-2 p-4 ${
                      totalMargen >= 0
                        ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-slate-50"
                        : "border-rose-300 bg-gradient-to-br from-rose-50 to-slate-50"
                    }`}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MarginStat label="Costo total" value={"Gs. " + Math.round(totalCosto).toLocaleString("es-PY")} />
                        <MarginStat label="Venta esperada" value={"Gs. " + Math.round(totalVenta).toLocaleString("es-PY")} valueClass="text-sky-800" />
                        <MarginStat
                          label="Margen bruto"
                          value={"Gs. " + Math.round(totalMargen).toLocaleString("es-PY")}
                          valueClass={totalMargen >= 0 ? "text-emerald-800" : "text-rose-800"}
                          sub={totalMargen >= 0 ? "✓ Estás ganando" : "⚠ Estás perdiendo"}
                        />
                        <MarginStat
                          label="Margen %"
                          value={totalMargenPct != null ? `${totalMargenPct}%` : "—"}
                          valueClass={totalMargenPct != null && totalMargenPct >= 0 ? "text-emerald-800" : "text-rose-800"}
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] text-slate-500">
                      Elegí la franja de venta prenda por prenda para asignar el precio real
                      de cada una. Si dejás "franja original", se usa el precio con el que
                      se cargó al recibir. Al confirmar se ingresan al stock con los precios
                      aquí seleccionados.
                    </p>

                    {/* Footer con dos acciones */}
                    <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          if (!data) return;
                          setConfirmando(true);
                          onConfirmar(data.recepcion.cliente_id);
                        }}
                        disabled={!data || confirmando || loading}
                        className="text-xs text-slate-600 hover:text-slate-900 underline"
                      >
                        Cargar todo así nomás (sin cambiar franjas)
                      </button>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={onClose}
                          disabled={confirmando}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >Cancelar</button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!data) return;
                            setConfirmando(true);
                            setErr(null);
                            try {
                              const overrides = Object.entries(asignacion).map(([key, producto_id]) => {
                                const u = unidades.find(x => x.key === key);
                                return u ? { item_id: u.item_id, producto_id } : null;
                              }).filter(Boolean);
                              const rr = await fetchWithSupabaseSession(
                                `/api/recepciones/${recepcionId}/ingresar-con-overrides`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ overrides }),
                                },
                              );
                              const j = await rr.json().catch(() => ({}));
                              if (!rr.ok || j?.success === false) throw new Error(j?.error ?? `Error ${rr.status}`);
                              onClose();
                              onRefresh();
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : "Error al ingresar.");
                              setConfirmando(false);
                            }
                          }}
                          disabled={!data || confirmando || loading}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold px-6 py-2.5 shadow-sm"
                        >
                          {confirmando ? "Ingresando…" : "Ingresar con estos precios"}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}
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

// ─────────────────────────────────────────────────────────────────────
// Combobox estilizado con buscador para elegir franja de precio.
// Al abrir, autofocus en el input; tipear filtra (número o nombre).
// Enter selecciona la primera opción visible; Escape cierra.
// ─────────────────────────────────────────────────────────────────────

function FranjaCombobox({
  franjas, value, costoUnit, onChange,
}: {
  franjas: Franja[];
  value: string;
  costoUnit: number;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Popover posicionado como `fixed` porque el <ul> padre en el modal
  // tiene overflow-y-auto y clipeaba el desplegable adentro. Guardamos
  // top/left/width calculados desde el bounding rect del trigger.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const recalcPos = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
  };

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Recalcular posición si el layout cambia (scroll interno del modal,
  // resize, o simplemente al abrir).
  useEffect(() => {
    if (!open) return;
    recalcPos();
    const onWinChange = () => recalcPos();
    window.addEventListener("resize", onWinChange);
    window.addEventListener("scroll", onWinChange, true);
    return () => {
      window.removeEventListener("resize", onWinChange);
      window.removeEventListener("scroll", onWinChange, true);
    };
  }, [open]);

  // Autofocus del input cuando abre.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQ("");
  }, [open]);

  const cleanName = (n: string) => n.replace(/^Prenda\s*-\s*Categor[ií]a\s*/i, "").trim();
  const filtradas = franjas
    .filter(f => {
      if (!q.trim()) return true;
      const term = q.replace(/\D/g, "");
      const nombre = cleanName(f.nombre).toLowerCase();
      const precio = String(Number(f.precio_venta));
      return (term && precio.includes(term))
        || nombre.includes(q.toLowerCase());
    });

  const selectedFranja = franjas.find(f => f.id === value);
  const seleccionar = (id: string) => {
    onChange(id);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger — se ve como una tarjeta pill */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
          selectedFranja
            ? "border-emerald-400 bg-white shadow-sm hover:border-emerald-500"
            : "border-slate-300 bg-white hover:border-emerald-300"
        }`}
      >
        <span className={`truncate ${selectedFranja ? "text-slate-900 font-semibold" : "text-slate-400"}`}>
          {selectedFranja
            ? `Gs. ${Number(selectedFranja.precio_venta).toLocaleString("es-PY")}`
            : "Elegí franja…"}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.4a.75.75 0 0 1-1.08 0l-4.25-4.4a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Popover: buscador + lista. `fixed` para escapar del overflow del
          <ul> padre del modal. */}
      {open && pos && (
        <div
          ref={popRef}
          className="fixed z-[70] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtradas.length > 0) seleccionar(filtradas[0].id);
                }
              }}
              placeholder="Buscar (ej: 44)…"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => seleccionar("")}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-slate-500 hover:bg-slate-50 italic"
                >
                  — usar franja original —
                </button>
              </li>
            )}
            {filtradas.length === 0 ? (
              <li className="px-3 py-4 text-center text-[11px] text-slate-400">Sin franjas que coincidan.</li>
            ) : (
              filtradas.map(f => {
                const precio = Number(f.precio_venta);
                const margenPrev = precio - costoUnit;
                const esSel = f.id === value;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => seleccionar(f.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left transition ${
                        esSel ? "bg-emerald-100 text-emerald-900"
                              : "text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-semibold text-sm tabular-nums">
                        Gs. {precio.toLocaleString("es-PY")}
                      </span>
                      <span className={`text-[10px] font-semibold tabular-nums ${
                        margenPrev >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {margenPrev >= 0 ? "+" : ""}{margenPrev.toLocaleString("es-PY")}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
