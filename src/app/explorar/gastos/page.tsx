"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Gasto = {
  id: string; fecha: string; categoria: string; descripcion: string;
  tipo: string; recurrente: boolean; frecuencia: string | null; monto: number;
  sucursal: string | null;
};

export default function ExplorarGastosPage() {
  const [rows, setRows] = useState<Gasto[]>([]);
  const [tieneSucursal, setTieneSucursal] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/gastos-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) { setRows((j.data?.gastos ?? []) as Gasto[]); setTieneSucursal(Boolean(j.data?.tiene_sucursal)); } })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const columns = useMemo<ColumnDef<Gasto>[]>(() => {
    const categorias = Array.from(new Set(rows.map((r) => r.categoria).filter(Boolean))) as string[];
    const sucursales = Array.from(new Set(rows.map((r) => r.sucursal).filter(Boolean))) as string[];
    const base: ColumnDef<Gasto>[] = [
      { key: "fecha", label: "Fecha", type: "date", required: true, get: (r) => r.fecha },
      { key: "categoria", label: "Categoría", type: "enum", required: true, get: (r) => r.categoria,
        enumOptions: categorias.map((c) => ({ value: c, label: c })) },
      { key: "descripcion", label: "Descripción", type: "text", get: (r) => r.descripcion },
      { key: "tipo", label: "Tipo", type: "enum", get: (r) => r.tipo === "fijo" ? "Fijo" : "Variable",
        enumOptions: [{ value: "Fijo", label: "Fijo" }, { value: "Variable", label: "Variable" }] },
      { key: "recurrente", label: "Recurrente", type: "enum", get: (r) => r.recurrente ? "Sí" : "No",
        enumOptions: [{ value: "Sí", label: "Sí" }, { value: "No", label: "No" }], defaultVisible: false },
      { key: "frecuencia", label: "Frecuencia", type: "text", get: (r) => r.frecuencia ?? "", defaultVisible: false },
      { key: "monto", label: "Monto", type: "money", required: true, get: (r) => r.monto, total: "sum" },
    ];
    if (tieneSucursal) {
      base.splice(1, 0, { key: "sucursal", label: "Sucursal", type: "enum", get: (r) => r.sucursal ?? "",
        enumOptions: sucursales.map((s) => ({ value: s, label: s })) });
    }
    return base;
  }, [rows, tieneSucursal]);

  return (
    <DataExplorer<Gasto>
      titulo="Explorar gastos"
      descripcion="Gastos por categoría, tipo y período. Agrupá por Categoría para ver en qué se gasta más; filtrá Recurrente para los fijos."
      rows={rows} columns={columns} cargando={cargando} csvName="gastos"
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
