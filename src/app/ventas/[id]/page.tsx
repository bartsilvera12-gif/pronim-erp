"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getVentas } from "@/lib/ventas/storage";
import type { Venta } from "@/lib/ventas/types";
import { useT, useMoney } from "@/lib/i18n/context";

/**
 * Detalle de una venta puntual: cabecera, items con descuento por línea,
 * pagos, descuento general con motivo, sucursal y cliente enlazado.
 * Drill target desde las filas del historial `/ventas`.
 */
export default function VentaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const money = useMoney();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [clienteNombre, setClienteNombre] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getVentas().then((data) => {
      if (cancel) return;
      const found = data.find((v) => v.id === id) ?? null;
      setVenta(found);
      if (!found) setErr(t("Venta no encontrada."));
    }).finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [id, t]);

  useEffect(() => {
    if (!venta?.cliente_id) { setClienteNombre(null); return; }
    let cancel = false;
    fetch(`/api/clientes/${venta.cliente_id}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (cancel || !j?.success) return;
        const c = j.data as { nombre_contacto?: string | null; empresa?: string | null };
        setClienteNombre(c.empresa || c.nombre_contacto || null);
      })
      .catch(() => { /* silencioso */ });
    return () => { cancel = true; };
  }, [venta?.cliente_id]);

  if (cargando) {
    return <div className="min-h-screen bg-slate-50 p-6"><p className="text-sm text-slate-400 animate-pulse">{t("Cargando…")}</p></div>;
  }
  if (!venta) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 max-w-4xl mx-auto">
        <Link href="/ventas" className="text-sm text-[#4FAEB2] hover:underline">← {t("Volver al historial")}</Link>
        <p className="mt-4 text-slate-500">{err ?? t("Venta no encontrada.")}</p>
      </div>
    );
  }

  const fmt = (n: number) => money.format(n || 0);
  const totalDescuentoLinea = venta.items.reduce((s, i) => {
    const d = Math.max(0, (i.precio_venta_original ?? i.precio_venta) - i.precio_venta);
    return s + d * i.cantidad;
  }, 0);
  const descGeneral = Number(venta.descuento_general ?? 0);
  const fecha = new Date(venta.fecha).toLocaleString(money.moneda === "BRL" ? "pt-BR" : "es-PY");
  const motivoLabels: Record<string, string> = {
    redondeo: t("Redondeo"), negociacion: t("Negociación"), defecto: t("Producto con defecto"),
    promocion: t("Promoción"), cortesia: t("Cortesía"), intercambio: t("Intercambio"),
    otro: t("Otro"),
  };
  const pagoLabels: Record<string, string> = {
    efectivo: t("Efectivo"), tarjeta: t("Tarjeta"), transferencia: t("Transferencia"),
    qr: "QR", billetera: t("Billetera"), otro: t("Otro"),
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/ventas" className="text-xs text-[#4FAEB2] hover:underline">← {t("Historial de ventas")}</Link>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 font-mono">{venta.numero_control}</h1>
              {(venta.estado ?? "completada") === "anulada" && (
                <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{t("Anulada")}</span>
              )}
              {venta.tipo_venta === "CREDITO" && (
                <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{t("Crédito")}</span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{fecha}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{t("Total")}</p>
            <p className="text-3xl font-bold tabular-nums text-slate-900">{fmt(venta.total)}</p>
          </div>
        </div>

        {(venta.estado ?? "completada") === "anulada" && venta.anulacion_motivo && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">{t("Motivo de anulación")}</p>
            <p className="mt-0.5 text-sm text-rose-900">{venta.anulacion_motivo}</p>
          </div>
        )}

        {/* Contexto: cliente, sucursal, pago */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetaCard label={t("Cliente")} value={
            venta.cliente_id
              ? <Link href={`/clientes/${venta.cliente_id}`} className="text-[#3F8E91] hover:underline">{clienteNombre ?? t("Ver cliente")}</Link>
              : <span className="text-slate-400">{t("Consumidor final")}</span>
          } />
          <MetaCard label={t("Sucursal")} value={<span className="text-slate-800">{venta.sucursal_nombre ?? "—"}</span>} />
          <MetaCard label={t("Forma de pago")} value={<span className="text-slate-800">{pagoLabels[venta.metodo_pago ?? ""] ?? "—"}</span>} />
        </section>

        {/* Items */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800">{t("Productos")}</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">{t("Producto")}</th>
                  <th className="text-right px-4 py-2 font-semibold w-20">{t("Cant.")}</th>
                  <th className="text-right px-4 py-2 font-semibold w-32">{t("Precio")}</th>
                  <th className="text-right px-4 py-2 font-semibold w-28">{t("Desc.")}</th>
                  <th className="text-right px-4 py-2 font-semibold w-32">{t("Subtotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {venta.items.map((i, idx) => {
                  const descLinea = Math.max(0, (i.precio_venta_original ?? i.precio_venta) - i.precio_venta);
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-2.5">
                        <Link href={`/inventario/${i.producto_id}`} className="text-slate-800 hover:text-[#3F8E91] hover:underline">
                          {i.producto_nombre}
                        </Link>
                        <p className="text-[10px] text-slate-400 font-mono">{i.sku}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{i.cantidad}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(i.precio_venta_original ?? i.precio_venta)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {descLinea > 0 ? <span className="text-emerald-700">−{fmt(descLinea)}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">{fmt(i.subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Totales */}
        {/* Drill-outs: explorar más desde esta venta */}
        <section className="flex flex-wrap gap-2 text-xs">
          {venta.cliente_id && (
            <Link href={`/clientes/${venta.cliente_id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-[#4FAEB2] hover:text-[#3F8E91]">
              👤 {t("Historial del cliente")} →
            </Link>
          )}
          <Link href={`/inventario/movimientos?venta=${venta.numero_control}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-[#4FAEB2] hover:text-[#3F8E91]">
            📦 {t("Movimientos de stock generados")} →
          </Link>
          {venta.sucursal_id && (
            <Link href={`/ventas?sucursal_id=${venta.sucursal_id}&segmento=hoy`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-[#4FAEB2] hover:text-[#3F8E91]">
              🏬 {t("Ventas de hoy en esta sucursal")} →
            </Link>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-1.5 max-w-md ml-auto">
          <ResumenRow label={t("Subtotal items")} value={fmt(venta.items.reduce((s, i) => s + (i.precio_venta_original ?? i.precio_venta) * i.cantidad, 0))} />
          {totalDescuentoLinea > 0 && (
            <ResumenRow label={t("Descuento por línea")} value={`−${fmt(totalDescuentoLinea)}`} tone="emerald" />
          )}
          {descGeneral > 0 && (
            <ResumenRow
              label={`${t("Descuento general")}${venta.descuento_motivo ? ` · ${motivoLabels[venta.descuento_motivo] ?? venta.descuento_motivo}` : ""}`}
              value={`−${fmt(descGeneral)}`}
              tone="emerald"
            />
          )}
          <div className="border-t border-slate-100 pt-2 mt-2">
            <ResumenRow label={t("Total")} value={fmt(venta.total)} bold />
          </div>
        </section>
      </div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function ResumenRow({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "emerald" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={`${bold ? "font-bold text-slate-900" : "text-slate-600"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold text-slate-900 text-lg" : tone === "emerald" ? "font-semibold text-emerald-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
