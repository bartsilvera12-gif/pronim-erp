"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

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

  // ── Feedback ──────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // ── Caja / punto de caja: se detectan y se manejan solos ─────────────
  // La cajera no debería tener que pensar en abrir/cerrar turno para
  // hacer una atención. Si no hay caja abierta al confirmar, la abrimos
  // en el primer punto disponible con monto 0.
  const [cajaAbiertaId, setCajaAbiertaId] = useState<string | null>(null);
  const [cajaNumero, setCajaNumero] = useState<number | null>(null);
  const [cajaAperturaHora, setCajaAperturaHora] = useState<string | null>(null);
  const [cajaChecked, setCajaChecked] = useState(false);
  const [puntoCajaId, setPuntoCajaId] = useState<string | null>(null);
  const [puntoCajaNombre, setPuntoCajaNombre] = useState<string | null>(null);

  // ── Modal de caja (abrir / cerrar / info) ─────────────────────────────
  const [cajaModalOpen, setCajaModalOpen] = useState(false);
  const [aperturaMonto, setAperturaMonto] = useState<string>("");
  const [aperturaObs, setAperturaObs] = useState<string>("");
  const [abriendo, setAbriendo] = useState(false);
  const [aperturaError, setAperturaError] = useState<string | null>(null);

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
      const cajas = (jc?.data?.cajas as { id: string; numero_caja?: number; fecha_apertura?: string }[] | undefined) ?? [];
      const c0 = cajas[0] ?? (jc?.data?.caja as { id: string; numero_caja?: number; fecha_apertura?: string } | null | undefined) ?? null;
      setCajaAbiertaId(c0?.id ?? null);
      setCajaNumero(c0?.numero_caja ?? null);
      setCajaAperturaHora(c0?.fecha_apertura ?? null);
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
      setCajaModalOpen(false);
      await refrescarCajaEstado();
    } catch (e) {
      setAperturaError(e instanceof Error ? e.message : "Error al abrir la caja.");
    } finally {
      setAbriendo(false);
    }
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

  // ── Cálculos ──────────────────────────────────────────────────────────
  const totalTrae  = useMemo(() => trae.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0), [trae]);
  const totalLleva = useMemo(() => lleva.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0), [lleva]);

  // Modelo explícito:
  //  1) Todo lo que TRAE hoy genera crédito nuevo por totalTrae.
  //  2) El crédito TOTAL disponible ahora = previo + nuevo trae.
  //  3) La cajera decide cuánto de ese total aplicar en LA VENTA (0 …
  //     min(disponible, lleva)). Por defecto aplica el máximo posible.
  //  4) La diferencia se cobra en efectivo/tarjeta/transferencia.
  //  5) Lo que no se aplique queda como crédito remanente para el futuro.
  const creditoTotalDisponible = creditoDisponible + totalTrae;
  const creditoMaxAplicable = Math.min(creditoTotalDisponible, totalLleva);

  // Si el usuario NO tocó el input, se aplica el máximo. Si lo editó, se
  // respeta el número (clampeado al rango [0, creditoMaxAplicable]).
  const creditoAplicadoNum = useMemo(() => {
    if (aplicarCredito.trim() === "") return creditoMaxAplicable;
    const n = Number(aplicarCredito);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(n, creditoMaxAplicable));
  }, [aplicarCredito, creditoMaxAplicable]);

  const aCobrar = Math.max(0, totalLleva - creditoAplicadoNum);
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
    setError(null);
  }

  // ── Confirmar ─────────────────────────────────────────────────────────
  async function confirmar() {
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

    setEnviando(true);
    try {
      // La caja se abre explícitamente antes de arrancar (gate al entrar
      // a la pantalla). Acá asumimos que ya hay una abierta.
      if (!cajaAbiertaId) {
        throw new Error("Abrí la caja antes de confirmar la atención.");
      }

      // ── 1. Recepción (si trae algo) ────────────────────────────────
      if (trae.length > 0) {
        // Método de pago = crédito completo. El excedente se convierte
        // en saldo a favor. Si el cliente lleva algo también, ese
        // crédito se aplica automáticamente en la venta a continuación.
        const totalRec = totalTrae;
        const bodyRec = {
          items: trae.map((l) => ({
            producto_id: l.franja_id,
            cantidad: l.cantidad,
            precio_compra_unitario: l.precio_unitario,
          })),
          pagos: [{ metodo: "credito", monto: totalRec }],
          observaciones: observaciones || null,
        };
        const rr = await fetchWithSupabaseSession(`/api/clientes/${cliente.id}/recepciones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyRec),
        });
        const jr = await rr.json().catch(() => ({}));
        if (!rr.ok || jr?.success === false) {
          throw new Error(jr?.error ?? `No se pudo registrar la recepción (${rr.status}).`);
        }
      }

      // ── 2. Venta (si lleva algo) ───────────────────────────────────
      if (lleva.length > 0) {
        const total = totalLleva;
        // Crédito a aplicar en la venta: lo que la cajera decidió (o el
        // máximo si dejó el input vacío). Como la recepción se ejecutó
        // primero, el saldo del cliente ya incluye el nuevo crédito y
        // el consumo FIFO server-side toma primero los lotes viejos.
        const creditoUsado = creditoAplicadoNum;
        const efectivoNeeded = Math.max(0, total - creditoUsado);
        const pagoDetalle = efectivoNeeded > 0
          ? [{
              metodo_pago: metodoCobro,
              monto: efectivoNeeded,
              referencia: referenciaCobro.trim() || null,
            }]
          : [];
        const bodyVenta = {
          cliente_id: cliente.id,
          items: lleva.map((l) => ({
            producto_id: l.franja_id,
            cantidad: l.cantidad,
            tipo_iva: "EXENTA" as const,
          })),
          moneda: "GS",
          tipo_cambio: 1,
          tipo_venta: "CONTADO",
          subtotal: total,
          monto_iva: 0,
          total,
          metodo_pago: pagoDetalle.length > 0 ? metodoCobro : "efectivo",
          credito_cliente_usado: creditoUsado,
          pago_detalle: pagoDetalle,
          observaciones: observaciones || null,
        };
        const rv = await fetchWithSupabaseSession("/api/ventas/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyVenta),
        });
        const jv = await rv.json().catch(() => ({}));
        if (!rv.ok || jv?.success === false) {
          throw new Error(jv?.error ?? `No se pudo registrar la venta (${rv.status}).`);
        }
      }

      // ── 3. Feedback + reset ────────────────────────────────────────
      const partes: string[] = [];
      if (trae.length > 0) partes.push(`recepción por ${fmtGs(totalTrae)}`);
      if (lleva.length > 0) partes.push(`venta por ${fmtGs(totalLleva)}`);
      if (creditoRestante > creditoDisponible) {
        partes.push(`crédito restante ${fmtGs(creditoRestante)}`);
      }
      setOkMsg("Atención registrada: " + partes.join(" + ") + ".");
      reset();
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
          <button
            type="button"
            onClick={() => setCajaModalOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              cajaAbiertaId
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
            title={cajaAbiertaId ? "Ver / cerrar la caja abierta" : "Abrir caja"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cajaAbiertaId ? "bg-emerald-500" : "bg-amber-500"}`} />
            {cajaAbiertaId
              ? `Caja ${cajaNumero ? `N° ${cajaNumero}` : "abierta"}`
              : "Abrir caja"}
          </button>
          <Link
            href="/ventas"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Historial ↗
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>}


      {/* ─── Cliente ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
          Cliente <span className="text-red-500">*</span>
        </label>
        {cliente ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800">{cliente.nombre}</p>
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
          onAgregar={(f) => agregarLineaEn("trae", f)}
          onActualizar={(id, patch) => actualizarLinea("trae", id, patch)}
          onQuitar={(id) => quitarLinea("trae", id)}
          permitirEditarPrecio
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
          <BalanceItem label="Total trae"  value={fmtGs(totalTrae)}  tone="emerald" />
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
              <input
                type="number"
                min={0}
                max={creditoMaxAplicable}
                value={aplicarCredito === "" ? "" : aplicarCredito}
                onChange={(e) => setAplicarCredito(e.target.value)}
                placeholder={`Ej: ${Math.min(creditoMaxAplicable, 50000)}`}
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
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="1000"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      placeholder={`Ej: ${Math.ceil(aCobrar / 10000) * 10000}`}
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
            onClick={confirmar}
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

      {cajaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCajaModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {cajaAbiertaId ? "Caja abierta" : "Abrir caja"}
                </h3>
                {puntoCajaNombre && (
                  <p className="mt-0.5 text-xs text-slate-500">Punto: <strong>{puntoCajaNombre}</strong></p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCajaModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {cajaAbiertaId ? (
              // ── Caja abierta: info + acciones ─────────────────────
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <strong>Turno abierto {cajaNumero ? `N° ${cajaNumero}` : ""}</strong>
                  </span>
                  {cajaAperturaHora && (
                    <p className="mt-0.5 text-xs text-emerald-700">
                      Abierta a las {new Date(cajaAperturaHora).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
                <Link
                  href="/ventas"
                  className="block w-full rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold py-2.5 text-center transition-colors"
                >
                  Cerrar turno / arqueo ↗
                </Link>
                <Link
                  href="/ventas"
                  className="block w-full rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium py-2.5 text-center transition-colors"
                >
                  Registrar movimiento manual ↗
                </Link>
                <p className="text-[11px] text-slate-400 text-center pt-1">
                  El cierre, arqueo y movimientos se hacen en el panel completo de caja.
                </p>
              </div>
            ) : (
              // ── No hay caja abierta: form de apertura ─────────────
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  Ingresá el efectivo con el que arrancás la caja. Podés dejar 0 si es una caja nueva.
                </p>
                {aperturaError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aperturaError}</div>
                )}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Monto inicial en efectivo (Gs.)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="1000"
                    value={aperturaMonto}
                    onChange={(e) => setAperturaMonto(e.target.value)}
                    placeholder="Ej: 200000"
                    autoFocus
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Observación <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={aperturaObs}
                    onChange={(e) => setAperturaObs(e.target.value)}
                    placeholder="Ej: turno mañana"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                  />
                </div>
                <button
                  type="button"
                  onClick={abrirCajaAhora}
                  disabled={abriendo || !puntoCajaId}
                  className="w-full rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 transition-colors shadow-sm active:scale-95"
                >
                  {abriendo ? "Abriendo caja…" : "Abrir caja"}
                </button>
              </div>
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
}) {
  const { titulo, descripcion, tono, franjas, cargando, lineas, total, onAgregar, onActualizar, onQuitar, permitirEditarPrecio } = props;
  const border = tono === "emerald" ? "border-emerald-200" : "border-sky-200";
  const bg = tono === "emerald" ? "bg-emerald-50/40" : "bg-sky-50/40";
  const btn = tono === "emerald"
    ? "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
    : "border-sky-200 hover:border-sky-400 hover:bg-sky-50";
  const title = tono === "emerald" ? "text-emerald-700" : "text-sky-700";

  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 sm:p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`text-sm font-bold uppercase tracking-wider ${title}`}>{titulo}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase text-slate-500">Subtotal</p>
          <p className="text-lg font-bold text-slate-800">{fmtGs(total)}</p>
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
                      min={1}
                      value={l.cantidad}
                      onChange={(e) => onActualizar(l.franja_id, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {permitirEditarPrecio ? (
                      <input
                        type="number"
                        min={0}
                        value={l.precio_unitario}
                        onChange={(e) => onActualizar(l.franja_id, { precio_unitario: Math.max(0, Number(e.target.value) || 0) })}
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
