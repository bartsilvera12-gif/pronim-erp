"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const MONEDAS = [
  { value: "PYG", label: "Guaraníes (Gs.)" },
  { value: "BRL", label: "Reales (R$)" },
  { value: "USD", label: "Dólares (US$)" },
  { value: "ARS", label: "Pesos argentinos ($)" },
] as const;

type Sucursal = {
  id: string;
  nombre: string;
  slug: string;
  es_principal: boolean;
  activo: boolean;
  /** Ausente en schemas viejos sin la migración de multi-moneda. */
  moneda?: string | null;
};

function monedaLabel(m: string | null | undefined): string {
  const v = (m ?? "PYG").trim().toUpperCase();
  return MONEDAS.find((x) => x.value === v)?.label ?? v;
}

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
  /** Sucursal en edición. `null` = modal cerrado. */
  const [editando, setEditando] = useState<Sucursal | null>(null);

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
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Moneda</th>
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
                  <td className="px-4 py-3 text-slate-600">{monedaLabel(s.moneda)}</td>
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditando(s)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActivo(s)}
                        disabled={s.es_principal && s.activo}
                        title={s.es_principal && s.activo ? "No podés desactivar la sucursal principal. Marcá otra como principal primero." : ""}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {s.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </div>
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
        <SucursalModal
          sucursal={null}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setSuccess("Sucursal creada. Ya podés asignarle usuarios y abrir caja.");
            setTimeout(() => setSuccess(null), 4000);
            cargar();
          }}
        />
      )}

      {editando && (
        <SucursalModal
          sucursal={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            setSuccess("Sucursal actualizada.");
            setTimeout(() => setSuccess(null), 4000);
            cargar();
          }}
        />
      )}
    </div>
  );
}

/**
 * Alta y edición de sucursal en un solo modal.
 * `sucursal === null` → alta (POST). Con sucursal → edición (PATCH).
 *
 * El slug no se edita: es la clave única por empresa y ya está referenciado
 * por datos existentes. `es_principal` se cambia desde la tabla.
 */
function SucursalModal({
  sucursal,
  onClose,
  onSaved,
}: {
  sucursal: Sucursal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esEdicion = sucursal !== null;
  const [nombre, setNombre] = useState(sucursal?.nombre ?? "");
  const [moneda, setMoneda] = useState((sucursal?.moneda ?? "PYG").trim().toUpperCase());
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monedaCambio =
    esEdicion && moneda !== (sucursal.moneda ?? "PYG").trim().toUpperCase();
  const sinCambios = esEdicion && nombre.trim() === sucursal.nombre && !monedaCambio;

  async function submit() {
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre de la sucursal es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithSupabaseSession("/api/sucursales", {
        method: esEdicion ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // En edición `moneda` va solo si cambió: en schemas sin esa columna
        // mandarla siempre rompería un simple renombre.
        body: JSON.stringify(
          esEdicion
            ? { id: sucursal.id, nombre: nombre.trim(), ...(monedaCambio ? { moneda } : {}) }
            : { nombre: nombre.trim(), moneda, es_principal: esPrincipal },
        ),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.success === false) {
        throw new Error(
          j?.error ??
            `No se pudo ${esEdicion ? "actualizar" : "crear"} la sucursal (${res.status}).`,
        );
      }
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Error al ${esEdicion ? "actualizar" : "crear"} la sucursal.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {esEdicion ? "Editar sucursal" : "Nueva sucursal"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {esEdicion
                ? "Cambiá el nombre con el que aparece en todo el sistema y la moneda con la que opera."
                : "Cada sucursal maneja stock, cajas y ventas de forma independiente. Los clientes y créditos se comparten."}
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
              {esEdicion
                ? `El identificador interno (slug: ${sucursal.slug}) no cambia: ya está referenciado por los datos existentes.`
                : "El identificador interno (slug) se genera automáticamente a partir del nombre."}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Moneda
            </label>
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] bg-white"
            >
              {MONEDAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Con esta moneda se muestran precios, ventas y reportes de la sucursal.
            </p>
          </div>

          {!esEdicion && (
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
          )}
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
            disabled={saving || !nombre.trim() || sinCambios}
            title={sinCambios ? "No hay cambios que guardar." : ""}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {esEdicion
              ? saving ? "Guardando…" : "Guardar cambios"
              : saving ? "Creando…" : "Crear sucursal"}
          </button>
        </div>
      </div>
    </div>
  );
}
