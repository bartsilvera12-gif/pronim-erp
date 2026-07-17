"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import MontoInput from "@/components/ui/MontoInput";
import {
  ALERTAS_DEFAULTS,
  mergeConfig,
  resolverAlerta,
  segmentoKeysAplicables,
  type AlertasConfig,
  type BeneficioCfg,
} from "@/lib/atencion/alertas-config";
import { StickerBadge } from "@/components/ui/StickerBadge";

// ═══════════════════════════════════════════════════════════════════════
// POS UNIFICADO — "Nueva atención"
// ---------------------------------------------------------------------
// Una sola pantalla donde la cajera carga lo que el cliente TRAE
// (recepción) y lo que LLEVA (venta). El sistema calcula el balance
// y decide detrás de escena si genera solo recepción, solo venta, o
// ambas + cambio, y aplica automáticamente el crédito del cliente FIFO.
// ═══════════════════════════════════════════════════════════════════════

type Franja = {
  id: string;
  nombre: string;
  sku: string | null;
  precio_venta: number | string;
  stock_actual: number | string | null;
};

type Cliente = {
  id: string;
  nombre: string;
  empresa?: string | null;
  ruc?: string | null;
};

type Linea = {
  franja_id: string;
  precio_referencia: number;   // precio de venta de la franja (fijo)
  precio_unitario: number;     // en Trae: lo que la tienda paga; en Lleva: normalmente = precio_referencia
  cantidad: number;
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}

function short(str: string): string {
  return str.replace(/^Prenda\s*-\s*Categor[ií]a\s*/i, "");
}

