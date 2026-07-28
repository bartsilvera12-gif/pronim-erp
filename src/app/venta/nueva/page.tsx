"use client";

// ═══════════════════════════════════════════════════════════════════════
// VENTA — solo "el cliente lleva"
// ---------------------------------------------------------------------
// Focus mode: no muestra el panel de recepción (trae). Reusa el mismo
// backend /api/atencion/confirmar mandando trae:null y solo lleva.
// El flujo atómico trae+lleva (cambio directo) sigue viviendo en
// /atencion/nueva ("Cambio directo" en el sidebar).
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT, useMoney } from "@/lib/i18n/context";
import { MetaCelebrationModal, MetaCumplidaBadge } from "@/components/metas/MetaCelebrationModal";
import MontoInput from "@/components/ui/MontoInput";
import {
  ALERTAS_DEFAULTS, mergeConfig, resolverAlerta, segmentoKeysAplicables,
  type AlertasConfig, type BeneficioCfg,
} from "@/lib/atencion/alertas-config";
import { StickerBadge } from "@/components/ui/StickerBadge";
import {
  BalanceItem, ColumnaAtencion, NuevoClienteRapidoModal,
  fmtGs, type Cliente, type Franja, type Linea,
} from "@/lib/atencion/shared";
import { CajaControlBanner, useCajaState } from "@/lib/atencion/caja-control";

type ClienteSegmento = {
  categoria: "nuevo" | "habitual" | "vip" | "dormido";
  totalHistorico: number;
  comprasUltimos90d: number;
  diasDesdeUltima: number | null;
  tieneReclamos: boolean;
  reclamosCount: number;
  recibioBeneficios: boolean;
  beneficiosCount: number;
};

