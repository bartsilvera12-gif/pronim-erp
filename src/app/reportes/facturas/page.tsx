"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fmtActive } from "@/lib/i18n/currency";

type Factura = {
  id: string; fecha: string; numero: string; timbrado: string | null;
  numero_control: string | null; anulada: boolean;
  cliente: string; documento: string; sucursal: string | null;
  exentas: number; gravado5: number; gravado10: number;
  iva5: number; iva10: number; total: number;
};
type Totales = {
  emitidas: number; anuladas: number;
  exentas: number; gravado5: number; gravado10: number;
  iva5: number; iva10: number; total: number;
};
type Sucursal = { id: string; nombre: string };

function iso(d: Date) { return d.toISOString().slice(0, 10); }
/** Primer y último día del mes con `desplazamiento` meses de diferencia. */
function mes(desplazamiento = 0): [string, string] {
  const h = new Date();
  const ini = new Date(h.getFullYear(), h.getMonth() + desplazamiento, 1);
  const fin = new Date(h.getFullYear(), h.getMonth() + desplazamiento + 1, 0);
  return [iso(ini), iso(fin)];
}

function fmtFecha(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? String(s).slice(0, 10)
    : d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ReporteFacturasPage() {
  const [filas, setFilas] = useState<Factura[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Arranca en el mes actual: el uso principal es "pasale las facturas del mes
  // a la contadora".
  const [[d0, h0]] = useState(() => mes(0));
  const [desde, setDesde] = useState(d0);
  const [hasta, setHasta] = useState(h0);
  const [sucursalId, setSucursalId] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  useEffect(() => {
    fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSucursales((j?.data?.sucursales ?? j?.sucursales ?? []) as Sucursal[]))
      .catch(() => { /* el filtro simplemente no aparece */ });
  }, []);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams({ desde, hasta });
    if (sucursalId) qs.set("sucursal_id", sucursalId);
    fetchWithSupabaseSession(`/api/reportes/facturas?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) { setError(j?.error ?? "No se pudo cargar el reporte."); setFilas([]); setTotales(null); return; }
        setFilas((j.data?.facturas ?? []) as Factura[]);
        setTotales((j.data?.totales ?? null) as Totales | null);
        setFaltaMigracion((j.data?.falta_migracion ?? null) as string | null);
      })
      .catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : "Error de red"); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, sucursalId]);

  const hayIva = useMemo(
    () => filas.some((f) => f.gravado5 || f.gravado10 || f.iva5 || f.iva10),
    [filas],
  );

  /**
   * CSV con punto y coma y BOM: el Excel en español abre así sin pedir nada.
   * Con coma mete todo en una columna y sin BOM rompe los acentos.
   */
  function exportar() {
    const col = [
      "Fecha", "Numero de factura", "Timbrado", "Cliente", "RUC/CI", "Sucursal",
      "Exentas", "Gravado 5%", "IVA 5%", "Gravado 10%", "IVA 10%", "Total", "Estado",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const cuerpo = filas.map((f) => [
      fmtFecha(f.fecha), f.numero, f.timbrado ?? "", f.cliente, f.documento, f.sucursal ?? "",
      f.exentas, f.gravado5, f.iva5, f.gravado10, f.iva10, f.total,
      f.anulada ? "ANULADA" : "Emitida",
    ].map(esc).join(";"));

    const txt = "﻿" + [col.join(";"), ...cuerpo].join("\r\n");
    const url = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";
  const on = "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]";
  const off = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  const esPreset = (p: [string, string]) => desde === p[0] && hasta === p[1];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400 print:hidden">
        <Link href="/reportes" className="hover:text-[#4FAEB2] transition-colors">Reportes</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Facturas emitidas</span>
      </div>

      <PageHeader
        eyebrow="Zentra · Análisis"
        title="Facturas emitidas"
        description="Las facturas del timbrado en el período, con su liquidación de IVA. Para pasarle a la contadora."
      />

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Período</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { const [a, b] = mes(0); setDesde(a); setHasta(b); }}
                className={`${btn} ${esPreset(mes(0)) ? on : off}`}>Este mes</button>
              <button type="button" onClick={() => { const [a, b] = mes(-1); setDesde(a); setHasta(b); }}
                className={`${btn} ${esPreset(mes(-1)) ? on : off}`}>Mes pasado</button>
            </div>
          </div>

          {sucursales.length > 1 && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Sucursal</label>
              <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]">
                <option value="">Todas</option>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="ml-auto flex gap-2">
            <button type="button" onClick={exportar} disabled={filas.length === 0}
              className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:opacity-40">
              Exportar Excel
            </button>
            <button type="button" onClick={() => window.print()} disabled={filas.length === 0}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40">
              Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      {faltaMigracion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Todavía no está activada la facturación: falta correr la migración{" "}
          <code className="font-mono text-xs">{faltaMigracion}</code>.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      )}

      {/* ── Totales del período ─────────────────────────────────────────── */}
      {totales && filas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tarjeta titulo="Facturas" valor={String(totales.emitidas)}
            nota={totales.anuladas > 0 ? `${totales.anuladas} anulada${totales.anuladas > 1 ? "s" : ""}` : undefined} />
          <Tarjeta titulo="Total facturado" valor={fmtActive(totales.total)} destacado />
          <Tarjeta titulo="Exentas" valor={fmtActive(totales.exentas)} />
          {hayIva && <Tarjeta titulo="Gravado 10%" valor={fmtActive(totales.gravado10)} />}
          {hayIva && <Tarjeta titulo="IVA 10%" valor={fmtActive(totales.iva10)} />}
        </div>
      )}

      {/* ── Detalle ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Factura</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">RUC / CI</th>
              {sucursales.length > 1 && <th className="px-3 py-2 text-left">Sucursal</th>}
              <th className="px-3 py-2 text-right">Exentas</th>
              {hayIva && <th className="px-3 py-2 text-right">Gravado 10%</th>}
              {hayIva && <th className="px-3 py-2 text-right">IVA 10%</th>}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => (
              <tr key={f.id} className={f.anulada ? "bg-rose-50/60 text-slate-400" : "hover:bg-slate-50"}>
                <td className="whitespace-nowrap px-3 py-2">{fmtFecha(f.fecha)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {f.numero}
                  {f.anulada && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">ANULADA</span>}
                </td>
                <td className="px-3 py-2">{f.cliente}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{f.documento}</td>
                {sucursales.length > 1 && <td className="whitespace-nowrap px-3 py-2">{f.sucursal ?? "—"}</td>}
                <td className="whitespace-nowrap px-3 py-2 text-right">{fmtActive(f.exentas)}</td>
                {hayIva && <td className="whitespace-nowrap px-3 py-2 text-right">{fmtActive(f.gravado10)}</td>}
                {hayIva && <td className="whitespace-nowrap px-3 py-2 text-right">{fmtActive(f.iva10)}</td>}
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{fmtActive(f.total)}</td>
              </tr>
            ))}
            {!cargando && filas.length === 0 && !faltaMigracion && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">
                  No se emitió ninguna factura en este período.
                </td>
              </tr>
            )}
            {cargando && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">Cargando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totales && totales.anuladas > 0 && (
        <p className="text-xs text-slate-500 print:hidden">
          Las facturas anuladas aparecen tachadas y no suman a los totales, pero no se ocultan:
          la numeración tiene que poder seguirse completa, sin huecos.
        </p>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, nota, destacado }: {
  titulo: string; valor: string; nota?: string; destacado?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${destacado ? "border-[#4FAEB2]/40 bg-[#4FAEB2]/5" : "border-slate-200 bg-white"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className="mt-1 text-xl font-bold text-slate-800">{valor}</div>
      {nota && <div className="mt-0.5 text-[11px] text-rose-600">{nota}</div>}
    </div>
  );
}
