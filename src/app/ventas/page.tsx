"use client";

import Link from "next/link";
import {
  useSegmentosGuardados, SegmentosGuardadosBar,
  useColumnasPersistidas, ColumnasDropdown, type ColumnaDef,
} from "@/components/tabla/segmentos-guardados";
import { useEffect, useState } from "react";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import { getVentas } from "@/lib/ventas/storage";
import { useT, useMoney, useUserCfg } from "@/lib/i18n/context";
import PedidosPendientesCaja from "./PedidosPendientesCaja";
import CambioModal from "./CambioModal";
import CajaControlPanel from "@/components/caja/CajaControlPanel";
import { esMismoDiaAsuncion } from "@/lib/fecha/asuncion";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { Venta, TipoVenta, TipoIvaVenta } from "@/lib/ventas/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d    = new Date(iso);
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, "0");
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

// ── Constantes de estilo ───────────────────────────────────────────────────────

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none";

const tipoVentaBadge: Record<TipoVenta, string> = {
  CONTADO: "bg-blue-50 text-blue-700",
  CREDITO: "bg-orange-50 text-orange-700",
};

const ivaLabel: Record<TipoIvaVenta, string> = {
  EXENTA: "Exenta",
  "5%":   "IVA 5%",
  "10%":  "IVA 10%",
};

// ── Métricas del día ──────────────────────────────────────────────────────────

function esDeHoy(iso: string): boolean {
  // Compara por día calendario de Paraguay (America/Asuncion), no por el TZ del
  // runtime: una venta hecha de noche PY se guarda con fecha UTC del día siguiente
  // y con `getDate()` local se contaría/descartaría mal.
  try {
    return esMismoDiaAsuncion(iso);
  } catch {
    return false;
  }
}

interface MetricasHoy {
  facturacion:       number;
  cantidadVentas:    number;
  ticketPromedio:    number;
  productosVendidos: number;  // suma de todas las cantidades en todos los ítems
}

function calcularMetricas(ventas: Venta[]): MetricasHoy {
  const deHoy            = ventas.filter((v) => esDeHoy(v.fecha));
  const facturacion      = deHoy.reduce((s, v) => s + v.total, 0);
  const cantidadVentas   = deHoy.length;
  const ticketPromedio   = cantidadVentas > 0 ? facturacion / cantidadVentas : 0;
  const productosVendidos = deHoy.reduce(
    (s, v) => s + v.items.reduce((si, i) => si + i.cantidad, 0),
    0
  );
  return { facturacion, cantidadVentas, ticketPromedio, productosVendidos };
}

// ── Tarjeta métrica ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-1 shadow-sm ${
      accent
        ? "bg-[#4FAEB2] border-[#4FAEB2] ring-1 ring-[#4FAEB2]/25"
        : "bg-white border-[#4FAEB2]/30 ring-1 ring-[#4FAEB2]/10"
    }`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
        accent ? "text-white/90" : "text-[#4FAEB2]"
      }`}>
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums leading-tight ${
        accent ? "text-white" : "text-[#3F8E91]"
      }`}>
        {value}
      </span>
      {sub && <span className={`text-xs ${accent ? "text-white/80" : "text-slate-500"}`}>{sub}</span>}
    </div>
  );
}

// ── Helpers de fila ───────────────────────────────────────────────────────────

/** Muestra el primer producto de la venta y un badge con el resto. */
function ResumenProductos({ v }: { v: Venta }) {
  const primero = v.items[0];
  if (!primero) {
    return (
      <span className="text-xs text-gray-400">Sin líneas cargadas</span>
    );
  }
  const extra   = v.items.length - 1;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-gray-800 leading-tight">
        {primero.producto_nombre}
      </span>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-mono text-xs text-gray-400">{primero.sku}</span>
        {extra > 0 && (
          <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full font-medium">
            +{extra} más
          </span>
        )}
      </div>
    </div>
  );
}

/** Determina qué mostrar en la celda IVA cuando hay múltiples ítems. */
function ivaResumen(v: Venta): string {
  const tipos = [...new Set(v.items.map((i) => i.tipo_iva))];
  if (tipos.length === 1) return ivaLabel[tipos[0]];
  return "Mixto";
}

// ── Componente principal ───────────────────────────────────────────────────────

function SortableTh<K extends string>({ sortKey, active, dir, onClick, className, children }: {
  sortKey: K; active: K | null; dir: "asc" | "desc"; onClick: (k: K) => void;
  className?: string; children: React.ReactNode;
}) {
  const isActive = active === sortKey;
  const arrow = isActive ? (dir === "asc" ? "▲" : "▼") : "";
  return (
    <th className={`${className ?? ""} cursor-pointer select-none hover:text-[#3F8E91]`} onClick={() => onClick(sortKey)} title="Ordenar">
      {children}
      {arrow && <span className="ml-1 text-[10px] text-[#4FAEB2]">{arrow}</span>}
    </th>
  );
}

