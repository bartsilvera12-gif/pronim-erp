"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Mov = {
  id: string; created_at: string;
  cliente_id: string | null; cliente_nombre: string | null;
  tipo: string; monto: number; origen: string | null; categoria: string | null;
  referencia_tipo: string | null; referencia_numero: string | null;
  observaciones: string | null; usuario_nombre: string | null;
};

export default function ExplorarCreditosPage() {
  const [rows, setRows] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/creditos-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.movimientos ?? []) as Mov[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const columns = useMemo<ColumnDef<Mov>[]>(() => {
    const origenes = Array.from(new Set(rows.map((r) => r.origen).filter(Boolean))) as string[];
    return [
      { key: "fecha", label: "Fecha", type: "date", required: true, get: (r) => r.created_at },
      { key: "cliente", label: "Cliente", type: "text", get: (r) => r.cliente_nombre ?? "" },
      { key: "tipo", label: "Tipo", type: "enum", get: (r) => r.tipo, enumOptions: [{ value: "ENTRADA", label: "ENTRADA" }, { value: "SALIDA", label: "SALIDA" }, { value: "AJUSTE", label: "AJUSTE" }] },
      { key: "categoria", label: "Categoría", type: "enum", get: (r) => r.categoria ?? "credito", enumOptions: [{ value: "credito", label: "Crédito" }, { value: "cashback", label: "Cashback" }, { value: "consignacion", label: "Consignación" }] },
      { key: "origen", label: "Origen", type: "enum", get: (r) => r.origen ?? "", enumOptions: origenes.map((o) => ({ value: o, label: o })), defaultVisible: false },
      { key: "referencia", label: "Referencia", type: "text", get: (r) => [r.referencia_tipo, r.referencia_numero].filter(Boolean).join(" "), defaultVisible: false },
      { key: "observaciones", label: "Observaciones", type: "text", get: (r) => r.observaciones ?? "", defaultVisible: false },
      { key: "usuario", label: "Usuario", type: "text", get: (r) => r.usuario_nombre ?? "", defaultVisible: false },
      { key: "monto", label: "Monto", type: "money", required: true, get: (r) => r.monto, total: "sum" },
    ];
  }, [rows]);

  return (
    <DataExplorer<Mov>
      titulo="Explorar créditos y cashback"
      descripcion="Movimientos de cartera. Filtrá por categoría/tipo/monto, ordená y exportá a Excel."
      rows={rows} columns={columns} cargando={cargando} csvName="creditos"
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
