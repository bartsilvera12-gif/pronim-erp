"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { VistasGuardadasBar } from "@/components/reportes/VistasGuardadasBar";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type SegmentoSlug =
  | "vip" | "con_credito" | "con_cashback"
  | "inactivos_90d" | "nuevos_mes" | "en_riesgo";

type Segmento = {
  slug: SegmentoSlug;
  label: string;
  descripcion: string;
  count: number; // baseline (sin filtros)
};

type ClienteSeg = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  es_vip: boolean;
  ultima_venta_at: string | null;
  total_comprado: string;
  cnt_ventas: number;
  saldo_credito: string;
  saldo_cashback: string;
};

const FLAGS_POS = ["vip","con_credito","con_cashback","inactivos_90d","nuevos_mes","en_riesgo"] as const;

export default function ClientesSegmentosPage() {
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [clientes, setClientes] = useState<ClienteSeg[]>([]);
  const [cargando, setCargando] = useState(true);

  // Quick-filters de segmento (pegan al server, muestran baseline counts).
  const [filtros, setFiltros] = useState<Set<SegmentoSlug>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleFiltro(slug: SegmentoSlug) {
    setFiltros((prev) => {
      const s = new Set(prev);
      if (s.has(slug)) s.delete(slug); else s.add(slug);
      return s;
    });
  }

  // Vistas guardadas (guardan la selección de segmentos).
  function aplicarVistaGuardada(f: Record<string, unknown>) {
    const s = new Set<SegmentoSlug>();
    for (const k of FLAGS_POS) if (f[k] === true) s.add(k);
    setFiltros(s);
  }
  const filtrosActualesObj = useMemo(() => {
    const o: Record<string, unknown> = {};
    filtros.forEach((k) => { o[k] = true; });
    return o;
  }, [filtros]);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    filtros.forEach((slug) => qs.set(slug, "1"));
    fetchWithSupabaseSession(`/api/clientes/segmentos?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setSegmentos(j.data?.segmentos ?? []);
        setTotalClientes(Number(j.data?.total_clientes ?? 0));
        setClientes((j.data?.clientes ?? []) as ClienteSeg[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [filtros]);

  async function toggleVip(cliente: ClienteSeg) {
    const nuevoVip = !cliente.es_vip;
    setClientes((prev) => prev.map((c) => c.id === cliente.id ? { ...c, es_vip: nuevoVip } : c));
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${cliente.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ es_vip: nuevoVip }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
    } catch (e) {
      setClientes((prev) => prev.map((c) => c.id === cliente.id ? { ...c, es_vip: !nuevoVip } : c));
      setError(e instanceof Error ? e.message : "No se pudo actualizar VIP.");
    }
  }

  const filtrosActivos = useMemo(() => segmentos.filter((s) => filtros.has(s.slug)), [segmentos, filtros]);

  const columns = useMemo<ColumnDef<ClienteSeg>[]>(() => [
    { key: "nombre", label: "Cliente", type: "text", required: true, get: (c) => c.nombre },
    { key: "telefono", label: "Teléfono", type: "text", get: (c) => c.telefono ?? "" },
    { key: "email", label: "Email", type: "text", get: (c) => c.email ?? "", defaultVisible: false },
    { key: "vip", label: "VIP", type: "enum", get: (c) => c.es_vip ? "Sí" : "No",
      enumOptions: [{ value: "Sí", label: "VIP" }, { value: "No", label: "No VIP" }], align: "center",
      render: (c) => (
        <button type="button" onClick={() => toggleVip(c)} title={c.es_vip ? "Quitar VIP" : "Marcar VIP"}
          className={`text-lg leading-none transition print:hidden ${c.es_vip ? "opacity-100" : "opacity-30 hover:opacity-70"}`}>
          {c.es_vip ? "⭐" : "☆"}
        </button>
      ) },
    { key: "ultima", label: "Última compra", type: "date", get: (c) => c.ultima_venta_at },
    { key: "compras", label: "Compras", type: "number", get: (c) => c.cnt_ventas, total: "sum" },
    { key: "total_comprado", label: "Total comprado", type: "money", get: (c) => Number(c.total_comprado) || 0, total: "sum" },
    { key: "credito", label: "Crédito", type: "money", required: true, get: (c) => Number(c.saldo_credito) || 0, total: "sum" },
    { key: "cashback", label: "Cashback", type: "money", required: true, get: (c) => Number(c.saldo_cashback) || 0, total: "sum" },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [clientes]);

  return (
    <div className="max-w-full space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tildá segmentos para acotar, después filtrá y ordená cualquier columna como en Excel.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/clientes/nuevo"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-3 py-1.5 text-xs font-semibold shadow-sm">
            + Nuevo cliente
          </Link>
        </div>
      </div>

      <div className="flex justify-end print:hidden">
        <VistasGuardadasBar
          reporteKey="segmentos_clientes"
          hayFiltros={filtros.size > 0}
          filtrosActuales={filtrosActualesObj}
          nombreSugerido={filtrosActivos.map((s) => s.label).join(" + ")}
          onAplicar={aplicarVistaGuardada}
          onError={(msg) => setError(msg)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 flex items-start justify-between gap-2 print:hidden">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-600 hover:underline text-xs">Cerrar</button>
        </div>
      )}

      {/* Tarjetas de segmento (quick-filters server-side, con baseline counts) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
        {segmentos.length === 0 && cargando ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 h-20 animate-pulse" />
          ))
        ) : segmentos.map((s) => {
          const activo = filtros.has(s.slug);
          return (
            <button key={s.slug} type="button" onClick={() => toggleFiltro(s.slug)} title={s.descripcion}
              className={`text-left rounded-xl border p-3 transition shadow-sm ${
                activo ? "border-[#4FAEB2] bg-[#4FAEB2]/10 ring-2 ring-[#4FAEB2]/30"
                       : "border-slate-200 bg-white hover:border-[#4FAEB2]/50 hover:shadow"
              }`}>
              <div className="flex items-center justify-end mb-1">
                <span className={`text-xl font-bold tabular-nums ${activo ? "text-[#3F8E91]" : "text-slate-700"}`}>{s.count}</span>
              </div>
              <p className={`text-xs font-bold ${activo ? "text-[#3F8E91]" : "text-slate-800"}`}>{s.label}</p>
              {activo && <p className="text-[10px] text-[#3F8E91] mt-1 font-semibold">✓ segmento activo</p>}
            </button>
          );
        })}
      </div>

      {filtrosActivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs text-slate-500 font-semibold">Segmentos:</span>
          {filtrosActivos.map((f) => (
            <span key={f.slug} className="inline-flex items-center gap-1 rounded-full bg-[#4FAEB2]/10 border border-[#4FAEB2]/30 px-2 py-0.5 text-xs text-[#3F8E91] font-semibold">
              {f.label}
              <button type="button" onClick={() => toggleFiltro(f.slug)} className="ml-1 text-[#3F8E91] hover:text-[#2a6a6d]">×</button>
            </span>
          ))}
          <button type="button" onClick={() => setFiltros(new Set())} className="text-xs text-slate-500 hover:text-slate-800 underline">Quitar segmentos</button>
          <span className="text-[11px] text-slate-400">· {clientes.length} de {totalClientes} clientes en este segmento</span>
        </div>
      )}

      {/* Explorador tipo Excel sobre los clientes del segmento */}
      <DataExplorer<ClienteSeg>
        titulo=""
        rows={clientes}
        columns={columns}
        cargando={cargando}
        csvName="clientes"
        detailHref={(c) => `/clientes/${c.id}`}
      />
    </div>
  );
}
