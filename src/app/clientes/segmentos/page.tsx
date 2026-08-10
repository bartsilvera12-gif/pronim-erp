"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";

type Segmento = {
  slug: string;
  label: string;
  descripcion: string;
  emoji: string;
  count: number;
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

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "Sin compras";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffD = Math.floor(diffMs / 86400000);
    if (diffD === 0) return "Hoy";
    if (diffD === 1) return "Ayer";
    if (diffD < 30) return `hace ${diffD}d`;
    if (diffD < 365) return `hace ${Math.floor(diffD / 30)}m`;
    return `hace ${Math.floor(diffD / 365)}a`;
  } catch { return iso; }
}

function fmtFechaAbs(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function ClientesSegmentosPage() {
  const money = useMoney();
  const fmt = (n: number | string) => money.format(Number(n) || 0);

  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [cargandoHub, setCargandoHub] = useState(true);

  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteSeg[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargandoHub(true);
    fetchWithSupabaseSession("/api/clientes/segmentos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setSegmentos(j.data?.segmentos ?? []);
        setTotalClientes(Number(j.data?.total_clientes ?? 0));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => { if (!cancel) setCargandoHub(false); });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!seleccionado) { setClientes([]); return; }
    let cancel = false;
    setCargandoLista(true);
    setBusqueda("");
    fetchWithSupabaseSession(`/api/clientes/segmentos?tipo=${seleccionado}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setClientes((j.data?.clientes ?? []) as ClienteSeg[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => { if (!cancel) setCargandoLista(false); });
    return () => { cancel = true; };
  }, [seleccionado]);

  const segMeta = seleccionado ? segmentos.find((s) => s.slug === seleccionado) : null;

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      (c.nombre ?? "").toLowerCase().includes(q)
      || (c.telefono ?? "").toLowerCase().includes(q)
      || (c.email ?? "").toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  function exportarCsv() {
    if (!segMeta) return;
    const rows: string[] = [];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    rows.push(["Nombre","Teléfono","Email","VIP","Última compra","Total comprado (Gs)","Compras","Crédito (Gs)","Cashback (Gs)"].join(";"));
    clientesFiltrados.forEach((c) => {
      rows.push([
        c.nombre,
        c.telefono ?? "",
        c.email ?? "",
        c.es_vip ? "Sí" : "",
        fmtFechaAbs(c.ultima_venta_at),
        c.total_comprado,
        String(c.cnt_ventas),
        c.saldo_credito,
        c.saldo_cashback,
      ].map(esc).join(";"));
    });
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${segMeta.slug}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleVip(cliente: ClienteSeg) {
    const nuevoVip = !cliente.es_vip;
    setClientes((prev) => prev.map((c) => c.id === cliente.id ? { ...c, es_vip: nuevoVip } : c));
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${cliente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ es_vip: nuevoVip }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
    } catch (e) {
      // Rollback
      setClientes((prev) => prev.map((c) => c.id === cliente.id ? { ...c, es_vip: !nuevoVip } : c));
      setError(e instanceof Error ? e.message : "No se pudo actualizar VIP.");
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Segmentos de clientes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Explorá tu cartera por categoría. Hacé click en cualquier tarjeta para ver el listado y exportarlo.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-600 hover:underline text-xs">Cerrar</button>
        </div>
      )}

      {/* Hub de tarjetas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 print:hidden">
        {cargandoHub ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 h-24 animate-pulse" />
          ))
        ) : segmentos.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => setSeleccionado(seleccionado === s.slug ? null : s.slug)}
            className={`text-left rounded-xl border p-4 transition shadow-sm ${
              seleccionado === s.slug
                ? "border-[#4FAEB2] bg-[#4FAEB2]/5 ring-2 ring-[#4FAEB2]/20"
                : "border-slate-200 bg-white hover:border-[#4FAEB2]/50 hover:shadow"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">{s.emoji}</span>
              <span className="text-2xl font-bold tabular-nums text-slate-800">{s.count}</span>
            </div>
            <p className="text-sm font-bold text-slate-800">{s.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.descripcion}</p>
          </button>
        ))}
      </div>

      {!cargandoHub && (
        <p className="text-xs text-slate-400 print:hidden">
          Total de clientes: <strong className="text-slate-700">{totalClientes}</strong>
        </p>
      )}

      {/* Listado del segmento seleccionado */}
      {seleccionado && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                {segMeta?.emoji} {segMeta?.label}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {clientesFiltrados.length} {clientesFiltrados.length === 1 ? "cliente" : "clientes"}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{segMeta?.descripcion}</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <input
                type="text"
                placeholder="Buscar…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
              <button type="button" onClick={exportarCsv}
                disabled={clientesFiltrados.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                Exportar CSV
              </button>
              <button type="button" onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Imprimir / PDF
              </button>
            </div>
          </header>
          {cargandoLista ? (
            <p className="py-10 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>
          ) : clientesFiltrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Sin clientes en este segmento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Cliente</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 hidden md:table-cell">Contacto</th>
                    <th className="text-center px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">VIP</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Última compra</th>
                    <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 hidden lg:table-cell">Total comprado</th>
                    <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Crédito</th>
                    <th className="text-right px-3 py-2 text-[11px] uppercase font-semibold text-slate-600">Cashback</th>
                    <th className="text-left px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 print:hidden">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientesFiltrados.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{c.nombre}</p>
                        <p className="text-[11px] text-slate-400 md:hidden">{c.telefono ?? ""}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 hidden md:table-cell">
                        {c.telefono ?? "—"}
                        {c.email ? <p className="text-[11px] text-slate-400">{c.email}</p> : null}
                      </td>
                      <td className="px-3 py-2 text-center print:text-slate-700">
                        <button
                          type="button"
                          onClick={() => toggleVip(c)}
                          title={c.es_vip ? "Quitar VIP" : "Marcar VIP"}
                          className={`text-lg leading-none transition print:hidden ${c.es_vip ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
                        >
                          {c.es_vip ? "⭐" : "☆"}
                        </button>
                        <span className="hidden print:inline">{c.es_vip ? "VIP" : ""}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {fmtFechaCorta(c.ultima_venta_at)}
                        <p className="text-[10px] text-slate-400">{c.cnt_ventas} vta(s)</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 hidden lg:table-cell">{fmt(c.total_comprado)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{Number(c.saldo_credito) > 0 ? fmt(c.saldo_credito) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-pink-700">{Number(c.saldo_cashback) > 0 ? fmt(c.saldo_cashback) : "—"}</td>
                      <td className="px-3 py-2 print:hidden">
                        <Link href={`/clientes/${c.id}`} className="text-[#3F8E91] hover:underline text-xs font-medium">
                          Ver ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
