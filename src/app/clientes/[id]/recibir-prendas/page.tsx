"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

function formatGs(n: number): string {
  return "Gs. " + Math.round(n).toLocaleString("es-PY").replace(/,/g, ".");
}

type Cliente = {
  id: string;
  nombre?: string | null;
  nombre_contacto?: string | null;
  empresa?: string | null;
  ruc?: string | null;
};

type LineaState = {
  cantidad: string;
  precio_compra: string; // por unidad
};

export default function RecibirPrendasPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clienteId = params?.id ?? "";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [lineas, setLineas] = useState<Record<string, LineaState>>({});

  // Formas de pago: crédito + efectivo + transferencia (sumatoria = total)
  const [pagoCredito, setPagoCredito] = useState("");
  const [pagoEfectivo, setPagoEfectivo] = useState("");
  const [pagoTransferencia, setPagoTransferencia] = useState("");
  const [transfEntidad, setTransfEntidad] = useState("");
  const [transfReferencia, setTransfReferencia] = useState("");

  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [margenMinimo, setMargenMinimo] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    void getProductos().then((data) => {
      if (!cancel) setProductos(data);
    });
    void (async () => {
      try {
        const r = await fetchWithSupabaseSession(`/api/clientes/${clienteId}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const c = (j?.data?.cliente ?? j?.cliente) as Cliente | undefined;
        if (!cancel && c) setCliente(c);
      } catch {
        /* opcional */
      }
    })();
    // Margen mínimo configurado a nivel empresa (best-effort)
    void (async () => {
      try {
        const r = await fetchWithSupabaseSession(`/api/empresas/current`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const val = j?.data?.empresa?.margen_minimo_esperado_pct ?? j?.empresa?.margen_minimo_esperado_pct;
        if (!cancel && typeof val === "number") setMargenMinimo(val);
      } catch { /* opcional */ }
    })();
    return () => { cancel = true; };
  }, [clienteId]);

  const franjas = useMemo(
    () =>
      productos
        .filter((p) => p.es_franja_precio === true && p.activo !== false)
        .sort((a, b) => (a.precio_venta ?? 0) - (b.precio_venta ?? 0)),
    [productos],
  );

  const items = useMemo(() => {
    return franjas
      .map((f) => {
        const st = lineas[f.id] ?? { cantidad: "", precio_compra: "" };
        const cant = parseInt(st.cantidad, 10) || 0;
        const precioCompra = parseFloat(st.precio_compra) || 0;
        const precioVenta = Number(f.precio_venta) || 0;
        const subtotal = cant * precioCompra;
        const margen =
          precioVenta > 0
            ? ((precioVenta - precioCompra) / precioVenta) * 100
            : null;
        return {
          producto_id: f.id,
          producto_nombre: f.nombre,
          sku: f.sku,
          cantidad: cant,
          precio_compra_unitario: precioCompra,
          precio_venta_snapshot: precioVenta,
          subtotal,
          margen,
          margenBajo: margen != null && margenMinimo != null && margen < margenMinimo,
        };
      })
      .filter((i) => i.cantidad > 0);
  }, [franjas, lineas, margenMinimo]);

  const totalCompra = items.reduce((s, i) => s + i.subtotal, 0);
  const totalPrendas = items.reduce((s, i) => s + i.cantidad, 0);
  const valorVentaPotencial = items.reduce(
    (s, i) => s + i.cantidad * i.precio_venta_snapshot,
    0,
  );

  const pCredito = parseFloat(pagoCredito) || 0;
  const pEfectivo = parseFloat(pagoEfectivo) || 0;
  const pTransfer = parseFloat(pagoTransferencia) || 0;
  const totalPagos = pCredito + pEfectivo + pTransfer;
  const diferenciaPagos = totalPagos - totalCompra;
  const pagosCubren = Math.abs(diferenciaPagos) <= 1;

  const puedeEnviar = items.length > 0 && pagosCubren && !enviando;

  function updLinea(id: string, patch: Partial<LineaState>) {
    setLineas((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { cantidad: "", precio_compra: "" }), ...patch },
    }));
  }

  async function enviar(ingresarAhora: boolean) {
    setError(null);
    setOk(null);
    if (!items.length) {
      setError("Cargá al menos una categoría con cantidad > 0.");
      return;
    }
    if (!pagosCubren) {
      setError(
        `Las formas de pago (${formatGs(totalPagos)}) no coinciden con el total (${formatGs(totalCompra)}).`,
      );
      return;
    }
    setEnviando(true);
    try {
      const pagos: Record<string, unknown>[] = [];
      if (pCredito > 0) pagos.push({ metodo: "credito", monto: pCredito });
      if (pEfectivo > 0) pagos.push({ metodo: "efectivo", monto: pEfectivo });
      if (pTransfer > 0) {
        pagos.push({
          metodo: "transferencia",
          monto: pTransfer,
          entidad_nombre_snapshot: transfEntidad.trim() || null,
          referencia: transfReferencia.trim() || null,
        });
      }

      const r = await fetchWithSupabaseSession(
        `/api/clientes/${clienteId}/recepciones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              producto_id: i.producto_id,
              producto_nombre: i.producto_nombre,
              sku: i.sku,
              cantidad: i.cantidad,
              precio_compra_unitario: i.precio_compra_unitario,
              precio_venta_snapshot: i.precio_venta_snapshot,
            })),
            pagos,
            total_compra: totalCompra,
            observaciones: observaciones.trim() || null,
            ingresar_ahora: ingresarAhora,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      const num = j.data?.recepcion?.numero_control ?? "";
      const estado = j.data?.recepcion?.estado ?? "";
      setOk(
        `Recepción ${num} guardada (${estado === "ingresada" ? "ingresada al stock" : "pendiente de ingreso"}). Crédito generado: ${formatGs(Number(j.data?.recepcion?.credito_generado ?? 0))}.`,
      );
      setLineas({});
      setPagoCredito("");
      setPagoEfectivo("");
      setPagoTransferencia("");
      setTransfEntidad("");
      setTransfReferencia("");
      setObservaciones("");
      setTimeout(() => router.push(`/clientes/${clienteId}/consultas`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  async function continuarComoCambio() {
    setError(null);
    if (!items.length || !pagosCubren) {
      setError("Primero completá los ítems y las formas de pago.");
      return;
    }
    setEnviando(true);
    try {
      // Primero se guarda la recepción como pendiente
      const pagos: Record<string, unknown>[] = [];
      if (pCredito > 0) pagos.push({ metodo: "credito", monto: pCredito });
      if (pEfectivo > 0) pagos.push({ metodo: "efectivo", monto: pEfectivo });
      if (pTransfer > 0) pagos.push({ metodo: "transferencia", monto: pTransfer });

      const rRec = await fetchWithSupabaseSession(
        `/api/clientes/${clienteId}/recepciones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              producto_id: i.producto_id,
              producto_nombre: i.producto_nombre,
              sku: i.sku,
              cantidad: i.cantidad,
              precio_compra_unitario: i.precio_compra_unitario,
              precio_venta_snapshot: i.precio_venta_snapshot,
            })),
            pagos,
            total_compra: totalCompra,
            observaciones: observaciones.trim() || null,
            ingresar_ahora: false,
          }),
        },
      );
      const jRec = await rRec.json();
      if (!rRec.ok || !jRec.success) throw new Error(jRec?.error ?? "Error al guardar la recepción");
      const recepcionId = jRec.data?.recepcion?.id;
      if (!recepcionId) throw new Error("No se pudo obtener el ID de la recepción.");

      // Ahora iniciamos el cambio
      const rCmb = await fetchWithSupabaseSession(
        `/api/clientes/${clienteId}/recepciones/${recepcionId}/continuar-como-cambio`,
        { method: "POST" },
      );
      const jCmb = await rCmb.json();
      if (!rCmb.ok || !jCmb.success) throw new Error(jCmb?.error ?? "Error al iniciar cambio");
      const url = jCmb.data?.cambio?.redirect_url;
      if (url) router.push(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  const nombreCliente =
    cliente?.empresa ?? cliente?.nombre_contacto ?? cliente?.nombre ?? "cliente";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Comprar prendas al cliente</h1>
          <p className="text-sm text-slate-600">
            Cliente: <strong>{nombreCliente}</strong>. Por cada categoría de precio ingresá
            cuántas prendas entran y a qué precio de compra por unidad.
          </p>
        </div>
        <Link
          href={`/clientes/${clienteId}`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          ← Volver al cliente
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {ok}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Categorías (cantidad + precio de compra por unidad)
        </p>
        {franjas.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay categorías cargadas. Andá a{" "}
            <Link href="/admin/franjas" className="text-[#3F8E91] underline">
              /admin/franjas
            </Link>{" "}
            para crearlas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">Categoría (precio venta)</th>
                  <th className="pb-2 pr-3 text-right">Cantidad</th>
                  <th className="pb-2 pr-3 text-right">Precio compra / u</th>
                  <th className="pb-2 pr-3 text-right">Subtotal compra</th>
                  <th className="pb-2 pr-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {franjas.map((f) => {
                  const st = lineas[f.id] ?? { cantidad: "", precio_compra: "" };
                  const cant = parseInt(st.cantidad, 10) || 0;
                  const pc = parseFloat(st.precio_compra) || 0;
                  const pv = Number(f.precio_venta) || 0;
                  const subtotal = cant * pc;
                  const margen =
                    pv > 0 && pc > 0 ? ((pv - pc) / pv) * 100 : null;
                  const margenBajo =
                    margen != null && margenMinimo != null && margen < margenMinimo;
                  return (
                    <tr
                      key={f.id}
                      className={`border-t border-slate-100 ${
                        cant > 0 ? "bg-emerald-50/30" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {f.nombre}
                        <div className="text-[11px] text-slate-500">
                          precio venta {formatGs(pv)} · stock {Number(f.stock_actual ?? 0)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={st.cantidad}
                          onChange={(e) => updLinea(f.id, { cantidad: e.target.value })}
                          placeholder="0"
                          className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={st.precio_compra}
                          onChange={(e) => updLinea(f.id, { precio_compra: e.target.value })}
                          placeholder="0"
                          className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700 font-semibold">
                        {cant > 0 && pc > 0 ? formatGs(subtotal) : "—"}
                      </td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${margenBajo ? "text-red-700 font-semibold" : "text-slate-600"}`}>
                        {margen != null ? `${margen.toFixed(1)}%` : "—"}
                        {margenBajo && (
                          <div className="text-[10px] text-red-500">
                            (mínimo esperado {margenMinimo}%)
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Formas de pago
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-[11px] font-medium text-slate-600">Crédito a favor</label>
            <input
              type="number"
              min={0}
              value={pagoCredito}
              onChange={(e) => setPagoCredito(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Efectivo</label>
            <input
              type="number"
              min={0}
              value={pagoEfectivo}
              onChange={(e) => setPagoEfectivo(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
            <p className="mt-1 text-[10px] text-slate-400">Genera egreso en la caja abierta.</p>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Transferencia</label>
            <input
              type="number"
              min={0}
              value={pagoTransferencia}
              onChange={(e) => setPagoTransferencia(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
          </div>
          {pTransfer > 0 && (
            <>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-600">Entidad / banco</label>
                <input
                  type="text"
                  value={transfEntidad}
                  onChange={(e) => setTransfEntidad(e.target.value)}
                  placeholder="Ej: Banco Itaú"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600">Referencia</label>
                <input
                  type="text"
                  value={transfReferencia}
                  onChange={(e) => setTransfReferencia(e.target.value)}
                  placeholder="Nro comprobante"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                />
              </div>
            </>
          )}
        </div>
        <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${pagosCubren ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          Total pagos: {formatGs(totalPagos)} · Total compra: {formatGs(totalCompra)} ·{" "}
          {pagosCubren ? "OK" : `diferencia ${formatGs(diferenciaPagos)}`}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Observaciones (opcional)
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Estado de las prendas, acuerdos, etc."
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        />
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="text-sm">
          <p className="text-slate-500">
            {totalPrendas} {totalPrendas === 1 ? "prenda" : "prendas"} · Valor venta potencial:{" "}
            {formatGs(valorVentaPotencial)}
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">
            Total compra: {formatGs(totalCompra)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={continuarComoCambio}
            disabled={!puedeEnviar}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-40"
          >
            Continuar como cambio
          </button>
          <button
            type="button"
            onClick={() => enviar(false)}
            disabled={!puedeEnviar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Guardar compra pendiente
          </button>
          <button
            type="button"
            onClick={() => enviar(true)}
            disabled={!puedeEnviar}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
          >
            {enviando ? "Guardando…" : "Guardar e ingresar ahora"}
          </button>
        </div>
      </div>
    </div>
  );
}
