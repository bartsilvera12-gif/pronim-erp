"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useMoney } from "@/lib/i18n/context";
import { ActiveFiltersBar, type ActiveChip } from "@/components/reportes/ActiveFiltersBar";

/**
 * Reporte de descuentos aplicados por motivo — con drill-down.
 *
 * Patrón "INDICADOR → CLIC → LISTADO → FILTROS → EXPORTAR":
 * cualquier fila de agregado (motivo / sucursal / usuario) es clickeable y
 * agrega el filtro correspondiente al listado detalle. El listado se puede
 * exportar a CSV con column picker o imprimir/PDF.
 */

type PorMotivo = { motivo: string; label: string; total_descuento: number; ventas_count: number; ticket_promedio: number; pct: number };
type PorSucursal = { sucursal_id: string | null; sucursal_nombre: string; total_descuento: number; ventas_count: number };
type PorUsuario = { usuario_id: string | null; usuario_nombre: string; total_descuento: number; ventas_count: number };
type VentaConDesc = {
  id: string;
  numero_control: string;
  fecha: string;
  total: number;
  descuento_general: number;
  descuento_motivo: string | null;
  motivo_label: string | null;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
};
type Opciones = {
  sucursales: { id: string; nombre: string }[];
  usuarios: { id: string; nombre: string }[];
  motivos: { codigo: string; label: string }[];
};

