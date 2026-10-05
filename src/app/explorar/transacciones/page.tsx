"use client";

import { useEffect, useMemo, useState } from "react";
import { tt } from "@/lib/i18n/dict";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useSucursalActivaId } from "@/lib/sucursales/activa";
import { DataExplorer, type ColumnDef } from "@/components/explorer/DataExplorer";

type Tx = {
  id: string; numero: string | null; fecha: string; tipo: string;
  cliente_id: string | null; cliente_nombre: string | null; telefono: string | null;
  categoria: string | null; sucursal: string | null;
  valor: number; valor_stock: number; cantidad: number; markup: number | null;
  tarjeta: number; efectivo: number; transferencia: number; credito: number;
  descuento: number; beneficio: number;
};

const CAT_LABEL: Record<string, string> = { vip: "VIP", nuevo: "Nuevo", dormido: "Dormido", activo: "Activo" };
const TIPO_LABEL: Record<string, string> = { venta: "Venta", compra: "Compra", cambio: "Cambio" };

export default function ExplorarTransaccionesPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [truncado, setTruncado] = useState(false);
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
    fetchWithSupabaseSession(`/api/reportes/transacciones-drill?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setRows((j.data?.transacciones ?? []) as Tx[]);
        setTruncado(j.data?.truncado === true);
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, sucursalActivaId]);

  const columns = useMemo<ColumnDef<Tx>[]>(() => {
    const sucursales = Array.from(new Set(rows.map((r) => r.sucursal).filter(Boolean))) as string[];
    return [
    { key: "fecha", label: tt("Fecha"), type: "date", required: true, get: (r) => r.fecha },
    { key: "sucursal", label: tt("Sucursal"), type: "enum", get: (r) => r.sucursal ?? "",
      enumOptions: sucursales.map((s) => ({ value: s, label: s })) },
    { key: "cliente", label: tt("Cliente"), type: "text", get: (r) => r.cliente_nombre ?? "" },
    { key: "telefono", label: tt("Teléfono"), type: "text", get: (r) => r.telefono ?? "", defaultVisible: false },
    { key: "categoria", label: tt("Categoría"), type: "enum", get: (r) => r.categoria ? (CAT_LABEL[r.categoria] ?? r.categoria) : "",
      enumOptions: [{ value: "VIP", label: "VIP" }, { value: "Nuevo", label: tt("Nuevo") }, { value: "Dormido", label: "Dormido" }, { value: "Activo", label: "Activo" }] },
    { key: "tipo", label: "Tipo", type: "enum", get: (r) => TIPO_LABEL[r.tipo] ?? r.tipo, required: true,
      enumOptions: [{ value: "Venta", label: tt("Venta") }, { value: "Compra", label: tt("Compra") }, { value: "Cambio", label: "Cambio" }] },
    { key: "valor", label: "Valor", type: "money", required: true, get: (r) => r.valor, total: "sum" },
    { key: "valor_stock", label: tt("Ingresó a stock"), type: "money", get: (r) => r.valor_stock, total: "sum", defaultVisible: false },
    { key: "cantidad", label: "Cant. productos", type: "number", get: (r) => r.cantidad, total: "sum" },
    { key: "markup", label: "% Markup", type: "number",
      get: (r) => r.markup ?? 0, render: (r) => r.markup == null ? "—" : `${r.markup}%` },
    { key: "tarjeta", label: tt("Tarjeta"), type: "money", get: (r) => r.tarjeta, total: "sum", defaultVisible: false },
    { key: "efectivo", label: "Efectivo", type: "money", get: (r) => r.efectivo, total: "sum" },
    { key: "transferencia", label: tt("Transferencia"), type: "money", get: (r) => r.transferencia, total: "sum", defaultVisible: false },
    { key: "credito", label: tt("Crédito"), type: "money", get: (r) => r.credito, total: "sum", defaultVisible: false },
    { key: "descuento", label: tt("Descuento"), type: "money", get: (r) => r.descuento, total: "sum", defaultVisible: false },
    { key: "beneficio", label: "Beneficio/Cashback", type: "money", get: (r) => r.beneficio, total: "sum", defaultVisible: false },
  ];
  }, [rows]);

  return (
    <DataExplorer<Tx>
      truncado={truncado}
      titulo="Explorar transacciones"
      descripcion="Todas las operaciones con clientes (ventas +, compras/cambios −) en un solo listado. Elegí columnas, filtrá, agrupá y exportá a Excel."
      rows={rows} columns={columns} cargando={cargando} csvName="transacciones"
      detailHref={(r) => r.tipo === "compra" ? (r.cliente_id ? `/clientes/${r.cliente_id}` : "#") : `/ventas/${r.id}`}
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
