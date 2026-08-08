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

  // Crea (o reactiva) una franja con un precio manual escrito en el input
  // del combobox. Devuelve el id para que el combobox lo seleccione.
  async function crearFranjaManual(precio: number): Promise<string | null> {
    if (!Number.isFinite(precio) || precio <= 0) return null;
    // Si ya existe una franja con ese precio, reutilizarla sin pegarle al server.
    const existente = franjas.find((f) => Number(f.precio_venta) === precio);
    if (existente) return existente.id;
    try {
      const rr = await fetchWithSupabaseSession("/api/franjas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio_venta: precio }),
      });
      const j = await rr.json().catch(() => ({}));
      if (!rr.ok || j?.success === false) {
        setErr(j?.error ?? "No se pudo crear la franja con ese precio.");
        return null;
      }
      const nueva = j?.data?.franja as { id: string; precio_venta: number; nombre: string } | undefined;
      if (!nueva?.id) return null;
      setFranjas((prev) => {
        if (prev.some((f) => f.id === nueva.id)) return prev;
        return [...prev, { id: nueva.id, nombre: nueva.nombre, precio_venta: Number(nueva.precio_venta) || precio }]
          .sort((a, b) => (Number(a.precio_venta) || 0) - (Number(b.precio_venta) || 0));
      });
      return nueva.id;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error creando franja.");
      return null;
    }
  }
  // splits[item_id] = lista de tramos { franjaId, cantidad } en los que
  // se reparte la cantidad total del item entre distintas franjas de
  // venta. Si el item no tiene entrada o su lista está vacía, no se
  // envía override — se usa la franja original.
  type Split = { franjaId: string; cantidad: number };
  const [splits, setSplits] = useState<Record<string, Split[]>>({});

  // Fase 2 tanda 18: bucket libre "cuántas prendas de cada franja"
  // independiente de los items originales. El operador clickea la franja
  // y se le suma cantMult. Al confirmar, distribuimos las cantidades del
  // bucket sobre los items en orden (el costo prorrateado es el mismo).
  type BucketItem = { franjaId: string; cantidad: number };
  const [bucket, setBucket] = useState<BucketItem[]>([]);
  const [cantMult, setCantMult] = useState<string>("1");
  const cantN = Math.max(1, Math.floor(Number(cantMult) || 1));

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
      <div className="w-full max-w-6xl max-h-[95vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
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
                    label="Ganancia bruta"
                    value={"Gs. " + data.totales.margen_bruto_esperado.toLocaleString("es-PY")}
                    valueClass={data.totales.margen_bruto_esperado >= 0 ? "text-emerald-800" : "text-rose-800"}
                    sub={data.totales.costo_total > 0
                      ? `${Math.round((data.totales.margen_bruto_esperado / data.totales.costo_total) * 1000) / 10}% markup`
                      : "—"}
                  />
                </div>
              </div>

              {/* 2 paneles: IZQ prendas compradas (readonly, con su costo)
                  DER franja de venta a asignar por unidad (dropdown).
                  El margen se calcula en vivo cliente-side comparando el
                  costo prorrateado con el precio_venta de la franja elegida. */}
              {(() => {
                // Trabajamos AGRUPADO por item: cada item de la recepción
                // tiene cantidad>=1 y un costo_unit fijo. El usuario puede
                // repartir esa cantidad entre varias franjas (splits). Si
                // no se toca, se usa la franja original (venta_unit).
                const getSplits = (id: string): Split[] => splits[id] ?? [];
                const sumSplits = (id: string): number => getSplits(id).reduce((a, s) => a + (s.cantidad || 0), 0);
                const totalUnidades = data.items.reduce((s, it) => s + it.cantidad, 0);
                const unidadesAsignadas = data.items.reduce((s, it) => {
                  const sp = getSplits(it.id);
                  if (sp.length === 0) return s;
                  return s + sp.filter((x) => x.franjaId).reduce((a, x) => a + (x.cantidad || 0), 0);
                }, 0);

                // Venta esperada por item — si tiene splits válidos, prorratear
                // por franja elegida; caso contrario usar venta_unit original.
                const ventaEsperadaItem = (it: PreviewItem): number => {
                  const sp = getSplits(it.id);
                  if (sp.length === 0) return it.venta_unit * it.cantidad;
                  let total = 0;
                  let cantOtras = 0;
                  for (const s of sp) {
                    const f = franjas.find((f) => f.id === s.franjaId);
                    if (f && s.cantidad > 0) {
                      total += Number(f.precio_venta) * s.cantidad;
                      cantOtras += s.cantidad;
                    }
                  }
                  // Las unidades del item aún sin franja asignada valen al
                  // precio original (venta_unit), así el estimado no se cae
                  // a cero mientras se está editando.
                  const cantSinAsignar = Math.max(0, it.cantidad - cantOtras);
                  return total + cantSinAsignar * it.venta_unit;
                };
                const totalCosto = data.items.reduce((s, it) => s + it.costo_total, 0);
                const totalVenta = data.items.reduce((s, it) => s + ventaEsperadaItem(it), 0);
                const totalMargen = totalVenta - totalCosto;
                const totalMarkupPct = totalCosto > 0 ? Math.round((totalMargen / totalCosto) * 1000) / 10 : null;
                const ventaPrevistaOriginal = data.totales.venta_total_esperada;
                const deltaVsPrevisto = totalVenta - ventaPrevistaOriginal;

                // Costo unitario promedio para el margen preview de "Aplicar a todas"
                const costoUnitPromedio =
                  totalUnidades > 0 ? Math.round(totalCosto / totalUnidades) : 0;

                // Aplica una única franja a la totalidad de cada item
                const aplicarATodas = (franjaId: string) => {
                  setSplits((prev) => {
                    if (!franjaId) return {};
                    const next: Record<string, Split[]> = {};
                    for (const it of data.items) {
                      next[it.id] = [{ franjaId, cantidad: it.cantidad }];
                    }
                    return next;
                  });
                };

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* PANEL IZQUIERDO — Lo que compraste (agrupado por item) */}
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
                          <h5 className="text-xs font-bold uppercase text-slate-600">
                            Prendas compradas
                          </h5>
                          <p className="text-[10px] text-slate-500">Agrupadas por item · costo unitario prorrateado</p>
                        </div>
                        <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                          {data.items.map((it, i) => (
                            <li key={it.id} className="flex items-center gap-2 px-3 py-2.5">
                              <span className="w-6 text-[10px] tabular-nums text-slate-400">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">
                                  <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 mr-1.5 align-middle">
                                    {it.cantidad}×
                                  </span>
                                  {it.producto_nombre}
                                </div>
                                <div className="text-[11px] text-slate-500">{it.tipo_nombre ?? "sin tipo"}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-bold text-slate-800 tabular-nums">
                                  Gs. {it.costo_unit.toLocaleString("es-PY")}
                                </div>
                                <div className="text-[10px] text-slate-500">c/u · total Gs. {it.costo_total.toLocaleString("es-PY")}</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* PANEL DERECHO — Grid libre de franjas (click = +N) */}
                      <div className="rounded-xl border-2 border-emerald-200 overflow-hidden">
                        <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200 flex items-center justify-between">
                          <div>
                            <h5 className="text-xs font-bold uppercase text-emerald-800">
                              Asignar precio de venta
                            </h5>
                            <p className="text-[10px] text-emerald-700">
                              Clickeá las franjas para armar el ingreso (ej: 5 de 99mil + 4 de 84mil)
                            </p>
                          </div>
                          <span className="text-xs font-bold text-emerald-800 tabular-nums shrink-0">
                            {bucket.reduce((s, b) => s + b.cantidad, 0)}/{totalUnidades}
                          </span>
                        </div>
                        {/* Cantidad por click */}
                        <div className="px-3 py-2 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-2 text-xs">
                          <label className="font-semibold text-emerald-800">Cantidad por click</label>
                          <input
                            type="number" min={1} value={cantMult}
                            onChange={(e) => setCantMult(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-14 rounded-md border border-emerald-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          {cantN > 1 && (
                            <span className="text-emerald-800">× cada click agrega <strong>{cantN}</strong></span>
                          )}
                          <button type="button" onClick={() => setBucket([])}
                            className="ml-auto text-[11px] text-slate-500 hover:text-rose-600 underline">
                            Vaciar
                          </button>
                        </div>

                        {/* Grid clickable de franjas */}
                        <div className="p-3 border-b border-emerald-100">
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {franjas.map((f) => (
                              <button key={f.id} type="button"
                                onClick={() => {
                                  setBucket((prev) => {
                                    const idx = prev.findIndex((b) => b.franjaId === f.id);
                                    if (idx >= 0) {
                                      const next = [...prev];
                                      next[idx] = { ...next[idx], cantidad: next[idx].cantidad + cantN };
                                      return next;
                                    }
                                    return [...prev, { franjaId: f.id, cantidad: cantN }];
                                  });
                                }}
                                title={f.nombre}
                                className="relative rounded-lg border border-emerald-200 bg-white px-2 py-2 text-center transition-colors active:scale-95 hover:border-emerald-400 hover:bg-emerald-50">
                                {cantN > 1 && (
                                  <span className="absolute -top-1 -right-1 rounded-full bg-emerald-700 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                                    ×{cantN}
                                  </span>
                                )}
                                <p className="text-sm font-bold text-slate-800">
                                  Gs. {(Number(f.precio_venta) || 0).toLocaleString("es-PY")}
                                </p>
                              </button>
                            ))}
                          </div>
                          <button type="button"
                            onClick={async () => {
                              const raw = window.prompt("Precio manual de la nueva franja (Gs.):", "");
                              if (!raw) return;
                              const precio = Number(raw.replace(/\D/g, ""));
                              if (!(precio > 0)) return;
                              const id = await crearFranjaManual(precio);
                              if (id) {
                                setBucket((prev) => [...prev, { franjaId: id, cantidad: cantN }]);
                              }
                            }}
                            className="mt-2 w-full rounded-lg border border-dashed border-emerald-300 bg-white py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                            ＋ Franja con precio manual
                          </button>
                        </div>

                        {/* Lista del bucket — editable */}
                        <ul className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto">
                          {bucket.length === 0 ? (
                            <li className="p-6 text-center text-xs text-slate-400">
                              Empezá clickeando una franja de arriba.
                            </li>
                          ) : bucket.map((b, idx) => {
                            const f = franjas.find((x) => x.id === b.franjaId);
                            const precio = f ? Number(f.precio_venta) : 0;
                            const subtotal = precio * b.cantidad;
                            const margenUnit = precio - costoUnitPromedio;
                            return (
                              <li key={b.franjaId} className="flex items-center gap-2 px-3 py-2">
                                <input
                                  type="number" min={0} value={b.cantidad === 0 ? "" : b.cantidad}
                                  onChange={(e) => {
                                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                    setBucket((prev) => {
                                      const next = [...prev];
                                      next[idx] = { ...next[idx], cantidad: n };
                                      return next;
                                    });
                                  }}
                                  onBlur={() => {
                                    if (b.cantidad <= 0) setBucket((prev) => prev.filter((_, k) => k !== idx));
                                  }}
                                  className="w-14 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                                <span className="text-xs text-slate-400">×</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800">
                                    Gs. {precio.toLocaleString("es-PY")}
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate">{f?.nombre ?? "franja"}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold tabular-nums text-slate-800">
                                    Gs. {subtotal.toLocaleString("es-PY")}
                                  </p>
                                  <p className={`text-[10px] font-semibold ${margenUnit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                    {margenUnit >= 0 ? "+" : ""}Gs. {(margenUnit * b.cantidad).toLocaleString("es-PY")}
                                  </p>
                                </div>
                                <button type="button"
                                  onClick={() => setBucket((prev) => prev.filter((_, k) => k !== idx))}
                                  className="text-slate-400 hover:text-rose-600 text-lg leading-none"
                                  title="Quitar">×</button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Totales en vivo — basado en el bucket libre */}
              {(() => {
                const totalUnidades = data.items.reduce((s, it) => s + it.cantidad, 0);
                const asignadas = bucket.reduce((s, b) => s + b.cantidad, 0);
                const restan = totalUnidades - asignadas;
                const totalCosto = data.items.reduce((s, it) => s + it.costo_total, 0);
                const totalVentaBucket = bucket.reduce((s, b) => {
                  const f = franjas.find((x) => x.id === b.franjaId);
                  return s + (f ? Number(f.precio_venta) : 0) * b.cantidad;
                }, 0);
                // Prendas sin asignar en el bucket todavía valen su venta original
                const costoUnitProm = totalUnidades > 0 ? totalCosto / totalUnidades : 0;
                const ventaOriginalProm = data.items.reduce((s, it) => s + it.venta_unit * it.cantidad, 0) / Math.max(1, totalUnidades);
                const totalVenta = totalVentaBucket + Math.max(0, restan) * ventaOriginalProm;
                const totalMargen = totalVenta - totalCosto;
                const totalMarkupPct = totalCosto > 0 ? Math.round((totalMargen / totalCosto) * 1000) / 10 : null;
                const ventaPrevistaOriginal = data.totales.venta_total_esperada;
                const deltaVsPrevisto = totalVenta - ventaPrevistaOriginal;
                void costoUnitProm;
                return (
                  <>
                    <div className={`mt-4 rounded-xl border-2 p-4 ${
                      totalMargen >= 0
                        ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-slate-50"
                        : "border-rose-300 bg-gradient-to-br from-rose-50 to-slate-50"
                    }`}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MarginStat label="Costo total" value={"Gs. " + Math.round(totalCosto).toLocaleString("es-PY")} />
                        <MarginStat label="Venta esperada" value={"Gs. " + Math.round(totalVenta).toLocaleString("es-PY")} valueClass="text-sky-800" />
                        <MarginStat
                          label="Ganancia bruta"
                          value={"Gs. " + Math.round(totalMargen).toLocaleString("es-PY")}
                          valueClass={totalMargen >= 0 ? "text-emerald-800" : "text-rose-800"}
                          sub={totalMargen >= 0 ? "✓ Estás ganando" : "⚠ Estás perdiendo"}
                        />
                        <MarginStat
                          label="Markup %"
                          value={totalMarkupPct != null ? `${totalMarkupPct}%` : "—"}
                          valueClass={totalMarkupPct != null && totalMarkupPct >= 0 ? "text-emerald-800" : "text-rose-800"}
                          sub="ganancia ÷ costo"
                        />
                      </div>
                      {/* Info: diferencia de cantidad entre evaluación e ingreso.
                          NO bloquea — Karen: 'es común una evaluación de 10 prendas
                          ingresar 12, o de 25 ingresar solo 20'. */}
                      <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
                        restan > 0
                          ? "bg-sky-50 text-sky-800 border border-sky-200"
                          : restan < 0
                          ? "bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200"
                          : totalMargen < 0
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {restan > 0 ? (
                          <>
                            Evaluación: <strong>{totalUnidades}</strong> prendas · Ingresando: <strong>{totalUnidades - restan}</strong> (<strong>−{restan}</strong>).
                            Está bien si ingresás menos — el monto pagado al cliente ({"Gs. " + Math.round(totalCosto).toLocaleString("es-PY")}) queda fijo.
                          </>
                        ) : restan < 0 ? (
                          <>
                            Evaluación: <strong>{totalUnidades}</strong> prendas · Ingresando: <strong>{totalUnidades + Math.abs(restan)}</strong> (<strong>+{Math.abs(restan)}</strong>).
                            Está bien si ingresás más — el monto pagado al cliente ({"Gs. " + Math.round(totalCosto).toLocaleString("es-PY")}) queda fijo.
                          </>
                        ) : totalMargen < 0 ? (
                          <>⚠ Vas a <strong>perder Gs. {Math.round(Math.abs(totalMargen)).toLocaleString("es-PY")}</strong> con estos precios. Revisá antes de ingresar.</>
                        ) : (
                          <>
                            ✓ Coincide con la evaluación. Vas a ganar <strong>Gs. {Math.round(totalMargen).toLocaleString("es-PY")}</strong> si se vende todo al precio de la franja.
                          </>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] text-slate-500">
                      Podés ingresar más o menos prendas de las evaluadas — el monto pagado al cliente queda fijo.
                      Al confirmar, se ingresan al stock con estos precios y el costo se prorratea entre las unidades ingresadas.
                    </p>
                  </>
                );
              })()}

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
                              // Bucket libre: la cantidad ingresada puede ser
                              // MENOR o MAYOR a la evaluación. El backend
                              // borra items originales y reinserta con costo
                              // prorrateado sobre las nuevas unidades.
                              const bucketValido = bucket.filter((b) => b.franjaId && b.cantidad > 0);
                              const payload = bucketValido.length > 0
                                ? { overrides_flat: bucketValido.map((b) => ({
                                    producto_id: b.franjaId, cantidad: b.cantidad,
                                  })) }
                                : {};
                              const rr = await fetchWithSupabaseSession(
                                `/api/recepciones/${recepcionId}/ingresar-con-overrides`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(payload),
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
          )}
        </div>

      </div>
    </div>
  );
}

// Campo rápido para tipear el precio de venta a mano y asignarlo a TODAS
// las prendas de un item sin abrir el combobox. Enter dispara la asignación
// (crea/reutiliza la franja de ese precio). Blur también, para que se pueda
// clickear afuera y confirmar sin usar teclado.
function PrecioManualQuickInput({
  cantidad, costoUnit, ventaOriginal, onAsignar,
}: {
  cantidad: number;
  costoUnit: number;
  ventaOriginal: number;
  onAsignar: (precio: number) => void | Promise<void>;
}) {
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);

  const precioTipeado = (() => {
    const digitos = txt.replace(/\D/g, "");
    if (!digitos) return null;
    const n = Number(digitos);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const gananciaPreview = precioTipeado != null ? (precioTipeado - costoUnit) * cantidad : null;

  const asignar = async () => {
    if (precioTipeado == null || busy) return;
    setBusy(true);
    try { await onAsignar(precioTipeado); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-slate-500 shrink-0">Gs.</span>
      <input
        type="text"
        inputMode="numeric"
        value={txt}
        disabled={busy}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); asignar(); }
        }}
        onBlur={() => { if (precioTipeado != null) asignar(); }}
        placeholder={`ej: ${ventaOriginal.toLocaleString("es-PY")}`}
        className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
        title="Tipeá el precio de venta y presioná Enter"
      />
      {gananciaPreview != null && (
        <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${
          gananciaPreview >= 0 ? "text-emerald-700" : "text-rose-700"
        }`}>
          {gananciaPreview >= 0 ? "+" : ""}{gananciaPreview.toLocaleString("es-PY")}
        </span>
      )}
      {busy && <span className="text-[10px] text-slate-400 shrink-0">…</span>}
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
  franjas, value, costoUnit, onChange, onCrearManual,
}: {
  franjas: Franja[];
  value: string;
  costoUnit: number;
  onChange: (v: string) => void;
  onCrearManual?: (precio: number) => Promise<string | null>;
}) {
  const [creando, setCreando] = useState(false);
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

  // Precio manual — sólo si tipearon exclusivamente dígitos (o dígitos + puntos/miles),
  // no coincide exacto con ninguna franja existente, y el modal padre expone el creador.
  const precioTipeado = (() => {
    const digitos = q.replace(/\D/g, "");
    if (!digitos) return null;
    const t = q.trim();
    if (!/^[\d.,]+$/.test(t)) return null;
    const n = Number(digitos);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (franjas.some((f) => Number(f.precio_venta) === n)) return null;
    return n;
  })();

  const crearYSeleccionar = async (precio: number) => {
    if (!onCrearManual || creando) return;
    setCreando(true);
    try {
      const id = await onCrearManual(precio);
      if (id) seleccionar(id);
    } finally {
      setCreando(false);
    }
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
                  else if (precioTipeado != null) crearYSeleccionar(precioTipeado);
                }
              }}
              placeholder={onCrearManual ? "Buscar o tipear precio (ej: 55000)…" : "Buscar (ej: 44)…"}
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
            {precioTipeado != null && onCrearManual && (
              <li>
                <button
                  type="button"
                  disabled={creando}
                  onClick={() => crearYSeleccionar(precioTipeado)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left transition bg-emerald-50 hover:bg-emerald-100 text-emerald-900 disabled:opacity-60"
                >
                  <span className="font-semibold text-sm tabular-nums">
                    {creando ? "Creando…" : `+ Usar precio Gs. ${precioTipeado.toLocaleString("es-PY")}`}
                  </span>
                  <span className={`text-[10px] font-semibold tabular-nums ${
                    precioTipeado - costoUnit >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}>
                    {precioTipeado - costoUnit >= 0 ? "+" : ""}{(precioTipeado - costoUnit).toLocaleString("es-PY")}
                  </span>
                </button>
              </li>
            )}
            {filtradas.length === 0 && precioTipeado == null ? (
              <li className="px-3 py-4 text-center text-[11px] text-slate-400">
                {onCrearManual ? "Tipeá un precio (ej: 55000) para crear una franja." : "Sin franjas que coincidan."}
              </li>
            ) : filtradas.length === 0 ? null : (
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
