"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Ev = {
  id: string; numero_control: string; fecha: string;
  cliente_id: string | null; cliente_nombre: string | null;
  sucursal_nombre: string | null; usuario_nombre: string | null;
  estado: string | null; subtotal: number; ajuste: number; total: number; prendas: number;
};

export default function ExplorarEvaluacionesPage() {
  const [rows, setRows] = useState<Ev[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/evaluaciones-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.evaluaciones ?? []) as Ev[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const columns = useMemo<ColumnDef<Ev>[]>(() => {
    const sucursales = Array.from(new Set(rows.map((r) => r.sucursal_nombre).filter(Boolean))) as string[];
    const evaluadoras = Array.from(new Set(rows.map((r) => r.usuario_nombre).filter(Boolean))) as string[];
    const estados = Array.from(new Set(rows.map((r) => r.estado).filter(Boolean))) as string[];
    return [
      { key: "fecha", label: "Fecha", type: "date", required: true, get: (r) => r.fecha },
      { key: "numero", label: "N° Recepción", type: "text", get: (r) => r.numero_control },
      { key: "cliente", label: "Cliente", type: "text", get: (r) => r.cliente_nombre ?? "" },
      { key: "sucursal", label: "Tienda", type: "enum", get: (r) => r.sucursal_nombre ?? "", enumOptions: sucursales.map((s) => ({ value: s, label: s })) },
      { key: "evaluadora", label: "Evaluadora", type: "enum", get: (r) => r.usuario_nombre ?? "", enumOptions: evaluadoras.map((u) => ({ value: u, label: u })), defaultVisible: false },
      { key: "prendas", label: "Prendas", type: "number", get: (r) => r.prendas, total: "sum" },
      { key: "subtotal", label: "Subtotal", type: "money", get: (r) => r.subtotal, total: "sum", defaultVisible: false },
      { key: "ajuste", label: "Ajuste", type: "money", get: (r) => r.ajuste, defaultVisible: false },
      { key: "total", label: "Total pagado", type: "money", required: true, get: (r) => r.total, total: "sum" },
      { key: "estado", label: "Estado", type: "enum", get: (r) => r.estado ?? "", enumOptions: estados.map((e) => ({ value: e, label: e })) },
    ];
  }, [rows]);

  return (
    <DataExplorer<Ev>
      titulo="Explorar compras / evaluaciones"
      descripcion="Prendas evaluadas por cliente. Filtrá, ordená y exportá como en Excel."
      rows={rows} columns={columns} cargando={cargando} csvName="evaluaciones"
      detailHref={(r) => r.cliente_id ? `/clientes/${r.cliente_id}` : `#`}
      toolbarExtra={
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">Datos desde:</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
      }
    />
  );
}
