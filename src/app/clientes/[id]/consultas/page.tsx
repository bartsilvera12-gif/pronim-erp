"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

function formatGs(n: number): string {
  return "Gs. " + Math.round(n).toLocaleString("es-PY").replace(/,/g, ".");
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type KPIs = {
  saldo_credito: number;
  ultima_compra_fecha: string | null;
  dias_desde_ultima_compra: number | null;
  compras_ultimos_90d: number;
  total_comprado_historico: number;
  total_consignado_historico: number;
  cadencia_dias: number | null;
  facturas_pendientes: number;
  monto_pendiente: number;
};

type TimelineEvent = {
  tipo: "venta" | "pago" | "recepcion" | "credito_uso" | "credito_entrada" | "nota_credito" | "nota";
  fecha: string;
  monto: number | null;
  referencia: string | null;
  detalle: string | null;
};

type Nota = {
  id: string;
  autor_id: string | null;
  autor_nombre: string | null;
  texto: string;
  created_at: string;
};

const TIPO_LABEL: Record<TimelineEvent["tipo"], { label: string; color: string }> = {
  venta: { label: "Venta", color: "bg-sky-100 text-sky-700" },
  pago: { label: "Pago", color: "bg-emerald-100 text-emerald-700" },
  recepcion: { label: "Recepción de prendas", color: "bg-amber-100 text-amber-700" },
  credito_uso: { label: "Uso de crédito", color: "bg-purple-100 text-purple-700" },
  credito_entrada: { label: "Ingreso de crédito", color: "bg-emerald-100 text-emerald-700" },
  nota_credito: { label: "Nota crédito", color: "bg-rose-100 text-rose-700" },
  nota: { label: "Nota", color: "bg-slate-100 text-slate-600" },
};

export default function ConsultasClientePage() {
  const params = useParams<{ id: string }>();
  const clienteId = params?.id ?? "";

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [nuevaNota, setNuevaNota] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posteandoNota, setPosteandoNota] = useState(false);
  const [miUserId, setMiUserId] = useState<string | null>(null);
  const [soySuperAdmin, setSoySuperAdmin] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [rConsultas, rNotas, rRol] = await Promise.all([
        fetchWithSupabaseSession(`/api/clientes/${clienteId}/consultas`, { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/clientes/${clienteId}/notas`, { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/me/rol`, { cache: "no-store" }),
      ]);
      const jc = await rConsultas.json();
      if (!rConsultas.ok || !jc.success) throw new Error(jc?.error ?? "Error consultas");
      setKpis(jc.data.kpis);
      setTimeline(jc.data.timeline ?? []);
      const jn = await rNotas.json();
      if (rNotas.ok && jn.success) setNotas(jn.data.notas ?? []);
      const jr = await rRol.json();
      if (rRol.ok && jr.success) setSoySuperAdmin(jr.data.isSuperAdmin === true);

      // usuario actual (para saber quién puede borrar sus notas)
      const rMe = await fetchWithSupabaseSession(`/api/usuarios/me`, { cache: "no-store" });
      if (rMe.ok) {
        const jm = await rMe.json();
        // el endpoint /api/usuarios/me tiene forma distinta según deploy — probamos ambos
        const uid =
          jm?.usuario?.auth_user_id ??
          jm?.data?.usuario?.auth_user_id ??
          jm?.usuario?.id ??
          null;
        setMiUserId(uid ? String(uid) : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function agregarNota() {
    const texto = nuevaNota.trim();
    if (!texto) return;
    setPosteandoNota(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      setNuevaNota("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setPosteandoNota(false);
    }
  }

  async function borrarNota(id: string) {
    if (!window.confirm("¿Eliminar esta nota?")) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/notas/${id}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Cargando consultas…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Consultas del cliente</h1>
          <p className="text-sm text-slate-600">
            Vista consolidada: crédito, historial, frecuencia, anotaciones y beneficios.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clientes/${clienteId}/recibir-prendas`}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            + Recibir prendas
          </Link>
          <Link
            href={`/clientes/${clienteId}`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ← Ficha del cliente
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {kpis && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Saldo a favor"
            value={formatGs(kpis.saldo_credito)}
            hint="crédito disponible"
            highlight={kpis.saldo_credito > 0}
          />
          <KpiCard
            label="Última compra"
            value={
              kpis.dias_desde_ultima_compra != null
                ? `hace ${kpis.dias_desde_ultima_compra}d`
                : "sin compras"
            }
            hint={kpis.ultima_compra_fecha ? formatFecha(kpis.ultima_compra_fecha) : "—"}
          />
          <KpiCard
            label="Compras 90 días"
            value={String(kpis.compras_ultimos_90d)}
            hint={
              kpis.cadencia_dias
                ? `cada ~${Math.round(kpis.cadencia_dias)}d`
                : "sin cadencia calculada"
            }
          />
          <KpiCard
            label="Facturas pendientes"
            value={String(kpis.facturas_pendientes)}
            hint={
              kpis.monto_pendiente > 0
                ? `${formatGs(kpis.monto_pendiente)} deuda`
                : "al día"
            }
            highlight={kpis.facturas_pendientes > 0}
            danger={kpis.facturas_pendientes > 0}
          />
          <KpiCard
            label="Total comprado histórico"
            value={formatGs(kpis.total_comprado_historico)}
            hint="acumulado"
          />
          <KpiCard
            label="Total consignado histórico"
            value={formatGs(kpis.total_consignado_historico)}
            hint="prendas entregadas"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Historial
          </h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay movimientos.</p>
          ) : (
            <ul className="space-y-2">
              {timeline.map((e, idx) => {
                const t = TIPO_LABEL[e.tipo] ?? { label: e.tipo, color: "bg-slate-100 text-slate-600" };
                return (
                  <li
                    key={idx}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.color}`}>
                          {t.label}
                        </span>
                        {e.referencia && (
                          <span className="text-xs text-slate-500 font-mono">{e.referencia}</span>
                        )}
                        <span className="text-xs text-slate-400">{formatFecha(e.fecha)}</span>
                      </div>
                      {e.detalle && (
                        <p className="mt-1 truncate text-xs text-slate-600">{e.detalle}</p>
                      )}
                    </div>
                    {e.monto != null && (
                      <div
                        className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
                          e.tipo === "recepcion" || e.tipo === "credito_entrada"
                            ? "text-emerald-700"
                            : e.tipo === "credito_uso"
                            ? "text-purple-700"
                            : "text-slate-800"
                        }`}
                      >
                        {formatGs(e.monto)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Anotaciones del equipo
          </h2>
          <div className="space-y-2">
            <textarea
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              rows={3}
              placeholder="Escribí una nota sobre este cliente…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
            <button
              type="button"
              onClick={agregarNota}
              disabled={posteandoNota || !nuevaNota.trim()}
              className="w-full rounded-lg bg-[#4FAEB2] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40"
            >
              {posteandoNota ? "Guardando…" : "Agregar nota"}
            </button>
          </div>

          <ul className="mt-4 space-y-2">
            {notas.length === 0 ? (
              <li className="text-xs text-slate-400">Sin anotaciones.</li>
            ) : (
              notas.map((n) => {
                const puedoBorrar = soySuperAdmin || (miUserId && n.autor_id === miUserId);
                return (
                  <li
                    key={n.id}
                    className="rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {n.autor_nombre ?? "Equipo"}
                      </span>
                      <span>{formatFecha(n.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.texto}</p>
                    {puedoBorrar && (
                      <button
                        type="button"
                        onClick={() => borrarNota(n.id)}
                        className="mt-1 text-[11px] text-red-500 hover:text-red-700 hover:underline"
                      >
                        Eliminar
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        danger
          ? "border-red-200 bg-red-50"
          : highlight
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          danger ? "text-red-700" : highlight ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
