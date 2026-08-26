"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCompras, deleteCompra } from "@/lib/compras/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import { alert, confirm } from "@/components/ui/dialog";
import type { Compra, TipoPago } from "@/lib/compras/types";
import { useT } from "@/lib/i18n/context";
import { fmtActive } from "@/lib/i18n/currency";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none bg-white";

// formatGs → moneda activa (Gs. o R$ según sucursal del usuario).
const formatGs = fmtActive;

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

const tipoPagoBadge: Record<TipoPago, string> = {
  contado: "bg-blue-50 text-blue-700",
  credito: "bg-orange-50 text-orange-700",
};

// ── Agrupación por numero_control: 1 compra = N filas ─────────────────────────
type GrupoCompra = {
  numero_control: string;
  proveedor_nombre: string;
  fecha: string;
  tipo_pago: TipoPago;
  plazo_dias?: number;
  items: Compra[];
  /** Lo que se le pagó al cliente/proveedor por las prendas (costo). */
  total: number;
  /** Valor de venta de lo que entró: SUM(cantidad × precio_venta). */
  totalIngresado: number;
  comprobante: boolean;
};

/** Markup % = cuánto se le suma al costo para llegar al precio de venta. */
function markupPct(pagado: number, ingresado: number): number | null {
  if (!(pagado > 0) || !(ingresado > 0)) return null;
  return ((ingresado - pagado) / pagado) * 100;
}

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito en productos",
  consignacion: "Consignación",
};
const metodoBadge: Record<string, string> = {
  efectivo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  transferencia: "bg-sky-50 text-sky-700 ring-sky-200",
  credito: "bg-violet-50 text-violet-700 ring-violet-200",
  consignacion: "bg-amber-50 text-amber-700 ring-amber-200",
};

function agrupar(rows: Compra[]): GrupoCompra[] {
  const map = new Map<string, GrupoCompra>();
  for (const c of rows) {
    const key = c.numero_control || c.id;
    let g = map.get(key);
    if (!g) {
      g = {
        numero_control: c.numero_control,
        proveedor_nombre: c.proveedor_nombre,
        fecha: c.fecha,
        tipo_pago: c.tipo_pago,
        plazo_dias: c.plazo_dias,
        items: [],
        total: 0,
        totalIngresado: 0,
        comprobante: false,
      };
      map.set(key, g);
    }
    g.items.push(c);
    g.total += Number(c.total) || 0;
    g.totalIngresado += (Number(c.cantidad) || 0) * (Number(c.precio_venta) || 0);
    if (c.comprobante_storage_path) g.comprobante = true;
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
}

function resumenProductos(items: Compra[]): string {
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0].producto_nombre;
  return `${items[0].producto_nombre} + ${items.length - 1} más`;
}

