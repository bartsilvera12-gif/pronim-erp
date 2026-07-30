"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

/**
 * Conciliación bancaria. Lista pagos con su estado (pendiente/en_proceso/
 * confirmada/conciliada/descartada), filtros y acciones masivas para
 * marcar como conciliado o rechazar. Cada fila enlaza a la venta original.
 */

type EstadoConc = "pendiente" | "en_proceso" | "confirmada" | "conciliada" | "descartada";

type Pago = {
  id: string;
  venta_id: string;
  numero_control: string | null;
  cliente_id: string | null;
  sucursal_nombre: string | null;
  metodo_pago: string;
  entidad_nombre_snapshot: string | null;
  monto: number;
  referencia: string | null;
  titular: string | null;
  fecha_acreditacion: string | null;
  observacion: string | null;
  conciliacion_estado: EstadoConc;
  conciliado_at: string | null;
  conciliado_by_nombre: string | null;
  conciliacion_nota: string | null;
  created_at: string;
};

const ESTADO_META: Record<EstadoConc, { emoji: string; label: string; bg: string }> = {
  pendiente:  { emoji: "🟡", label: "Pendiente",  bg: "bg-amber-100 text-amber-800 border-amber-200" },
  en_proceso: { emoji: "🔵", label: "En proceso", bg: "bg-sky-100 text-sky-800 border-sky-200" },
  confirmada: { emoji: "🟢", label: "Confirmada", bg: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  conciliada: { emoji: "👀", label: "Conciliada", bg: "bg-slate-200 text-slate-800 border-slate-300" },
  descartada: { emoji: "❌", label: "Descartada", bg: "bg-rose-100 text-rose-800 border-rose-200" },
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia",
  qr: "QR", billetera: "Billetera", credito_cliente: "Crédito cliente", otro: "Otro",
};

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try { const d = new Date(iso); return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`; }
  catch { return iso; }
}

export default function ConciliacionPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [totales, setTotales] = useState<{ estado: string; metodo: string; total: number; count: number }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState<string>("");

  // Filtros
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<EstadoConc | "">("");
  const [metodo, setMetodo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [tick, setTick] = useState(0); // trigger de refetch

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setErr(null);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (estado) qs.set("estado", estado);
    if (metodo) qs.set("metodo", metodo);
    if (q.trim()) qs.set("q", q.trim());
    qs.set("limit", "500");
    fetchWithSupabaseSession(`/api/conciliacion?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setPagos((j.data?.pagos ?? []) as Pago[]);
        setTotales(j.data?.totales ?? []);
      })
      .catch((e) => { if (!cancel) setErr(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, estado, metodo, q, tick]);

  const filtradosVisibles = pagos;
  const allSel = filtradosVisibles.length > 0 && filtradosVisibles.every((p) => seleccion.has(p.id));

  function toggleUno(id: string) {
    setSeleccion((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleTodos() {
    if (allSel) setSeleccion(new Set());
    else setSeleccion(new Set(filtradosVisibles.map((p) => p.id)));
  }

  async function cambiarEstado(nuevo: EstadoConc) {
    if (seleccion.size === 0) return;
    setErr(null);
    try {
      const r = await fetchWithSupabaseSession("/api/conciliacion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...seleccion], estado: nuevo, nota: nota.trim() || null }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setSeleccion(new Set());
      setNota("");
      setTick((n) => n + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al actualizar.");
    }
  }

  // Resumen por estado (para banner arriba)
  const resumenPorEstado = useMemo(() => {
    const acc: Record<string, { total: number; count: number }> = {};
    for (const t of totales) {
      const cur = acc[t.estado] ?? { total: 0, count: 0 };
      cur.total += t.total; cur.count += t.count;
      acc[t.estado] = cur;
    }
    return acc;
  }, [totales]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Conciliación bancaria</h1>
          <p className="text-sm text-slate-500 mt-0.5">Estado de cada pago recibido. Marcá conciliado tras confirmar contra el extracto.</p>
        </header>

        {/* Resumen por estado */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(["pendiente","en_proceso","confirmada","conciliada","descartada"] as EstadoConc[]).map((e) => {
            const meta = ESTADO_META[e];
            const r = resumenPorEstado[e] ?? { total: 0, count: 0 };
            return (
              <button key={e} type="button" onClick={() => setEstado(estado === e ? "" : e)}
                className={`text-left rounded-xl border p-3 shadow-sm transition ${meta.bg} ${estado === e ? "ring-2 ring-[#4FAEB2]" : ""}`}>
                <p className="text-xs font-semibold">{meta.emoji} {meta.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{fmt(r.total)}</p>
                <p className="text-[10px]">{r.count} pago(s)</p>
              </button>
            );
          })}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" title="Desde" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" title="Hasta" />
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los métodos</option>
            {Object.entries(METODO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en Nº venta / referencia / titular / observación…"
            className="flex-1 min-w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          {(desde || hasta || estado || metodo || q) && (
            <button type="button"
              onClick={() => { setDesde(""); setHasta(""); setEstado(""); setMetodo(""); setQ(""); }}
              className="text-xs text-slate-500 hover:text-slate-800 underline">Limpiar</button>
          )}
          <span className="ml-auto text-xs text-slate-400">{filtradosVisibles.length} pagos</span>
        </div>

        {/* Acciones masivas */}
        {seleccion.size > 0 && (
          <div className="bg-white rounded-xl border-2 border-[#4FAEB2] shadow-sm p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{seleccion.size} seleccionado(s)</span>
            <input type="text" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Nota (opcional): referencia externa, motivo…"
              className="flex-1 min-w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            <button type="button" onClick={() => cambiarEstado("en_proceso")}
              className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5">🔵 En proceso</button>
            <button type="button" onClick={() => cambiarEstado("confirmada")}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5">🟢 Confirmar</button>
            <button type="button" onClick={() => cambiarEstado("conciliada")}
              className="rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5">👀 Conciliar</button>
            <button type="button" onClick={() => cambiarEstado("descartada")}
              className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5">❌ Descartar</button>
            <button type="button" onClick={() => setSeleccion(new Set())}
              className="text-xs text-slate-500 hover:text-slate-800 underline">Cancelar</button>
          </div>
        )}

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {cargando ? (
            <p className="py-16 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
          ) : filtradosVisibles.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-1">
              <p className="text-4xl">💸</p>
              <p className="text-sm">Sin pagos que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-8 px-3 py-2"><input type="checkbox" checked={allSel} onChange={toggleTodos} /></th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Estado</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Fecha</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Venta</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Método</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Entidad / Titular</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Referencia</th>
                    <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Monto</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Conciliado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtradosVisibles.map((p) => {
                    const meta = ESTADO_META[p.conciliacion_estado] ?? ESTADO_META.pendiente;
                    const sel = seleccion.has(p.id);
                    return (
                      <tr key={p.id} className={sel ? "bg-[#4FAEB2]/5" : "hover:bg-slate-50"}>
                        <td className="px-3 py-2"><input type="checkbox" checked={sel} onChange={() => toggleUno(p.id)} /></td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.bg}`}>
                            {meta.emoji} {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap tabular-nums">{fmtFecha(p.created_at)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.numero_control ? (
                            <Link href={`/ventas/${p.venta_id}`} className="text-[#3F8E91] hover:underline">{p.numero_control}</Link>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{p.sucursal_nombre ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-slate-700">{METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}</td>
                        <td className="px-3 py-2 text-xs text-slate-700">
                          {p.entidad_nombre_snapshot ?? "—"}
                          {p.titular && <p className="text-[10px] text-slate-400">{p.titular}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-600">
                          {p.referencia ?? <span className="text-slate-300">—</span>}
                          {p.conciliacion_nota && <p className="text-[10px] text-slate-400 italic mt-0.5">📝 {p.conciliacion_nota}</p>}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-800 whitespace-nowrap">{fmt(p.monto)}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {p.conciliado_by_nombre ? (
                            <>
                              <p>{p.conciliado_by_nombre}</p>
                              {p.conciliado_at && <p className="text-[10px] text-slate-400">{fmtFecha(p.conciliado_at)}</p>}
                            </>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
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
