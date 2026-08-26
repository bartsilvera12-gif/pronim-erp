"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Mov = {
  fecha: string; origen: string; tipo: string; concepto: string;
  metodo: string | null; entidad: string | null; referencia: string | null;
  cliente: string | null; numero: string | null;
  sucursal: string | null; caja_numero: string | null;
  monto: number; signo: number; neto: number; afecta_efectivo: boolean;
  usuario: string | null;
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  qr: "QR",
  billetera: "Billetera",
  credito_cliente: "Crédito del cliente",
  credito: "Crédito en productos",
  consignacion: "Consignación",
  otro: "Otro",
};

function fmtGs(n: number) {
  return `${Math.round(n).toLocaleString("es-PY")}`;
}

export default function ExplorarCajaMovimientosPage() {
  const [rows, setRows] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(true);
  // Por defecto: HOY. Es el caso de uso principal — cuadrar la caja del día.
  const hoy = () => new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState<string>(hoy);
  const [hasta, setHasta] = useState<string>(hoy);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams({ desde, hasta });
    fetchWithSupabaseSession(`/api/reportes/caja-movimientos?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.movimientos ?? []) as Mov[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  // Arqueo: solo lo que mueve efectivo físico.
  const resumen = useMemo(() => {
    let entra = 0, sale = 0, efectivo = 0;
    const porMetodo = new Map<string, number>();
    for (const r of rows) {
      if (r.neto > 0) entra += r.neto; else sale += -r.neto;
      if (r.afecta_efectivo) efectivo += r.neto;
      const k = r.metodo ?? "otro";
      porMetodo.set(k, (porMetodo.get(k) ?? 0) + r.neto);
    }
    return { entra, sale, efectivo, porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]) };
  }, [rows]);

  const columns = useMemo<ColumnDef<Mov>[]>(() => {
    const origenes = Array.from(new Set(rows.map((r) => r.origen)));
    const metodos = Array.from(new Set(rows.map((r) => r.metodo).filter(Boolean))) as string[];
    const sucs = Array.from(new Set(rows.map((r) => r.sucursal).filter(Boolean))) as string[];
    return [
      { key: "fecha", label: "Fecha y hora", type: "date", required: true, get: (r) => r.fecha },
      { key: "tipo", label: "Movimiento", type: "text", required: true, get: (r) => r.tipo },
      { key: "origen", label: "Origen", type: "enum", get: (r) => r.origen,
        enumOptions: origenes.map((o) => ({ value: o, label: o })), defaultVisible: false },
      { key: "concepto", label: "Concepto", type: "text", get: (r) => r.concepto },
      { key: "cliente", label: "Cliente", type: "text", get: (r) => r.cliente ?? "" },
      { key: "metodo", label: "Método", type: "enum", get: (r) => (r.metodo ? METODO_LABEL[r.metodo] ?? r.metodo : ""),
        enumOptions: metodos.map((m) => ({ value: METODO_LABEL[m] ?? m, label: METODO_LABEL[m] ?? m })) },
      { key: "entidad", label: "Entidad", type: "text", get: (r) => r.entidad ?? "", defaultVisible: false },
      { key: "referencia", label: "Referencia", type: "text", get: (r) => r.referencia ?? "", defaultVisible: false },
      { key: "sucursal", label: "Sucursal", type: "enum", get: (r) => r.sucursal ?? "",
        enumOptions: sucs.map((s) => ({ value: s, label: s })) },
      { key: "caja", label: "N° Caja", type: "text", get: (r) => r.caja_numero ?? "", defaultVisible: false },
      // Entra / Sale separados: sumarlos juntos no diría nada.
      { key: "entra", label: "Entra", type: "money", required: true, get: (r) => (r.neto > 0 ? r.neto : 0), total: "sum" },
      { key: "sale", label: "Sale", type: "money", required: true, get: (r) => (r.neto < 0 ? -r.neto : 0), total: "sum" },
      { key: "neto", label: "Neto", type: "money", get: (r) => r.neto, total: "sum" },
      { key: "efectivo", label: "Efectivo", type: "money", get: (r) => (r.afecta_efectivo ? r.neto : 0), total: "sum" },
    ];
  }, [rows]);

  return (
    <DataExplorer<Mov>
      titulo="Movimientos de caja"
      descripcion="Todo lo que movió plata en el período: cobros de ventas, pagos por evaluaciones, ingresos/egresos manuales y aperturas. Para cuadrar la caja del día."
      rows={rows} columns={columns} cargando={cargando} csvName="caja_movimientos"
      toolbarExtra={
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">Del:</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <button type="button"
            onClick={() => { const h = new Date().toISOString().slice(0, 10); setDesde(h); setHasta(h); }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
            Hoy
          </button>
        </div>
      }
      headerExtra={
        rows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">Entró</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700">Gs. {fmtGs(resumen.entra)}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700/80">Salió</p>
              <p className="text-lg font-bold tabular-nums text-rose-700">Gs. {fmtGs(resumen.sale)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Neto</p>
              <p className={`text-lg font-bold tabular-nums ${resumen.entra - resumen.sale >= 0 ? "text-slate-800" : "text-rose-700"}`}>
                Gs. {fmtGs(resumen.entra - resumen.sale)}
              </p>
            </div>
            <div className="rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#3F8E91]">En efectivo</p>
              <p className="text-lg font-bold tabular-nums text-[#3F8E91]">Gs. {fmtGs(resumen.efectivo)}</p>
              <p className="text-[10px] text-slate-500">lo que debería haber en la caja</p>
            </div>
          </div>
        ) : null
      }
    />
  );
}
