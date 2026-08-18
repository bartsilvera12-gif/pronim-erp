"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Venta = {
  id: string;
  numero_control: string;
  fecha: string;
  total: number;
  descuento_general: number;
  metodo_pago: string | null;
  estado: string | null;
  sucursal_nombre: string | null;
  cliente_nombre: string | null;
  usuario_nombre: string | null;
  cant_productos: number;
};

export default function ExplorarVentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [metodos, setMetodos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);

  // Rango de fechas del FETCH (trae los datos; los filtros finos son client-side).
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetchWithSupabaseSession(`/api/reportes/ventas-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setVentas((j.data?.ventas ?? []) as Venta[]);
        setMetodos((j.data?.opciones?.metodos_pago ?? []) as string[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  const columns = useMemo<ColumnDef<Venta>[]>(() => {
    const sucursales = Array.from(new Set(ventas.map((v) => v.sucursal_nombre).filter(Boolean))) as string[];
    const usuarios = Array.from(new Set(ventas.map((v) => v.usuario_nombre).filter(Boolean))) as string[];
    return [
      { key: "fecha", label: "Fecha", type: "date", get: (v) => v.fecha, required: true, total: undefined },
      { key: "numero", label: "N° Venta", type: "text", get: (v) => v.numero_control,
        render: (v) => <Link href={`/ventas/${v.id}`} className="font-mono text-[#3F8E91] hover:underline">{v.numero_control}</Link> },
      { key: "sucursal", label: "Tienda", type: "enum", get: (v) => v.sucursal_nombre ?? "", enumOptions: sucursales.map((s) => ({ value: s, label: s })) },
      { key: "cliente", label: "Cliente", type: "text", get: (v) => v.cliente_nombre ?? "" },
      { key: "usuario", label: "Vendedora", type: "enum", get: (v) => v.usuario_nombre ?? "", enumOptions: usuarios.map((u) => ({ value: u, label: u })), defaultVisible: false },
      { key: "metodo", label: "Forma de pago", type: "enum", get: (v) => v.metodo_pago ?? "", enumOptions: metodos.map((m) => ({ value: m, label: m })) },
      { key: "cant", label: "Cant. productos", type: "number", get: (v) => v.cant_productos, total: "sum" },
      { key: "descuento", label: "Descuento", type: "money", get: (v) => v.descuento_general, total: "sum", defaultVisible: false },
      { key: "total", label: "Valor", type: "money", get: (v) => v.total, total: "sum", required: true },
      { key: "estado", label: "Estado", type: "enum", get: (v) => v.estado ?? "activa", enumOptions: [{ value: "activa", label: "Activa" }, { value: "anulada", label: "Anulada" }], defaultVisible: false },
    ];
  }, [ventas, metodos]);

  return (
    <DataExplorer<Venta>
      titulo="Explorar ventas"
      descripcion="Elegí columnas, filtrá cada campo, combiná filtros y ordená por cualquier columna. Todo instantáneo."
      rows={ventas}
      columns={columns}
      cargando={cargando}
      csvName="ventas"
      detailHref={(v) => `/ventas/${v.id}`}
      toolbarExtra={
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">Datos desde:</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
      }
    />
  );
}
