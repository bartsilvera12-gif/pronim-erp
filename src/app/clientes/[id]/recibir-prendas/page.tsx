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

type Cliente = { id: string; nombre?: string | null; razon_social?: string | null; ruc?: string | null };

export default function RecibirPrendasPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clienteId = params?.id ?? "";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
    return () => {
      cancel = true;
    };
  }, [clienteId]);

  const franjas = useMemo(
    () =>
      productos
        .filter((p) => p.es_franja_precio === true && p.activo !== false)
        .sort((a, b) => (a.precio_venta ?? 0) - (b.precio_venta ?? 0)),
    [productos],
  );

  const items = useMemo(() => {
    const out = franjas
      .map((f) => {
        const q = parseInt(cantidades[f.id] ?? "", 10) || 0;
        const precio = Number(f.precio_venta) || 0;
        return {
          producto_id: f.id,
          producto_nombre: f.nombre,
          sku: f.sku,
          cantidad: q,
          precio_unitario: precio,
          subtotal: q * precio,
        };
      })
      .filter((i) => i.cantidad > 0);
    return out;
  }, [franjas, cantidades]);

  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const totalPrendas = items.reduce((s, i) => s + i.cantidad, 0);
  const puedeEnviar = items.length > 0 && !enviando;

  async function enviar() {
    setError(null);
    setOk(null);
    if (!items.length) {
      setError("Cargá al menos una categoría con cantidad > 0.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetchWithSupabaseSession(
        `/api/clientes/${clienteId}/recepciones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            total_credito: total,
            observaciones: observaciones.trim() || null,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      setOk(
        `Recepción ${j.data?.recepcion?.numero_control ?? ""} registrada. Crédito generado: ${formatGs(
          Number(j.data?.recepcion?.total_credito ?? total),
        )}.`,
      );
      setCantidades({});
      setObservaciones("");
      setTimeout(() => router.push(`/clientes/${clienteId}?tab=consultas`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  const nombreCliente = cliente?.razon_social ?? cliente?.nombre ?? "cliente";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recibir prendas</h1>
          <p className="text-sm text-slate-600">
            Cliente: <strong>{nombreCliente}</strong>. Indicá cuántas prendas entra por cada categoría de precio.
            El crédito a favor se genera automáticamente.
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
          Cargá cantidad por categoría
        </p>
        {franjas.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay categorías cargadas. Andá a{" "}
            <Link href="/admin/categorias" className="text-[#3F8E91] underline">
              /admin/categorias
            </Link>{" "}
            para sembrar el catálogo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {franjas.map((f) => {
              const cant = parseInt(cantidades[f.id] ?? "", 10) || 0;
              const subtotal = cant * (Number(f.precio_venta) || 0);
              return (
                <div
                  key={f.id}
                  className={`flex flex-col rounded-xl border p-3 transition-colors ${
                    cant > 0
                      ? "border-emerald-400 bg-emerald-50/60"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold tabular-nums text-slate-900">
                      {formatGs(Number(f.precio_venta) || 0)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      stock {Number(f.stock_actual ?? 0)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCantidades((prev) => ({
                          ...prev,
                          [f.id]: String(Math.max(0, cant - 1)),
                        }))
                      }
                      className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-semibold text-slate-600 hover:bg-slate-50 active:scale-95"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={cantidades[f.id] ?? ""}
                      onChange={(e) =>
                        setCantidades((prev) => ({ ...prev, [f.id]: e.target.value }))
                      }
                      placeholder="0"
                      className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-center text-base font-semibold tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCantidades((prev) => ({ ...prev, [f.id]: String(cant + 1) }))
                      }
                      className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-semibold text-slate-600 hover:bg-slate-50 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                  <div
                    className={`mt-2 text-right text-xs tabular-nums ${
                      cant > 0 ? "text-emerald-700 font-semibold" : "text-slate-400"
                    }`}
                  >
                    {cant > 0 ? formatGs(subtotal) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Observaciones (opcional)
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Detalles del estado de las prendas, acuerdos, etc."
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        />
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="text-sm">
          <p className="text-slate-500">
            {totalPrendas} {totalPrendas === 1 ? "prenda" : "prendas"} · Crédito a generar:
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">
            {formatGs(total)}
          </p>
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={!puedeEnviar}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
        >
          {enviando ? "Registrando…" : "Confirmar recepción"}
        </button>
      </div>
    </div>
  );
}
