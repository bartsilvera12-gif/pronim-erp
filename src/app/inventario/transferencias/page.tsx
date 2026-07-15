"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Sucursal = { id: string; nombre: string; es_principal?: boolean; activo?: boolean };
type ItemBorrador = { producto_id: string; producto_nombre: string; cantidad: string };
type Producto = { id: string; nombre: string; sku?: string | null; stock_actual?: number | null };

type TransferenciaRow = {
  id: string; origen_sucursal_id: string; destino_sucursal_id: string;
  origen_nombre: string | null; destino_nombre: string | null;
  observacion: string | null; estado: string; created_at: string;
  created_by_nombre: string | null;
};
type TransferenciaItem = {
  id: string; transferencia_id: string; producto_id: string;
  producto_nombre: string | null; cantidad: number;
};

function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`;
}

async function unwrap<T>(r: Response): Promise<T> {
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? j?.message ?? `Error ${r.status}`);
  // API responses vienen envueltos por successResponse: { data: ... }
  return (j?.data ?? j) as T;
}

export default function TransferenciasStockPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [observacion, setObservacion] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [items, setItems] = useState<ItemBorrador[]>([]);

  const [historia, setHistoria] = useState<TransferenciaRow[]>([]);
  const [historiaItems, setHistoriaItems] = useState<TransferenciaItem[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const puedeEnviar = origen && destino && origen !== destino && items.length > 0 && !enviando;

  async function cargarSucursales() {
    try {
      const d = await unwrap<{ sucursales: Sucursal[] }>(
        await fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" }),
      );
      setSucursales(d.sucursales ?? []);
    } catch { /* tolerar */ }
  }

  async function cargarHistorial() {
    try {
      const d = await unwrap<{ transferencias: TransferenciaRow[]; items: TransferenciaItem[] }>(
        await fetchWithSupabaseSession("/api/inventario/transferencias", { cache: "no-store" }),
      );
      setHistoria(d.transferencias ?? []);
      setHistoriaItems(d.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    }
  }

  useEffect(() => {
    cargarSucursales();
    cargarHistorial();
  }, []);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setResultados([]); return; }
    const ctrl = new AbortController();
    setBuscando(true);
    fetchWithSupabaseSession(`/api/productos/search?q=${encodeURIComponent(q)}&limit=15`, {
      signal: ctrl.signal, cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        const arr = (j?.data?.productos as Producto[] | undefined) ?? (j?.productos as Producto[] | undefined) ?? [];
        setResultados(arr);
      })
      .catch(() => { /* ignorar aborts */ })
      .finally(() => setBuscando(false));
    return () => ctrl.abort();
  }, [busqueda]);

  function agregarProducto(p: Producto) {
    setItems((prev) => {
      if (prev.some((x) => x.producto_id === p.id)) return prev;
      return [...prev, { producto_id: p.id, producto_nombre: p.nombre, cantidad: "1" }];
    });
    setBusqueda("");
    setResultados([]);
  }

  function actualizarCantidad(id: string, cant: string) {
    setItems((prev) => prev.map((x) => (x.producto_id === id ? { ...x, cantidad: cant } : x)));
  }

  function quitar(id: string) {
    setItems((prev) => prev.filter((x) => x.producto_id !== id));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const payload = {
      origen_sucursal_id: origen,
      destino_sucursal_id: destino,
      observacion: observacion.trim() || null,
      items: items
        .map((x) => ({
          producto_id: x.producto_id,
          producto_nombre: x.producto_nombre,
          cantidad: Number(x.cantidad),
        }))
        .filter((x) => Number.isFinite(x.cantidad) && x.cantidad > 0),
    };
    if (payload.items.length === 0) {
      setError("Cargá al menos un producto con cantidad > 0.");
      return;
    }
    setEnviando(true);
    try {
      await unwrap(
        await fetchWithSupabaseSession("/api/inventario/transferencias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setSuccess("Transferencia registrada correctamente.");
      setItems([]);
      setObservacion("");
      cargarHistorial();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar transferencia.");
    } finally {
      setEnviando(false);
    }
  }

  const itemsByTransferencia = useMemo(() => {
    const map = new Map<string, TransferenciaItem[]>();
    for (const it of historiaItems) {
      const arr = map.get(it.transferencia_id) ?? [];
      arr.push(it);
      map.set(it.transferencia_id, arr);
    }
    return map;
  }, [historiaItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/inventario" className="hover:text-[#4FAEB2] transition-colors">Inventario</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Transferencias entre sucursales</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transferencias entre sucursales</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Mueve productos de una sucursal a otra. El stock se actualiza en el momento.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <form onSubmit={enviar} className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Desde (origen) *</label>
            <select
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
              required
            >
              <option value="">Elegí sucursal…</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}{s.es_principal ? " (Principal)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Hacia (destino) *</label>
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
              required
            >
              <option value="">Elegí sucursal…</option>
              {sucursales.filter((s) => s.id !== origen).map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}{s.es_principal ? " (Principal)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Buscar producto</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escribí nombre, SKU o código de barras…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
          />
          {buscando && <p className="text-xs text-gray-400 mt-1">Buscando…</p>}
          {resultados.length > 0 && (
            <ul className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregarProducto(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <span>
                      <span className="font-medium text-slate-800">{p.nombre}</span>
                      {p.sku && <span className="text-xs text-slate-400 ml-2">{p.sku}</span>}
                    </span>
                    <span className="text-xs text-slate-500">Stock: {p.stock_actual ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide">Producto</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide w-40">Cantidad</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.producto_id}>
                    <td className="px-3 py-2 text-slate-800">{it.producto_nombre}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={it.cantidad}
                        onChange={(e) => actualizarCantidad(it.producto_id, e.target.value)}
                        className="w-32 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => quitar(it.producto_id)}
                        title="Quitar"
                        className="text-slate-400 hover:text-red-600 text-lg leading-none"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observación (opcional)</label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
            placeholder="Motivo, referencia interna, etc."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!puedeEnviar}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 transition-colors shadow-sm active:scale-95"
          >
            {enviando ? "Registrando…" : "Registrar transferencia"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 overflow-x-auto">
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Historial reciente</h2>
        </div>
        {historia.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">Sin transferencias registradas.</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Origen → Destino</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Productos</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Usuario</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historia.map((t) => {
                const its = itemsByTransferencia.get(t.id) ?? [];
                return (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatFechaHora(t.created_at)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="font-medium">{t.origen_nombre ?? "?"}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="font-medium">{t.destino_nombre ?? "?"}</span>
                      {t.observacion && <p className="text-xs text-slate-400 mt-0.5">{t.observacion}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5">
                        {its.map((it) => (
                          <li key={it.id} className="text-xs text-slate-600">
                            {it.producto_nombre ?? it.producto_id} — <span className="font-semibold">{Number(it.cantidad)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{t.created_by_nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        t.estado === "confirmada"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {t.estado}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
