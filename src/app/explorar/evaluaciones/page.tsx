"use client";

import { useEffect, useMemo, useState } from "react";
import { tt } from "@/lib/i18n/dict";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useSucursalActivaId } from "@/lib/sucursales/activa";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";
import { fmtGs } from "@/lib/atencion/shared";

type Ev = {
  id: string; numero_control: string; fecha: string;
  cliente_id: string | null; cliente_nombre: string | null;
  sucursal_nombre: string | null; usuario_nombre: string | null;
  estado: string | null; subtotal: number; ajuste: number; total: number; prendas: number;
  /** Lo que vale en vitrina lo que entró: cantidad × precio de venta. */
  valor_venta: number;
  costo_unitario: number | null;
  precio_venta_prom: number | null;
  margen: number | null;
  markup_pct: number | null;
};

export default function ExplorarEvaluacionesPage() {
  const [rows, setRows] = useState<Ev[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Explorar sigue al selector del header: si estoy parada en LILLO, todo
  // lo que veo acá es de LILLO. Sin sucursal elegida se ve la empresa.
  const sucursalActivaId = useSucursalActivaId();

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (sucursalActivaId) qs.set("sucursal_id", sucursalActivaId);
    fetchWithSupabaseSession(`/api/reportes/evaluaciones-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.evaluaciones ?? []) as Ev[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, sucursalActivaId]);

  const columns = useMemo<ColumnDef<Ev>[]>(() => {
    const sucursales = Array.from(new Set(rows.map((r) => r.sucursal_nombre).filter(Boolean))) as string[];
    const evaluadoras = Array.from(new Set(rows.map((r) => r.usuario_nombre).filter(Boolean))) as string[];
    const estados = Array.from(new Set(rows.map((r) => r.estado).filter(Boolean))) as string[];
    return [
      { key: "fecha", label: tt("Fecha"), type: "date", required: true, get: (r) => r.fecha },
      { key: "numero", label: tt("N° Recepción"), type: "text", get: (r) => r.numero_control },
      { key: "cliente", label: tt("Cliente"), type: "text", get: (r) => r.cliente_nombre ?? "" },
      { key: "sucursal", label: "Tienda", type: "enum", get: (r) => r.sucursal_nombre ?? "", enumOptions: sucursales.map((s) => ({ value: s, label: s })) },
      { key: "evaluadora", label: "Evaluadora", type: "enum", get: (r) => r.usuario_nombre ?? "", enumOptions: evaluadoras.map((u) => ({ value: u, label: u })), defaultVisible: false },
      { key: "prendas", label: tt("Prendas"), type: "number", get: (r) => r.prendas, total: "sum" },
      { key: "ajuste", label: "Ajuste de tasación", type: "money", get: (r) => r.ajuste, defaultVisible: false },
      { key: "total", label: tt("Total pagado"), type: "money", required: true, get: (r) => r.total, total: "sum" },
      // Lo que se le pagó a la clienta por cada prenda.
      { key: "costo_unitario", label: "Costo por prenda", type: "money",
        get: (r) => r.costo_unitario ?? 0,
        render: (r) => r.costo_unitario == null ? "—" : fmtGs(r.costo_unitario) },
      // A cuánto se va a vender: precio de venta de cada prenda ingresada.
      { key: "precio_venta_prom", label: "Precio de venta prom.", type: "money",
        get: (r) => r.precio_venta_prom ?? 0,
        render: (r) => r.precio_venta_prom == null ? "—" : fmtGs(r.precio_venta_prom) },
      { key: "valor_venta", label: "Valor de venta total", type: "money",
        get: (r) => r.valor_venta, total: "sum",
        render: (r) => r.valor_venta > 0 ? fmtGs(r.valor_venta) : "—" },
      { key: "margen", label: "Ganancia est.", type: "money",
        get: (r) => r.margen ?? 0, total: "sum",
        render: (r) => r.margen == null ? "—" : fmtGs(r.margen) },
      // Las evaluaciones del histórico importado no traen el detalle de
      // prendas, así que no hay precio de venta con el cual comparar: ahí va
      // "—" en vez de un 0% que daría a entender que no se gana nada.
      { key: "markup", label: "% Markup", type: "number",
        get: (r) => r.markup_pct ?? 0,
        render: (r) => r.markup_pct == null ? "—" : `${r.markup_pct}%` },
      { key: "estado", label: "Estado", type: "enum", get: (r) => r.estado ?? "", enumOptions: estados.map((e) => ({ value: e, label: e })) },
    ];
  }, [rows]);

  return (
    <DataExplorer<Ev>
      volverA={{ href: "/evaluacion/nueva", label: "Evaluaciones" }}
      titulo="Explorar compras / evaluaciones"
      descripcion="Prendas evaluadas por cliente. Filtrá, ordená y exportá como en Excel."
      rows={rows} columns={columns} cargando={cargando} csvName="evaluaciones"
      detailHref={(r) => r.cliente_id ? `/clientes/${r.cliente_id}` : `#`}
      toolbarExtra={
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">{tt("Datos desde:")}</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
      }
    />
  );
}