export default function NuevaAtencionPage() {
  const router = useRouter();

  // ── Catálogo ──────────────────────────────────────────────────────────
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [cargando, setCargando] = useState(true);

  // ── Cliente ───────────────────────────────────────────────────────────
  const [clienteQuery, setClienteQuery] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [creditoDisponible, setCreditoDisponible] = useState(0);
  const [nuevoClienteOpen, setNuevoClienteOpen] = useState(false);

  // Segmento del cliente derivado de KPIs + timeline (ver ventas/nueva).
  // Categorías (mutuamente excluyentes): nuevo | habitual | vip | dormido
  // Flags (coexisten con la categoría): reclamos previos, beneficios recibidos.
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
  const [clienteSegmento, setClienteSegmento] = useState<ClienteSegmento | null>(null);

  // ── Config del modal previo al cierre (alertas + beneficios) ──────────
  // Se carga desde /api/configuracion/atencion-alertas. Si falla, usamos DEFAULTS.
  const [alertasConfig, setAlertasConfig] = useState<AlertasConfig>(ALERTAS_DEFAULTS);

  // Modal pre-cierre.
  const [preCierreOpen, setPreCierreOpen] = useState(false);
  const [beneficiosMarcados, setBeneficiosMarcados] = useState<Record<string, { marcado: boolean; monto: string }>>({});
  const [clienteSegmentoLoading, setClienteSegmentoLoading] = useState(false);

  // Modal "Cambio directo": prenda por otra del mismo precio, sin dinero de por medio.
  const [cambioDirectoOpen, setCambioDirectoOpen] = useState(false);

  // Override manual del monto a pagar por la recepción — la cajera evalúa las
  // prendas por franja y a veces redondea a mano (140.000), a veces no
  // (2.040.555). Si el campo queda vacío, se paga el subtotal exacto de los
  // items; si se completa, ese valor es el que se acredita al cliente.
  const [traeMontoFinal, setTraeMontoFinal] = useState<string>("");

  // ── Líneas ────────────────────────────────────────────────────────────
  const [trae, setTrae] = useState<Linea[]>([]);
  const [lleva, setLleva] = useState<Linea[]>([]);

  // ── Pago / balance ────────────────────────────────────────────────────
  // aplicarCredito = cuánto del crédito TOTAL (previo + nuevo por lo que
  // trajo) se aplica en esta venta. Empty string = "aplicar el máximo
  // posible" automáticamente; cualquier número lo overridea.
  const [aplicarCredito, setAplicarCredito] = useState<string>("");
  const [metodoCobro, setMetodoCobro] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [montoRecibido, setMontoRecibido] = useState<string>("");
  const [referenciaCobro, setReferenciaCobro] = useState<string>("");
  const [observaciones, setObservaciones] = useState("");
  // Default true: la mercadería que trae el cliente entra al stock ahora
  // mismo. Si la cajera tiene que catalogar/etiquetar después, puede
  // destildar y la recepción queda pendiente de ingreso.
  const [ingresarAlStock, setIngresarAlStock] = useState<boolean>(true);

  // ── Meta del día ────────────────────────────────────────────────────
  const [metaDia, setMetaDia] = useState<{ meta_diaria: number; vendido_dia: number; pct: number } | null>(null);

  // ── Promoción / cupón ────────────────────────────────────────────────
  const [cuponInput, setCuponInput] = useState<string>("");
  const [promoAplicada, setPromoAplicada] = useState<{
    id: string; nombre: string; tipo: string; cupon_codigo: string | null;
    descuento: number; cashback: number;
  } | null>(null);
  const [promoBuscando, setPromoBuscando] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // ── Feedback ──────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // ── Caja / punto de caja: se detectan y se manejan solos ─────────────
  // La cajera no debería tener que pensar en abrir/cerrar turno para
  // hacer una atención. Si no hay caja abierta al confirmar, la abrimos
  // en el primer punto disponible con monto 0.
  const [pendientesIngresoCount, setPendientesIngresoCount] = useState<number>(0);
  const [pendientesVencidasCount, setPendientesVencidasCount] = useState<number>(0);
  const [cajaAbiertaId, setCajaAbiertaId] = useState<string | null>(null);
  // Multi-caja: si hay más de una abierta en la sucursal, la cajera elige.
  // Si hay una sola, se autoresuelve (spec: “Si existe una sola caja abierta, usarla”).
  // Si hay >1 y no eligió, se bloquea la confirmación en preConfirmar.
  const [cajasAbiertas, setCajasAbiertas] = useState<
    { id: string; numero_caja?: number; punto_caja_nombre?: string | null }[]
  >([]);
  const [cajaSeleccionadaId, setCajaSeleccionadaId] = useState<string | null>(null);
  // Idempotency key del submit actual. Se genera al abrir el modal pre-cierre
  // y se invalida al cerrar o al cambiar cualquier dato relevante.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  // Caja "en uso" — la que efectivamente se opera. Reglas:
  //   - 1 sola caja abierta ⇒ esa.
  //   - >1 ⇒ la que la cajera eligió en el selector; null si aún no eligió.
  // TODAS las acciones (Movimiento, Cerrar caja, resumen, confirmar atención)
  // usan ESTE id; nunca `cajas[0]` silenciosamente.
  const cajaEnUsoId = cajaSeleccionadaId
    ?? (cajasAbiertas.length === 1 ? cajasAbiertas[0].id : null);
  const [cajaNumero, setCajaNumero] = useState<number | null>(null);
  const [cajaAperturaHora, setCajaAperturaHora] = useState<string | null>(null);
  const [cajaChecked, setCajaChecked] = useState(false);
  const [puntoCajaId, setPuntoCajaId] = useState<string | null>(null);
  const [puntoCajaNombre, setPuntoCajaNombre] = useState<string | null>(null);

  // ── Estado del banner de caja + monto inicial visible ─────────────────
  const [cajaMontoApertura, setCajaMontoApertura] = useState<number>(0);

  // ── Modales: apertura / cierre / movimiento ───────────────────────────
  const [cajaModalOpen, setCajaModalOpen] = useState<null | "abrir" | "cerrar" | "mov">(null);
  const [aperturaMonto, setAperturaMonto] = useState<string>("");
  const [aperturaObs, setAperturaObs] = useState<string>("");
  const [abriendo, setAbriendo] = useState(false);
  const [aperturaError, setAperturaError] = useState<string | null>(null);

  // Cierre
  const [cierreContado, setCierreContado] = useState<string>("");
  const [cierreObs, setCierreObs] = useState<string>("");
  const [cerrando, setCerrando] = useState(false);
  const [cierreError, setCierreError] = useState<string | null>(null);
  const [cierreResumen, setCierreResumen] = useState<{
    cantidad_ventas: number;
    total_vendido: number;
    total_efectivo: number;
    total_transferencia: number;
    total_tarjeta: number;
    monto_apertura: number;
    efectivo_esperado: number;
  } | null>(null);

  // Movimiento manual
  const [movTipo, setMovTipo] = useState<"ingreso" | "egreso" | "retiro" | "ajuste">("ingreso");
  const [movConcepto, setMovConcepto] = useState<string>("");
  const [movMonto, setMovMonto] = useState<string>("");
  const [movMedio, setMovMedio] = useState<"efectivo" | "tarjeta" | "transferencia" | "otro">("efectivo");
  const [movObs, setMovObs] = useState<string>("");
  const [movEnviando, setMovEnviando] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);

  // Detecta caja abierta y primer punto disponible en la sucursal actual.
  // Silencioso: solo guarda ids, no bloquea la pantalla si no hay nada.
  async function refrescarCajaEstado() {
    try {
      const [rc, rp] = await Promise.all([
        fetchWithSupabaseSession("/api/caja/abierta", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/puntos-caja", { cache: "no-store" }),
      ]);
      const jc = await rc.json().catch(() => ({}));
      const jp = await rp.json().catch(() => ({}));
      const cajas = (jc?.data?.cajas as { id: string; numero_caja?: number; fecha_apertura?: string; monto_apertura?: number | string; punto_caja_nombre?: string | null }[] | undefined) ?? [];
      const c0 = cajas[0] ?? (jc?.data?.caja as { id: string; numero_caja?: number; fecha_apertura?: string; monto_apertura?: number | string } | null | undefined) ?? null;
      setCajaAbiertaId(c0?.id ?? null);
      setCajaNumero(c0?.numero_caja ?? null);
      setCajaAperturaHora(c0?.fecha_apertura ?? null);
      setCajaMontoApertura(Number(c0?.monto_apertura ?? 0) || 0);
      setCajasAbiertas(cajas);
      // Auto-selección solo si hay exactamente una caja abierta.
      setCajaSeleccionadaId((prev) => {
        if (cajas.length === 1) return cajas[0].id;
        // Si ya había una seleccionada y sigue estando abierta, la respetamos.
        if (prev && cajas.some((c) => c.id === prev)) return prev;
        return null;
      });
      const puntos = (jp?.data?.puntos as { id: string; nombre?: string }[] | undefined) ?? [];
      setPuntoCajaId(puntos[0]?.id ?? null);
      setPuntoCajaNombre(puntos[0]?.nombre ?? null);
    } catch {
      /* tolerar */
    } finally {
      setCajaChecked(true);
    }
  }

  async function abrirCajaAhora() {
    setAperturaError(null);
    if (!puntoCajaId) {
      setAperturaError("No hay puntos de caja configurados en esta sucursal. Un administrador debe crear al menos uno.");
      return;
    }
    const monto = Number(aperturaMonto) || 0;
    if (monto < 0) {
      setAperturaError("El monto de apertura no puede ser negativo.");
      return;
    }
    setAbriendo(true);
    try {
      const r = await fetchWithSupabaseSession("/api/caja/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_apertura: monto,
          observacion: aperturaObs.trim() || null,
          punto_caja_id: puntoCajaId,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo abrir la caja (${r.status}).`);
      }
      setAperturaMonto("");
      setAperturaObs("");
      setCajaModalOpen(null);
      await refrescarCajaEstado();
    } catch (e) {
      setAperturaError(e instanceof Error ? e.message : "Error al abrir la caja.");
    } finally {
      setAbriendo(false);
    }
  }

  async function cargarResumenCierre() {
    if (!cajaEnUsoId) { setCierreResumen(null); return; }
    try {
      const r = await fetchWithSupabaseSession(`/api/caja/resumen?caja_id=${encodeURIComponent(cajaEnUsoId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const res = j?.data?.resumen;
      if (!res) { setCierreResumen(null); return; }
      setCierreResumen({
        cantidad_ventas: Number(res.cantidad_ventas ?? 0),
        total_vendido: Number(res.total_vendido ?? 0),
        total_efectivo: Number(res.total_efectivo ?? 0),
        total_transferencia: Number(res.total_transferencia ?? 0),
        total_tarjeta: Number(res.total_tarjeta ?? 0),
        monto_apertura: Number(res.caja?.monto_apertura ?? 0),
        efectivo_esperado: Number(res.efectivo_esperado ?? 0),
      });
    } catch { setCierreResumen(null); }
  }

  async function cerrarCajaAhora() {
    setCierreError(null);
    if (!cajaEnUsoId) {
      setCierreError(cajasAbiertas.length > 1
        ? "Elegí la caja a cerrar en el selector antes de continuar."
        : "No hay caja abierta.");
      return;
    }
    const contado = Number(cierreContado);
    if (!Number.isFinite(contado) || contado < 0) {
      setCierreError("Ingresá el efectivo contado (0 o más).");
      return;
    }
    setCerrando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/caja/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caja_id: cajaEnUsoId,
          monto_cierre_contado: contado,
          observacion: cierreObs.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo cerrar la caja (${r.status}).`);
      }
      setCierreContado(""); setCierreObs("");
      setCajaModalOpen(null);
      await refrescarCajaEstado();
    } catch (e) {
      setCierreError(e instanceof Error ? e.message : "Error al cerrar la caja.");
    } finally {
      setCerrando(false);
    }
  }

  async function registrarMovimientoAhora() {
    setMovError(null);
    if (!cajaEnUsoId) {
      setMovError(cajasAbiertas.length > 1
        ? "Elegí la caja para registrar el movimiento."
        : "Abrí la caja primero.");
      return;
    }
    const monto = Number(movMonto);
    if (!movConcepto.trim()) { setMovError("El concepto es obligatorio."); return; }
    if (!Number.isFinite(monto) || monto === 0) { setMovError("Ingresá un monto distinto de 0."); return; }
    setMovEnviando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/caja/movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caja_id: cajaEnUsoId,
          tipo: movTipo,
          concepto: movConcepto.trim(),
          monto: Math.abs(monto),
          medio_pago: movMedio,
          observacion: movObs.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo registrar el movimiento (${r.status}).`);
      }
      setMovConcepto(""); setMovMonto(""); setMovObs("");
      setCajaModalOpen(null);
    } catch (e) {
      setMovError(e instanceof Error ? e.message : "Error al registrar movimiento.");
    } finally {
      setMovEnviando(false);
    }
  }

  // Contar recepciones pendientes de ingreso (para chip informativo)
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
      // Sumar meta e importes para todas las sucursales visibles (una si operativo, todas si admin).
      const meta = arr.reduce((s, x) => s + (Number(x.meta_diaria) || 0), 0);
      const vendido = arr.reduce((s, x) => s + (Number(x.vendido_dia) || 0), 0);
      const pct = meta > 0 ? Math.min(100, Math.round((vendido / meta) * 100)) : 0;
      setMetaDia(meta > 0 ? { meta_diaria: meta, vendido_dia: vendido, pct } : null);
    } catch { /* tolerar */ }
  }

  // Cargar franjas + clientes iniciales + estado de caja
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [rf, rc] = await Promise.all([
          fetchWithSupabaseSession("/api/franjas/publicas", { cache: "no-store" }),
          fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
        ]);
        refrescarCajaEstado();
        refrescarPendientesIngreso();
        refrescarMetaDia();
        const jf = await rf.json().catch(() => ({}));
        const jc = await rc.json().catch(() => ({}));
        if (cancel) return;
        const fr = (jf?.data?.franjas as Franja[] | undefined) ?? [];
        setFranjas(fr);
        const rows = Array.isArray(jc?.data) ? (jc.data as Record<string, unknown>[]) : [];
        const cs: Cliente[] = rows.map((r) => ({
          id: String(r.id),
          nombre:
            (typeof r.empresa === "string" && r.empresa.trim())
            || (typeof r.nombre_contacto === "string" && r.nombre_contacto.trim())
            || (typeof r.nombre === "string" && r.nombre.trim())
            || "Cliente",
          empresa: typeof r.empresa === "string" ? r.empresa : null,
          ruc: typeof r.ruc === "string" ? r.ruc : null,
        }));
        setClientes(cs);
      } catch (e) {
        console.error("[atencion] carga inicial", e);
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Cargar saldo de crédito al elegir cliente
  useEffect(() => {
    if (!cliente) { setCreditoDisponible(0); setAplicarCredito(""); return; }
    let cancel = false;
    fetchWithSupabaseSession(`/api/clientes/${cliente.id}/creditos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const s = Number(j?.data?.saldo ?? 0);
        setCreditoDisponible(Number.isFinite(s) ? s : 0);
      })
      .catch(() => { if (!cancel) setCreditoDisponible(0); });
    return () => { cancel = true; };
  }, [cliente]);

  // Segmento del cliente: endpoint liviano (1 round-trip, sin timeline).
  useEffect(() => {
    if (!cliente) { setClienteSegmento(null); setClienteSegmentoLoading(false); return; }
    let cancel = false;
    setClienteSegmentoLoading(true);
    fetchWithSupabaseSession(`/api/clientes/${cliente.id}/segmento`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setClienteSegmento(j.data as ClienteSegmento);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setClienteSegmentoLoading(false); });
    return () => { cancel = true; };
  }, [cliente]);

  // ── Cálculos ──────────────────────────────────────────────────────────
  const totalTraeSubtotal = useMemo(() => trae.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0), [trae]);
  // Si la cajera escribió un monto final (override), ese es el que se paga.
  // Si el campo está vacío, se usa el subtotal exacto.
  const totalTraeManual = useMemo(() => {
    const raw = traeMontoFinal.trim();
    if (raw === "") return null;
    const n = Number(raw.replace(/\./g, "").replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }, [traeMontoFinal]);
  const totalTrae = totalTraeManual != null ? totalTraeManual : totalTraeSubtotal;
  const ajusteEvaluacion = totalTrae - totalTraeSubtotal;
  const totalLleva = useMemo(() => lleva.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0), [lleva]);

  // Modelo explícito:
  //  1) Todo lo que TRAE hoy genera crédito nuevo por totalTrae.
  //  2) El crédito TOTAL disponible ahora = previo + nuevo trae.
  //  3) La cajera decide cuánto de ese total aplicar en LA VENTA (0 …
  //     min(disponible, lleva)). Por defecto aplica el máximo posible.
  //  4) La diferencia se cobra en efectivo/tarjeta/transferencia.
  //  5) Lo que no se aplique queda como crédito remanente para el futuro.
  const descuentoPromo = promoAplicada?.descuento ?? 0;
  const totalLlevaConDescuento = Math.max(0, totalLleva - descuentoPromo);

  const creditoTotalDisponible = creditoDisponible + totalTrae;
  const creditoMaxAplicable = Math.min(creditoTotalDisponible, totalLlevaConDescuento);

  // Si el usuario NO tocó el input, se aplica el máximo. Si lo editó, se
  // respeta el número (clampeado al rango [0, creditoMaxAplicable]).
  const creditoAplicadoNum = useMemo(() => {
    if (aplicarCredito.trim() === "") return creditoMaxAplicable;
    const n = Number(aplicarCredito);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(n, creditoMaxAplicable));
  }, [aplicarCredito, creditoMaxAplicable]);

  const aCobrar = Math.max(0, totalLlevaConDescuento - creditoAplicadoNum);
  const creditoRestante = Math.max(0, creditoTotalDisponible - creditoAplicadoNum);

  // Monto recibido / vuelto — solo relevante cuando hay que cobrar en efectivo.
  const recibidoNum = useMemo(() => {
    const n = Number(montoRecibido);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [montoRecibido]);
  const vuelto = metodoCobro === "efectivo" ? Math.max(0, recibidoNum - aCobrar) : 0;
  const faltaCobrar = metodoCobro === "efectivo"
    ? Math.max(0, aCobrar - recibidoNum)
    : 0; // en tarjeta/transferencia se asume que se cobró el monto exacto

  // ── Filtrados / helpers UI ────────────────────────────────────────────
  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    const arr = clientes.filter((c) => !q
      || c.nombre.toLowerCase().includes(q)
      || (c.ruc ?? "").toLowerCase().includes(q));
    return arr.slice(0, 50);
  }, [clienteQuery, clientes]);

  function agregarLineaEn(bucket: "trae" | "lleva", franja: Franja) {
    const precio = Number(franja.precio_venta) || 0;
    const nueva: Linea = {
      franja_id: franja.id,
      precio_referencia: precio,
      precio_unitario: precio, // por defecto igual al de la franja
      cantidad: 1,
    };
    if (bucket === "trae") {
      setTrae((prev) => {
        const idx = prev.findIndex((l) => l.franja_id === franja.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
          return copy;
        }
        return [...prev, nueva];
      });
    } else {
      setLleva((prev) => {
        const idx = prev.findIndex((l) => l.franja_id === franja.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
          return copy;
        }
        return [...prev, nueva];
      });
    }
  }

  // Cambio directo: agrega la MISMA franja a TRAE y LLEVA a la vez.
  // El sistema calcula naturalmente total_a_cobrar = 0 en el balance.
  function agregarCambioDirecto(franja: Franja, cantidad: number) {
    const precio = Number(franja.precio_venta) || 0;
    const merge = (prev: Linea[]) => {
      const idx = prev.findIndex((l) => l.franja_id === franja.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + cantidad };
        return copy;
      }
      return [
        ...prev,
        { franja_id: franja.id, precio_referencia: precio, precio_unitario: precio, cantidad },
      ];
    };
    setTrae(merge);
    setLleva(merge);
  }

  function actualizarLinea(bucket: "trae" | "lleva", franjaId: string, patch: Partial<Linea>) {
    const setter = bucket === "trae" ? setTrae : setLleva;
    setter((prev) => prev.map((l) => l.franja_id === franjaId ? { ...l, ...patch } : l));
  }
  function quitarLinea(bucket: "trae" | "lleva", franjaId: string) {
    const setter = bucket === "trae" ? setTrae : setLleva;
    setter((prev) => prev.filter((l) => l.franja_id !== franjaId));
  }

  function reset() {
    setTrae([]); setLleva([]);
    setAplicarCredito(""); setObservaciones("");
    setMontoRecibido(""); setReferenciaCobro("");
    setPromoAplicada(null); setCuponInput(""); setPromoError(null);
    setTraeMontoFinal("");
    setError(null);
  }

  async function aplicarPromocion(cuponManual: string | null) {
    setPromoError(null);
    if (lleva.length === 0) {
      setPromoError("Cargá primero lo que el cliente lleva.");
      return;
    }
    setPromoBuscando(true);
    try {
      const payload = {
        cliente_id: cliente?.id ?? null,
        cupon: cuponManual,
        items: lleva.map((l) => ({
          franja_id: l.franja_id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
        })),
      };
      const r = await fetchWithSupabaseSession("/api/promociones/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? "No se pudo aplicar la promoción.");
      }
      const desc = Number(j?.data?.descuento ?? 0);
      const cash = Number(j?.data?.cashback ?? 0);
      const promo = j?.data?.promocion;
      if (!promo || (desc === 0 && cash === 0)) {
        setPromoAplicada(null);
        setPromoError(cuponManual ? `El cupón "${cuponManual}" no aplica.` : "No hay promociones automáticas aplicables.");
        return;
      }
      setPromoAplicada({
        id: promo.id,
        nombre: promo.nombre,
        tipo: promo.tipo,
        cupon_codigo: promo.cupon_codigo ?? null,
        descuento: desc,
        cashback: cash,
      });
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "Error al aplicar promoción.");
      setPromoAplicada(null);
    } finally {
      setPromoBuscando(false);
    }
  }

  function quitarPromocion() {
    setPromoAplicada(null);
    setCuponInput("");
    setPromoError(null);
  }

  // Alertas condicionadas: se calculan desde el carrito "lleva" y, si hay
  // cliente cargado, aplican el override por segmento (VIP, con reclamos, etc).
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
    if (
      alertasConfig.prendas_caras.activa &&
      preciosUnitarios.some((p) => p >= alertasConfig.prendas_caras.precio_min)
    ) {
      out.push(resolverAlerta(alertasConfig.prendas_caras, segKeys));
    }
    if (
      alertasConfig.prendas_baratas.activa &&
      // "varias prenditas baratas" → al menos 2 líneas con precio <= max
      lleva.filter((l) => l.precio_unitario > 0 && l.precio_unitario <= alertasConfig.prendas_baratas.precio_max).length >= 2
    ) {
      out.push(resolverAlerta(alertasConfig.prendas_baratas, segKeys));
    }
    if (
      alertasConfig.pocas_prendas.activa &&
      cantidadTotal > 0 &&
      cantidadTotal <= alertasConfig.pocas_prendas.cantidad_max
    ) {
      out.push(resolverAlerta(alertasConfig.pocas_prendas, segKeys));
    }
    return out;
  }, [lleva, alertasConfig, clienteSegmento]);

  // Cargar config del modal (defaults si falla o si la empresa no tiene fila).
  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/configuracion/atencion-alertas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setAlertasConfig(mergeConfig(j.data?.config));
      })
      .catch(() => { /* defaults ya cargados */ });
    return () => { cancel = true; };
  }, []);

  // ── Confirmar ─────────────────────────────────────────────────────────
  // Wrapper: valida el ticket, y si pasa abre el modal previo al cierre.
  // El cierre real corre desde `confirmarDesdeModal`.
  function preConfirmar() {
    setError(null); setOkMsg(null);
    if (!cliente) { setError("Elegí un cliente antes de confirmar."); return; }
    if (trae.length === 0 && lleva.length === 0) {
      setError("Cargá al menos una prenda que el cliente traiga o lleve.");
      return;
    }
    if (trae.some((l) => l.cantidad <= 0 || l.precio_unitario < 0)) {
      setError("Revisá las líneas de 'Trae': cantidad debe ser > 0 y precio válido.");
      return;
    }
    if (lleva.some((l) => l.cantidad <= 0)) {
      setError("Revisá las líneas de 'Lleva': cantidad debe ser > 0.");
      return;
    }
    if (aCobrar > 0 && metodoCobro === "efectivo" && recibidoNum < aCobrar) {
      setError(`Falta cobrar Gs. ${Math.round(aCobrar - recibidoNum).toLocaleString("es-PY")} en efectivo. Ingresá el monto recibido.`);
      return;
    }
    // Caja: exigimos selección explícita cuando hay >1 abierta.
    if (!cajaSeleccionadaId && cajasAbiertas.length !== 1) {
      setError(cajasAbiertas.length > 1
        ? "Elegí la caja en la que se registra esta atención (hay más de una abierta)."
        : "Abrí una caja antes de confirmar.");
      return;
    }
    // Reset checklist en cada apertura.
    setBeneficiosMarcados({});
    // Nueva idempotency_key por submit lógico. Si el usuario cierra y vuelve
    // a abrir el modal (o cambia datos), la key se regenera.
    setIdempotencyKey(crypto.randomUUID());
    setPreCierreOpen(true);
  }

  // Persistir beneficios marcados como cliente_eventos. Corre después del
  // cierre exitoso — así el evento queda ligado al cliente aunque la venta
  // haya generado (o no) crédito por cashback.
  async function persistirBeneficios() {
    if (!cliente) return;
    // Solo persistimos post-commit los beneficios NO monetarios
    // (ecobag, regalitos). Los que piden monto ya se persistieron
    // dentro de la transacción del orquestador (beneficios_credito).
    const informativos = Object.entries(beneficiosMarcados)
      .filter(([, v]) => v.marcado)
      .map(([id]) => alertasConfig.beneficios.find((b) => b.id === id))
      .filter((cfg): cfg is BeneficioCfg => Boolean(cfg && !cfg.pide_monto));
    for (const cfg of informativos) {
      try {
        await fetchWithSupabaseSession(`/api/clientes/${cliente.id}/eventos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: cfg.tipo_evento,
            titulo: cfg.label,
            descripcion: `Entregado en atención · ${cfg.label}`,
            monto: null,
            generar_credito: false,
          }),
        });
      } catch (e) {
        console.error("[atencion] persistir beneficio informativo", cfg.id, e);
      }
    }
  }

  async function confirmar() {
    // Defensivo: preConfirmar ya validó, pero TS no puede seguirlo.
    if (!cliente) return;
    // Caja "en uso" — nunca autoseleccionamos la primera cuando hay varias.
    const cajaIdFinal = cajaEnUsoId;
    if (!cajaIdFinal) {
      setError(cajasAbiertas.length > 1
        ? "Hay más de una caja abierta. Elegí la caja antes de confirmar."
        : "Abrí la caja antes de confirmar la atención.");
      return;
    }
    // Idempotency key: la fija preConfirmar al abrir el modal. Si por alguna
    // razón no está (llamada directa), la generamos acá — reintento de la
    // misma llamada reusa la misma key gracias a este cierre léxico.
    const key = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);

    setEnviando(true);
    try {
      const traePayload = trae.length > 0
        ? {
            items: trae.map((l) => ({
              producto_id: l.franja_id,
              cantidad: l.cantidad,
              precio_compra_unitario: l.precio_unitario,
            })),
            total_final_evaluado: totalTrae, // ya incluye el ajuste manual (traeMontoFinal)
            ingresar_al_stock: ingresarAlStock,
          }
        : null;

      const llevaPayload = lleva.length > 0
        ? (() => {
            const total = totalLleva;
            // Crédito a aplicar: lo que la cajera decidió + descuento
            // promocional que el orquestador materializa como crédito
            // dentro de la misma tx (descuento_ya_aplicado_como_credito=false).
            const creditoUsado = creditoAplicadoNum + (promoAplicada?.descuento ?? 0);
            const efectivoNeeded = Math.max(0, total - creditoUsado);
            const pago_detalle = efectivoNeeded > 0
              ? [{
                  metodo_pago: metodoCobro,
                  monto: efectivoNeeded,
                  referencia: referenciaCobro.trim() || null,
                }]
              : [];
            return {
              items: lleva.map((l) => ({
                producto_id: l.franja_id,
                cantidad: l.cantidad,
                tipo_iva: "EXENTA" as const,
              })),
              credito_usado: creditoUsado,
              pago_detalle,
              moneda: "GS" as const,
              tipo_cambio: 1,
            };
          })()
        : null;

      // Promo: solo mandamos la referencia; el server re-evalúa monto y cashback.
      const promoPayload = promoAplicada
        ? {
            promocion_id: promoAplicada.id,
            cupon_codigo: promoAplicada.cupon_codigo,
          }
        : null;

      // Beneficios entregados: separamos los que generan crédito (van a la tx
      // del orquestador) de los meramente informativos (persistBeneficios
      // sigue haciéndolos best-effort post-commit).
      const beneficiosCredito = Object.entries(beneficiosMarcados)
        .filter(([, v]) => v.marcado)
        .map(([id, v]) => {
          const cfg = alertasConfig.beneficios.find((b) => b.id === id);
          if (!cfg || !cfg.pide_monto) return null;
          const monto = Number(v.monto.replace(/[^\d]/g, "")) || 0;
          if (!(monto > 0)) return null;
          return {
            id: cfg.id,
            label: cfg.label,
            tipo_evento: cfg.tipo_evento,
            monto,
          };
        })
        .filter((x): x is { id: string; label: string; tipo_evento: BeneficioCfg["tipo_evento"]; monto: number } => x !== null);

      const r = await fetchWithSupabaseSession("/api/atencion/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: key,
          caja_id: cajaIdFinal,
          cliente_id: cliente.id,
          observaciones: observaciones || null,
          trae: traePayload,
          lleva: llevaPayload,
          promocion: promoPayload,
          beneficios_credito: beneficiosCredito,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `No se pudo confirmar la atención (${r.status}).`);
      }

      // ── Feedback + reset ────────────────────────────────────────
      const partes: string[] = [];
      if (trae.length > 0) partes.push(`recepción por ${fmtGs(totalTrae)}`);
      if (lleva.length > 0) partes.push(`venta por ${fmtGs(totalLleva)}`);
      if (creditoRestante > creditoDisponible) {
        partes.push(`crédito restante ${fmtGs(creditoRestante)}`);
      }
      // Persistir beneficios marcados en el modal previo al cierre.
      // Es best-effort: si falla, la venta ya cerró y no la revertimos.
      await persistirBeneficios();
      setPreCierreOpen(false);
      // Invalidamos la key: cualquier confirmación posterior es un submit
      // nuevo (una key = una operación exitosa).
      setIdempotencyKey(null);
      setOkMsg("Atención registrada: " + partes.join(" + ") + ".");
      reset();
      // Re-contar pendientes por si la nueva recepción quedó sin ingresar.
      refrescarPendientesIngreso();
      // Actualizar el chip de meta del día — la venta que acaba de entrar suma.
      refrescarMetaDia();
      // recargar saldo de crédito
      const rc = await fetchWithSupabaseSession(`/api/clientes/${cliente.id}/creditos`, { cache: "no-store" });
      const jcr = await rc.json().catch(() => ({}));
      const s = Number(jcr?.data?.saldo ?? 0);
      setCreditoDisponible(Number.isFinite(s) ? s : 0);
      setTimeout(() => setOkMsg(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  // Paleta y rotación para las "sticky notes" del rail derecho. Estable
  // por índice para que la misma alerta no cambie de estilo al re-render.
  const STICKY_STYLES = [
    { bg: "bg-yellow-100", tape: "bg-yellow-300/70", tilt: "-rotate-2", text: "text-yellow-900" },
    { bg: "bg-pink-100",   tape: "bg-pink-300/70",   tilt: "rotate-1",  text: "text-pink-900"   },
    { bg: "bg-sky-100",    tape: "bg-sky-300/70",    tilt: "-rotate-1", text: "text-sky-900"    },
  ];

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caja</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cargá lo que el cliente <span className="font-medium text-slate-700">trae</span> y lo que <span className="font-medium text-slate-700">lleva</span>. El sistema calcula el resto.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {metaDia && (
            <Link
              href="/admin/metas"
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                metaDia.pct >= 100
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : metaDia.pct >= 50
                    ? "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title={`Meta hoy: Gs. ${Math.round(metaDia.vendido_dia).toLocaleString("es-PY")} de ${Math.round(metaDia.meta_diaria).toLocaleString("es-PY")}`}
            >
              🎯 Meta hoy: <strong>{metaDia.pct}%</strong>
            </Link>
          )}
          {pendientesIngresoCount > 0 && (
            <Link
              href="/atencion/pendientes-ingreso"
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                pendientesVencidasCount > 0
                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title={pendientesVencidasCount > 0
                ? `${pendientesVencidasCount} recepción(es) con más de 72h sin ingresar al stock`
                : "Recepciones pendientes de ingreso al stock"}
            >
              {pendientesVencidasCount > 0 ? "⚠ " : "📦 "}
              {pendientesIngresoCount} pendiente{pendientesIngresoCount === 1 ? "" : "s"} ↗
            </Link>
          )}
          <Link
            href="/ventas"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Historial ↗
          </Link>
        </div>
      </div>

      {/* ─── Banner de estado de caja con acciones directas ─── */}
      {cajaChecked && (
        cajaAbiertaId ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-900">
              <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-xs text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Caja abierta
              </span>
              {cajasAbiertas.length > 1 ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  · Caja
                  <select
                    value={cajaSeleccionadaId ?? ""}
                    onChange={(e) => setCajaSeleccionadaId(e.target.value || null)}
                    className="rounded border border-emerald-300 bg-white px-1 py-0.5 text-xs text-emerald-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    aria-label="Seleccionar caja abierta"
                  >
                    <option value="">— Elegir —</option>
                    {cajasAbiertas.map((c) => (
                      <option key={c.id} value={c.id}>
                        N° {c.numero_caja ?? "?"}{c.punto_caja_nombre ? ` (${c.punto_caja_nombre})` : ""}
                      </option>
                    ))}
                  </select>
                </span>
              ) : cajaNumero ? (
                <span className="text-emerald-700">· N° {cajaNumero}</span>
              ) : null}
              <span className="text-emerald-700">· Monto inicial <strong>Gs. {Math.round(cajaMontoApertura).toLocaleString("es-PY")}</strong></span>
              {cajaAperturaHora && (
                <span className="text-emerald-700/80 text-xs">
                  · desde {new Date(cajaAperturaHora).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMovError(null); setCajaModalOpen("mov"); }}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Movimiento
              </button>
              <button
                type="button"
                onClick={() => { setCierreError(null); setCierreResumen(null); setCajaModalOpen("cerrar"); cargarResumenCierre(); }}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-sm font-semibold"
              >
                Cerrar caja
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-amber-900">
              <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-xs text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Caja cerrada
              </span>
              <span className="ml-2 text-amber-800">Abrí la caja para poder registrar atenciones.</span>
            </div>
            <button
              type="button"
              onClick={() => { setAperturaError(null); setCajaModalOpen("abrir"); }}
              className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-4 py-1.5 text-sm font-semibold shadow-sm"
            >
              Abrir caja
            </button>
          </div>
        )
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>}


      {/* ─── Cliente ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
          Cliente <span className="text-red-500">*</span>
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
                  <div className="flex flex-wrap items-center gap-2 animate-seg-chip-in">
                    {clienteSegmento.categoria === "vip" && (
                      <StickerBadge type="vip">Cliente VIP</StickerBadge>
                    )}
                    {clienteSegmento.categoria === "habitual" && (
                      <StickerBadge type="frecuente" tilt="right">Cliente frecuente</StickerBadge>
                    )}
                    {clienteSegmento.categoria === "nuevo" && (
                      <StickerBadge type="nuevo">Cliente nuevo</StickerBadge>
                    )}
                    {clienteSegmento.categoria === "dormido" && (
                      <StickerBadge
                        type="inactivo"
                        title={
                          clienteSegmento.diasDesdeUltima != null
                            ? `Última compra hace ${clienteSegmento.diasDesdeUltima} días`
                            : undefined
                        }
                      >
                        Hace tiempo que no visita
                      </StickerBadge>
                    )}
                    {clienteSegmento.tieneReclamos && (
                      <StickerBadge
                        type="deuda"
                        tilt="right"
                        title={`${clienteSegmento.reclamosCount} reclamo${clienteSegmento.reclamosCount === 1 ? "" : "s"} previo${clienteSegmento.reclamosCount === 1 ? "" : "s"}`}
                      >
                        Con reclamos previos
                      </StickerBadge>
                    )}
                    {clienteSegmento.recibioBeneficios && (
                      <StickerBadge
                        type="credito"
                        title={`${clienteSegmento.beneficiosCount} beneficio${clienteSegmento.beneficiosCount === 1 ? "" : "s"} entregado${clienteSegmento.beneficiosCount === 1 ? "" : "s"}`}
                      >
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
            <button
              type="button"
              onClick={() => { setCliente(null); setClienteQuery(""); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              Cambiar cliente
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={clienteQuery}
              onChange={(e) => { setClienteQuery(e.target.value); setClienteOpen(true); }}
              onFocus={() => setClienteOpen(true)}
              placeholder="Buscar por nombre o RUC…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
            {clienteOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setNuevoClienteOpen(true); setClienteOpen(false); }}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 text-sm font-medium text-[#4FAEB2] hover:bg-[#4FAEB2]/5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  Cargar nuevo cliente
                </button>
                {clientesFiltrados.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Sin clientes que coincidan.</p>
                ) : clientesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCliente(c); setClienteOpen(false); }}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{c.nombre}</span>
                    {c.ruc && <span className="ml-2 text-xs text-slate-400">RUC {c.ruc}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Dos columnas: TRAE | LLEVA ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ColumnaAtencion
          titulo="El cliente TRAE"
          descripcion="Cargá las prendas que entrega para acreditar."
          tono="emerald"
          franjas={franjas}
          cargando={cargando}
          lineas={trae}
          total={totalTrae}
          subtotalItems={totalTraeSubtotal}
          onAgregar={(f) => agregarLineaEn("trae", f)}
          onActualizar={(id, patch) => actualizarLinea("trae", id, patch)}
          onQuitar={(id) => quitarLinea("trae", id)}
          permitirEditarPrecio
          accionesHeader={
            <button
              type="button"
              onClick={() => setCambioDirectoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
              title="Cliente cambia una prenda por otra del mismo precio, sin pagar diferencia"
            >
              ⇄ Cambio directo
            </button>
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
                      Escribí lo que efectivamente le pagás al cliente. Si lo dejás vacío se usa el subtotal de arriba ({fmtGs(totalTraeSubtotal)}).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <MontoInput
                      value={totalTraeManual ?? 0}
                      onChange={(n) => setTraeMontoFinal(String(Math.max(0, Math.round(n))))}
                      decimals={false}
                      placeholder={fmtGs(totalTraeSubtotal)}
                      className="w-36 rounded-md border border-emerald-300 px-2 py-1.5 text-right text-sm font-semibold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    {totalTraeManual != null && (
                      <button
                        type="button"
                        onClick={() => setTraeMontoFinal("")}
                        className="text-xs text-slate-500 hover:text-slate-700 underline decoration-dotted"
                        title="Volver al subtotal de los items"
                      >
                        limpiar
                      </button>
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
        <ColumnaAtencion
          titulo="El cliente LLEVA"
          descripcion="Cargá las prendas que se lleva de la tienda."
          tono="sky"
          franjas={franjas}
          cargando={cargando}
          lineas={lleva}
          total={totalLleva}
          onAgregar={(f) => agregarLineaEn("lleva", f)}
          onActualizar={(id, patch) => actualizarLinea("lleva", id, patch)}
          onQuitar={(id) => quitarLinea("lleva", id)}
          permitirEditarPrecio={false}
        />
      </div>

      {/* ─── Balance + confirmar ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Balance</h3>

        {/* Fila 1: totales de la atención */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <BalanceItem
              label={ajusteEvaluacion !== 0 ? "Total trae (evaluado)" : "Total trae"}
              value={fmtGs(totalTrae)}
              tone="emerald"
            />
            {ajusteEvaluacion !== 0 && (
              <p className="mt-1 text-[11px] text-slate-500">
                Subtotal items <span className="line-through">{fmtGs(totalTraeSubtotal)}</span>
                <span className={`ml-1 font-semibold ${ajusteEvaluacion > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {ajusteEvaluacion > 0 ? "+" : ""}{fmtGs(ajusteEvaluacion)} ajuste
                </span>
              </p>
            )}
          </div>
          <BalanceItem label="Total lleva" value={fmtGs(totalLleva)} tone="sky" />
        </div>

        {/* Bloque de crédito: solo si hay algo relevante (trajo, tiene previo, o va a llevar) */}
        {(totalTrae > 0 || creditoDisponible > 0 || totalLleva > 0) && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-[11px] uppercase font-semibold text-slate-500">Crédito del cliente</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className="flex justify-between sm:block">
                <span className="text-slate-500 text-xs">Previo</span>
                <span className="font-medium text-slate-700 sm:block">{fmtGs(creditoDisponible)}</span>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-slate-500 text-xs">Nuevo (por lo que trajo hoy)</span>
                <span className={`font-medium sm:block ${totalTrae > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                  {totalTrae > 0 ? "+ " : ""}{fmtGs(totalTrae)}
                </span>
              </div>
              <div className="flex justify-between sm:block border-t sm:border-t-0 sm:border-l border-slate-200 pt-1 sm:pt-0 sm:pl-3">
                <span className="text-slate-500 text-xs">Total disponible</span>
                <span className="font-bold text-slate-900 sm:block">{fmtGs(creditoTotalDisponible)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Promoción / cupón — solo cuando el cliente lleva algo */}
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
                <button type="button" onClick={quitarPromocion} className="rounded-lg border border-fuchsia-300 bg-white px-2 py-1 text-xs text-fuchsia-700 hover:bg-fuchsia-50">
                  Quitar
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={cuponInput}
                  onChange={(e) => setCuponInput(e.target.value.toUpperCase())}
                  placeholder="Código de cupón (opcional)"
                  className="flex-1 min-w-[140px] rounded-lg border border-fuchsia-200 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
                <button
                  type="button"
                  onClick={() => aplicarPromocion(cuponInput.trim() || null)}
                  disabled={promoBuscando}
                  className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
                >
                  {promoBuscando ? "Buscando…" : cuponInput.trim() ? "Aplicar cupón" : "Buscar automática"}
                </button>
              </div>
            )}
            {promoError && <p className="text-xs text-red-700">{promoError}</p>}
          </div>
        )}

        {/* Solo se aplica crédito si hay venta */}
        {totalLleva > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Aplicar del crédito ahora
              </label>
              <div className="flex gap-2 mb-1.5">
                <button
                  type="button"
                  onClick={() => setAplicarCredito("")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    aplicarCredito.trim() === ""
                      ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  title="Usar todo el crédito que pueda"
                >
                  💰 Usar el máximo ({fmtGs(creditoMaxAplicable)})
                </button>
                <button
                  type="button"
                  onClick={() => setAplicarCredito("0")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    aplicarCredito === "0"
                      ? "border-slate-400 bg-slate-100 text-slate-800 ring-2 ring-slate-300"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  title="No usar crédito ahora — guardarlo para otra venta"
                >
                  🔒 No usar (guardar para otra venta)
                </button>
              </div>
              <label className="block text-[11px] text-slate-400 mb-1">O ingresá un monto exacto:</label>
              <MontoInput
                value={aplicarCredito}
                onChange={(n) => setAplicarCredito(n === 0 ? "0" : String(n))}
                placeholder={`Ej: ${Math.min(creditoMaxAplicable, 50000).toLocaleString("es-PY")}`}
                decimals={false}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Aplicando ahora: <strong className="text-slate-800">{fmtGs(creditoAplicadoNum)}</strong>.
                {" "}Queda a favor: <strong className="text-emerald-700">{fmtGs(creditoRestante)}</strong>.
              </p>
            </div>
            {aCobrar > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Cobrar Gs. {Math.round(aCobrar).toLocaleString("es-PY")} en
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoCobro(m)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                        metodoCobro === m
                          ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {m === "efectivo" ? "💵 Efectivo" : m === "tarjeta" ? "💳 Tarjeta" : "📱 Transferencia"}
                    </button>
                  ))}
                </div>

                {metodoCobro === "efectivo" ? (
                  <div>
                    <label className="block text-[11px] uppercase font-semibold text-slate-500 mt-1 mb-1">
                      Recibido del cliente
                    </label>
                    <MontoInput
                      value={montoRecibido}
                      onChange={(n) => setMontoRecibido(n === 0 ? "0" : String(n))}
                      placeholder={`Ej: ${(Math.ceil(aCobrar / 10000) * 10000).toLocaleString("es-PY")}`}
                      decimals={false}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                    <div className="mt-1 flex gap-1">
                      {[aCobrar, Math.ceil(aCobrar / 10000) * 10000, Math.ceil(aCobrar / 50000) * 50000, Math.ceil(aCobrar / 100000) * 100000]
                        .filter((n, i, arr) => n >= aCobrar && arr.indexOf(n) === i)
                        .slice(0, 4)
                        .map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setMontoRecibido(String(n))}
                            className="flex-1 rounded-md border border-slate-200 bg-white px-1 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                          >
                            {n.toLocaleString("es-PY")}
                          </button>
                        ))}
                    </div>
                    {faltaCobrar > 0 ? (
                      <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                        Falta cobrar <strong>{fmtGs(faltaCobrar)}</strong>.
                      </p>
                    ) : vuelto > 0 ? (
                      <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800">
                        Vuelto: <strong className="text-lg">{fmtGs(vuelto)}</strong>
                      </p>
                    ) : recibidoNum > 0 ? (
                      <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        Exacto — sin vuelto.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] uppercase font-semibold text-slate-500 mt-1 mb-1">
                      Referencia / N° operación (opcional)
                    </label>
                    <input
                      type="text"
                      value={referenciaCobro}
                      onChange={(e) => setReferenciaCobro(e.target.value)}
                      placeholder={metodoCobro === "tarjeta" ? "Últimos 4 dígitos, autorización…" : "N° de transferencia"}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Se asume el monto exacto ({fmtGs(aCobrar)}). Sin vuelto.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Resumen final: cuánto crédito le queda al cliente después de esta atención */}
        <div className="grid grid-cols-2 gap-3">
          <BalanceItem
            label={aCobrar > 0 ? "A cobrar ahora" : (totalLleva > 0 ? "A cobrar ahora" : "Sin cobro (solo entregó)")}
            value={fmtGs(aCobrar)}
            tone={aCobrar > 0 ? "amber" : "slate"}
          />
          <BalanceItem
            label="Crédito que le queda"
            value={fmtGs(creditoRestante)}
            tone={creditoRestante > 0 ? "emerald" : "slate"}
          />
        </div>

        {trae.length > 0 && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ingresarAlStock}
              onChange={(e) => setIngresarAlStock(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]"
            />
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
            Observaciones (opcional)
          </label>
          <input
            type="text"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas de la atención"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={preConfirmar}
            disabled={enviando || !cliente || (trae.length === 0 && lleva.length === 0)}
            className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 transition-colors shadow-sm active:scale-95"
          >
            {enviando ? "Registrando…" : "Confirmar atención"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={enviando}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => router.push("/ventas")}
            className="text-sm text-slate-400 hover:text-slate-700"
          >
            Cancelar
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

      {cambioDirectoOpen && (
        <CambioDirectoModal
          franjas={franjas}
          onClose={() => setCambioDirectoOpen(false)}
          onConfirmar={(f, cant) => {
            agregarCambioDirecto(f, cant);
            setCambioDirectoOpen(false);
          }}
        />
      )}

      {/* ─── Sticky notes: recordatorios contextuales al armar el ticket ─── */}
      {cliente && alertasDisparadas.length > 0 && (
        <aside
          aria-label="Recordatorios para el vendedor"
          className="hidden xl:flex fixed top-28 right-6 z-30 flex-col gap-4 w-64 pointer-events-none"
        >
          {alertasDisparadas.map((a, i) => {
            const s = STICKY_STYLES[i % STICKY_STYLES.length];
            return (
              <div
                key={`${a.titulo}-${i}`}
                className={`relative ${s.bg} ${s.tilt} pointer-events-auto shadow-[0_6px_16px_-4px_rgba(0,0,0,0.25)] px-4 pt-5 pb-4 transition-transform hover:rotate-0 hover:scale-[1.02]`}
                style={{ borderRadius: "2px 2px 14px 2px" }}
              >
                <span
                  aria-hidden
                  className={`absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-16 ${s.tape} rotate-[-3deg] shadow-sm`}
                />
                <p className={`text-[13px] font-bold leading-snug ${s.text}`}>
                  {a.titulo}
                </p>
                <p className={`text-[12px] mt-1 leading-snug ${s.text} opacity-90`}>
                  {a.mensaje}
                </p>
              </div>
            );
          })}
        </aside>
      )}

      {/* ─── Modal previo al cierre: alertas + beneficios entregados ─── */}
      {preCierreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!enviando) setPreCierreOpen(false); }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Antes de cerrar la atención</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Repasá los recordatorios y marcá los beneficios que entregaste.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreCierreOpen(false)}
                disabled={enviando}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Beneficios entregados
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Marcá lo que le diste al cliente. Se registra en su historial.
              </p>
            </div>
            <div className="space-y-2 mb-5">
              {alertasConfig.beneficios.map((b) => {
                const marcado = !!beneficiosMarcados[b.id]?.marcado;
                const monto = beneficiosMarcados[b.id]?.monto ?? "";
                return (
                  <label
                    key={b.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      marcado ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) =>
                        setBeneficiosMarcados((prev) => ({
                          ...prev,
                          [b.id]: { marcado: e.target.checked, monto: prev[b.id]?.monto ?? "" },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{b.label}</p>
                      {b.tipo_evento === "cashback" && b.genera_credito && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Si marcás con monto, se agrega como crédito a favor del cliente.
                        </p>
                      )}
                    </div>
                    {b.pide_monto && marcado && (
                      <MontoInput
                        value={monto === "" ? 0 : Number(monto) || 0}
                        onChange={(n) =>
                          setBeneficiosMarcados((prev) => ({
                            ...prev,
                            [b.id]: { marcado: true, monto: String(n) },
                          }))
                        }
                        placeholder="Gs."
                        decimals={false}
                        className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right"
                      />
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPreCierreOpen(false)}
                disabled={enviando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={enviando}
                className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-300 text-white text-sm font-semibold px-5 py-2 shadow-sm"
              >
                {enviando ? "Registrando…" : "Cerrar atención"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cajaModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCajaModalOpen(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {cajaModalOpen === "abrir" && (
              <>
                <h3 className="text-base font-semibold text-slate-900">Abrir caja</h3>
                {puntoCajaNombre && <p className="mt-0.5 text-xs text-slate-500">Punto: <strong>{puntoCajaNombre}</strong></p>}
                {aperturaError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aperturaError}</div>
                )}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Monto inicial en efectivo (Gs.)</label>
                    <MontoInput
                      value={aperturaMonto} onChange={(n) => setAperturaMonto(String(n))}
                      placeholder="Ej: 200.000" autoFocus decimals={false}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Observación (opcional)</label>
                    <input
                      type="text" value={aperturaObs} onChange={(e) => setAperturaObs(e.target.value)}
                      placeholder="Ej: turno mañana"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </div>
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button type="button" onClick={() => setCajaModalOpen(null)} disabled={abriendo} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={abrirCajaAhora} disabled={abriendo || !puntoCajaId} className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 shadow-sm">
                    {abriendo ? "Abriendo…" : "Abrir caja"}
                  </button>
                </div>
              </>
            )}

            {cajaModalOpen === "cerrar" && (
              <div className="max-h-[85vh] overflow-y-auto pr-1">
                <h3 className="text-base font-semibold text-slate-900">Cerrar caja</h3>

                {cierreError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{cierreError}</div>
                )}

                {/* Resumen de ventas del turno */}
                {cierreResumen ? (
                  <>
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Resumen de ventas del turno</p>
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
                        <ResumenRow label="Cantidad de ventas" value={String(cierreResumen.cantidad_ventas)} />
                        <ResumenRow label="Ventas en efectivo" value={fmtGs(cierreResumen.total_efectivo)} />
                        <ResumenRow label="Ventas por transferencia" value={fmtGs(cierreResumen.total_transferencia)} />
                        <ResumenRow label="Ventas con tarjeta" value={fmtGs(cierreResumen.total_tarjeta)} />
                        <ResumenRow label="Total vendido" value={fmtGs(cierreResumen.total_vendido)} bold />
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Cierre total del turno</p>
                      <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-sm">
                        <div className="flex justify-between text-slate-700"><span>Monto de apertura</span><span>{fmtGs(cierreResumen.monto_apertura)}</span></div>
                        <div className="flex justify-between text-slate-700 border-b border-sky-200 pb-2"><span>Total vendido</span><span>+ {fmtGs(cierreResumen.total_vendido)}</span></div>
                        <div className="flex justify-between items-baseline pt-2">
                          <span className="font-semibold text-sky-800">Cierre total esperado</span>
                          <span className="text-xl font-bold text-sky-900">{fmtGs(cierreResumen.monto_apertura + cierreResumen.total_vendido)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Desglose del cierre</p>
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
                        <ResumenRow label="Efectivo físico esperado" value={fmtGs(cierreResumen.efectivo_esperado)} />
                        <ResumenRow label="Transferencias registradas" value={"+ " + fmtGs(cierreResumen.total_transferencia)} />
                        <ResumenRow label="Tarjetas registradas" value={"+ " + fmtGs(cierreResumen.total_tarjeta)} />
                        <ResumenRow label="Total cierre esperado" value={fmtGs(cierreResumen.efectivo_esperado + cierreResumen.total_transferencia + cierreResumen.total_tarjeta)} bold />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        El <strong>efectivo físico esperado</strong> es apertura + ventas en efectivo + ingresos − egresos − retiros. Transferencias y tarjetas suman al cierre total, pero <strong>no</strong> al efectivo físico.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-slate-400 animate-pulse">Cargando resumen del turno…</p>
                )}

                <div className="mt-4 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cierre</p>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Efectivo físico contado en caja (Gs.)</label>
                    <MontoInput
                      value={cierreContado} onChange={(n) => setCierreContado(String(n))}
                      placeholder="Ej: 160.000" autoFocus decimals={false}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Ingresá solo el dinero físico disponible en caja. Transferencias y tarjetas ya se toman desde las ventas registradas.
                    </p>
                  </div>
                  {cierreResumen && cierreContado !== "" && (() => {
                    const contado = Number(cierreContado) || 0;
                    const dif = contado - cierreResumen.efectivo_esperado;
                    return dif === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Cuadra: sin diferencia.</div>
                    ) : dif > 0 ? (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">Sobrante: <strong>{fmtGs(dif)}</strong></div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Faltante: <strong>{fmtGs(Math.abs(dif))}</strong></div>
                    );
                  })()}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Observación (opcional)</label>
                    <input
                      type="text" value={cierreObs} onChange={(e) => setCierreObs(e.target.value)}
                      placeholder="Ej: cierre turno mañana"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </div>
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button type="button" onClick={() => setCajaModalOpen(null)} disabled={cerrando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={cerrarCajaAhora} disabled={cerrando || cierreContado === ""} className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 shadow-sm">
                    {cerrando ? "Cerrando…" : "Confirmar cierre"}
                  </button>
                </div>
              </div>
            )}

            {cajaModalOpen === "mov" && (
              <>
                <h3 className="text-base font-semibold text-slate-900">Movimiento manual</h3>
                <p className="mt-0.5 text-xs text-slate-500">Ingreso/egreso de plata en la caja fuera de una venta (ej. pagar un delivery, retirar cambio).</p>
                {movError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{movError}</div>
                )}
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["ingreso", "egreso", "retiro", "ajuste"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setMovTipo(t)}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                          movTipo === t
                            ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}>{t}</button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Concepto *</label>
                    <input
                      type="text" value={movConcepto} onChange={(e) => setMovConcepto(e.target.value)}
                      placeholder="Ej: pago delivery"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Monto (Gs.) *</label>
                      <MontoInput
                        value={movMonto} onChange={(n) => setMovMonto(String(n))}
                        placeholder="Ej: 20.000" decimals={false}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Método</label>
                      <select value={movMedio} onChange={(e) => setMovMedio(e.target.value as "efectivo"|"tarjeta"|"transferencia"|"otro")}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]">
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Observación (opcional)</label>
                    <input
                      type="text" value={movObs} onChange={(e) => setMovObs(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </div>
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button type="button" onClick={() => setCajaModalOpen(null)} disabled={movEnviando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={registrarMovimientoAhora} disabled={movEnviando} className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 shadow-sm">
                    {movEnviando ? "Registrando…" : "Registrar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal de alta rápida de cliente (embebido)
// ═══════════════════════════════════════════════════════════════════════

function NuevoClienteRapidoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Cliente) => void;
}) {
  const [tipo, setTipo] = useState<"empresa" | "persona">("empresa");
  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [telefono, setTelefono] = useState("");
  const [comoConocio, setComoConocio] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const puedeGuardar = razonSocial.trim().length > 0 && !saving;

  async function submit() {
    setErr(null);
    if (!razonSocial.trim()) {
      setErr(tipo === "empresa" ? "La razón social es obligatoria." : "El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tipo_cliente: tipo,
        nombre_contacto: razonSocial.trim().toUpperCase(),
        empresa: tipo === "empresa" ? razonSocial.trim().toUpperCase() : null,
        ruc: ruc.trim() || null,
        telefono: telefono.trim() || null,
        como_conocio: comoConocio.trim() || null,
        estado: "activo",
      };
      const res = await fetch("/api/clientes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) {
        throw new Error(j?.error ?? `No se pudo crear el cliente (${res.status}).`);
      }
      const data = (j.data ?? {}) as {
        id?: string;
        empresa?: string | null;
        nombre?: string | null;
        nombre_contacto?: string | null;
        ruc?: string | null;
      };
      if (!data.id) throw new Error("El servidor no devolvió el id del cliente.");
      const nombre =
        (data.empresa ?? "").trim() ||
        (data.nombre_contacto ?? "").trim() ||
        (data.nombre ?? "").trim() ||
        razonSocial.trim().toUpperCase();
      onCreated({
        id: data.id,
        nombre,
        empresa: data.empresa ?? null,
        ruc: (data.ruc ?? "").trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al crear el cliente.");
    } finally {
      setSaving(false);
    }
  }

  const nombreLabel = tipo === "empresa" ? "Razón social" : "Nombre completo";
  const nombrePlaceholder = tipo === "empresa" ? "Ej: TALLER VIDAL S.A." : "Ej: MARÍA PÉREZ";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Nuevo cliente</h3>
            <p className="mt-1 text-xs text-slate-500">
              Solo los datos mínimos. Podés completar dirección, SIFEN y condiciones más tarde desde la ficha del cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-1">
          {(["empresa", "persona"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                tipo === t
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-[#4FAEB2]/40"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "empresa" ? "Empresa" : "Persona"}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {nombreLabel} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder={nombrePlaceholder}
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {tipo === "empresa" ? "RUC" : "RUC / CI (opcional)"}
            </label>
            <input
              type="text"
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              placeholder="Ej: 80011405-1"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Teléfono <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 0991 234 567"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              ¿Cómo conoció la tienda? <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={comoConocio}
              onChange={(e) => setComoConocio(e.target.value)}
              placeholder="Ej: Instagram, referida por María, pasó por la puerta…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!puedeGuardar}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Columna reusable
// ─────────────────────────────────────────────────────────────────────────

function ColumnaAtencion(props: {
  titulo: string;
  descripcion: string;
  tono: "emerald" | "sky";
  franjas: Franja[];
  cargando: boolean;
  lineas: Linea[];
  total: number;
  onAgregar: (f: Franja) => void;
  onActualizar: (franjaId: string, patch: Partial<Linea>) => void;
  onQuitar: (franjaId: string) => void;
  permitirEditarPrecio: boolean;
  /** Subtotal de los items antes de un override manual. Solo se usa para mostrar. */
  subtotalItems?: number;
  /** Acciones extra en el header (ej. botón "Cambio directo"). */
  accionesHeader?: React.ReactNode;
  /** Bloque debajo del listado (ej. campo "A pagar final" para la recepción). */
  slotDebajo?: React.ReactNode;
}) {
  const { titulo, descripcion, tono, franjas, cargando, lineas, total, onAgregar, onActualizar, onQuitar, permitirEditarPrecio, subtotalItems, accionesHeader, slotDebajo } = props;
  const border = tono === "emerald" ? "border-emerald-200" : "border-sky-200";
  const bg = tono === "emerald" ? "bg-emerald-50/40" : "bg-sky-50/40";
  const btn = tono === "emerald"
    ? "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
    : "border-sky-200 hover:border-sky-400 hover:bg-sky-50";
  const title = tono === "emerald" ? "text-emerald-700" : "text-sky-700";
  const delta = subtotalItems != null ? total - subtotalItems : 0;
  const hayAjuste = subtotalItems != null && delta !== 0;

  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 sm:p-5`}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className={`text-sm font-bold uppercase tracking-wider ${title}`}>{titulo}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
          {accionesHeader && <div className="mt-2">{accionesHeader}</div>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase text-slate-500">
            {hayAjuste ? "A pagar (final)" : "Subtotal"}
          </p>
          <p className="text-lg font-bold text-slate-800">{fmtGs(total)}</p>
          {hayAjuste && subtotalItems != null && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Subtotal <span className="line-through">{fmtGs(subtotalItems)}</span>
              <span className={`ml-1 font-semibold ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {delta > 0 ? "+" : ""}{fmtGs(delta)}
              </span>
            </p>
          )}
        </div>
      </div>

      {cargando ? (
        <p className="text-xs text-slate-400 py-4 text-center animate-pulse">Cargando categorías…</p>
      ) : franjas.length === 0 ? (
        <p className="text-xs text-amber-700 py-4 text-center">
          No hay franjas de precio configuradas. Un administrador debe crearlas en <Link href="/admin/franjas" className="underline">Categorías</Link>.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {franjas.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onAgregar(f)}
              title={f.nombre}
              className={`rounded-lg border bg-white px-2 py-2 text-center transition-colors active:scale-95 ${btn}`}
            >
              <p className="text-[10px] text-slate-400 uppercase">{short(f.nombre)}</p>
              <p className="text-sm font-bold text-slate-800">{fmtGs(Number(f.precio_venta) || 0)}</p>
            </button>
          ))}
        </div>
      )}

      {lineas.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide">Categoría</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-20">Cant.</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-32">Precio unit.</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-28">Subtotal</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((l) => (
                <tr key={l.franja_id}>
                  <td className="px-3 py-2 text-slate-700">{fmtGs(l.precio_referencia)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={l.cantidad === 0 ? "" : l.cantidad}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Permitir borrar el campo — se guarda 0 y al salir
                        // del input (o al confirmar) se limpia esa línea.
                        const n = v === "" ? 0 : Number(v);
                        onActualizar(l.franja_id, { cantidad: Number.isFinite(n) && n >= 0 ? n : 0 });
                      }}
                      onBlur={() => {
                        // Al perder el foco: si quedó en 0, quitar la línea.
                        if (l.cantidad <= 0) onQuitar(l.franja_id);
                      }}
                      placeholder="0"
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {permitirEditarPrecio ? (
                      <MontoInput
                        value={l.precio_unitario}
                        onChange={(n) => onActualizar(l.franja_id, { precio_unitario: Math.max(0, n) })}
                        decimals={false}
                        className="w-28 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                      />
                    ) : (
                      <span className="text-slate-700">{fmtGs(l.precio_unitario)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{fmtGs(l.precio_unitario * l.cantidad)}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onQuitar(l.franja_id)}
                      title="Quitar"
                      className="text-slate-400 hover:text-red-600 text-lg leading-none"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {slotDebajo && <div className="mt-4">{slotDebajo}</div>}
    </div>
  );
}

function ResumenRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-2 ${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function BalanceItem({ label, value, tone }: { label: string; value: string; tone: "emerald"|"sky"|"amber"|"slate" }) {
  const bg = tone === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : tone === "sky" ? "bg-sky-50 border-sky-200 text-sky-800"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-slate-50 border-slate-200 text-slate-700";
  return (
    <div className={`rounded-lg border px-3 py-2 ${bg}`}>
      <p className="text-[10px] uppercase font-semibold">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}

// ── Cambio directo ─────────────────────────────────────────────────────
// Cliente entrega una prenda y se lleva otra del MISMO precio (mismo valor
// de franja). El cambio se materializa agregando la franja a TRAE y LLEVA
// en igual cantidad; el balance calcula naturalmente "a cobrar = 0".
function CambioDirectoModal({
  franjas,
  onClose,
  onConfirmar,
}: {
  franjas: Franja[];
  onClose: () => void;
  onConfirmar: (franja: Franja, cantidad: number) => void;
}) {
  const [franjaId, setFranjaId] = useState<string>("");
  const [cantidad, setCantidad] = useState<number>(1);
  const franjaSel = franjas.find((f) => f.id === franjaId) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Cambio directo</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              El cliente entrega una prenda y se lleva otra del <span className="font-semibold text-slate-700">mismo precio</span>. No hay dinero de por medio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Categoría / precio
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {franjas.map((f) => {
                const sel = f.id === franjaId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFranjaId(f.id)}
                    className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                      sel
                        ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                        : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
                    }`}
                  >
                    <p className="text-[10px] text-slate-400 uppercase truncate">{f.nombre}</p>
                    <p className="text-sm font-bold text-slate-800">{fmtGs(Number(f.precio_venta) || 0)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Cantidad
            </label>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCantidad(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
              }}
              className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>

          {franjaSel && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
              Se agregará <span className="font-semibold">{cantidad}× {franjaSel.nombre}</span> a <span className="font-semibold">Trae</span> y también a <span className="font-semibold">Lleva</span>, por {fmtGs((Number(franjaSel.precio_venta) || 0) * cantidad)}. El balance queda en cero.
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!franjaSel || cantidad < 1}
            onClick={() => franjaSel && onConfirmar(franjaSel, cantidad)}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-1.5 text-sm font-semibold"
          >
            Agregar cambio
          </button>
        </div>
      </div>
    </div>
  );
}
