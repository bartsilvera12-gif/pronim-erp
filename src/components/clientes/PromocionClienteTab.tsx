"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Promoción exclusiva del cliente.
 *
 * Es UNA sola: asignar otra reemplaza la anterior. La promo se elige del
 * catálogo que se arma en Administración → Promociones, así que acá no se
 * inventan descuentos sueltos: se decide a quién y hasta cuándo.
 */

type PromoCatalogo = {
  id: string;
  nombre: string;
  tipo: string;
  valor: number | string;
  ambito?: string | null;
  activo?: boolean;
};

type PromoAsignada = {
  id: string;
  nombre: string;
  tipo: string;
  valor: number;
  cupon_codigo: string | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  asignada_at: string;
  usos: number;
  primera_uso_at: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  descuento_pct: "Descuento %",
  descuento_fijo: "Descuento fijo",
  lleve_n_pague_m: "Lleve N pague M",
  cashback: "Cashback",
};

function describirPromo(tipo: string, valor: number): string {
  if (tipo === "descuento_pct") return `${valor}% de descuento`;
  if (tipo === "cashback") return `${valor}% de cashback`;
  if (tipo === "descuento_fijo") return `Gs. ${Math.round(valor).toLocaleString("es-PY")} de descuento`;
  return TIPO_LABEL[tipo] ?? tipo;
}

function fechaCorta(v: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PromocionClienteTab({ clienteId }: { clienteId: string }) {
  const [asignada, setAsignada] = useState<PromoAsignada | null>(null);
  const [catalogo, setCatalogo] = useState<PromoCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [baseId, setBaseId] = useState("");
  const [desde, setDesde] = useState(hoyISO);
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rA, rC] = await Promise.all([
        fetchWithSupabaseSession(`/api/clientes/${clienteId}/promocion`, { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/promociones?solo_activas=1`, { cache: "no-store" }),
      ]);
      const jA = await rA.json().catch(() => ({}));
      const jC = await rC.json().catch(() => ({}));
      setAsignada((jA?.data?.promocion ?? null) as PromoAsignada | null);
      const todas = (jC?.data?.promociones ?? jC?.data ?? []) as PromoCatalogo[];
      // Las que ya son exclusivas de alguien no sirven como plantilla.
      setCatalogo(Array.isArray(todas) ? todas.filter((p) => (p.ambito ?? "general") !== "cliente") : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [clienteId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function asignar(e: React.FormEvent) {
    e.preventDefault();
    if (!baseId) { setError("Elegí qué promoción asignarle."); return; }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/promocion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promocion_base_id: baseId,
          fecha_desde: desde || null,
          fecha_hasta: hasta || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.success) { setError(j?.error ?? "No se pudo asignar."); return; }
      setBaseId("");
      setHasta("");
      setOk("Promoción asignada.");
      setTimeout(() => setOk(null), 3000);
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    if (!window.confirm(
      "¿Quitarle la promoción a este cliente?\n\n" +
      "Deja de aplicarse en la próxima venta. Si ya la usó, ese uso queda registrado.",
    )) return;
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/promocion`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!j?.success) { setError(j?.error ?? "No se pudo quitar."); return; }
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }

  const vencida = Boolean(asignada?.fecha_hasta && asignada.fecha_hasta < hoyISO());

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {ok && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</p>
      )}

      {cargando ? (
        <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
      ) : asignada ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Promoción asignada
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">{asignada.nombre}</p>
              <p className="text-sm text-[#3F8E91]">{describirPromo(asignada.tipo, asignada.valor)}</p>
            </div>
            <div className="flex items-center gap-2">
              {asignada.usos > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  YA USADA
                </span>
              ) : vencida ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  VENCIDA
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  SIN USAR
                </span>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-slate-400">Asignada</dt>
              <dd className="text-slate-700">{fechaCorta(asignada.asignada_at)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Válida</dt>
              <dd className="text-slate-700">
                {fechaCorta(asignada.fecha_desde)} → {fechaCorta(asignada.fecha_hasta)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Utilizada</dt>
              <dd className="text-slate-700">
                {asignada.primera_uso_at ? fechaCorta(asignada.primera_uso_at) : "Todavía no"}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={quitar}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-red-200 hover:text-red-600"
            >
              Quitar promoción
            </button>
          </div>

          <p className="mt-3 text-[11px] text-slate-400">
            Para cambiarla, asigná otra abajo: reemplaza a esta.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Este cliente no tiene ninguna promoción asignada.
        </p>
      )}

      {/* Asignar / reemplazar */}
      <form onSubmit={asignar} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">
          {asignada ? "Cambiar la promoción" : "Asignar una promoción"}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Es una sola por cliente. Se aplica en el POS al cobrarle.
        </p>

        {catalogo.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Todavía no hay promociones creadas.{" "}
            <Link href="/admin/promociones" className="font-medium text-[#3F8E91] underline">
              Crear una
            </Link>
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Promoción
                </label>
                <select
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                >
                  <option value="">Elegí una…</option>
                  {catalogo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {describirPromo(p.tipo, Number(p.valor) || 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Válida desde
                </label>
                <input
                  type="date"
                  value={desde}
                  max={hasta || undefined}
                  onChange={(e) => setDesde(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Hasta
                </label>
                <input
                  type="date"
                  value={hasta}
                  min={desde || undefined}
                  onChange={(e) => setHasta(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                />
                <p className="mt-1 text-[11px] text-slate-400">Vacío = sin vencimiento.</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={guardando || !baseId}
                className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {guardando ? "Asignando…" : asignada ? "Reemplazar" : "Asignar"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