export default function NuevaVentaPage() {
  const router = useRouter();
  const t = useT();
  const money = useMoney();

  // ── Catálogo / clientes ──────────────────────────────────────────────
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [nuevoClienteOpen, setNuevoClienteOpen] = useState(false);
  const [creditoDisponible, setCreditoDisponible] = useState(0);
  const [clienteSegmento, setClienteSegmento] = useState<ClienteSegmento | null>(null);
  const [clienteSegmentoLoading, setClienteSegmentoLoading] = useState(false);

  // ── Alertas / beneficios ─────────────────────────────────────────────
  const [alertasConfig, setAlertasConfig] = useState<AlertasConfig>(ALERTAS_DEFAULTS);
  const [preCierreOpen, setPreCierreOpen] = useState(false);
  const [beneficiosMarcados, setBeneficiosMarcados] = useState<Record<string, { marcado: boolean; monto: string }>>({});

  // ── Metas / pendientes (para sticky notes + chip) ────────────────────
  const [metaDia, setMetaDia] = useState<{ meta_diaria: number; vendido_dia: number; pct: number } | null>(null);
  // Pendientes de ingreso viven en /evaluacion/nueva — Venta no los muestra.
  const [metaAlcanzada, setMetaAlcanzada] = useState<{
    sucursal_id: string; nombre: string; pct_meta: number;
    vendido: number; meta_periodo: number;
  } | null>(null);
  const [metasCumplidasHoy, setMetasCumplidasHoy] = useState<{ sucursal_id: string; nombre: string }[]>([]);

  // ── Ticket ────────────────────────────────────────────────────────────
  const [lleva, setLleva] = useState<Linea[]>([]);
  const [aplicarCredito, setAplicarCredito] = useState<string>("");
  // Pago partido (split): Karen quiere poder cobrar en varias filas — ej.
  // 500k en tarjeta A + 300k en tarjeta B + 200k en efectivo. Cada fila
  // lleva su propio método/monto/referencia. Cuando hay sobrante en la(s)
  // fila(s) de efectivo, se muestra como vuelto (el excedente NO se
  // registra: sale como devolución al cliente).
  type PagoMetodo = "efectivo" | "tarjeta" | "transferencia";
  type PagoLinea = { metodo: PagoMetodo; monto: string; referencia: string };
  const [pagos, setPagos] = useState<PagoLinea[]>([
    { metodo: "efectivo", monto: "", referencia: "" },
  ]);
  const [observaciones, setObservaciones] = useState("");

  // ── Promo / cupón ────────────────────────────────────────────────────
  const [cuponInput, setCuponInput] = useState("");
  const [promoAplicada, setPromoAplicada] = useState<{
    id: string; nombre: string; tipo: string; cupon_codigo: string | null;
    descuento: number; cashback: number;
  } | null>(null);
  const [promoBuscando, setPromoBuscando] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // ── Feedback / submit ────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  // ── Caja compartida ──────────────────────────────────────────────────
  const caja = useCajaState();

  // ── Efectos: catálogo + segmento + alertas + metas ──────────────────
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [rf, rc] = await Promise.all([
          fetchWithSupabaseSession("/api/franjas/publicas", { cache: "no-store" }),
          fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
        ]);
        refrescarMetaDia();
        refrescarMetasAlcanzadas();
        const jf = await rf.json().catch(() => ({}));
        const jc = await rc.json().catch(() => ({}));
        if (cancel) return;
        setFranjas((jf?.data?.franjas as Franja[] | undefined) ?? []);
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
      } catch (e) { console.error("[venta] carga inicial", e); }
      finally { if (!cancel) setCargando(false); }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    fetchWithSupabaseSession("/api/configuracion/atencion-alertas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.success) setAlertasConfig(mergeConfig(j.data?.config)); })
      .catch(() => { /* defaults */ });
  }, []);

  // Poll metas cada 2 min.
  useEffect(() => {
    const id = setInterval(() => { refrescarMetasAlcanzadas(); }, 120_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crédito + segmento del cliente elegido.
  useEffect(() => {
    if (!cliente) { setCreditoDisponible(0); setAplicarCredito(""); setClienteSegmento(null); return; }
    let cancel = false;
    fetchWithSupabaseSession(`/api/clientes/${cliente.id}/creditos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel) { const s = Number(j?.data?.saldo ?? 0); setCreditoDisponible(Number.isFinite(s) ? s : 0); } })
      .catch(() => { if (!cancel) setCreditoDisponible(0); });
    setClienteSegmentoLoading(true);
    fetchWithSupabaseSession(`/api/clientes/${cliente.id}/segmento`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setClienteSegmento(j.data as ClienteSegmento); })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setClienteSegmentoLoading(false); });
    return () => { cancel = true; };
  }, [cliente]);

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
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  const totalLleva = useMemo(() => lleva.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0), [lleva]);
  const totalPrendas = useMemo(() => lleva.reduce((s, l) => s + (Number(l.cantidad) || 0), 0), [lleva]);
  const descuentoPromo = promoAplicada?.descuento ?? 0;
  const totalLlevaConDescuento = Math.max(0, totalLleva - descuentoPromo);
  const creditoMaxAplicable = Math.min(creditoDisponible, totalLlevaConDescuento);
  const creditoAplicadoNum = useMemo(() => {
    if (aplicarCredito.trim() === "") return creditoMaxAplicable;
    const n = Number(aplicarCredito);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(n, creditoMaxAplicable));
  }, [aplicarCredito, creditoMaxAplicable]);
  const aCobrar = Math.max(0, totalLlevaConDescuento - creditoAplicadoNum);
  const creditoRestante = Math.max(0, creditoDisponible - creditoAplicadoNum);

  // ── Cálculos derivados del pago partido ────────────────────────────
  const totalPagos = useMemo(
    () => pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0),
    [pagos],
  );
  const totalEfectivoEntregado = useMemo(
    () => pagos.filter((p) => p.metodo === "efectivo")
              .reduce((s, p) => s + (Number(p.monto) || 0), 0),
    [pagos],
  );
  const hayEfectivo = totalEfectivoEntregado > 0;
  const excedente = Math.max(0, totalPagos - aCobrar);
  // Vuelto solo tiene sentido si hay efectivo (se devuelve en efectivo).
  const vuelto = hayEfectivo ? excedente : 0;
  const faltaCobrar = Math.max(0, aCobrar - totalPagos);
  // Sobra sin efectivo => tarjeta/transf sobrepasa aCobrar y no hay
  // efectivo para dar vuelto: la cajera debe corregir los montos.
  const sobraSinEfectivo = !hayEfectivo && excedente > 0;

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

  const alertasDisparadas = useMemo(() => {
    if (lleva.length === 0) return [] as { titulo: string; mensaje: string }[];
    const cantidadTotal = lleva.reduce((s, l) => s + l.cantidad, 0);
    const preciosUnitarios = lleva.map((l) => l.precio_unitario);
    const segKeys = segmentoKeysAplicables({
      categoria: clienteSegmento?.categoria,
      tieneReclamos: clienteSegmento?.tieneReclamos,
      recibioBeneficios: clienteSegmento?.recibioBeneficios,
    });
    const out: { titulo: string; mensaje: string }[] = [];
    if (alertasConfig.prendas_caras.activa && preciosUnitarios.some((p) => p >= alertasConfig.prendas_caras.precio_min)) {
      out.push(resolverAlerta(alertasConfig.prendas_caras, segKeys));
    }
    if (alertasConfig.prendas_baratas.activa &&
        lleva.filter((l) => l.precio_unitario > 0 && l.precio_unitario <= alertasConfig.prendas_baratas.precio_max).length >= 2) {
      out.push(resolverAlerta(alertasConfig.prendas_baratas, segKeys));
    }
    if (alertasConfig.pocas_prendas.activa && cantidadTotal > 0 && cantidadTotal <= alertasConfig.pocas_prendas.cantidad_max) {
      out.push(resolverAlerta(alertasConfig.pocas_prendas, segKeys));
    }
    return out;
  }, [lleva, alertasConfig, clienteSegmento]);

  // ── Handlers ─────────────────────────────────────────────────────────
  function agregarLinea(f: Franja) {
    const precio = Number(f.precio_venta) || 0;
    setLleva((prev) => {
      const idx = prev.findIndex((l) => l.franja_id === f.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
        return copy;
      }
      return [...prev, { franja_id: f.id, precio_referencia: precio, precio_unitario: precio, cantidad: 1, tipo_prenda_id: null }];
    });
  }
  function actualizarLinea(idx: number, patch: Partial<Linea>) {
    setLleva((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }
  function quitarLinea(idx: number) { setLleva((prev) => prev.filter((_, i) => i !== idx)); }

  function reset() {
    setLleva([]); setAplicarCredito(""); setObservaciones("");
    setPagos([{ metodo: "efectivo", monto: "", referencia: "" }]);
    setPromoAplicada(null); setCuponInput(""); setPromoError(null);
    setError(null); setCliente(null); setClienteQuery(""); setClienteOpen(false);
  }

  async function aplicarPromocion(cuponManual: string | null) {
    setPromoError(null);
    if (lleva.length === 0) { setPromoError("Cargá primero lo que el cliente lleva."); return; }
    setPromoBuscando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/promociones/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente?.id ?? null,
          cupon: cuponManual,
          items: lleva.map((l) => ({ franja_id: l.franja_id, cantidad: l.cantidad, precio_unitario: l.precio_unitario })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "No se pudo aplicar la promoción.");
      const desc = Number(j?.data?.descuento ?? 0);
      const cash = Number(j?.data?.cashback ?? 0);
      const promo = j?.data?.promocion;
      if (!promo || (desc === 0 && cash === 0)) {
        setPromoAplicada(null);
        setPromoError(cuponManual ? `El cupón "${cuponManual}" no aplica.` : "No hay promociones automáticas aplicables.");
        return;
      }
      setPromoAplicada({
        id: promo.id, nombre: promo.nombre, tipo: promo.tipo,
        cupon_codigo: promo.cupon_codigo ?? null, descuento: desc, cashback: cash,
      });
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "Error al aplicar promoción.");
      setPromoAplicada(null);
    } finally { setPromoBuscando(false); }
  }

  function quitarPromocion() { setPromoAplicada(null); setCuponInput(""); setPromoError(null); }

  function preConfirmar() {
    setError(null); setOkMsg(null);
    if (!cliente) { setError("Elegí un cliente antes de confirmar."); return; }
    if (lleva.length === 0) { setError("Cargá al menos una prenda que el cliente lleva."); return; }
    if (lleva.some((l) => l.cantidad <= 0)) { setError("Revisá las líneas: la cantidad debe ser > 0."); return; }
    if (aCobrar > 0 && faltaCobrar > 0) {
      setError(`Falta cobrar ${fmtGs(faltaCobrar)}. Repartí el monto entre efectivo/tarjeta/transferencia.`);
      return;
    }
    if (sobraSinEfectivo) {
      setError(`Sobra ${fmtGs(excedente)} y no hay efectivo para dar vuelto. Ajustá los montos de tarjeta/transferencia.`);
      return;
    }
    if (!caja.cajaSeleccionadaId && caja.cajasAbiertas.length !== 1) {
      setError(caja.cajasAbiertas.length > 1
        ? "Elegí la caja en la que se registra esta venta (hay más de una abierta)."
        : "Abrí una caja antes de confirmar.");
      return;
    }
    setBeneficiosMarcados({});
    setIdempotencyKey(crypto.randomUUID());
    setPreCierreOpen(true);
  }

  async function persistirBeneficios() {
    if (!cliente) return;
    const posCommit = Object.entries(beneficiosMarcados)
      .filter(([, v]) => v.marcado)
      .map(([id, v]) => {
        const cfg = alertasConfig.beneficios.find((b) => b.id === id);
        if (!cfg || cfg.genera_credito === true) return null;
        const monto = cfg.pide_monto ? Number(v.monto.replace(/[^\d]/g, "")) || 0 : 0;
        return { cfg, monto };
      })
      .filter((x): x is { cfg: BeneficioCfg; monto: number } => x !== null);
    for (const { cfg, monto } of posCommit) {
      try {
        await fetchWithSupabaseSession(`/api/clientes/${cliente.id}/eventos`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: cfg.tipo_evento, titulo: cfg.label,
            descripcion: `Entregado en venta · ${cfg.label}${monto > 0 ? ` — ${fmtGs(monto)}` : ""}`,
            monto: cfg.pide_monto ? monto : null,
            generar_credito: false,
          }),
        });
      } catch (e) { console.error("[venta] beneficio post-commit", cfg.id, e); }
    }
  }

  async function confirmar() {
    if (!cliente) return;
    const cajaIdFinal = caja.cajaEnUsoId;
    if (!cajaIdFinal) {
      setError(caja.cajasAbiertas.length > 1
        ? "Hay más de una caja abierta. Elegí la caja antes de confirmar."
        : "Abrí la caja antes de confirmar la venta.");
      return;
    }
    const key = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);

    setEnviando(true);
    try {
      // Armar pago_detalle desde las líneas de pago partido.
      //   * No efectivo: cada fila va tal cual (tarjeta A, tarjeta B, etc.)
      //     con su monto y referencia.
      //   * Efectivo: se consolida en UNA sola línea con el monto NETO
      //     (lo entregado menos el vuelto). Si sobró efectivo (vuelto),
      //     no se registra ese excedente — sale de la caja como devolución.
      const noEfectivo = pagos
        .filter((p) => p.metodo !== "efectivo" && (Number(p.monto) || 0) > 0)
        .map((p) => ({
          metodo_pago: p.metodo,
          monto: Math.round(Number(p.monto) || 0),
          referencia: p.referencia.trim() || null,
        }));
      const netoEfectivo = Math.max(0, totalEfectivoEntregado - vuelto);
      const pago_detalle: Array<{ metodo_pago: PagoMetodo; monto: number; referencia: string | null }> = [
        ...noEfectivo,
        ...(netoEfectivo > 0
          ? [{ metodo_pago: "efectivo" as PagoMetodo, monto: netoEfectivo, referencia: null }]
          : []),
      ];

      const llevaPayload = {
        items: lleva.map((l) => ({ producto_id: l.franja_id, cantidad: l.cantidad, tipo_iva: "EXENTA" as const })),
        credito_usado: creditoAplicadoNum,
        pago_detalle,
        moneda: "GS" as const, tipo_cambio: 1,
      };

      const promoPayload = promoAplicada
        ? { promocion_id: promoAplicada.id, cupon_codigo: promoAplicada.cupon_codigo }
        : null;

      const beneficiosCredito = Object.entries(beneficiosMarcados)
        .filter(([, v]) => v.marcado)
        .map(([id, v]) => {
          const cfg = alertasConfig.beneficios.find((b) => b.id === id);
          if (!cfg || cfg.genera_credito !== true) return null;
          const monto = Number(v.monto.replace(/[^\d]/g, "")) || 0;
          if (!(monto > 0)) return null;
          return { id: cfg.id, monto };
        })
        .filter((x): x is { id: string; monto: number } => x !== null);

      const r = await fetchWithSupabaseSession("/api/atencion/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: key,
          caja_id: cajaIdFinal,
          cliente_id: cliente.id,
          observaciones: observaciones || null,
          trae: null,
          lleva: llevaPayload,
          promocion: promoPayload,
          beneficios_credito: beneficiosCredito,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? `No se pudo confirmar la venta (${r.status}).`);

      await persistirBeneficios();
      setPreCierreOpen(false);
      setIdempotencyKey(null);
      setOkMsg(`Venta registrada por ${fmtGs(totalLleva)}${creditoRestante > 0 ? ` · crédito restante ${fmtGs(creditoRestante)}` : ""}.`);
      reset();
      refrescarMetaDia();
      refrescarMetasAlcanzadas();
      // Recargar saldo del cliente actual — ya reseteamos, así que este get sobra;
      // lo dejamos por si el reset() cambia en el futuro.
      const rc = await fetchWithSupabaseSession(`/api/clientes/${cliente.id}/creditos`, { cache: "no-store" });
      const jcr = await rc.json().catch(() => ({}));
      const s = Number(jcr?.data?.saldo ?? 0);
      setCreditoDisponible(Number.isFinite(s) ? s : 0);
      setTimeout(() => setOkMsg(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally { setEnviando(false); }
  }

  // ── Render ───────────────────────────────────────────────────────────
  const STICKY_STYLES = [
    { bg: "bg-yellow-100", tape: "bg-yellow-300/70", tilt: "-rotate-2", text: "text-yellow-900" },
    { bg: "bg-pink-100",   tape: "bg-pink-300/70",   tilt: "rotate-1",  text: "text-pink-900"   },
    { bg: "bg-sky-100",    tape: "bg-sky-300/70",    tilt: "-rotate-1", text: "text-sky-900"    },
  ];

  return (
    // xl:mr-72 reserva espacio para el rail de sticky notes fixed a la
    // derecha (256px + gap) para que meta cumplida / alertas del cliente
    // no encimen los chips del header. Karen: "deja el espacio para que
    // quepa bien la stikynote".
    <div className="space-y-4 max-w-7xl xl:mr-72">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Venta")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("Cargá lo que el cliente lleva. El sistema calcula el resto.")}
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
          {/* Badge de pendientes de evaluar removido: pertenece al módulo
              Evaluación, no a Venta. Ver /evaluacion/nueva. */}
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
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-800">{cliente.nombre}</p>
                {clienteSegmentoLoading && !clienteSegmento && (
                  <span className="inline-block h-5 w-24 rounded-full bg-slate-100 animate-pulse" aria-hidden />
                )}
                {clienteSegmento && (
                  <div className="flex flex-wrap items-center gap-2">
                    {clienteSegmento.categoria === "vip" && <StickerBadge type="vip">Cliente VIP</StickerBadge>}
                    {clienteSegmento.categoria === "habitual" && <StickerBadge type="frecuente" tilt="right">Cliente frecuente</StickerBadge>}
                    {clienteSegmento.categoria === "nuevo" && <StickerBadge type="nuevo">Cliente nuevo</StickerBadge>}
                    {clienteSegmento.categoria === "dormido" && (
                      <StickerBadge type="inactivo"
                        title={clienteSegmento.diasDesdeUltima != null ? `Última compra hace ${clienteSegmento.diasDesdeUltima} días` : undefined}>
                        Hace tiempo que no visita
                      </StickerBadge>
                    )}
                    {clienteSegmento.tieneReclamos && (
                      <StickerBadge type="deuda" tilt="right"
                        title={`${clienteSegmento.reclamosCount} reclamo${clienteSegmento.reclamosCount === 1 ? "" : "s"} previo${clienteSegmento.reclamosCount === 1 ? "" : "s"}`}>
                        Con reclamos previos
                      </StickerBadge>
                    )}
                    {clienteSegmento.recibioBeneficios && (
                      <StickerBadge type="credito"
                        title={`${clienteSegmento.beneficiosCount} beneficio${clienteSegmento.beneficiosCount === 1 ? "" : "s"} entregado${clienteSegmento.beneficiosCount === 1 ? "" : "s"}`}>
                        Ya recibió beneficios
                      </StickerBadge>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {cliente.ruc ? `RUC ${cliente.ruc} · ` : ""}
                Crédito disponible: <span className="font-semibold text-emerald-700">{fmtGs(creditoDisponible)}</span>
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

      {/* Panel LLEVA (única columna) */}
      <ColumnaAtencion
        titulo={t("EL CLIENTE LLEVA")}
        descripcion={t("Cargá las prendas que se lleva de la tienda.")}
        tono="sky"
        franjas={franjas}
        cargando={cargando}
        lineas={lleva}
        total={totalLleva}
        onAgregar={agregarLinea}
        onActualizar={actualizarLinea}
        onQuitar={quitarLinea}
        permitirEditarPrecio={false}
      />

      {/* Balance + cobro */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Balance</h3>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <BalanceItem label="Total lleva" value={fmtGs(totalLleva)} tone="sky" />
          <BalanceItem label="Crédito disponible" value={fmtGs(creditoDisponible)} tone={creditoDisponible > 0 ? "emerald" : "slate"} />
        </div>

        {/* Promo / cupón */}
        {totalLleva > 0 && (
          <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-2">
            <p className="text-[11px] uppercase font-semibold text-fuchsia-700">Promoción / cupón</p>
            {promoAplicada ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-fuchsia-900">
                  <strong>{promoAplicada.nombre}</strong>
                  {promoAplicada.cupon_codigo && <span className="ml-2 font-mono text-xs text-fuchsia-700">({promoAplicada.cupon_codigo})</span>}
                  <div className="text-xs text-fuchsia-800 mt-0.5">
                    {promoAplicada.descuento > 0 && <>Descuento aplicado: <strong>{fmtGs(promoAplicada.descuento)}</strong>. </>}
                    {promoAplicada.cashback > 0 && <>Cashback al confirmar: <strong>{fmtGs(promoAplicada.cashback)}</strong> a favor.</>}
                  </div>
                </div>
                <button type="button" onClick={quitarPromocion}
                  className="rounded-lg border border-fuchsia-300 bg-white px-2 py-1 text-xs text-fuchsia-700 hover:bg-fuchsia-50">Quitar</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" value={cuponInput} onChange={(e) => setCuponInput(e.target.value.toUpperCase())}
                  placeholder="Código de cupón (opcional)"
                  className="flex-1 min-w-[140px] rounded-lg border border-fuchsia-200 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                <button type="button" onClick={() => aplicarPromocion(cuponInput.trim() || null)} disabled={promoBuscando}
                  className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5">
                  {promoBuscando ? "Buscando…" : cuponInput.trim() ? "Aplicar cupón" : "Buscar automática"}
                </button>
              </div>
            )}
            {promoError && <p className="text-xs text-red-700">{promoError}</p>}
          </div>
        )}

        {totalLleva > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Aplicar del crédito ahora</label>
              <div className="flex gap-2 mb-1.5">
                <button type="button" onClick={() => setAplicarCredito("")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    aplicarCredito.trim() === ""
                      ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  title="Usar todo el crédito que pueda">
                  💰 Usar el máximo ({fmtGs(creditoMaxAplicable)})
                </button>
                <button type="button" onClick={() => setAplicarCredito("0")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    aplicarCredito === "0"
                      ? "border-slate-400 bg-slate-100 text-slate-800 ring-2 ring-slate-300"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  title="No usar crédito ahora">
                  🔒 No usar (guardar para otra venta)
                </button>
              </div>
              <MontoInput value={aplicarCredito}
                onChange={(n) => setAplicarCredito(n === 0 ? "0" : String(n))}
                placeholder={`Ej: ${Math.min(creditoMaxAplicable, 50000).toLocaleString("es-PY")}`}
                decimals={false}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
              <p className="text-[11px] text-slate-500 mt-1">
                Aplicando ahora: <strong className="text-slate-800">{fmtGs(creditoAplicadoNum)}</strong>.
                {" "}Queda a favor: <strong className="text-emerald-700">{fmtGs(creditoRestante)}</strong>.
              </p>
            </div>
            {aCobrar > 0 && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cobrar {fmtGs(Math.round(aCobrar))} en
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      // Autocompletar la primera línea con el saldo pendiente
                      // (útil cuando la cajera ya cargó parciales y quiere
                      // que el resto vaya al primer método sin escribir).
                      const restante = Math.max(0, aCobrar - totalPagos);
                      if (restante <= 0) return;
                      setPagos((prev) => prev.map((p, i) =>
                        i === 0
                          ? { ...p, monto: String((Number(p.monto) || 0) + restante) }
                          : p,
                      ));
                    }}
                    className="text-[11px] font-semibold text-[#4FAEB2] hover:text-[#3F8E91]"
                  >
                    Completar exacto
                  </button>
                </div>

                <div className="space-y-2">
                  {pagos.map((p, idx) => {
                    const setLinea = (patch: Partial<PagoLinea>) =>
                      setPagos((prev) => prev.map((x, i) => i === idx ? { ...x, ...patch } : x));
                    return (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                        <div className="flex items-center gap-1.5">
                          {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setLinea({ metodo: m })}
                              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                p.metodo === m
                                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {m === "efectivo" ? "💵 Efectivo" : m === "tarjeta" ? "💳 Tarjeta" : "📱 Transf."}
                            </button>
                          ))}
                          {pagos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setPagos((prev) => prev.filter((_, i) => i !== idx))}
                              className="ml-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Quitar este método"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <MontoInput
                            value={p.monto}
                            onChange={(n) => setLinea({ monto: n === 0 ? "0" : String(n) })}
                            placeholder={
                              p.metodo === "efectivo"
                                ? `Ej: ${(Math.ceil(aCobrar / 10000) * 10000).toLocaleString("es-PY")}`
                                : `Ej: ${Math.round(aCobrar).toLocaleString("es-PY")}`
                            }
                            decimals={false}
                            className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const restante = Math.max(0, aCobrar - totalPagos + (Number(p.monto) || 0));
                              setLinea({ monto: String(restante) });
                            }}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                            title="Poner el saldo pendiente en esta línea"
                          >
                            Resto acá
                          </button>
                        </div>
                        {p.metodo !== "efectivo" && (
                          <input
                            type="text"
                            value={p.referencia}
                            onChange={(e) => setLinea({ referencia: e.target.value })}
                            placeholder={p.metodo === "tarjeta" ? "Últimos 4 dígitos, autorización…" : "N° de transferencia"}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                          />
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      const restante = Math.max(0, aCobrar - totalPagos);
                      setPagos((prev) => [
                        ...prev,
                        { metodo: "tarjeta", monto: restante > 0 ? String(restante) : "", referencia: "" },
                      ]);
                    }}
                    className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:border-[#4FAEB2] hover:text-[#4FAEB2]"
                  >
                    + Agregar otro método
                  </button>
                </div>

                {/* Resumen */}
                {faltaCobrar > 0 ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    Falta cobrar <strong>{fmtGs(faltaCobrar)}</strong> (asignado {fmtGs(totalPagos)} de {fmtGs(aCobrar)}).
                  </p>
                ) : sobraSinEfectivo ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    Sobra <strong>{fmtGs(excedente)}</strong> y no hay efectivo para dar vuelto. Ajustá los montos.
                  </p>
                ) : vuelto > 0 ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800">
                    Asignado {fmtGs(totalPagos)} · Vuelto: <strong className="text-lg">{fmtGs(vuelto)}</strong>
                  </p>
                ) : totalPagos > 0 ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                    Exacto — sin vuelto.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{t("Observaciones (opcional)")}</label>
          <input type="text" value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
            placeholder={t("Notas de la atención")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={preConfirmar}
            disabled={enviando || !cliente || lleva.length === 0}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 transition-colors shadow-sm active:scale-95">
            {enviando ? t("Registrando…") : t("Confirmar venta")}
          </button>
          <button type="button" onClick={reset} disabled={enviando}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {t("Limpiar")}
          </button>
          <button type="button" onClick={() => router.push("/ventas")}
            className="text-sm text-slate-400 hover:text-slate-700">{t("Cancelar")}</button>
          {totalPrendas > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <span className="text-base leading-none">👕</span>
              {t("Total prendas")}: <strong className="tabular-nums text-[#3F8E91]">{totalPrendas}</strong>
            </span>
          )}
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

      {((cliente && alertasDisparadas.length > 0) || metasCumplidasHoy.length > 0) && (
        <aside aria-label="Recordatorios"
          className="hidden xl:flex fixed top-24 right-6 z-30 flex-col gap-4 w-64 max-h-[calc(100vh-8rem)] overflow-y-auto overflow-x-hidden py-2 pr-1 pointer-events-none">
          {metasCumplidasHoy.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              {metasCumplidasHoy.map(m => <MetaCumplidaBadge key={m.sucursal_id} nombre={m.nombre} />)}
            </div>
          )}
          {/* Sticky de recepciones pendientes removida: vive en /evaluacion/nueva. */}
          {cliente && alertasDisparadas.map((a, i) => {
            const s = STICKY_STYLES[i % STICKY_STYLES.length];
            return (
              <div key={`${a.titulo}-${i}`}
                className={`relative ${s.bg} ${s.tilt} pointer-events-auto shadow-[0_6px_16px_-4px_rgba(0,0,0,0.25)] px-4 pt-5 pb-4 transition-transform hover:rotate-0 hover:scale-[1.02]`}
                style={{ borderRadius: "2px 2px 14px 2px" }}>
                <span aria-hidden className={`absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-16 ${s.tape} rotate-[-3deg] shadow-sm`} />
                <p className={`text-[13px] font-bold leading-snug ${s.text}`}>{a.titulo}</p>
                <p className={`text-[12px] mt-1 leading-snug ${s.text} opacity-90`}>{a.mensaje}</p>
              </div>
            );
          })}
        </aside>
      )}

      {preCierreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!enviando) setPreCierreOpen(false); }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Antes de cerrar la venta</h3>
                <p className="text-sm text-slate-500 mt-0.5">Repasá los recordatorios y marcá los beneficios que entregaste.</p>
              </div>
              <button type="button" onClick={() => setPreCierreOpen(false)} disabled={enviando}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40" aria-label="Cerrar">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Beneficios entregados</p>
              <p className="text-xs text-slate-400 mt-0.5">Marcá lo que le diste al cliente. Se registra en su historial.</p>
            </div>
            <div className="space-y-2 mb-5">
              {alertasConfig.beneficios.map((b) => {
                const marcado = !!beneficiosMarcados[b.id]?.marcado;
                const monto = beneficiosMarcados[b.id]?.monto ?? "";
                return (
                  <label key={b.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      marcado ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                    }`}>
                    <input type="checkbox" checked={marcado}
                      onChange={(e) => setBeneficiosMarcados((prev) => ({
                        ...prev, [b.id]: { marcado: e.target.checked, monto: prev[b.id]?.monto ?? "" },
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{b.label}</p>
                      {b.tipo_evento === "cashback" && b.genera_credito && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Si marcás con monto, se agrega como crédito a favor del cliente.
                        </p>
                      )}
                    </div>
                    {b.pide_monto && marcado && (
                      <MontoInput value={monto === "" ? 0 : Number(monto) || 0}
                        onChange={(n) => setBeneficiosMarcados((prev) => ({
                          ...prev, [b.id]: { marcado: true, monto: String(n) },
                        }))}
                        placeholder={money.symbol} decimals={false}
                        className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right" />
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setPreCierreOpen(false)} disabled={enviando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Volver</button>
              <button type="button" onClick={confirmar} disabled={enviando}
                className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-300 text-white text-sm font-semibold px-5 py-2 shadow-sm">
                {enviando ? "Registrando…" : "Cerrar venta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