export default function VentasPage() {
  const t = useT();
  const money = useMoney();
  const { lang } = useUserCfg();
  // Locale para toLocaleDateString y toLocaleTimeString. es-PY para
  // sucursales de Paraguay, pt-BR para Brasil.
  const dateLocale = lang === "pt-BR" ? "pt-BR" : "es-PY";
  // Karen: solo administrador puede anular ventas. Escondemos el botón
  // para cualquier otro rol (super_admin queda incluido por isAdmin).
  const { isAdmin: puedeAnular, loaded: rolLoaded } = useIsAdmin();
  const [todas,      setTodas]      = useState<Venta[]>([]);
  const [busqueda,   setBusqueda]   = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoVenta | "">("");
  const [filtroIva,  setFiltroIva]  = useState<TipoIvaVenta | "">("");
  // Solo para admin: filtro por sucursal del histórico completo. Los cajeros
  // ya reciben la lista scopeada por su sucursal desde la API.
  const [filtroSucursal, setFiltroSucursal] = useState<string>("");
  // Fase 2 tanda 3: filtros combinables adicionales
  const [filtroPago,     setFiltroPago]     = useState<"" | "efectivo" | "tarjeta" | "transferencia" | "qr" | "billetera" | "otro">("");
  // Formas de pago configurables (fase 2 tanda 12). Fallback a defaults.
  const [formasPago, setFormasPago] = useState<Array<{ codigo: string; label: string }>>([
    { codigo: "efectivo", label: "Efectivo" }, { codigo: "tarjeta", label: "Tarjeta" },
    { codigo: "transferencia", label: "Transferencia" }, { codigo: "qr", label: "QR" },
    { codigo: "billetera", label: "Billetera" }, { codigo: "otro", label: "Otro" },
  ]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/formas-pago", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        const list = (j.data?.formas ?? []) as Array<{ codigo: string; label: string }>;
        if (list.length > 0) setFormasPago(list);
      })
      .catch(() => { /* silencioso */ });
    return () => { cancel = true; };
  }, []);
  const [filtroEstado,   setFiltroEstado]   = useState<"" | "completada" | "anulada">("");
  const [segmento,       setSegmento]       = useState<"" | "hoy" | "semana" | "mes" | "con_descuento" | "anuladas">("");
  // Ordenamiento por columna (fase 2 tanda 3.b)
  type VentaSortKey = "numero_control" | "cant_items" | "cant_total" | "total" | "tipo_venta" | "metodo_pago" | "sucursal" | "fecha";
  const [sortKey, setSortKey] = useState<VentaSortKey | null>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(key: VentaSortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir("desc"); return; }
    if (sortDir === "desc") { setSortDir("asc"); return; }
    setSortKey(null); setSortDir("desc");
  }

  // Fase 2 tanda 15: columnas configurables + segmentos guardados
  type VentaColKey = "numero_control" | "productos" | "items_count" | "cant_total" | "iva" | "total" | "tipo" | "pago" | "sucursal" | "fecha" | "acciones";
  const VENTAS_COLUMNAS_ALL: ColumnaDef<VentaColKey>[] = [
    { key: "numero_control", label: "Número", required: true },
    { key: "productos", label: "Productos" },
    { key: "items_count", label: "Ítems" },
    { key: "cant_total", label: "Cant. total" },
    { key: "iva", label: "IVA" },
    { key: "total", label: "Total", required: true },
    { key: "tipo", label: "Tipo" },
    { key: "pago", label: "Pago" },
    { key: "sucursal", label: "Sucursal" },
    { key: "fecha", label: "Fecha" },
    { key: "acciones", label: "Acciones (Imprimir / Anular)", required: true },
  ];
  const VENTAS_COL_DEFAULTS: VentaColKey[] = ["numero_control", "productos", "items_count", "cant_total", "iva", "total", "tipo", "pago", "sucursal", "fecha", "acciones"];
  const { visibles: colVis, toggle: colToggle, mover: colMover, reset: colReset } =
    useColumnasPersistidas<VentaColKey>("neura.erp.ventas.columnas.v1", VENTAS_COLUMNAS_ALL, VENTAS_COL_DEFAULTS);
  const [colsOpen, setColsOpen] = useState(false);

  type VentaSegData = {
    busqueda: string; filtroTipo: string; filtroIva: string; filtroSucursal: string;
    filtroPago: string; filtroEstado: string; segmento: string;
  };
  const { segmentos: segsGuardados, guardar: guardarSeg, borrar: borrarSeg } =
    useSegmentosGuardados<VentaSegData>("neura.erp.ventas.segmentos.v1");
  const [sucursales, setSucursales] = useState<{ id: string; nombre: string }[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  // Modal para anular una venta desde el listado. La venta a anular
  // se guarda en estado + un textarea para el motivo (admin only).
  const [anularVenta, setAnularVenta] = useState<Venta | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulandoBusy, setAnulandoBusy] = useState(false);
  const [anularError, setAnularError] = useState<string | null>(null);
  const [cambioVenta, setCambioVenta] = useState<Venta | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCargandoLista(true);
    getVentas().then((data) => {
      if (cancelled) return;
      const ordenadas = [...data].sort((a, b) => {
        const ta = new Date(a.fecha).getTime();
        const tb = new Date(b.fecha).getTime();
        return tb - ta || b.numero_control.localeCompare(a.numero_control);
      });
      setTodas(ordenadas);
    }).finally(() => {
      if (!cancelled) setCargandoLista(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sucursales (solo hace la fetch cuando confirmamos que el usuario es admin,
  // para no gastar la request en cajeros que no necesitan el filtro).
  useEffect(() => {
    if (!rolLoaded || !puedeAnular) return;
    let cancelled = false;
    fetch("/api/sucursales", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const rows = ((j.data?.sucursales as Array<Record<string, unknown>>) ?? [])
          .map((s) => ({ id: String(s.id), nombre: String(s.nombre ?? "Sucursal") }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        setSucursales(rows);
      })
      .catch(() => { /* silencioso */ });
    return () => { cancelled = true; };
  }, [rolLoaded, puedeAnular]);

  async function confirmarAnular() {
    const v = anularVenta;
    if (!v) return;
    setAnularError(null);
    if (!anularMotivo.trim()) {
      setAnularError("Escribí un motivo para la anulación.");
      return;
    }
    setAnulandoBusy(true);
    try {
      const r = await fetch(`/api/ventas/${v.id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ motivo: anularMotivo.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo anular la venta (${r.status}).`);
      }
      // Marca la venta en el listado sin refetch full.
      setTodas((prev) => prev.map((x) =>
        x.id === v.id
          ? { ...x, estado: "anulada", anulada_at: new Date().toISOString(), anulacion_motivo: anularMotivo.trim() }
          : x
      ));
      setAnularVenta(null);
      setAnularMotivo("");
    } catch (e) {
      setAnularError(e instanceof Error ? e.message : "Error inesperado al anular.");
    } finally {
      setAnulandoBusy(false);
    }
  }

  // Cuando el admin elige una sucursal, TODAS las visualizaciones (métricas
  // del día, contador, tabla) se limitan a esa sucursal. Cajero siempre ve
  // sus propias ventas — el filtro ya venía scopeado desde la API.
  const alcance = filtroSucursal
    ? todas.filter((v) => (v.sucursal_id ?? "") === filtroSucursal)
    : todas;
  const metricas = calcularMetricas(alcance);
  const sucursalNombreActiva = filtroSucursal
    ? (sucursales.find((s) => s.id === filtroSucursal)?.nombre ?? null)
    : null;

  const filtradas = alcance.filter((v) => {
    // Búsqueda global: número de control, nombre o SKU de cualquier ítem
    if (busqueda.trim() !== "") {
      const t = busqueda.toLowerCase().trim();
      const coincide =
        v.numero_control.toLowerCase().includes(t) ||
        v.items.some(
          (i) =>
            i.producto_nombre.toLowerCase().includes(t) ||
            i.sku.toLowerCase().includes(t)
        );
      if (!coincide) return false;
    }
    // Tipo de venta
    if (filtroTipo !== "" && v.tipo_venta !== filtroTipo) return false;
    // IVA: coincide si al menos un ítem tiene ese tipo
    if (filtroIva !== "" && !v.items.some((i) => i.tipo_iva === filtroIva))
      return false;
    // Forma de pago
    if (filtroPago !== "" && v.metodo_pago !== filtroPago) return false;
    // Estado (completada / anulada) — si no se filtra, mostramos todo salvo
    // que el segmento "anuladas" lo pida explícitamente
    if (filtroEstado !== "" && (v.estado ?? "completada") !== filtroEstado) return false;
    // Segmento rápido
    if (segmento) {
      const f = Date.parse(v.fecha);
      const dias = Number.isFinite(f) ? (Date.now() - f) / 86_400_000 : Infinity;
      const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
      const startWeek = (() => {
        const x = new Date();
        const dow = (x.getDay() + 6) % 7; // lunes=0
        x.setHours(0,0,0,0);
        x.setDate(x.getDate() - dow);
        return x.getTime();
      })();
      const startMonth = new Date();
      startMonth.setDate(1); startMonth.setHours(0,0,0,0);
      switch (segmento) {
        case "hoy":
          if (!Number.isFinite(f) || f < startOfDay()) return false;
          break;
        case "semana":
          if (!Number.isFinite(f) || f < startWeek) return false;
          break;
        case "mes":
          if (!Number.isFinite(f) || f < startMonth.getTime()) return false;
          break;
        case "con_descuento":
          if (!(Number(v.descuento_general ?? 0) > 0)) return false;
          break;
        case "anuladas":
          if ((v.estado ?? "completada") !== "anulada") return false;
          break;
      }
      void dias;
    }
    return true;
  });

  const filtradasOrdenadas = (() => {
    if (!sortKey) return filtradas;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtradas];
    return arr.sort((a, b) => {
      switch (sortKey) {
        case "numero_control": return a.numero_control.localeCompare(b.numero_control) * dir;
        case "cant_items":     return (a.items.length - b.items.length) * dir;
        case "cant_total":     return (a.items.reduce((s, i) => s + i.cantidad, 0) - b.items.reduce((s, i) => s + i.cantidad, 0)) * dir;
        case "total":          return (a.total - b.total) * dir;
        case "tipo_venta":     return a.tipo_venta.localeCompare(b.tipo_venta) * dir;
        case "metodo_pago":    return ((a.metodo_pago ?? "") as string).localeCompare((b.metodo_pago ?? "") as string) * dir;
        case "sucursal":       return ((a.sucursal_nombre ?? "") as string).localeCompare((b.sucursal_nombre ?? "") as string) * dir;
        case "fecha":          return (Date.parse(a.fecha) - Date.parse(b.fecha)) * dir;
        default: return 0;
      }
    });
  })();

  const hayFiltros = busqueda || filtroTipo || filtroIva || filtroSucursal;

  return (
    <div className="space-y-8">

      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
            style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Zentra · Operaciones
          </p>
        </div>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{t("Caja")}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{t("Cobro, facturación y cierre de pedidos")}</p>
      </div>

      <CajaControlPanel />

      <PedidosPendientesCaja />

      {/* ── Métricas del día ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
          {t("Resumen de hoy")} —{" "}
          {new Date().toLocaleDateString(dateLocale, {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label={t("Facturación de hoy")}
            value={money.format(metricas.facturacion)}
            sub={t("Total incl. IVA")}
            accent
          />
          <MetricCard
            label={t("Ventas de hoy")}
            value={String(metricas.cantidadVentas)}
            sub={metricas.cantidadVentas === 1 ? t("orden registrada") : t("órdenes registradas")}
          />
          <MetricCard
            label={t("Ticket promedio")}
            value={
              metricas.ticketPromedio > 0
                ? money.format(Math.round(metricas.ticketPromedio))
                : "—"
            }
            sub={t("Por orden de venta")}
          />
          <MetricCard
            label={t("Unidades vendidas")}
            value={String(metricas.productosVendidos)}
            sub={t("Unidades despachadas")}
          />
        </div>
      </div>

      {/* ── Tabla de ventas ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 sm:p-5 lg:p-6">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("Órdenes de venta")}</h2>
          <Link
            href="/atencion/nueva"
            className="bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            + {t("Nueva venta")}
          </Link>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input
            type="text"
            placeholder={t("Buscar por número, producto o SKU...")}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-0 flex-1 sm:min-w-64`}
          />
          <FancySelect
            value={filtroTipo}
            onChange={(v) => setFiltroTipo(v as TipoVenta | "")}
            ariaLabel={t("Filtrar por tipo de venta")}
            className="w-44"
            size="sm"
            options={[
              { value: "", label: t("Todos los tipos") },
              { value: "CONTADO", label: t("Contado") },
              { value: "CREDITO", label: t("Crédito") },
            ]}
          />
          <FancySelect
            value={filtroIva}
            onChange={(v) => setFiltroIva(v as TipoIvaVenta | "")}
            ariaLabel={t("Filtrar por IVA")}
            className="w-44"
            size="sm"
            options={[
              { value: "", label: t("Todos los IVA") },
              { value: "EXENTA", label: t("Exenta") },
              { value: "5%", label: "IVA 5%" },
              { value: "10%", label: "IVA 10%" },
            ]}
          />
          {puedeAnular && sucursales.length > 1 && (
            <FancySelect
              value={filtroSucursal}
              onChange={(v) => setFiltroSucursal(v as string)}
              ariaLabel={t("Filtrar por sucursal")}
              className="w-52"
              size="sm"
              options={[
                { value: "", label: t("Todas las sucursales") },
                ...sucursales.map((s) => ({ value: s.id, label: s.nombre })),
              ]}
            />
          )}
          <FancySelect
            value={filtroPago}
            onChange={(v) => setFiltroPago(v as typeof filtroPago)}
            ariaLabel={t("Filtrar por forma de pago")}
            className="w-44"
            size="sm"
            options={[
              { value: "", label: t("Todas formas de pago") },
              ...formasPago.map((f) => ({ value: f.codigo, label: t(f.label) })),
            ]}
          />
          <FancySelect
            value={filtroEstado}
            onChange={(v) => setFiltroEstado(v as typeof filtroEstado)}
            ariaLabel={t("Filtrar por estado")}
            className="w-40"
            size="sm"
            options={[
              { value: "", label: t("Todas") },
              { value: "completada", label: t("Completadas") },
              { value: "anulada", label: t("Anuladas") },
            ]}
          />
          {(hayFiltros || filtroPago || filtroEstado || segmento) && (
            <button
              onClick={() => { setBusqueda(""); setFiltroTipo(""); setFiltroIva(""); setFiltroSucursal(""); setFiltroPago(""); setFiltroEstado(""); setSegmento(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              {t("Limpiar filtros")}
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400 flex items-center gap-2">
            {sucursalNombreActiva && (
              <span className="rounded-full bg-[#4FAEB2]/10 px-2 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
                {sucursalNombreActiva}
              </span>
            )}
            <span>{filtradas.length} {t("de")} {alcance.length} {t("ventas")}</span>
            <ColumnasDropdown<VentaColKey>
              abierto={colsOpen}
              onToggle={() => setColsOpen((v) => !v)}
              todas={VENTAS_COLUMNAS_ALL}
              visibles={colVis}
              onToggleColumna={colToggle}
              onMover={colMover}
              onReset={colReset}
            />
          </span>
        </div>

        {/* Segmentos guardados */}
        <SegmentosGuardadosBar<VentaSegData>
          segmentos={segsGuardados}
          puedeGuardar={Boolean(busqueda || filtroTipo || filtroIva || filtroSucursal || filtroPago || filtroEstado || segmento)}
          onGuardar={() => guardarSeg({
            busqueda, filtroTipo, filtroIva, filtroSucursal, filtroPago, filtroEstado, segmento,
          })}
          onAplicar={(s) => {
            setBusqueda(s.data.busqueda ?? "");
            setFiltroTipo((s.data.filtroTipo as TipoVenta | "") ?? "");
            setFiltroIva((s.data.filtroIva as TipoIvaVenta | "") ?? "");
            setFiltroSucursal(s.data.filtroSucursal ?? "");
            setFiltroPago((s.data.filtroPago as typeof filtroPago) ?? "");
            setFiltroEstado((s.data.filtroEstado as typeof filtroEstado) ?? "");
            setSegmento((s.data.segmento as typeof segmento) ?? "");
          }}
          onBorrar={borrarSeg}
        />

        {/* Segmentos rápidos por período / estado */}
        <div className="flex flex-wrap gap-1.5 -mt-2">
          {(() => {
            const now = Date.now();
            const startOfDay = (() => { const x = new Date(); x.setHours(0,0,0,0); return x.getTime(); })();
            const startWeek = (() => {
              const x = new Date(); const dow = (x.getDay() + 6) % 7;
              x.setHours(0,0,0,0); x.setDate(x.getDate() - dow); return x.getTime();
            })();
            const startMonth = (() => { const x = new Date(); x.setDate(1); x.setHours(0,0,0,0); return x.getTime(); })();
            const items: Array<[typeof segmento, string, number]> = [
              ["", t("Todas"), alcance.length],
              ["hoy", t("Hoy"), alcance.filter((v) => Date.parse(v.fecha) >= startOfDay).length],
              ["semana", t("Esta semana"), alcance.filter((v) => Date.parse(v.fecha) >= startWeek).length],
              ["mes", t("Este mes"), alcance.filter((v) => Date.parse(v.fecha) >= startMonth).length],
              ["con_descuento", t("Con descuento"), alcance.filter((v) => Number(v.descuento_general ?? 0) > 0).length],
              ["anuladas", t("Anuladas"), alcance.filter((v) => (v.estado ?? "completada") === "anulada").length],
            ];
            void now;
            return items.map(([key, label, count]) => {
              const active = segmento === key;
              return (
                <button
                  key={key || "todos"}
                  type="button"
                  onClick={() => setSegmento(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    active
                      ? "bg-[#4FAEB2] border-[#4FAEB2] text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-[#4FAEB2] hover:text-[#3F8E91]"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            });
          })()}
        </div>

        {/* Tabla — min-w fuerza scroll horizontal en mobile; columnas secundarias
            (Items, Cant total, IVA, Pago) se ocultan progresivamente. */}
        <EdgeScrollArea>
          <table className="w-full min-w-[760px] lg:min-w-0 text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                {colVis.map((k) => {
                  switch (k) {
                    case "numero_control": return <SortableTh key={k} sortKey="numero_control" active={sortKey} dir={sortDir} onClick={toggleSort} className="py-3 pr-4 font-medium">{t("Número")}</SortableTh>;
                    case "productos": return <th key={k} className="py-3 pr-4 font-medium">{t("Productos")}</th>;
                    case "items_count": return <SortableTh key={k} sortKey="cant_items" active={sortKey} dir={sortDir} onClick={toggleSort} className="hidden py-3 pr-4 text-center font-medium lg:table-cell">{t("Ítems")}</SortableTh>;
                    case "cant_total": return <SortableTh key={k} sortKey="cant_total" active={sortKey} dir={sortDir} onClick={toggleSort} className="py-3 pr-4 font-medium text-right hidden lg:table-cell">{t("Cant. total")}</SortableTh>;
                    case "iva": return <th key={k} className="py-3 pr-4 font-medium hidden lg:table-cell">IVA</th>;
                    case "total": return <SortableTh key={k} sortKey="total" active={sortKey} dir={sortDir} onClick={toggleSort} className="py-3 pr-4 font-medium text-right">{t("Total")}</SortableTh>;
                    case "tipo": return <SortableTh key={k} sortKey="tipo_venta" active={sortKey} dir={sortDir} onClick={toggleSort} className="hidden py-3 pr-4 font-medium lg:table-cell">{t("Tipo")}</SortableTh>;
                    case "pago": return <SortableTh key={k} sortKey="metodo_pago" active={sortKey} dir={sortDir} onClick={toggleSort} className="hidden py-3 pr-4 font-medium lg:table-cell">{t("Pago")}</SortableTh>;
                    case "sucursal": return <SortableTh key={k} sortKey="sucursal" active={sortKey} dir={sortDir} onClick={toggleSort} className="hidden py-3 pr-4 font-medium lg:table-cell">{t("Sucursal")}</SortableTh>;
                    case "fecha": return <SortableTh key={k} sortKey="fecha" active={sortKey} dir={sortDir} onClick={toggleSort} className="py-3 pr-4 font-medium">{t("Fecha")}</SortableTh>;
                    case "acciones": return <th key={k} className="py-3 font-medium text-center">{t("Ticket")}</th>;
                    default: return null;
                  }
                })}
              </tr>
            </thead>
            <tbody>
              {cargandoLista ? (
                <tr>
                  <td colSpan={colVis.length} className="py-12 text-center text-sm text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin text-[#4FAEB2]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      {t("Cargando ventas…")}
                    </div>
                  </td>
                </tr>
              ) : filtradasOrdenadas.length === 0 ? (
                <tr>
                  <td colSpan={colVis.length} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? t("No hay ventas registradas")
                      : t("Ninguna venta coincide con los filtros")}
                  </td>
                </tr>
              ) : (
                filtradasOrdenadas.map((v) => {
                  const cantTotal = v.items.reduce((s, i) => s + i.cantidad, 0);
                  return (
                    <tr key={v.id} className="border-b border-slate-200 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                      {colVis.map((k) => {
                        switch (k) {
                          case "numero_control": return (
                            <td key={k} className="py-4 pr-4 font-mono text-xs align-middle">
                              <Link href={`/ventas/${v.id}`} className="text-[#3F8E91] hover:underline" title={t("Ver detalle")}>{v.numero_control}</Link>
                            </td>
                          );
                          case "productos": return <td key={k} className="py-4 pr-4 align-middle"><ResumenProductos v={v} /></td>;
                          case "items_count": return (
                            <td key={k} className="hidden py-4 pr-4 text-center align-middle lg:table-cell">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{v.items.length}</span>
                            </td>
                          );
                          case "cant_total": return <td key={k} className="py-4 pr-4 text-right tabular-nums text-gray-700 align-middle hidden lg:table-cell">{cantTotal}</td>;
                          case "iva": return (
                            <td key={k} className="py-4 pr-4 align-middle hidden lg:table-cell">
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">{ivaResumen(v)}</span>
                            </td>
                          );
                          case "total": return <td key={k} className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800 align-middle">{formatGs(v.total)}</td>;
                          case "tipo": return (
                            <td key={k} className="hidden py-4 pr-4 align-middle lg:table-cell">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tipoVentaBadge[v.tipo_venta]}`}>
                                {v.tipo_venta === "CONTADO" ? "Contado" : `Crédito ${v.plazo_dias ?? ""}d`}
                              </span>
                            </td>
                          );
                          case "pago": return (
                            <td key={k} className="hidden py-4 pr-4 align-middle text-xs text-gray-600 lg:table-cell">
                              {v.metodo_pago === "tarjeta" ? "Tarjeta" : v.metodo_pago === "transferencia" ? "Transfer." : v.metodo_pago === "efectivo" ? "Efectivo" : "—"}
                            </td>
                          );
                          case "sucursal": return <td key={k} className="hidden py-4 pr-4 align-middle text-xs text-gray-600 lg:table-cell">{v.sucursal_nombre ?? "—"}</td>;
                          case "fecha": return <td key={k} className="py-4 pr-4 text-gray-500 text-xs tabular-nums align-middle">{formatFecha(v.fecha)}</td>;
                          case "acciones": return (
                            <td key={k} className="py-4 text-center align-middle">
                        <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                          {v.estado === "anulada" ? (
                            <span
                              className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                              title={v.anulacion_motivo ?? "Anulada"}
                            >
                              ⛔ Anulada
                            </span>
                          ) : (
                            <>
                              <a
                                href={`/api/ventas/${v.id}/ticket?mode=comandas`}
                                target="_blank" rel="noopener"
                                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                                title="Abrir comandas + ticket cliente"
                              >
                                Imprimir
                              </a>
                              {v.genera_nota_remision && (
                                <a
                                  href={`/api/ventas/${v.id}/ticket?tipo=remision`}
                                  target="_blank" rel="noopener"
                                  className="inline-flex items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                                  title="Nota de remisión (documento no fiscal)"
                                >
                                  Nota de remisión
                                </a>
                              )}
                              {puedeAnular && (
                                <button
                                  type="button"
                                  onClick={() => setAnularVenta(v)}
                                  className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                                  title="Anular esta venta (revierte stock y crédito)"
                                >
                                  Anular
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setCambioVenta(v)}
                                className="inline-flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                                title="Registrar cambio de productos de esta venta"
                              >
                                Cambio
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                          );
                          default: return null;
                        }
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </EdgeScrollArea>

      </div>

      {/* Modal: cambio de productos (devuelve items + se lleva franjas) */}
      {cambioVenta && (
        <CambioModal
          venta={cambioVenta}
          onClose={() => setCambioVenta(null)}
          onDone={() => {
            setCambioVenta(null);
            // Refrescamos el listado para que se vea la nueva venta del cambio.
            getVentas().then((data) => {
              const ordenadas = [...data].sort((a, b) => {
                const ta = new Date(a.fecha).getTime();
                const tb = new Date(b.fecha).getTime();
                return tb - ta || b.numero_control.localeCompare(a.numero_control);
              });
              setTodas(ordenadas);
            });
          }}
        />
      )}

      {/* Modal: anular venta */}
      {anularVenta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!anulandoBusy) { setAnularVenta(null); setAnularError(null); setAnularMotivo(""); } }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Anular venta {anularVenta.numero_control}</h3>
            <p className="text-sm text-slate-500 mb-3">
              Revierte el stock, cancela cobros inmediatos y devuelve el crédito aplicado al cliente. Requiere permisos de administrador.
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 mb-4 text-xs text-slate-600 space-y-0.5">
              <p><strong>Total:</strong> {formatGs(anularVenta.total)}</p>
              <p><strong>Fecha:</strong> {formatFecha(anularVenta.fecha)}</p>
              {anularVenta.sucursal_nombre && <p><strong>Sucursal:</strong> {anularVenta.sucursal_nombre}</p>}
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Motivo *
            </label>
            <textarea
              value={anularMotivo}
              onChange={(e) => setAnularMotivo(e.target.value)}
              disabled={anulandoBusy}
              placeholder="Ej: cliente devolvió, error de carga, etc."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {anularError && (
              <p className="mt-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                {anularError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setAnularVenta(null); setAnularMotivo(""); setAnularError(null); }}
                disabled={anulandoBusy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarAnular()}
                disabled={anulandoBusy || !anularMotivo.trim()}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 px-4 py-2 text-sm font-semibold text-white"
              >
                {anulandoBusy ? "Anulando…" : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB mobile: acceso 1-tap a "+ Nueva venta" desde cualquier scroll position */}
      <MobileFab href="/atencion/nueva" label="Nueva venta" />
    </div>
  );
}