export default function ComprasPage() {
  const t = useT();
  const [todas, setTodas] = useState<Compra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipoPago, setFiltroTipoPago] = useState<TipoPago | "">("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [cargandoLista, setCargandoLista] = useState(true);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Método real de pago por N° de control (efectivo / transferencia / crédito
  // en productos / consignación). Vive en la recepción, no en `compras`.
  const [metodosPago, setMetodosPago] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancel = false;
    fetch("/api/compras/metodos-pago", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel) setMetodosPago((j?.data?.metodos ?? {}) as Record<string, string[]>); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancel = false;
    setCargandoLista(true);
    getCompras().then((data) => {
      if (cancel) return;
      setTodas(data);
    }).finally(() => {
      if (!cancel) setCargandoLista(false);
    });
    return () => { cancel = true; };
  }, [refreshKey]);

  async function handleBorrar(g: GrupoCompra, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm({
      title: "Borrar compra",
      message: `¿Borrar la compra ${g.numero_control} de ${g.proveedor_nombre}? Se descontará del stock lo que había ingresado (${g.items.reduce((s, i) => s + Number(i.cantidad || 0), 0)} u. en ${g.items.length} ${g.items.length === 1 ? "producto" : "productos"}). Esta acción no se puede deshacer.`,
      confirmText: "Borrar",
      variant: "danger",
    });
    if (!ok) return;
    setBorrando(g.numero_control);
    const res = await deleteCompra(g.numero_control);
    setBorrando(null);
    if (!res.ok) { void alert({ message: res.error, variant: "warning" }); return; }
    setRefreshKey((k) => k + 1);
  }

  const grupos = useMemo(() => agrupar(todas), [todas]);

  const filtrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return grupos.filter((g) => {
      const coincideTexto =
        texto === "" ||
        g.proveedor_nombre.toLowerCase().includes(texto) ||
        g.numero_control.toLowerCase().includes(texto) ||
        g.items.some((i) => i.producto_nombre.toLowerCase().includes(texto));
      const coincideTipoPago = filtroTipoPago === "" || g.tipo_pago === filtroTipoPago;
      return coincideTexto && coincideTipoPago;
    });
  }, [grupos, busqueda, filtroTipoPago]);

  const hayFiltros = busqueda || filtroTipoPago;

  function toggle(numero: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(numero)) next.delete(numero);
      else next.add(numero);
      return next;
    });
  }

  return (
    <div className="space-y-8">

      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
            style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Adquisiciones</p>
        </div>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{t("Compras")}</h1>
        <p className="mt-0.5 text-xs text-slate-500">Registro de órdenes de compra a proveedores</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 sm:p-5 lg:p-6">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("Órdenes de compra")}</h2>
          <div className="flex items-center gap-3">
            <ExportExcelButton url="/api/compras/export" />
            <Link href="/compras/nueva"
              className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95">
              + Nueva compra
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input type="text" placeholder="Buscar por proveedor, producto o N° control..."
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-0 flex-1 sm:min-w-72`} />
          <FancySelect value={filtroTipoPago} onChange={(v) => setFiltroTipoPago(v as TipoPago | "")}
            ariaLabel="Filtrar por tipo de pago" className="w-44" size="sm"
            options={[
              { value: "", label: "Todos los pagos" },
              { value: "contado", label: "Contado" },
              { value: "credito", label: "Crédito" },
            ]} />
          {hayFiltros && (
            <button onClick={() => { setBusqueda(""); setFiltroTipoPago(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2">
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtrados.length} de {grupos.length} compras
          </span>
        </div>

        {/* Tabla agrupada por compra */}
        <EdgeScrollArea>
          <table className="w-full min-w-[760px] lg:min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3 pr-4 font-medium">Fecha</th>
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium text-right">Ítems</th>
                <th className="py-3 pr-4 font-medium text-right">Total pagado</th>
                <th className="py-3 pr-4 font-medium text-right">Total ingresado</th>
                <th className="py-3 pr-4 font-medium text-right">Markup</th>
                <th className="py-3 pr-4 font-medium">Pago</th>
                <th className="py-3 pr-4 font-medium">N° Control</th>
                <th className="py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoLista ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Cargando compras…
                    </div>
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    {grupos.length === 0 ? "No hay compras registradas" : "Ninguna compra coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtrados.map((g) => {
                  const abierto = expandidos.has(g.numero_control);
                  const multi = g.items.length > 1;
                  return (
                    <FragmentRow key={g.numero_control}>
                      <tr
                        className={`border-b border-slate-200 transition-colors hover:bg-[#4FAEB2]/[0.04] ${multi ? "cursor-pointer" : ""}`}
                        onClick={() => multi && toggle(g.numero_control)}
                      >
                        <td className="py-4 pr-4 text-gray-600 text-xs tabular-nums whitespace-nowrap">
                          {multi && <span className="mr-1 inline-block text-gray-400">{abierto ? "▾" : "▸"}</span>}
                          {formatFecha(g.fecha)}
                        </td>
                        <td className="py-4 pr-4">
                          <div className="font-medium text-gray-800">{g.proveedor_nombre}</div>
                          <div className="text-xs text-gray-500">{resumenProductos(g.items)}</div>
                          {g.comprobante && (
                            <a
                              href={`/api/compras/comprobante?numero_control=${encodeURIComponent(g.numero_control)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                            >
                              📎 Ver comprobante
                            </a>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-right tabular-nums text-gray-700">{g.items.length}</td>
                        <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800">{formatGs(g.total)}</td>
                        <td className="py-4 pr-4 text-right tabular-nums text-gray-700">
                          {g.totalIngresado > 0 ? formatGs(g.totalIngresado) : "—"}
                        </td>
                        <td className="py-4 pr-4 text-right tabular-nums">
                          {(() => {
                            const mk = markupPct(g.total, g.totalIngresado);
                            if (mk == null) return <span className="text-gray-400">—</span>;
                            return (
                              <span className={`font-semibold ${mk >= 100 ? "text-emerald-700" : mk >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                                {mk.toFixed(0)}%
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-4 pr-4">
                          {(() => {
                            const ms = metodosPago[g.numero_control];
                            if (ms && ms.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {ms.map((m) => (
                                    <span key={m} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${metodoBadge[m] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                                      {metodoLabel[m] ?? m}
                                    </span>
                                  ))}
                                </div>
                              );
                            }
                            // Sin recepción vinculada: mostramos el tipo de pago de la compra.
                            return (
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${g.tipo_pago ? tipoPagoBadge[g.tipo_pago] : "bg-gray-100 text-gray-500"}`}>
                                {g.tipo_pago === "contado" ? "Contado" : g.tipo_pago === "credito" ? `Crédito ${g.plazo_dias ?? ""}d` : "—"}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-4 pr-4 font-mono text-xs text-gray-500 whitespace-nowrap">{g.numero_control}</td>
                        <td className="py-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => void handleBorrar(g, e)}
                            disabled={borrando === g.numero_control}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 active:scale-95 disabled:opacity-50"
                          >
                            {borrando === g.numero_control ? "Borrando…" : "🗑 Borrar"}
                          </button>
                        </td>
                      </tr>

                      {abierto && multi && g.items.map((it) => (
                        <tr key={it.id} className="border-b border-slate-100 bg-slate-50/50 text-xs">
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4 text-gray-700">
                            <span className="font-medium">{it.producto_nombre}</span>
                            <span className="ml-2 font-mono text-gray-400">{formatGs(it.costo_unitario)}/u</span>
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{it.cantidad}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-700">{formatGs(it.total)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                            {formatGs((Number(it.cantidad) || 0) * (Number(it.precio_venta) || 0))}
                          </td>
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4" />
                          <td />
                        </tr>
                      ))}
                    </FragmentRow>
                  );
                })
              )}
            </tbody>
          </table>
        </EdgeScrollArea>

      </div>

      <MobileFab href="/compras/nueva" label="Nueva compra" />
    </div>
  );
}

/** Wrapper para agrupar fila principal + filas de detalle sin <div> en <tbody>. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
