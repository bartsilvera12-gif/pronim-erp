"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Prod = {
  id: string; sku: string | null; nombre: string;
  costo: number; precio: number; stock: number; stock_min: number;
  categorias: string; tipo_prenda: string;
};

export default function ExplorarInventarioPage() {
  const [rows, setRows] = useState<Prod[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    fetchWithSupabaseSession(`/api/reportes/inventario-drill`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setRows((j.data?.productos ?? []) as Prod[]); })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, []);

  const columns = useMemo<ColumnDef<Prod>[]>(() => {
    const tipos = Array.from(new Set(rows.map((r) => r.tipo_prenda).filter(Boolean))) as string[];
    return [
      { key: "sku", label: "SKU", type: "text", required: true, get: (r) => r.sku ?? "" },
      { key: "nombre", label: "Producto", type: "text", required: true, get: (r) => r.nombre },
      { key: "categorias", label: "Categorías", type: "text", get: (r) => r.categorias },
      { key: "tipo", label: "Tipo prenda", type: "enum", get: (r) => r.tipo_prenda, enumOptions: tipos.map((t) => ({ value: t, label: t })), defaultVisible: false },
      { key: "stock", label: "Stock", type: "number", required: true, get: (r) => r.stock, total: "sum" },
      { key: "stock_min", label: "Stock mín.", type: "number", get: (r) => r.stock_min, defaultVisible: false },
      { key: "costo", label: "Costo prom.", type: "money", get: (r) => r.costo, defaultVisible: false },
      { key: "precio", label: "Precio venta", type: "money", get: (r) => r.precio },
      { key: "valor", label: "Valor stock", type: "money", get: (r) => r.stock * r.costo, total: "sum" },
    ];
  }, [rows]);

  return (
    <DataExplorer<Prod>
      titulo="Explorar inventario"
      descripcion="Productos, stock y valor. Filtrá (ej. Stock < 5), ordená y exportá a Excel."
      rows={rows} columns={columns} cargando={cargando} csvName="inventario"
      detailHref={(r) => `/inventario/${r.id}`}
    />
  );
}
