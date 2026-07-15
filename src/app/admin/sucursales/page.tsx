"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Sucursal = {
  id: string;
  nombre: string;
  slug: string;
  es_principal: boolean;
  activo: boolean;
};

async function unwrap<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) {
    throw new Error(j?.error ?? `Error ${r.status}`);
  }
  return (j?.data ?? j) as T;
}

export default function AdminSucursalesPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function cargar() {
    setError(null);
    setCargando(true);
    try {
      const d = await unwrap<{ sucursales: Sucursal[] }>(
        await fetchWithSupabaseSession("/api/sucursales?incluir_inactivas=1", { cache: "no-store" }),
      );
      setSucursales(d.sucursales ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar sucursales.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function toggleActivo(s: Sucursal) {
    setError(null); setSuccess(null);
    try {
      await unwrap(
        await fetchWithSupabaseSession("/api/sucursales", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: s.id, activo: !s.activo }),
        }),
      );
      setSuccess(!s.activo ? "Sucursal reactivada." : "Sucursal desactivada.");
      setTimeout(() => setSuccess(null), 3000);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }

  async function marcarPrincipal(s: Sucursal) {
    if (s.es_principal) return;
    setError(null); setSuccess(null);
    try {
      await unwrap(
        await fetchWithSupabaseSession("/api/sucursales", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: s.id, es_principal: true }),
        }),
      );
      setSuccess(`"${s.nombre}" es ahora la sucursal principal.`);
      setTimeout(() => setSuccess(null), 3000);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la principal.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sucursales</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestioná las sucursales de tu empresa. Cada sucursal opera su propio stock, cajas y ventas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nueva sucursal
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-[#4FAEB2]/15 overflow-x-auto">
        {cargando ? (
          <div className="py-16 text-center text-sm text-gray-400 animate-pulse">Cargando…</div>
        ) : sucursales.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Aún no hay sucursales. Creá la primera con el botón de arriba.</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Nombre</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Slug</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Principal</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Estado</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sucursales.map((s) => (
                <tr key={s.id} className={s.activo ? "" : "opacity-60"}>
                  <td className="px-4 py-3 font-medium text-slate-800">{s.nombre}</td>
                  <td className="px-4 py-3 text-slate-500">{s.slug}</td>
                  <td className="px-4 py-3">
                    {s.es_principal ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2 py-0.5 text-xs font-semibold text-[#3F8E91]">
                        ● Principal
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => marcarPrincipal(s)}
                        disabled={!s.activo}
                        className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Marcar como principal
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      s.activo
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    }`}>
                      {s.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActivo(s)}
                      disabled={s.es_principal && s.activo}
                      title={s.es_principal && s.activo ? "No podés desactivar la sucursal principal. Marcá otra como principal primero." : ""}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {s.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-slate-400">
        Al crear una sucursal se le asigna automáticamente un punto <strong>"Caja 1"</strong>.
        Podés agregar más puntos desde la caja (Configuración de puntos de caja).
        Los usuarios operativos se asignan a la sucursal desde{" "}
        <Link href="/usuarios" className="underline decoration-dotted hover:text-slate-600">Usuarios</Link>.
      </div>

      {modalOpen && (
        <NuevaSucursalModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            setSuccess("Sucursal creada. Ya podés asignarle usuarios y abrir caja.");
            setTimeout(() => setSuccess(null), 4000);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevaSucursalModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre de la sucursal es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithSupabaseSession("/api/sucursales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), es_principal: esPrincipal }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo crear la sucursal (${res.status}).`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la sucursal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Nueva sucursal</h3>
            <p className="mt-1 text-xs text-slate-500">
              Cada sucursal maneja stock, cajas y ventas de forma independiente. Los clientes y créditos se comparten.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Sucursal Centro"
              autoFocus
              maxLength={80}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              El identificador interno (slug) se genera automáticamente a partir del nombre.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={esPrincipal}
              onChange={(e) => setEsPrincipal(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]"
            />
            <span>
              Marcar como <strong>sucursal principal</strong>
              <span className="ml-1 text-xs text-slate-400">(si ya había otra, deja de serlo)</span>
            </span>
          </label>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !nombre.trim()}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Creando…" : "Crear sucursal"}
          </button>
        </div>
      </div>
    </div>
  );
}
