"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Prod = {
  id: string; sku: string | null; nombre: string;
  costo: number; precio: number; stock: number; stock_min: number;
  categorias: string; tipo_prenda: string;
};

type SucursalOpt = { id: string; nombre: string };

export default function ExplorarInventarioPage() {
  const [rows, setRows] = useState<Prod[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOpt[]>([]);
  // Sin sucursal elegida el stock es el TOTAL de la empresa (suma de todos
  // los locales), que es lo que se mostraba siempre y confundía.
  const [sucursalId, setSucursalId] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("solo_bajo_stock") === "1") qs.set("solo_bajo_stock", "1");
      if (p.get("sin_stock") === "1") qs.set("sin_stock", "1");
    }
    if (sucursalId) qs.set("sucursal_id", sucursalId);
    fetchWithSupabaseSession(`/api/reportes/inventario-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setRows((j.data?.productos ?? []) as Prod[]);
        setSucursales((j.data?.opciones?.sucursales ?? []) as SucursalOpt[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [sucursalId]);

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
      // "Valor stock" = stock × PRECIO DE VENTA: cuánto vale la mercadería que
      // hay en el local. Antes se calculaba contra el costo promedio, que en
      // las franjas es 0 (las prendas entran por evaluación, no por compra),
      // así que la columna daba Gs. 0 en todo el inventario.
      { key: "valor", label: "Valor stock", type: "money", get: (r) => r.stock * r.precio, total: "sum" },
      // El valor a costo sigue disponible para quien lo necesite (contable).
      { key: "valor_costo", label: "Valor a costo", type: "money", get: (r) => r.stock * r.costo, total: "sum", defaultVisible: false },
    ];
  }, [rows]);

  return (
    <DataExplorer<Prod>
      volverA={{ href: "/inventario", label: "Inventario" }}
      titulo="Explorar inventario"
      descripcion={
        sucursalId
          ? `Stock de ${sucursales.find((s) => s.id === sucursalId)?.nombre ?? "la sucursal"}. Filtrá, ordená y exportá a Excel.`
          : "Stock TOTAL de la empresa (todas las sucursales juntas). Elegí una sucursal arriba para ver la suya."
      }
      rows={rows} columns={columns} cargando={cargando} csvName="inventario"
      detailHref={(r) => `/inventario/${r.id}`}
      toolbarExtra={
        sucursales.length > 1 ? (
          <div className="flex items-center gap-1.5">
            <span className="whitespace-nowrap text-[11px] text-slate-500">Sucursal:</span>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              aria-label="Filtrar el stock por sucursal"
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                sucursalId
                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <option value="">Todas (stock total)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        ) : null
      }
    />
  );
}
