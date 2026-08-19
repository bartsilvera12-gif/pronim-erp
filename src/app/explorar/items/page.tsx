"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type It = {
  fecha: string; tipo: string; sucursal: string | null;
  producto: string; sku: string | null; categoria: string | null;
  cliente: string | null; cantidad: number; precio_unitario: number; valor: number;
};

const TIPO_LABEL: Record<string, string> = { venta: "Venta", compra: "Compra" };

export default function ExplorarItemsPage() {
  const [rows, setRows] = useState<It[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/items-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.items ?? []) as It[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const columns = useMemo<ColumnDef<It>[]>(() => {
    const sucursales = Array.from(new Set(rows.map((r) => r.sucursal).filter(Boolean))) as string[];
    const categorias = Array.from(new Set(rows.map((r) => r.categoria).filter(Boolean))) as string[];
    const productos = Array.from(new Set(rows.map((r) => r.producto).filter(Boolean))) as string[];
    return [
      { key: "fecha", label: "Fecha", type: "date", required: true, get: (r) => r.fecha },
      { key: "sucursal", label: "Sucursal", type: "enum", get: (r) => r.sucursal ?? "", enumOptions: sucursales.map((s) => ({ value: s, label: s })) },
      { key: "tipo", label: "Tipo", type: "enum", get: (r) => TIPO_LABEL[r.tipo] ?? r.tipo, required: true,
        enumOptions: [{ value: "Venta", label: "Venta" }, { value: "Compra", label: "Compra" }] },
      { key: "producto", label: "Rango / Producto", type: "enum", required: true, get: (r) => r.producto,
        enumOptions: productos.map((p) => ({ value: p, label: p })) },
      { key: "categoria", label: "Categoría", type: "enum", get: (r) => r.categoria ?? "", enumOptions: categorias.map((c) => ({ value: c, label: c })) },
      { key: "sku", label: "SKU", type: "text", get: (r) => r.sku ?? "", defaultVisible: false },
      { key: "cliente", label: "Cliente", type: "text", get: (r) => r.cliente ?? "", defaultVisible: false },
      { key: "cantidad", label: "Cantidad", type: "number", required: true, get: (r) => r.cantidad, total: "sum" },
      { key: "precio", label: "Precio unit.", type: "money", get: (r) => r.precio_unitario, defaultVisible: false },
      { key: "valor", label: "Valor", type: "money", required: true, get: (r) => r.valor, total: "sum" },
    ];
  }, [rows]);

  return (
    <DataExplorer<It>
      titulo="Explorar ítems (prendas)"
      descripcion="Cada prenda vendida (+) o comprada (−). Agrupá por Rango/Producto o Categoría para ver qué se vende/compra más, por sucursal."
      rows={rows} columns={columns} cargando={cargando} csvName="items"
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
