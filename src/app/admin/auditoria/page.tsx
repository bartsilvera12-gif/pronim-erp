"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Central de auditoría: qué se hizo, quién y cuándo. Filtros por período,
 * tipo, entidad, usuario, sucursal + búsqueda por texto (referencia/motivo).
 * Cada fila puede expandirse para ver dato_anterior vs dato_nuevo (JSON).
 */

type Evento = {
  id: string;
  fecha: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  tipo: string;
  entidad: string;
  entidad_id: string | null;
  referencia: string | null;
  dato_anterior: unknown;
  dato_nuevo: unknown;
  motivo: string | null;
};

const TIPO_LABELS: Record<string, string> = {
  venta_anulada: "Venta anulada",
  descuento_aplicado: "Descuento aplicado",
  cliente_editado: "Cliente editado",
  precio_actualizado: "Precio actualizado",
  meta_cambiada: "Meta cambiada",
  comision_cambiada: "Comisión cambiada",
};

function fmtFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return iso; }
}

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  // Filtros
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [entidad, setEntidad] = useState<string>("");
  const [q, setQ] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setErr(null);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (tipo) qs.set("tipo", tipo);
    if (entidad) qs.set("entidad", entidad);
    if (q.trim()) qs.set("q", q.trim());
    qs.set("limit", "500");
    fetchWithSupabaseSession(`/api/auditoria?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setEventos((j.data?.eventos ?? []) as Evento[]);
      })
      .catch((e) => { if (!cancel) setErr(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, tipo, entidad, q]);

  const tiposDisponibles = useMemo(() => {
    const s = new Set(eventos.map((e) => e.tipo));
    return Array.from(s).sort();
  }, [eventos]);
  const entidadesDisponibles = useMemo(() => {
    const s = new Set(eventos.map((e) => e.entidad));
    return Array.from(s).sort();
  }, [eventos]);

  function toggle(id: string) {
    setExpandido((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría</h1>
          <p className="text-sm text-slate-500 mt-0.5">Historial de operaciones sensibles con antes/después/motivo.</p>
        </header>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" title="Desde" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" title="Hasta" />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los tipos</option>
            {tiposDisponibles.map((t) => <option key={t} value={t}>{TIPO_LABELS[t] ?? t}</option>)}
          </select>
          <select value={entidad} onChange={(e) => setEntidad(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las entidades</option>
            {entidadesDisponibles.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en referencia / motivo…"
            className="flex-1 min-w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          {(desde || hasta || tipo || entidad || q) && (
            <button type="button" onClick={() => { setDesde(""); setHasta(""); setTipo(""); setEntidad(""); setQ(""); }}
              className="text-xs text-slate-500 hover:text-slate-800 underline">Limpiar</button>
          )}
          <span className="ml-auto text-xs text-slate-400">{eventos.length} eventos</span>
        </div>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <p className="py-16 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
          ) : eventos.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-1">
              <p className="text-4xl">📋</p>
              <p className="text-sm">Sin eventos registrados con esos filtros.</p>
              <p className="text-[11px]">Si acabás de correr la migración, los primeros eventos aparecen al aplicar descuentos o anular ventas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Fecha</th>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Usuario</th>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Tipo</th>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Referencia</th>
                    <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Motivo</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventos.map((e) => {
                    const isOpen = expandido.has(e.id);
                    return (
                      <>
                        <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => toggle(e.id)}>
                          <td className="px-4 py-2 text-xs text-slate-600 tabular-nums whitespace-nowrap">{fmtFecha(e.fecha)}</td>
                          <td className="px-4 py-2 text-slate-800 whitespace-nowrap">{e.usuario_nombre ?? <span className="text-slate-400">Sistema</span>}</td>
                          <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{e.sucursal_nombre ?? "—"}</td>
                          <td className="px-4 py-2">
                            <span className="inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium">
                              {TIPO_LABELS[e.tipo] ?? e.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs font-mono text-slate-600">{e.referencia ?? "—"}</td>
                          <td className="px-4 py-2 text-xs text-slate-600 max-w-xs truncate" title={e.motivo ?? ""}>{e.motivo ?? "—"}</td>
                          <td className="px-2 py-2 text-slate-400">{isOpen ? "▼" : "▶"}</td>
                        </tr>
                        {isOpen && (
                          <tr key={`${e.id}-detail`} className="bg-slate-50/60">
                            <td colSpan={7} className="px-6 py-3">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="font-semibold text-slate-500 uppercase text-[10px] mb-1">Antes</p>
                                  <pre className="bg-white rounded border border-slate-200 p-2 overflow-x-auto text-[11px]">{e.dato_anterior ? JSON.stringify(e.dato_anterior, null, 2) : "—"}</pre>
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-500 uppercase text-[10px] mb-1">Después</p>
                                  <pre className="bg-white rounded border border-slate-200 p-2 overflow-x-auto text-[11px]">{e.dato_nuevo ? JSON.stringify(e.dato_nuevo, null, 2) : "—"}</pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
