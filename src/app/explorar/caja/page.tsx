"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Caja = {
  id: string; numero_caja: number; estado: string;
  fecha_apertura: string; fecha_cierre: string | null;
  abierta_por_nombre: string | null; cerrada_por_nombre: string | null;
  monto_apertura: number; monto_esperado: number; monto_contado: number; diferencia: number;
  movs_count: number;
};

export default function ExplorarCajaPage() {
  const [rows, setRows] = useState<Caja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/cajas-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.cajas ?? []) as Caja[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const columns = useMemo<ColumnDef<Caja>[]>(() => [
    { key: "numero", label: "N° Caja", type: "number", required: true, get: (r) => r.numero_caja },
    { key: "estado", label: "Estado", type: "enum", get: (r) => r.estado, enumOptions: [{ value: "abierta", label: "Abierta" }, { value: "cerrada", label: "Cerrada" }] },
    { key: "apertura", label: "Apertura", type: "date", required: true, get: (r) => r.fecha_apertura },
    { key: "cierre", label: "Cierre", type: "date", get: (r) => r.fecha_cierre, defaultVisible: false },
    { key: "abrio", label: "Abrió", type: "text", get: (r) => r.abierta_por_nombre ?? "", defaultVisible: false },
    { key: "cerro", label: "Cerró", type: "text", get: (r) => r.cerrada_por_nombre ?? "" },
    { key: "apertura_monto", label: "Monto apertura", type: "money", get: (r) => r.monto_apertura, defaultVisible: false },
    { key: "esperado", label: "Esperado", type: "money", get: (r) => r.monto_esperado },
    { key: "contado", label: "Contado", type: "money", get: (r) => r.monto_contado, total: "sum" },
    { key: "diferencia", label: "Diferencia", type: "money", required: true, get: (r) => r.diferencia, total: "sum" },
    { key: "movs", label: "Movs", type: "number", get: (r) => r.movs_count, defaultVisible: false },
  ], []);

  return (
    <DataExplorer<Caja>
      titulo="Explorar cierres de caja"
      descripcion="Turnos con contado vs esperado. Filtrá (ej. Diferencia < 0), ordená y exportá a Excel."
      rows={rows} columns={columns} cargando={cargando} csvName="cajas"
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
