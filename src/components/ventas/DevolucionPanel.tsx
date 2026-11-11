"use client";

/**
 * Devolución de prendas vendidas.
 *   - <DevolucionPanel/>: buscador de la venta original + elección de prendas.
 *     Se usa dentro de la pantalla de venta (sección "Devolución").
 *   - <DevolucionSinCompraModal/>: ventana para registrar SOLO la devolución
 *     (el valor queda como crédito a favor, sin vencimiento).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getSucursalActivaId } from "@/lib/sucursales/activa";

const PLAZO_DIAS = 30;

interface Prenda {
  venta_item_id: string;
  producto_nombre: string;
  sku: string;
  precio_venta: number;
  cantidad_vendida: number;
  cantidad_disponible: number;
}
interface VentaDev {
  id: string;
  numero_control: string;
  fecha: string;
  dias: number;
  fuera_de_plazo: boolean;
  cliente_id: string;
  cliente_nombre: string | null;
  prendas: Prenda[];
}

export interface DevolucionSeleccion {
  venta_original_id: string;
  numero_control: string;
  items: { venta_item_id: string; cantidad: number }[];
  total: number;
}

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

export function DevolucionPanel({
  clienteId,
  onChange,
  resetKey,
}: {
  /** Si viene, se buscan las ventas de ese cliente. */
  clienteId?: string | null;
  onChange: (sel: DevolucionSeleccion | null) => void;
  /** Cambiarlo limpia la selección. */
  resetKey?: number;
}) {
  const [q, setQ] = useState("");
  const [ventas, setVentas] = useState<VentaDev[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cant, setCant] = useState<Record<string, number>>({});

  const buscar = useCallback(async () => {
    setError(null);
    if (!clienteId && !q.trim()) { setVentas([]); return; }
    setBuscando(true);
    try {
      const sp = new URLSearchParams();
      if (clienteId) sp.set("cliente_id", clienteId);
      if (q.trim()) sp.set("q", q.trim());
      const r = await fetchWithSupabaseSession(`/api/ventas/devolucion?${sp}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "No se pudo buscar.");
      setVentas((j?.data?.ventas ?? []) as VentaDev[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al buscar.");
    } finally { setBuscando(false); }
  }, [clienteId, q]);

  // Con cliente elegido se listan solas sus ventas; sin cliente, por número/nombre.
  useEffect(() => {
    if (clienteId) void buscar();
    else { setVentas([]); }
    setCant({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, resetKey]);

  const seleccion = useMemo<DevolucionSeleccion | null>(() => {
    const items: { venta_item_id: string; cantidad: number }[] = [];
    let total = 0; let venta: VentaDev | null = null;
    for (const v of ventas) {
      for (const p of v.prendas) {
        const c = cant[p.venta_item_id] ?? 0;
        if (c > 0 && !v.fuera_de_plazo) {
          items.push({ venta_item_id: p.venta_item_id, cantidad: c });
          total += c * p.precio_venta;
          venta = v;
        }
      }
    }
    if (!venta || items.length === 0) return null;
    return { venta_original_id: venta.id, numero_control: venta.numero_control, items, total };
  }, [ventas, cant]);

  useEffect(() => { onChange(seleccion); }, [seleccion, onChange]);

  function setCantidad(v: VentaDev, p: Prenda, n: number) {
    const nuevo = Math.max(0, Math.min(p.cantidad_disponible, n));
    setCant((prev) => {
      // Una devolución corresponde a UNA venta original: al tocar otra, se limpia el resto.
      const base: Record<string, number> = {};
      for (const x of v.prendas) if (prev[x.venta_item_id]) base[x.venta_item_id] = prev[x.venta_item_id];
      return { ...base, [p.venta_item_id]: nuevo };
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(); } }}
          placeholder="Número de venta o nombre del cliente"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
        <button type="button" onClick={() => void buscar()} disabled={buscando}
          className="rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
          {buscando ? "Buscando…" : "Buscar venta"}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {!buscando && ventas.length === 0 && (clienteId || q.trim()) && !error && (
        <p className="text-xs text-slate-500">No hay ventas para devolver con ese dato.</p>
      )}
      <div className="space-y-2">
        {ventas.map((v) => (
          <div key={v.id} className={`rounded-lg border p-3 ${v.fuera_de_plazo ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-800">
                Venta {v.numero_control}{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ""}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(v.fecha).toLocaleDateString("es-PY")} · hace {v.dias} {v.dias === 1 ? "día" : "días"}
              </span>
            </div>
            {v.fuera_de_plazo ? (
              <p className="mt-1 text-xs font-medium text-rose-700">
                Fuera de plazo: solo se pueden devolver prendas vendidas hace {PLAZO_DIAS} días o menos.
              </p>
            ) : v.prendas.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Todas las prendas de esta venta ya fueron devueltas.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {v.prendas.map((p) => (
                  <li key={p.venta_item_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {p.producto_nombre} <span className="text-xs text-slate-400">({p.sku})</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {gs(p.precio_venta)} c/u · pueden volver {p.cantidad_disponible}
                      </span>
                    </span>
                    <input
                      type="number" min={0} max={p.cantidad_disponible} step={1}
                      aria-label={`Cantidad a devolver de ${p.producto_nombre}`}
                      value={cant[p.venta_item_id] ?? 0}
                      onChange={(e) => setCantidad(v, p, Number(e.target.value) || 0)}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {seleccion && (
        <p className="text-sm text-slate-700">
          Devuelve de la venta {seleccion.numero_control}: <strong>{gs(seleccion.total)}</strong>
        </p>
      )}
    </div>
  );
}

export function DevolucionSinCompraModal({
  clienteId,
  onClose,
  onDone,
}: {
  clienteId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [sel, setSel] = useState<DevolucionSeleccion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const onSel = useCallback((s: DevolucionSeleccion | null) => setSel(s), []);

  async function registrar() {
    if (!sel) return;
    setEnviando(true); setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/ventas/devolucion", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: clienteId ?? null,
          sucursal_id: getSucursalActivaId(),
          venta_original_id: sel.venta_original_id,
          items: sel.items,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "No se pudo registrar la devolución.");
      setOkMsg(`Devolución registrada: ${gs(sel.total)} quedan como crédito a favor, sin vencimiento.`);
      setSel(null); setResetKey((k) => k + 1);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Devolución sin compra</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Cerrar</button>
        </div>
        <p className="text-xs text-slate-500">
          Buscá la venta original y elegí las prendas. Vuelven al stock de la sucursal y su valor queda
          como crédito a favor del cliente, sin vencimiento.
        </p>
        <DevolucionPanel clienteId={clienteId} onChange={onSel} resetKey={resetKey} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        {okMsg && <p className="text-sm text-emerald-700">{okMsg}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={registrar} disabled={!sel || enviando}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
            {enviando ? "Registrando…" : "Confirmar devolución"}
          </button>
        </div>
      </div>
    </div>
  );
}
