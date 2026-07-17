"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { GlobalConfigSubpageShell } from "@/components/config/GlobalConfigSubpageShell";
import {
  ConfigFormCard,
  ConfigSectionTitle,
  ConfigHelpText,
  F_INPUT,
  F_LABEL,
} from "@/components/config/global-config-primitives";

type Tipo = { id: string; nombre: string; orden: number; activo: boolean };

export default function ConfiguracionTiposPrendaPage() {
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const cargar = useCallback(async () => {
    setError(null); setCargando(true);
    try {
      const [rt, ra] = await Promise.all([
        fetchWithSupabaseSession("/api/tipos-prenda", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/auth/empresa-context", { cache: "no-store" }),
      ]);
      const jt = await rt.json();
      const ja = await ra.json().catch(() => ({}));
      if (jt?.success) setTipos((jt.data?.tipos as Tipo[]) ?? []);
      if (ja?.success) setEsAdmin(Boolean(ja.data?.es_admin));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function crear() {
    setError(null); setOk(null);
    const nombre = nombreNuevo.trim();
    if (!nombre) { setError("El nombre es obligatorio."); return; }
    const orden = (tipos[tipos.length - 1]?.orden ?? 0) + 10;
    try {
      const r = await fetchWithSupabaseSession("/api/tipos-prenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, orden }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Error");
      setOk("Creado.");
      setNombreNuevo("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function actualizar(t: Tipo, patch: Partial<Tipo>) {
    try {
      const r = await fetchWithSupabaseSession(`/api/tipos-prenda/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Error");
      setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function desactivar(t: Tipo) {
    if (!confirm(`Desactivar "${t.nombre}"?`)) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/tipos-prenda/${t.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <GlobalConfigSubpageShell
      title="Tipos de prenda"
      description="Catálogo usado en la evaluación del cliente (columna Trae) y en las estadísticas del dashboard de Sucursales."
    >
      {cargando ? (
        <ConfigFormCard><p className="text-sm text-slate-500">Cargando…</p></ConfigFormCard>
      ) : (
        <div className="space-y-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>}
          {!esAdmin && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Estás viendo la configuración en modo lectura. Solo un administrador puede editar.
            </div>
          )}

          <ConfigFormCard>
            <ConfigSectionTitle>Nuevo tipo</ConfigSectionTitle>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className={F_LABEL}>Nombre</label>
                <input
                  type="text"
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  placeholder="Ej: Cinturón"
                  disabled={!esAdmin}
                  className={F_INPUT}
                />
              </div>
              <button
                type="button"
                onClick={crear}
                disabled={!esAdmin || !nombreNuevo.trim()}
                className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-300 text-white px-4 py-2 text-sm font-semibold shadow-sm"
              >
                Agregar
              </button>
            </div>
            <ConfigHelpText>Los tipos aparecen en el selector de cada línea de "Cliente trae" en la pantalla de atención.</ConfigHelpText>
          </ConfigFormCard>

          <ConfigFormCard>
            <ConfigSectionTitle>Tipos existentes</ConfigSectionTitle>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2">Nombre</th>
                  <th className="py-2 w-24 text-right">Orden</th>
                  <th className="py-2 w-24 text-center">Activo</th>
                  <th className="py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tipos.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2">
                      <input
                        type="text"
                        defaultValue={t.nombre}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== t.nombre) actualizar(t, { nombre: v });
                        }}
                        disabled={!esAdmin}
                        className={F_INPUT + " text-sm"}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        defaultValue={t.orden}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n !== t.orden) actualizar(t, { orden: n });
                        }}
                        disabled={!esAdmin}
                        className={F_INPUT + " text-sm text-right w-20 inline-block"}
                      />
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={t.activo}
                        onChange={(e) => actualizar(t, { activo: e.target.checked })}
                        disabled={!esAdmin}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="py-2 text-right">
                      {esAdmin && t.activo && (
                        <button
                          type="button"
                          onClick={() => desactivar(t)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tipos.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">Sin tipos configurados.</td></tr>
                )}
              </tbody>
            </table>
          </ConfigFormCard>
        </div>
      )}
    </GlobalConfigSubpageShell>
  );
}
