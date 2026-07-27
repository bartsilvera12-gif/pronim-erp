"use client";

// ═══════════════════════════════════════════════════════════════════════
// EVALUACIÓN — solo "el cliente trae"
// ---------------------------------------------------------------------
// Focus mode: no muestra el panel de venta (lleva). Reusa el mismo
// backend /api/atencion/confirmar mandando lleva:null y solo trae.
// El resultado es una recepción + crédito ENTRADA para el cliente.
// El flujo atómico trae+lleva sigue vivo en /atencion/nueva.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT, useMoney } from "@/lib/i18n/context";
import { MetaCelebrationModal, MetaCumplidaBadge } from "@/components/metas/MetaCelebrationModal";
import MontoInput from "@/components/ui/MontoInput";
import {
  BalanceItem, ColumnaAtencion, NuevoClienteRapidoModal,
  fmtGs, type Cliente, type Franja, type Linea, type TipoPrenda,
} from "@/lib/atencion/shared";
import { CajaControlBanner, useCajaState } from "@/lib/atencion/caja-control";

export default function NuevaEvaluacionPage() {
  const router = useRouter();
  const t = useT();
  const money = useMoney();

  // ── Catálogo / clientes ──────────────────────────────────────────────
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [tiposPrenda, setTiposPrenda] = useState<TipoPrenda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [nuevoClienteOpen, setNuevoClienteOpen] = useState(false);
  const [creditoDisponible, setCreditoDisponible] = useState(0);

  // ── Metas / pendientes ───────────────────────────────────────────────
  const [metaDia, setMetaDia] = useState<{ meta_diaria: number; vendido_dia: number; pct: number } | null>(null);
  const [pendientesIngresoCount, setPendientesIngresoCount] = useState(0);
  const [pendientesVencidasCount, setPendientesVencidasCount] = useState(0);
  const [metaAlcanzada, setMetaAlcanzada] = useState<{
    sucursal_id: string; nombre: string; pct_meta: number;
    vendido: number; meta_periodo: number;
  } | null>(null);
  const [metasCumplidasHoy, setMetasCumplidasHoy] = useState<{ sucursal_id: string; nombre: string }[]>([]);

  // ── Ticket ────────────────────────────────────────────────────────────
  const [trae, setTrae] = useState<Linea[]>([]);
  const [traeMontoFinal, setTraeMontoFinal] = useState<string>("");
  const [ingresarAlStock, setIngresarAlStock] = useState<boolean>(false);
  const [observaciones, setObservaciones] = useState("");

  // Carga rápida por MONTO (misma UX que caja original).
  const [cargaRapidaOpen, setCargaRapidaOpen] = useState(false);
  const [cargaRapidaCantidad, setCargaRapidaCantidad] = useState("");
  const [cargaRapidaMonto, setCargaRapidaMonto] = useState("");

  // ── Feedback / submit ────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  // ── Caja compartida ──────────────────────────────────────────────────
  const caja = useCajaState();

  // ── Efectos ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [rf, rc, rt] = await Promise.all([
          fetchWithSupabaseSession("/api/franjas/publicas", { cache: "no-store" }),
          fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
          fetchWithSupabaseSession("/api/tipos-prenda?solo_activos=true", { cache: "no-store" }),
        ]);
        refrescarPendientesIngreso();
        refrescarMetaDia();
        refrescarMetasAlcanzadas();
        const jf = await rf.json().catch(() => ({}));
        const jc = await rc.json().catch(() => ({}));
        const jt = await rt.json().catch(() => ({}));
        if (cancel) return;
        setFranjas((jf?.data?.franjas as Franja[] | undefined) ?? []);
        if (jt?.success) setTiposPrenda((jt.data?.tipos as TipoPrenda[]) ?? []);
        const rows = Array.isArray(jc?.data) ? (jc.data as Record<string, unknown>[]) : [];
        setClientes(rows.map((r) => ({
          id: String(r.id),
          nombre:
            (typeof r.empresa === "string" && r.empresa.trim())
            || (typeof r.nombre_contacto === "string" && r.nombre_contacto.trim())
            || (typeof r.nombre === "string" && r.nombre.trim())
            || "Cliente",
          empresa: typeof r.empresa === "string" ? r.empresa : null,
          ruc: typeof r.ruc === "string" ? r.ruc : null,
          telefono: typeof r.telefono === "string" ? r.telefono : null,
        })));
      } catch (e) { console.error("[evaluacion] carga inicial", e); }
      finally { if (!cancel) setCargando(false); }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => { refrescarMetasAlcanzadas(); }, 120_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cliente) { setCreditoDisponible(0); return; }
    let cancel = false;
    fetchWithSupabaseSession(`/api/clientes/${cliente.id}/creditos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel) { const s = Number(j?.data?.saldo ?? 0); setCreditoDisponible(Number.isFinite(s) ? s : 0); } })
      .catch(() => { if (!cancel) setCreditoDisponible(0); });
    return () => { cancel = true; };
  }, [cliente]);

  async function refrescarPendientesIngreso() {
    try {
      const r = await fetchWithSupabaseSession("/api/recepciones/pendientes", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const arr = (j?.data?.recepciones as { fecha: string }[] | undefined) ?? [];
      setPendientesIngresoCount(arr.length);
      const now = Date.now();
      const venc = arr.filter((x) => {
        try { return (now - new Date(x.fecha).getTime()) > 72 * 3600 * 1000; }
        catch { return false; }
      }).length;
      setPendientesVencidasCount(venc);
    } catch { /* tolerar */ }
  }

  async function refrescarMetaDia() {
    try {
      const r = await fetchWithSupabaseSession("/api/metas", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const arr = (j?.data?.sucursales as { meta_diaria: number; vendido_dia: number; pct: number }[] | undefined) ?? [];
      const meta = arr.reduce((s, x) => s + (Number(x.meta_diaria) || 0), 0);
      const vendido = arr.reduce((s, x) => s + (Number(x.vendido_dia) || 0), 0);
      const pct = meta > 0 ? Math.min(100, Math.round((vendido / meta) * 100)) : 0;
      setMetaDia(meta > 0 ? { meta_diaria: meta, vendido_dia: vendido, pct } : null);
    } catch { /* tolerar */ }
  }

  async function refrescarMetasAlcanzadas() {
    try {
      const r = await fetchWithSupabaseSession("/api/notificaciones/metas", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const metas = (j?.data?.metas as Array<{
        sucursal_id: string; nombre: string; pct_meta: number;
        vendido: number; meta_periodo: number; ya_celebrada?: boolean;
      }>) ?? [];
      if (metas.length === 0) return;
      const nueva = metas.find(m => !m.ya_celebrada);
      if (nueva && !metaAlcanzada) setMetaAlcanzada(nueva);
      setMetasCumplidasHoy(metas.filter(m => m.ya_celebrada).map(m => ({ sucursal_id: m.sucursal_id, nombre: m.nombre })));
    } catch { /* silencioso */ }
  }

  async function celebrarMetaAck(cerradoPorUsuario: boolean) {
    const m = metaAlcanzada;
    setMetaAlcanzada(null);
    if (!m) return;
    try {
      await fetchWithSupabaseSession("/api/notificaciones/metas/celebrar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal_id: m.sucursal_id, pct_meta: m.pct_meta,
          vendido: m.vendido, meta_diaria: m.meta_periodo,
          cerrado_por_usuario: cerradoPorUsuario,
        }),
      });
      setMetasCumplidasHoy(prev => prev.some(x => x.sucursal_id === m.sucursal_id)
        ? prev : [...prev, { sucursal_id: m.sucursal_id, nombre: m.nombre }]);
    } catch { /* backend dedupe */ }
  }

  // ── Cálculos ─────────────────────────────────────────────────────────
  const totalTraeSubtotal = useMemo(() => trae.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0), [trae]);
  const totalTraeManual = useMemo(() => {
    const raw = traeMontoFinal.trim();
    if (raw === "") return null;
    const n = Number(raw.replace(/\./g, "").replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }, [traeMontoFinal]);
  const totalTrae = totalTraeManual != null ? totalTraeManual : totalTraeSubtotal;
  const ajusteEvaluacion = totalTrae - totalTraeSubtotal;

  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return clientes.filter((c) => {
      if (!q) return true;
      if (c.nombre.toLowerCase().includes(q)) return true;
      if ((c.ruc ?? "").toLowerCase().includes(q)) return true;
      if (qDigits && c.telefono) {
        const tel = String(c.telefono).replace(/\D/g, "");
        if (tel.includes(qDigits)) return true;
      }
      return false;
    }).slice(0, 50);
  }, [clienteQuery, clientes]);

  // ── Handlers ─────────────────────────────────────────────────────────
  function agregarLinea(f: Franja) {
    const precio = Number(f.precio_venta) || 0;
    setTrae((prev) => {
      // Merge por (franja + sin tipo) — mismo criterio que la caja original.
      const idx = prev.findIndex((l) => l.franja_id === f.id && (l.tipo_prenda_id == null));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
        return copy;
      }
      return [...prev, { franja_id: f.id, precio_referencia: precio, precio_unitario: precio, cantidad: 1, tipo_prenda_id: null }];
    });
  }
  function actualizarLinea(idx: number, patch: Partial<Linea>) {
    setTrae((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }
  function quitarLinea(idx: number) { setTrae((prev) => prev.filter((_, i) => i !== idx)); }

  function cargarRapidoPorMonto(cantidad: number, monto: number) {
    if (!(cantidad > 0) || !(monto > 0) || franjas.length === 0) return;
    const costoUnit = Math.round(monto / cantidad);
    const mejor = franjas.reduce((acc, f) => {
      const diff = Math.abs(Number(f.precio_venta) - costoUnit);
      if (acc == null || diff < acc.diff) return { franja: f, diff };
      return acc;
    }, null as null | { franja: typeof franjas[number]; diff: number });
    if (!mejor) return;
    setTrae((prev) => [...prev, {
      franja_id: mejor.franja.id,
      precio_referencia: Number(mejor.franja.precio_venta) || 0,
      precio_unitario: costoUnit,
      cantidad,
      tipo_prenda_id: null,
    }]);
    setTraeMontoFinal(String(monto));
    setCargaRapidaOpen(false);
    setCargaRapidaCantidad("");
    setCargaRapidaMonto("");
  }

  function reset() {
    setTrae([]); setTraeMontoFinal(""); setIngresarAlStock(false);
    setObservaciones(""); setError(null);
    setCliente(null); setClienteQuery(""); setClienteOpen(false);
  }

  function preConfirmar() {
    setError(null); setOkMsg(null);
    if (!cliente) { setError("Elegí un cliente antes de confirmar."); return; }
    if (trae.length === 0) { setError("Cargá al menos una prenda que el cliente traiga."); return; }
    if (trae.some((l) => l.cantidad <= 0 || l.precio_unitario < 0)) {
      setError("Revisá las líneas: cantidad > 0 y precio válido.");
      return;
    }
    if (!caja.cajaSeleccionadaId && caja.cajasAbiertas.length !== 1) {
      setError(caja.cajasAbiertas.length > 1
        ? "Elegí la caja en la que se registra esta evaluación (hay más de una abierta)."
        : "Abrí una caja antes de confirmar.");
      return;
    }
    // La idempotency_key se genera en confirmar() cuando aún no hay una;
    // acá directamente disparamos el submit (no hay modal previo como en Venta).
    void confirmar();
  }

  async function confirmar() {
    if (!cliente) return;
    const cajaIdFinal = caja.cajaEnUsoId;
    if (!cajaIdFinal) {
      setError(caja.cajasAbiertas.length > 1
        ? "Hay más de una caja abierta. Elegí la caja antes de confirmar."
        : "Abrí la caja antes de confirmar la evaluación.");
      return;
    }
    const key = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);

    setEnviando(true);
    try {
      const traePayload = {
        items: trae.map((l) => ({
          producto_id: l.franja_id,
          cantidad: l.cantidad,
          precio_compra_unitario: l.precio_unitario,
          tipo_prenda_id: l.tipo_prenda_id ?? null,
        })),
        total_final_evaluado: totalTrae,
        ingresar_al_stock: ingresarAlStock,
      };
      const r = await fetchWithSupabaseSession("/api/atencion/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: key,
          caja_id: cajaIdFinal,
          cliente_id: cliente.id,
          observaciones: observaciones || null,
          trae: traePayload,
          lleva: null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `No se pudo confirmar la evaluación (${r.status}).`);

      setIdempotencyKey(null);
      setOkMsg(`Evaluación registrada por ${fmtGs(totalTrae)} — se acreditó al cliente.`);
      reset();
      refrescarPendientesIngreso();
      setTimeout(() => setOkMsg(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally { setEnviando(false); }
  }

  const STICKY_STYLES = [
    { bg: "bg-yellow-100", tape: "bg-yellow-300/70", tilt: "-rotate-2", text: "text-yellow-900" },
    { bg: "bg-pink-100",   tape: "bg-pink-300/70",   tilt: "rotate-1",  text: "text-pink-900"   },
    { bg: "bg-sky-100",    tape: "bg-sky-300/70",    tilt: "-rotate-1", text: "text-sky-900"    },
  ];

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Evaluación")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("Registrá las prendas que el cliente entrega para acreditar.")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {metaDia && (
            <Link href="/admin/metas"
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                metaDia.pct >= 100 ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : metaDia.pct >= 50 ? "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title={`Meta hoy: ${money.format(Math.round(metaDia.vendido_dia))} de ${money.format(Math.round(metaDia.meta_diaria))}`}
            >
              🎯 Meta hoy: <strong>{metaDia.pct}%</strong>
            </Link>
          )}
          {pendientesIngresoCount > 0 && (
            <Link href="/atencion/pendientes-ingreso"
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                pendientesVencidasCount > 0
                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}>
              {pendientesVencidasCount > 0 ? "⚠ " : "📦 "}
              {pendientesIngresoCount} {pendientesIngresoCount === 1 ? t("pendiente") : t("pendientes")} ↗
            </Link>
          )}
          <Link href="/ventas" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {t("Historial")} ↗
          </Link>
        </div>
      </div>

      <CajaControlBanner state={caja} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-rose-800">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 text-lg leading-none">×</button>
        </div>
      )}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>}

      {/* Cliente */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
          {t("CLIENTE")} <span className="text-red-500">*</span>
        </label>
        {cliente ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">{cliente.nombre}</p>
              <p className="text-xs text-slate-500">
                {cliente.ruc ? `RUC ${cliente.ruc} · ` : ""}
                Crédito actual: <span className="font-semibold text-emerald-700">{fmtGs(creditoDisponible)}</span>
              </p>
            </div>
            <button type="button" onClick={() => { setCliente(null); setClienteQuery(""); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
              Cambiar cliente
            </button>
          </div>
        ) : (
          <div className="relative">
            <input type="text" value={clienteQuery}
              onChange={(e) => { setClienteQuery(e.target.value); setClienteOpen(true); }}
              onFocus={() => setClienteOpen(true)}
              placeholder={t("Buscar por nombre, RUC o teléfono…")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
            {clienteOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                <button type="button" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setNuevoClienteOpen(true); setClienteOpen(false); }}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 text-sm font-medium text-[#4FAEB2] hover:bg-[#4FAEB2]/5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  Cargar nuevo cliente
                </button>
                {clientesFiltrados.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Sin clientes que coincidan.</p>
                ) : clientesFiltrados.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setCliente(c); setClienteOpen(false); }}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-800">{c.nombre}</span>
                    {c.ruc && <span className="ml-2 text-xs text-slate-400">RUC {c.ruc}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ColumnaAtencion
        titulo={t("EL CLIENTE TRAE")}
        descripcion={t("Cargá las prendas que entrega para acreditar.")}
        tono="emerald"
        franjas={franjas}
        cargando={cargando}
        lineas={trae}
        total={totalTrae}
        subtotalItems={totalTraeSubtotal}
        onAgregar={agregarLinea}
        onActualizar={actualizarLinea}
        onQuitar={quitarLinea}
        permitirEditarPrecio
        tiposPrenda={tiposPrenda}
        accionesHeader={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCargaRapidaOpen(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                cargaRapidaOpen
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
              }`}
              title="Cargar N prendas por un monto total sin elegir franja">
              ⚡ {t("Carga rápida")}
            </button>
            {cargaRapidaOpen && (
              <div className="w-full mt-2 rounded-lg border border-emerald-300 bg-emerald-50/70 p-3">
                <p className="text-[11px] text-emerald-900 mb-2">
                  Ingresá <strong>cuántas prendas</strong> trae y el <strong>monto total</strong> que le pagás.
                  Se crearán N unidades prorrateadas; después ajustás las franjas al ingresar al stock.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-emerald-800">Cantidad</label>
                    <input type="number" min={1} value={cargaRapidaCantidad}
                      onChange={(e) => setCargaRapidaCantidad(e.target.value)}
                      placeholder="Ej: 15"
                      className="w-24 rounded-md border border-emerald-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-emerald-800">Monto total ({money.symbol})</label>
                    <MontoInput value={cargaRapidaMonto === "" ? 0 : Number(cargaRapidaMonto) || 0}
                      onChange={(n) => setCargaRapidaMonto(String(n))}
                      decimals={false} placeholder="Ej: 1.000.000"
                      className="w-36 rounded-md border border-emerald-300 px-2 py-1 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <button type="button"
                    onClick={() => {
                      const n = parseInt(cargaRapidaCantidad, 10);
                      const m = Number(cargaRapidaMonto) || 0;
                      if (!(n > 0) || !(m > 0)) return;
                      cargarRapidoPorMonto(n, m);
                    }}
                    disabled={!(parseInt(cargaRapidaCantidad, 10) > 0) || !((Number(cargaRapidaMonto) || 0) > 0)}
                    className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5">
                    Cargar
                  </button>
                  <button type="button" onClick={() => setCargaRapidaOpen(false)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 underline">cancelar</button>
                </div>
              </div>
            )}
          </div>
        }
        slotDebajo={
          trae.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Monto final de la evaluación
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Escribí lo que efectivamente le acreditás al cliente. Si lo dejás vacío se usa el subtotal ({fmtGs(totalTraeSubtotal)}).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <MontoInput value={totalTraeManual ?? 0}
                    onChange={(n) => setTraeMontoFinal(String(Math.max(0, Math.round(n))))}
                    decimals={false} placeholder={fmtGs(totalTraeSubtotal)}
                    className="w-36 rounded-md border border-emerald-300 px-2 py-1.5 text-right text-sm font-semibold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  {totalTraeManual != null && (
                    <button type="button" onClick={() => setTraeMontoFinal("")}
                      className="text-xs text-slate-500 hover:text-slate-700 underline decoration-dotted"
                      title="Volver al subtotal de los items">limpiar</button>
                  )}
                </div>
              </div>
              {ajusteEvaluacion !== 0 && (
                <p className="mt-2 text-[11px] text-slate-600">
                  Ajuste sobre el subtotal:{" "}
                  <span className={`font-semibold ${ajusteEvaluacion > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {ajusteEvaluacion > 0 ? "+" : ""}{fmtGs(ajusteEvaluacion)}
                  </span>
                </p>
              )}
            </div>
          ) : null
        }
      />

      {/* Balance + confirmar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Balance</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <BalanceItem
            label={ajusteEvaluacion !== 0 ? "Total trae (evaluado)" : "Total trae"}
            value={fmtGs(totalTrae)} tone="emerald"
          />
          <BalanceItem
            label="Se acredita al cliente"
            value={fmtGs(totalTrae)}
            tone={totalTrae > 0 ? "emerald" : "slate"}
          />
        </div>

        {trae.length > 0 && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={ingresarAlStock}
              onChange={(e) => setIngresarAlStock(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]" />
            <span>
              <strong>Ingresar al stock ahora</strong>
              <span className="ml-1 text-xs text-slate-400">
                (si lo destildás, la recepción queda "pendiente de ingreso" y podés catalogarla después)
              </span>
            </span>
          </label>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            {t("Observaciones (opcional)")}
          </label>
          <input type="text" value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
            placeholder={t("Notas de la atención")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={preConfirmar}
            disabled={enviando || !cliente || trae.length === 0}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 transition-colors shadow-sm active:scale-95">
            {enviando ? t("Registrando…") : t("Confirmar evaluación")}
          </button>
          <button type="button" onClick={reset} disabled={enviando}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {t("Limpiar")}
          </button>
          <button type="button" onClick={() => router.push("/atencion/pendientes-ingreso")}
            className="text-sm text-slate-400 hover:text-slate-700">
            Ver bandeja de recepciones →
          </button>
        </div>
      </div>

      {nuevoClienteOpen && (
        <NuevoClienteRapidoModal
          onClose={() => setNuevoClienteOpen(false)}
          onCreated={(nuevo) => {
            setClientes((prev) => [nuevo, ...prev.filter((c) => c.id !== nuevo.id)]);
            setCliente(nuevo);
            setClienteQuery("");
            setClienteOpen(false);
            setNuevoClienteOpen(false);
          }}
        />
      )}

      <MetaCelebrationModal
        meta={metaAlcanzada}
        onSeguir={() => celebrarMetaAck(true)}
        onVerResultados={() => router.push("/admin/metas")}
      />

      {(pendientesIngresoCount > 0 || metasCumplidasHoy.length > 0) && (
        <aside aria-label="Recordatorios"
          className="hidden xl:flex fixed top-24 right-6 z-30 flex-col gap-4 w-64 max-h-[calc(100vh-8rem)] overflow-y-auto overflow-x-hidden py-2 pr-1 pointer-events-none">
          {metasCumplidasHoy.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              {metasCumplidasHoy.map(m => <MetaCumplidaBadge key={m.sucursal_id} nombre={m.nombre} />)}
            </div>
          )}
          {pendientesIngresoCount > 0 && (
            <Link href="/atencion/pendientes-ingreso"
              className={`block relative bg-orange-100 rotate-1 pointer-events-auto shadow-[0_6px_16px_-4px_rgba(0,0,0,0.25)] px-4 pt-5 pb-4 transition-transform hover:rotate-0 hover:scale-[1.02] ${STICKY_STYLES[0].bg}`}
              style={{ borderRadius: "2px 2px 14px 2px" }}>
              <span aria-hidden className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-16 bg-orange-300/70 rotate-[-3deg] shadow-sm" />
              <p className="text-[13px] font-bold leading-snug text-orange-900">
                {pendientesIngresoCount === 1
                  ? `1 ${t("recepción pendiente de evaluar")}`
                  : `${pendientesIngresoCount} ${t("recepciones pendientes de evaluar")}`}
              </p>
              <p className="text-[12px] mt-1 leading-snug text-orange-900 opacity-90">
                {t("Hay bolsas esperando ser ingresadas al stock.")}
                {pendientesVencidasCount > 0 && (
                  <> <span className="font-semibold text-rose-700">{pendientesVencidasCount} {t("con más de 72h.")}</span></>
                )}
              </p>
              <p className="text-[11px] mt-2 font-semibold text-orange-900 underline">{t("Ir a la bandeja")} →</p>
            </Link>
          )}
        </aside>
      )}
    </div>
  );
}
