"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Numeración del autoimpresor POR SUCURSAL.
 *
 * El timbrado es uno solo para toda la empresa (se carga arriba), pero cada
 * establecimiento numera aparte: Lillo 001-001-0000001…, Palmeras
 * 002-001-0000001… Una fila acá por cada sucursal que factura.
 *
 * La sucursal que NO aparece configurada no emite factura: sigue con el
 * comprobante interno de siempre. Así quedan afuera las de Brasil sin tener
 * que preguntar el país en ningún lado.
 */

type Configurada = {
  sucursal_id: string;
  sucursal_nombre: string | null;
  activo: boolean;
  establecimiento_codigo: string;
  punto_expedicion_codigo: string;
  numero_inicial: number;
  numero_final: number;
  numero_emitido: number | null;
  disponibles: number;
};
type SucursalMin = { id: string; nombre: string; configurada: boolean };

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]";

function numeroMuestra(c: { establecimiento_codigo: string; punto_expedicion_codigo: string; numero_inicial: number; numero_emitido: number | null }) {
  const prox = c.numero_emitido == null ? c.numero_inicial : c.numero_emitido + 1;
  return `${c.establecimiento_codigo}-${c.punto_expedicion_codigo}-${String(prox).padStart(7, "0")}`;
}

export default function AutoimpresorSucursalesSection() {
  const [configuradas, setConfiguradas] = useState<Configurada[]>([]);
  const [sucursales, setSucursales] = useState<SucursalMin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/configuracion/autoimpresor/sucursales", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) { setError(j?.error ?? "No se pudo cargar."); return; }
      setConfiguradas((j.data?.configuradas ?? []) as Configurada[]);
      setSucursales((j.data?.sucursales ?? []) as SucursalMin[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar(payload: {
    sucursal_id: string; activo: boolean;
    establecimiento_codigo: string; punto_expedicion_codigo: string;
    numero_inicial: number; numero_final: number;
  }) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/configuracion/autoimpresor/sucursales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.success) { setError(j?.error ?? "No se pudo guardar."); return; }
      setConfiguradas((j.data?.configuradas ?? []) as Configurada[]);
      setEditando(null);
      setOk("Guardado.");
      setTimeout(() => setOk(null), 3000);
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(sucursalId: string, nombre: string) {
    if (!window.confirm(
      `¿Sacar a ${nombre} de la facturación?\n\n` +
      "Va a dejar de emitir factura con timbrado y vuelve al comprobante interno. " +
      "Las facturas ya emitidas no se tocan.",
    )) return;
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/configuracion/autoimpresor/sucursales?sucursal_id=${encodeURIComponent(sucursalId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!j?.success) { setError(j?.error ?? "No se pudo quitar."); return; }
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }

  const sinConfigurar = sucursales.filter((s) => !s.configurada);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Numeración por sucursal</h3>
        {ok && <span className="text-xs text-emerald-600">{ok}</span>}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        El timbrado es uno solo (arriba), pero cada establecimiento numera aparte.
        La sucursal que no esté acá <strong>no emite factura</strong>: sigue con el comprobante interno.
      </p>

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}

      {cargando ? (
        <p className="py-6 text-center text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-3">
          {configuradas.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Todavía no hay ninguna sucursal facturando.
            </p>
          )}

          {configuradas.map((c) =>
            editando === c.sucursal_id ? (
              <FilaEdicion
                key={c.sucursal_id}
                nombre={c.sucursal_nombre ?? "Sucursal"}
                inicial={c}
                guardando={guardando}
                onCancelar={() => setEditando(null)}
                onGuardar={guardar}
              />
            ) : (
              <div key={c.sucursal_id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {c.sucursal_nombre ?? "Sucursal"}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        c.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {c.activo ? "FACTURANDO" : "PAUSADA"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Próxima factura: <span className="font-mono font-semibold text-slate-700">{numeroMuestra(c)}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Rango {String(c.numero_inicial).padStart(7, "0")} a {String(c.numero_final).padStart(7, "0")} ·{" "}
                      <span className={c.disponibles < 100 ? "font-semibold text-amber-700" : ""}>
                        quedan {c.disponibles.toLocaleString("es-PY")}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditando(c.sucursal_id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      Editar
                    </button>
                    <button type="button" onClick={() => quitar(c.sucursal_id, c.sucursal_nombre ?? "esta sucursal")}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-red-200 hover:text-red-600">
                      Quitar
                    </button>
                  </div>
                </div>
                {c.disponibles < 100 && (
                  <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    Quedan pocos números en el rango autorizado. Conviene pedir un timbrado nuevo antes de que se agote:
                    cuando llega a cero, la sucursal no puede seguir facturando.
                  </p>
                )}
              </div>
            ),
          )}

          {sinConfigurar.length > 0 && (
            <details className="rounded-lg border border-dashed border-slate-200 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                Agregar una sucursal ({sinConfigurar.length} sin configurar)
              </summary>
              <div className="mt-3 space-y-3">
                {sinConfigurar.map((s) => (
                  <FilaEdicion
                    key={s.id}
                    nombre={s.nombre}
                    inicial={{
                      sucursal_id: s.id, activo: true,
                      establecimiento_codigo: "", punto_expedicion_codigo: "001",
                      numero_inicial: 1, numero_final: 1,
                    }}
                    guardando={guardando}
                    onGuardar={guardar}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function FilaEdicion({
  nombre, inicial, guardando, onGuardar, onCancelar,
}: {
  nombre: string;
  inicial: {
    sucursal_id: string; activo: boolean;
    establecimiento_codigo: string; punto_expedicion_codigo: string;
    numero_inicial: number; numero_final: number;
  };
  guardando: boolean;
  onGuardar: (p: {
    sucursal_id: string; activo: boolean;
    establecimiento_codigo: string; punto_expedicion_codigo: string;
    numero_inicial: number; numero_final: number;
  }) => Promise<void>;
  onCancelar?: () => void;
}) {
  const [est, setEst] = useState(inicial.establecimiento_codigo);
  const [pex, setPex] = useState(inicial.punto_expedicion_codigo);
  const [ini, setIni] = useState(String(inicial.numero_inicial));
  const [fin, setFin] = useState(String(inicial.numero_final));
  const [activo, setActivo] = useState(inicial.activo);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onGuardar({
          sucursal_id: inicial.sucursal_id,
          activo,
          establecimiento_codigo: est,
          punto_expedicion_codigo: pex,
          numero_inicial: parseInt(ini, 10),
          numero_final: parseInt(fin, 10),
        });
      }}
      className="rounded-lg border border-[#4FAEB2]/40 bg-[#4FAEB2]/5 p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-slate-800">{nombre}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Establecimiento</label>
          <input className={inputClass} placeholder="001" value={est} onChange={(e) => setEst(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Punto de expedición</label>
          <input className={inputClass} placeholder="001" value={pex} onChange={(e) => setPex(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">N° desde</label>
          <input type="number" min={1} className={inputClass} value={ini} onChange={(e) => setIni(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">N° hasta</label>
          <input type="number" min={1} className={inputClass} value={fin} onChange={(e) => setFin(e.target.value)} required />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-[#4FAEB2]" />
        Esta sucursal emite factura
      </label>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando}
          className="rounded-lg bg-[#4FAEB2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
