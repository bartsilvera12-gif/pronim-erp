"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Dashboard simple para usuarios de sucursal (no admin). Muestra solo los
 * datos de la propia sucursal: ventas del día, del mes, últimas ventas y
 * clientes atendidos. Deliberadamente reducido — sin gráficos multi-sucursal,
 * sin cobranzas globales, sin inventario cruzado.
 */

type Data = {
  sucursal: { id: string; nombre: string | null };
  ventas: {
    total_hoy: number; count_hoy: number;
    total_mes: number; count_mes: number;
    total_mes_prev: number; count_mes_prev: number;
    ultimas: {
      id: string; fecha: string; total: number;
      numero_control: string | null; cliente_nombre: string | null;
    }[];
  };
  clientes: {
    total_atendidos: number;
    recientes: {
      id: string; nombre: string;
      telefono: string | null;
      ultima_fecha: string; total_gastado: number;
    }[];
  };
};

function fmtGs(n: number): string {
  return "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
}
function fmtFechaHora(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return iso; }
}
function fmtFecha(iso: string): string {
  try { return new Date(iso).toLocaleDateString("es-PY"); } catch { return iso; }
}

export default function DashboardSucursalSimple() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchWithSupabaseSession("/api/dashboard/sucursal-simple", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setData(j.data as Data);
      })
      .catch((e) => { if (!cancel) setErr(e instanceof Error ? e.message : "Error"); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const diffMesPct = data && data.ventas.total_mes_prev > 0
    ? Math.round(((data.ventas.total_mes - data.ventas.total_mes_prev) / data.ventas.total_mes_prev) * 1000) / 10
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Panel de sucursal</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.sucursal.nombre
              ? <>Datos de <strong>{data.sucursal.nombre}</strong>. Actualizado ahora.</>
              : "Datos de tu sucursal."}
          </p>
        </header>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {loading && !data && <p className="py-10 text-center text-sm text-slate-400 animate-pulse">Cargando…</p>}

        {data && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Ventas de hoy" value={fmtGs(data.ventas.total_hoy)} sub={`${data.ventas.count_hoy} operación(es)`} tone="emerald" />
              <KpiCard label="Ventas del mes" value={fmtGs(data.ventas.total_mes)}
                sub={diffMesPct != null
                  ? (diffMesPct >= 0 ? `↑ ${diffMesPct}% vs mes pasado` : `↓ ${Math.abs(diffMesPct)}% vs mes pasado`)
                  : `${data.ventas.count_mes} operación(es)`}
                tone="sky" />
              <KpiCard label="Operaciones del mes" value={String(data.ventas.count_mes)} sub={`mes pasado: ${data.ventas.count_mes_prev}`} tone="slate" />
              <KpiCard label="Clientes atendidos" value={String(data.clientes.total_atendidos)} sub="acumulado" tone="fuchsia" />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Últimas ventas */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                  <h2 className="text-sm font-bold text-slate-800">Últimas ventas</h2>
                  <Link href="/ventas" className="text-xs text-[#4FAEB2] hover:underline">Ver todas →</Link>
                </header>
                {data.ventas.ultimas.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">Sin ventas todavía.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.ventas.ultimas.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {v.cliente_nombre ?? "Consumidor final"}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {v.numero_control && <>{v.numero_control} · </>}
                            {fmtFechaHora(v.fecha)}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">{fmtGs(v.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Clientes recientes */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                  <h2 className="text-sm font-bold text-slate-800">Clientes atendidos recientemente</h2>
                  <Link href="/clientes" className="text-xs text-[#4FAEB2] hover:underline">Ver todos →</Link>
                </header>
                {data.clientes.recientes.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">Sin clientes atendidos todavía.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.clientes.recientes.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <Link href={`/clientes/${c.id}`} className="text-sm font-medium text-slate-800 truncate hover:underline">
                            {c.nombre}
                          </Link>
                          <p className="text-[11px] text-slate-500">
                            {c.telefono && <>Tel {c.telefono} · </>}
                            última compra {fmtFecha(c.ultima_fecha)}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 tabular-nums shrink-0">{fmtGs(c.total_gastado)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Accesos rápidos</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <QuickLink href="/atencion/nueva" label="Nueva atención" />
                <QuickLink href="/ventas/nueva" label="Nueva venta" />
                <QuickLink href="/clientes" label="Clientes" />
                <QuickLink href="/atencion/pendientes-ingreso" label="Recepciones pendientes" />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string;
  tone?: "emerald" | "sky" | "slate" | "fuchsia";
}) {
  const toneClasses: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50/60",
    sky: "border-sky-200 bg-sky-50/60",
    slate: "border-slate-200 bg-white",
    fuchsia: "border-fuchsia-200 bg-fuchsia-50/60",
  };
  const cls = toneClasses[tone ?? "slate"];
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:border-[#4FAEB2] hover:text-[#3F8E91] transition"
    >
      {label}
    </Link>
  );
}
