"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Franja = {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
};

type Sucursal = { id: string; nombre: string; es_principal: boolean };

function formatGs(n: number): string {
  return "Gs. " + Math.round(n).toLocaleString("es-PY").replace(/,/g, ".");
}

export default function AdminFranjasPage() {
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [creando, setCreando] = useState(false);
  const [sembrando, setSembrando] = useState(false);
  const [ajusteAbierto, setAjusteAbierto] = useState<Franja | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/franjas", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al cargar");
      setFranjas((j.data.franjas ?? []).map((f: Record<string, unknown>) => ({
        id: String(f.id),
        nombre: String(f.nombre),
        sku: String(f.sku),
        precio_venta: Number(f.precio_venta ?? 0),
        stock_actual: Number(f.stock_actual ?? 0),
        stock_minimo: Number(f.stock_minimo ?? 0),
        activo: f.activo === true,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function cargarSucursales() {
    try {
      const r = await fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const rows = (j?.data?.sucursales ?? j?.sucursales ?? []) as Sucursal[];
      setSucursales(rows);
    } catch {
      /* opcional */
    }
  }

  useEffect(() => {
    void cargar();
    void cargarSucursales();
  }, []);

  async function crearFranja() {
    const precio = parseFloat(nuevoPrecio);
    if (!Number.isFinite(precio) || precio <= 0) {
      setError("Precio inválido.");
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/franjas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio_venta: precio }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al crear");
      setNuevoPrecio("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCreando(false);
    }
  }

  async function sembrarIniciales() {
    setSembrando(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/franjas/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error al sembrar");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSembrando(false);
    }
  }

  async function togglearActivo(f: Franja) {
    try {
      const r = await fetchWithSupabaseSession(`/api/franjas/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !f.activo }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function editarPrecio(f: Franja) {
    const nuevo = window.prompt(`Nuevo precio para ${f.nombre}:`, String(f.precio_venta));
    if (nuevo == null) return;
    const p = parseFloat(nuevo);
    if (!Number.isFinite(p) || p <= 0) {
      setError("Precio inválido.");
      return;
    }
    try {
      const r = await fetchWithSupabaseSession(`/api/franjas/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio_venta: p }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administración de franjas de precio</h1>
          <p className="text-sm text-slate-600">
            Crear, editar precio, activar/desactivar y ajustar stock. Cada franja es un producto virtual único.
          </p>
        </div>
        <Link
          href="/inventario"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          ← Volver a inventario
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && franjas.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-sm font-semibold text-amber-800">
            Todavía no hay franjas cargadas
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Podés sembrar el conjunto inicial acordado con el cliente
            (Gs. 6.000, 9.000, 14.000, 19.000, 24.000, 29.000 y luego cada 5.000 hasta 99.000)
            o crear las tuyas manualmente abajo.
          </p>
          <button
            type="button"
            onClick={sembrarIniciales}
            disabled={sembrando}
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-40"
          >
            {sembrando ? "Sembrando…" : "Sembrar franjas iniciales"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Crear nueva franja
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={nuevoPrecio}
            onChange={(e) => setNuevoPrecio(e.target.value)}
            placeholder="Precio en Gs. (ej: 104000)"
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
          />
          <button
            type="button"
            onClick={crearFranja}
            disabled={creando || !nuevoPrecio}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-40"
          >
            {creando ? "Creando…" : "Crear franja"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Franjas existentes
        </p>
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : franjas.length === 0 ? (
          <p className="text-sm text-slate-500">No hay franjas cargadas todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">Nombre</th>
                  <th className="pb-2 pr-3">SKU</th>
                  <th className="pb-2 pr-3 text-right">Precio</th>
                  <th className="pb-2 pr-3 text-right">Stock</th>
                  <th className="pb-2 pr-3 text-center">Activo</th>
                  <th className="pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {franjas.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{f.nombre}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{f.sku}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatGs(f.precio_venta)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.stock_actual}</td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        type="button"
                        onClick={() => togglearActivo(f)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          f.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {f.activo ? "Activa" : "Inactiva"}
                      </button>
                    </td>
                    <td className="py-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => editarPrecio(f)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Editar precio
                      </button>
                      <button
                        type="button"
                        onClick={() => setAjusteAbierto(f)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Ajustar stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ajusteAbierto && (
        <AjusteStockModal
          franja={ajusteAbierto}
          sucursales={sucursales}
          onClose={() => setAjusteAbierto(null)}
          onDone={() => {
            setAjusteAbierto(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function AjusteStockModal({
  franja,
  sucursales,
  onClose,
  onDone,
}: {
  franja: Franja;
  sucursales: Sucursal[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [modo, setModo] = useState<"delta" | "set">("delta");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursalId && sucursales[0]) setSucursalId(sucursales[0].id);
  }, [sucursales, sucursalId]);

  async function submit() {
    const n = parseFloat(valor);
    if (!Number.isFinite(n)) {
      setErr("Valor inválido.");
      return;
    }
    if (!sucursalId) {
      setErr("Elegí una sucursal.");
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        sucursal_id: sucursalId,
        motivo: motivo || undefined,
      };
      if (modo === "delta") body.delta = n;
      else body.set = n;
      const r = await fetchWithSupabaseSession(`/api/franjas/${franja.id}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">Ajustar stock — {franja.nombre}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Registra un movimiento tipo AJUSTE en el inventario.
        </p>

        {err && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Sucursal</label>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            >
              {sucursales.length === 0 && <option value="">Sin sucursales</option>}
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {s.es_principal ? " · principal" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Tipo de ajuste</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setModo("delta")}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  modo === "delta"
                    ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                Sumar / restar (delta)
              </button>
              <button
                type="button"
                onClick={() => setModo("set")}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  modo === "set"
                    ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                Fijar valor exacto
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              {modo === "delta" ? "Cantidad (positiva o negativa)" : "Stock final"}
            </label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={modo === "delta" ? "Ej: +10 o -3" : "Ej: 25"}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Motivo (opcional)</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: conteo físico, merma…"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={enviando || !valor}
            className="rounded-lg bg-[#4FAEB2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40"
          >
            {enviando ? "Guardando…" : "Guardar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}