function fmtFecha(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtFechaHora(iso: string) {
  try { return new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const COLORS = ["#4FAEB2", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#3b82f6", "#ec4899", "#64748b"];

// Columnas disponibles para el listado — el usuario elige cuáles exportar/imprimir.
type ColKey = "fecha" | "venta" | "sucursal" | "usuario" | "cliente" | "motivo" | "total" | "descuento";
const COLUMNAS: { key: ColKey; label: string; alwaysShow?: boolean }[] = [
  { key: "fecha",     label: "Fecha", alwaysShow: true },
  { key: "venta",     label: "N° Venta", alwaysShow: true },
  { key: "sucursal",  label: "Sucursal" },
  { key: "usuario",   label: "Usuario/Cajera" },
  { key: "cliente",   label: "Cliente" },
  { key: "motivo",    label: "Motivo" },
  { key: "total",     label: "Total venta" },
  { key: "descuento", label: "Descuento", alwaysShow: true },
];

export default function ReporteDescuentosPage() {
  const money = useMoney();
  const fmt = (n: number) => money.format(n || 0);

  const [porMotivo, setPorMotivo] = useState<PorMotivo[]>([]);
  const [porSucursal, setPorSucursal] = useState<PorSucursal[]>([]);
  const [porUsuario, setPorUsuario] = useState<PorUsuario[]>([]);
  const [ventas, setVentas] = useState<VentaConDesc[]>([]);
  const [opciones, setOpciones] = useState<Opciones>({ sucursales: [], usuarios: [], motivos: [] });
  const [total, setTotal] = useState(0);
  const [ventasCount, setVentasCount] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  // Filtros
  const [desde, setDesde] = useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [motivoFiltro, setMotivoFiltro] = useState<string>("");
  const [sucursalFiltro, setSucursalFiltro] = useState<string>("");
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>("");
  const [clienteQ, setClienteQ] = useState<string>(""); // busca en cliente/venta/usuario
  const [colsVisibles, setColsVisibles] = useState<Set<ColKey>>(new Set(COLUMNAS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (motivoFiltro) qs.set("motivo", motivoFiltro);
    if (sucursalFiltro) qs.set("sucursal_id", sucursalFiltro);
    if (usuarioFiltro) qs.set("usuario_id", usuarioFiltro);
    if (clienteQ.trim()) qs.set("q", clienteQ.trim());
    fetchWithSupabaseSession(`/api/reportes/descuentos?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setPorMotivo(j.data?.por_motivo ?? []);
        setPorSucursal(j.data?.por_sucursal ?? []);
        setPorUsuario(j.data?.por_usuario ?? []);
        setVentas(j.data?.ventas ?? []);
        setOpciones(j.data?.opciones ?? { sucursales: [], usuarios: [], motivos: [] });
        setTotal(Number(j.data?.total_general ?? 0));
        setVentasCount(Number(j.data?.ventas_con_descuento_count ?? 0));
        setWarning(j.data?.warning ?? null);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, motivoFiltro, sucursalFiltro, usuarioFiltro, clienteQ]);

  const hayFiltrosExtra = Boolean(motivoFiltro || sucursalFiltro || usuarioFiltro || clienteQ.trim());

  function limpiarFiltros() {
    setMotivoFiltro(""); setSucursalFiltro(""); setUsuarioFiltro(""); setClienteQ("");
  }

  const columnasVisibles = useMemo(() => COLUMNAS.filter((c) => colsVisibles.has(c.key)), [colsVisibles]);

  function toggleCol(k: ColKey) {
    setColsVisibles((prev) => {
      const s = new Set(prev);
      if (s.has(k)) {
        // No dejar quitar la última visible ni las alwaysShow
        if (COLUMNAS.find((c) => c.key === k)?.alwaysShow) return prev;
        s.delete(k);
      } else s.add(k);
      return s;
    });
  }

  function valorParaCol(v: VentaConDesc, col: ColKey): string {
    switch (col) {
      case "fecha":     return fmtFechaHora(v.fecha);
      case "venta":     return v.numero_control;
      case "sucursal":  return v.sucursal_nombre ?? "";
      case "usuario":   return v.usuario_nombre ?? "";
      case "cliente":   return v.cliente_nombre ?? "";
      case "motivo":    return v.motivo_label ?? v.descuento_motivo ?? "";
      case "total":     return String(v.total);
      case "descuento": return String(v.descuento_general);
    }
  }

  function exportarCsv() {
    const rows: string[] = [];
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.push(columnasVisibles.map((c) => esc(c.label)).join(";"));
    ventas.forEach((v) => {
      rows.push(columnasVisibles.map((c) => esc(valorParaCol(v, c.key))).join(";"));
    });
    // Fila de totales (solo suma total y descuento)
    const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalDesc = ventas.reduce((s, v) => s + Number(v.descuento_general || 0), 0);
    rows.push("");
    rows.push(columnasVisibles.map((c) => {
      if (c.key === "total")     return String(totalVentas);
      if (c.key === "descuento") return String(totalDesc);
      if (c.key === "fecha")     return "TOTAL";
      return "";
    }).map(esc).join(";"));
    const csv = "﻿" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = [motivoFiltro, sucursalFiltro && "suc", usuarioFiltro && "usr"].filter(Boolean).join("_");
    a.download = `descuentos_${desde}_a_${hasta}${suffix ? `_${suffix}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function imprimir() { window.print(); }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400 print:hidden">
        <Link href="/admin" className="hover:text-gray-700">Administración</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Reporte de descuentos</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reporte de descuentos</h1>
        <p className="text-sm text-slate-500 mt-0.5 print:hidden">
          Click en cualquier motivo, sucursal o usuario para filtrar. Exportá el listado a CSV o imprimí para reuniones.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center print:hidden">
        <label className="text-xs text-slate-500">Desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        <label className="text-xs text-slate-500 ml-2">Hasta</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />

        {opciones.sucursales.length > 0 && (
          <select value={sucursalFiltro} onChange={(e) => setSucursalFiltro(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas las sucursales</option>
            {opciones.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        {opciones.usuarios.length > 0 && (
          <select value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los usuarios</option>
            {opciones.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
        {opciones.motivos.length > 0 && (
          <select value={motivoFiltro} onChange={(e) => setMotivoFiltro(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos los motivos</option>
            {opciones.motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.label}</option>)}
          </select>
        )}
        <input type="text" placeholder="Buscar cliente / N° venta…"
          value={clienteQ} onChange={(e) => setClienteQ(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[180px]" />

      </div>

      <ActiveFiltersBar
        resourceLabel="ventas con descuento"
        resultCount={ventas.length}
        totalCount={ventasCount}
        onClearAll={hayFiltrosExtra ? limpiarFiltros : undefined}
        chips={([
          motivoFiltro && { key: "motivo", emoji: "🏷️", label: `Motivo: ${opciones.motivos.find((m) => m.codigo === motivoFiltro)?.label ?? motivoFiltro}`, onRemove: () => setMotivoFiltro("") },
          sucursalFiltro && { key: "sucursal", emoji: "🏬", label: `Sucursal: ${opciones.sucursales.find((s) => s.id === sucursalFiltro)?.nombre ?? sucursalFiltro}`, onRemove: () => setSucursalFiltro("") },
          usuarioFiltro && { key: "usuario", emoji: "👤", label: `Usuario: ${opciones.usuarios.find((u) => u.id === usuarioFiltro)?.nombre ?? usuarioFiltro}`, onRemove: () => setUsuarioFiltro("") },
          clienteQ.trim() && { key: "q", label: `Búsqueda: "${clienteQ.trim()}"`, onRemove: () => setClienteQ("") },
        ].filter(Boolean) as ActiveChip[])}
        right={<span className="text-xs text-slate-500">· <strong className="text-slate-800">{fmt(total)}</strong> descontado</span>}
      />

      {warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{warning}</div>}

      {cargando ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Cargando…</p>
      ) : (
        <>
          {/* Por motivo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Por motivo</h2>
              <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar la lista debajo.</p>
            </header>
            {porMotivo.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin ventas con descuento en el período.</p>
            ) : (
              <div className="p-4 space-y-3">
                {porMotivo.map((m, idx) => (
                  <button
                    key={m.motivo}
                    type="button"
                    onClick={() => setMotivoFiltro(motivoFiltro === m.motivo ? "" : m.motivo)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      motivoFiltro === m.motivo
                        ? "border-[#4FAEB2] bg-[#4FAEB2]/5 ring-2 ring-[#4FAEB2]/20"
                        : "border-slate-200 hover:border-[#4FAEB2] hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <p className="text-sm font-bold text-slate-800">{m.label}</p>
                        <span className="text-[10px] font-mono text-slate-400">{m.motivo}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-800">{fmt(m.total_descuento)}</p>
                        <p className="text-[10px] text-slate-500">{m.ventas_count} vta(s) · prom. {fmt(m.ticket_promedio)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{m.pct}% del total</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Por sucursal + Por usuario en grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {porSucursal.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800">Por sucursal</h2>
                  <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar.</p>
                </header>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Sucursal</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Vtas</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Descontado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {porSucursal.map((s) => {
                      const activa = sucursalFiltro === s.sucursal_id;
                      return (
                        <tr key={s.sucursal_id ?? "sin"}
                          onClick={() => s.sucursal_id && setSucursalFiltro(activa ? "" : s.sucursal_id)}
                          className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                          <td className="px-4 py-2 text-slate-800">{s.sucursal_nombre}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.ventas_count}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{fmt(s.total_descuento)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {porUsuario.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800">Por usuario / cajera</h2>
                  <p className="text-[11px] text-slate-500 print:hidden">Click para filtrar.</p>
                </header>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Usuario</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Vtas</th>
                      <th className="text-right px-4 py-2 text-[11px] uppercase font-semibold text-slate-600">Descontado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {porUsuario.map((u) => {
                      const activa = usuarioFiltro === u.usuario_id;
                      return (
                        <tr key={u.usuario_id ?? "sin"}
                          onClick={() => u.usuario_id && setUsuarioFiltro(activa ? "" : u.usuario_id)}
                          className={`cursor-pointer ${activa ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"}`}>
                          <td className="px-4 py-2 text-slate-800">{u.usuario_nombre}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{u.ventas_count}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800">{fmt(u.total_descuento)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ventas detalle */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Ventas con descuento
                {hayFiltrosExtra && (
                  <span className="ml-2 text-xs font-normal text-[#3F8E91]">(filtrado)</span>
                )}
                <span className="ml-2 text-xs font-normal text-slate-400">{ventas.length} en el listado</span>
              </h2>
              <div className="flex flex-wrap gap-2 print:hidden relative">
                <button type="button" onClick={() => setPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Columnas ({colsVisibles.size})
                </button>
                {pickerOpen && (
                  <div className="absolute right-0 top-9 z-10 rounded-lg border border-slate-200 bg-white shadow-lg p-3 min-w-[200px] space-y-1">
                    {COLUMNAS.map((c) => (
                      <label key={c.key} className={`flex items-center gap-2 text-xs cursor-pointer ${c.alwaysShow ? "opacity-50 cursor-not-allowed" : ""}`}>
                        <input type="checkbox" checked={colsVisibles.has(c.key)}
                          disabled={c.alwaysShow}
                          onChange={() => toggleCol(c.key)}
                          className="h-3.5 w-3.5" />
                        {c.label}
                        {c.alwaysShow && <span className="text-[9px] text-slate-400">(fija)</span>}
                      </label>
                    ))}
                  </div>
                )}
                <button type="button" onClick={exportarCsv}
                  disabled={ventas.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Exportar CSV ({ventas.length})
                </button>
                <button type="button" onClick={imprimir}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Imprimir / PDF
                </button>
              </div>
            </header>
            {ventas.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Sin ventas para mostrar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {columnasVisibles.map((c) => (
                        <th key={c.key} className={`px-3 py-2 text-[11px] uppercase font-semibold text-slate-600 ${c.key === "total" || c.key === "descuento" ? "text-right" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ventas.slice(0, 500).map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        {columnasVisibles.map((c) => {
                          if (c.key === "fecha") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtFecha(v.fecha)}</td>;
                          if (c.key === "venta") return <td key={c.key} className="px-3 py-2 font-mono text-xs"><Link href={`/ventas/${v.id}`} className="text-[#3F8E91] hover:underline">{v.numero_control}</Link></td>;
                          if (c.key === "sucursal") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.sucursal_nombre ?? "—"}</td>;
                          if (c.key === "usuario") return <td key={c.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.usuario_nombre ?? "—"}</td>;
                          if (c.key === "cliente") return <td key={c.key} className="px-3 py-2 text-xs text-slate-700">{v.cliente_nombre ? <Link href={`/clientes/${v.cliente_id}`} className="text-[#3F8E91] hover:underline">{v.cliente_nombre}</Link> : "—"}</td>;
                          if (c.key === "motivo") return <td key={c.key} className="px-3 py-2"><span className="inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px]">{v.motivo_label ?? "—"}</span></td>;
                          if (c.key === "total") return <td key={c.key} className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(v.total)}</td>;
                          if (c.key === "descuento") return <td key={c.key} className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">−{fmt(v.descuento_general)}</td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ventas.length > 500 && (
                  <p className="py-2 text-center text-[11px] text-slate-400">Mostrando 500 de {ventas.length}. Achicá el rango para ver el resto en la tabla (el CSV incluye todo).</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
