"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { useT, useMoney } from "@/lib/i18n/context";

/**
 * Dashboard simple para usuarios de sucursal (no admin). Muestra solo los
 * datos de la propia sucursal: ventas del día, del mes, últimas ventas y
 * clientes atendidos. Deliberadamente reducido — sin gráficos multi-sucursal,
 * sin cobranzas globales, sin inventario cruzado.
 */

type Data = {
  sucursal: { id: string; nombre: string | null };
  compras?: {
    total_hoy: number; total_mes: number;
    count_hoy: number; count_mes: number;
  };
  ventas: {
    total_hoy: number; count_hoy: number;
    total_mes: number; count_mes: number;
    total_mes_prev: number; count_mes_prev: number;
    // Comparativas temporales (tanda 16)
    total_ayer?: number;
    total_mismo_dia_sem_pasada?: number;
    total_mes_prev_hasta_hoy?: number;
    total_ultimos_7?: number;
    ticket_prom_mes?: number;
    ticket_prom_mes_prev?: number;
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

function fmtFechaHora(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return iso; }
}
function fmtFecha(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleDateString(locale); } catch { return iso; }
}

type MetaSuc = {
  meta_diaria: number;
  meta_semanal: number;
  vendido_hoy: number;
  vendido_semana: number;
  pct_dia: number;
  pct_semana: number;
  falta_hoy: number;
  falta_semana: number;
  // Fase 2 tanda 7: proyección de cierre + ritmo del mes
  meta_mensual?: number;
  vendido_mes?: number;
  pct_mes?: number;
  falta_mes?: number;
  proyeccion_cierre_mes?: number;
  necesario_por_dia_mes?: number;
  promedio_diario_actual?: number;
  dias_restantes_mes?: number;
  ritmo?: "encima" | "dentro" | "debajo" | "sin_meta";
  comision_estimada?: number;
  comision_pct_actual?: number;
  ticket_promedio_mes?: number;
};

export default function DashboardSucursalSimple() {
  const t = useT();
  const money = useMoney();
  const locale = money.moneda === "BRL" ? "pt-BR" : "es-PY";
  const fmtGs = (n: number) => money.format(n || 0);
  const [data, setData] = useState<Data | null>(null);
  const [meta, setMeta] = useState<MetaSuc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([
      fetchWithSupabaseSession("/api/dashboard/sucursal-simple", { cache: "no-store" }).then((r) => r.json()),
      fetchWithSupabaseSession("/api/metas", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([jDash, jMetas]) => {
        if (cancel) return;
        if (!jDash?.success) throw new Error(jDash?.error ?? "Error");
        setData(jDash.data as Data);
        // /api/metas devuelve un array; con auth.sucursal_id ya viene filtrado
        // a la sucursal del usuario, así que tomamos la primera fila.
        // Siempre mostrar el bloque de meta — incluso si el endpoint
        // devolvió warning (tabla metas_sucursal ausente) o la sucursal no
        // tiene meta configurada. En esos casos mostramos un CTA al admin.
        const first = jMetas?.data?.metas?.[0];
        setMeta({
          meta_diaria: Number(first?.meta_diaria) || 0,
          meta_semanal: Number(first?.meta_semanal) || 0,
          vendido_hoy: Number(first?.vendido_hoy) || 0,
          vendido_semana: Number(first?.vendido_semana) || 0,
          pct_dia: Number(first?.pct_dia) || 0,
          pct_semana: Number(first?.pct_semana) || 0,
          falta_hoy: Number(first?.falta_hoy) || 0,
          falta_semana: Number(first?.falta_semana) || 0,
          meta_mensual: Number(first?.meta_mensual) || 0,
          vendido_mes: Number(first?.vendido_mes) || 0,
          pct_mes: Number(first?.pct_mes) || 0,
          falta_mes: Number(first?.falta_mes) || 0,
          proyeccion_cierre_mes: Number(first?.proyeccion_cierre_mes) || 0,
          necesario_por_dia_mes: Number(first?.necesario_por_dia_mes) || 0,
          promedio_diario_actual: Number(first?.promedio_diario_actual) || 0,
          dias_restantes_mes: Number(first?.dias_restantes_mes) || 0,
          ritmo: (first?.ritmo as MetaSuc["ritmo"]) ?? "sin_meta",
          comision_estimada: Number(first?.comision_estimada) || 0,
          comision_pct_actual: Number(first?.comision_pct_actual) || 0,
          ticket_promedio_mes: Number(first?.ticket_promedio_mes) || 0,
        });
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
          <h1 className="text-2xl font-bold text-slate-900">{t("Dashboard")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.sucursal.nombre
              ? <>{t("Datos de")} <strong>{data.sucursal.nombre}</strong>.</>
              : t("Datos de tu sucursal.")}
          </p>
        </header>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {loading && !data && <p className="py-10 text-center text-sm text-slate-400 animate-pulse">{t("Cargando…")}</p>}

        {data && (
          <>
            {meta && (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                <h2 className="text-sm font-bold text-slate-800">{t("Meta de la sucursal")}</h2>
                {meta.meta_diaria > 0 ? (
                  <>
                    <MetaBar
                      label={t("Hoy")}
                      vendido={meta.vendido_hoy}
                      objetivo={meta.meta_diaria}
                      falta={meta.falta_hoy}
                      pct={meta.pct_dia}
                      fmt={fmtGs}
                      t={t}
                    />
                    <MetaBar
                      label={t("Esta semana")}
                      vendido={meta.vendido_semana}
                      objetivo={meta.meta_semanal}
                      falta={meta.falta_semana}
                      pct={meta.pct_semana}
                      fmt={fmtGs}
                      t={t}
                    />
                    {(meta.meta_mensual ?? 0) > 0 && (
                      <MetaBar
                        label={t("Este mes")}
                        vendido={meta.vendido_mes ?? 0}
                        objetivo={meta.meta_mensual ?? 0}
                        falta={meta.falta_mes ?? 0}
                        pct={meta.pct_mes ?? 0}
                        fmt={fmtGs}
                        t={t}
                      />
                    )}
                    {/* Proyección de cierre + ritmo (Tanda 7) */}
                    {(meta.meta_mensual ?? 0) > 0 && (
                      <ProyeccionCierre meta={meta} fmt={fmtGs} t={t} />
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    {t("Aún no hay una meta configurada para esta sucursal. Pedile al administrador que la fije en /admin/metas.")}
                  </div>
                )}
              </section>
            )}
            {/* KPIs principales: Ventas / Compras / Resultado líquido / Meta % — todos clicables */}
            {(() => {
              const comprasHoy = data.compras?.total_hoy ?? 0;
              const comprasMes = data.compras?.total_mes ?? 0;
              const liquidoHoy = data.ventas.total_hoy - comprasHoy;
              const liquidoMes = data.ventas.total_mes - comprasMes;
              const metaPctDia = meta?.pct_dia ?? null;
              return (
                <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard
                    href="/ventas?segmento=hoy"
                    label={t("Ventas de hoy")}
                    value={fmtGs(data.ventas.total_hoy)}
                    sub={`${data.ventas.count_hoy} ${t("operación(es)")}`}
                    tone="emerald"
                  />
                  <KpiCard
                    href="/compras"
                    label={t("Compras de hoy")}
                    value={fmtGs(comprasHoy)}
                    sub={`${data.compras?.count_hoy ?? 0} ${t("operación(es)")}`}
                    tone="amber"
                  />
                  <KpiCard
                    label={t("Resultado líquido hoy")}
                    value={fmtGs(liquidoHoy)}
                    sub={`${t("Mes")}: ${fmtGs(liquidoMes)}`}
                    tone={liquidoHoy >= 0 ? "sky" : "rose"}
                  />
                  <KpiCard
                    label={t("Meta del día")}
                    value={metaPctDia != null && (meta?.meta_diaria ?? 0) > 0 ? `${metaPctDia}%` : "—"}
                    sub={meta && meta.meta_diaria > 0 ? `${fmtGs(meta.vendido_hoy)} / ${fmtGs(meta.meta_diaria)}` : t("sin meta")}
                    tone="fuchsia"
                  />
                </section>
              );
            })()}

            {/* KPIs secundarios: mes / operaciones / clientes atendidos */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                href="/ventas?segmento=mes"
                label={t("Ventas del mes")}
                value={fmtGs(data.ventas.total_mes)}
                sub={diffMesPct != null
                  ? (diffMesPct >= 0 ? `↑ ${diffMesPct}% ${t("vs mes pasado")}` : `↓ ${Math.abs(diffMesPct)}% ${t("vs mes pasado")}`)
                  : `${data.ventas.count_mes} ${t("operación(es)")}`}
                tone="sky"
              />
              <KpiCard
                href="/compras"
                label={t("Compras del mes")}
                value={fmtGs(data.compras?.total_mes ?? 0)}
                sub={`${data.compras?.count_mes ?? 0} ${t("operación(es)")}`}
                tone="slate"
              />
              <KpiCard
                href="/ventas"
                label={t("Operaciones del mes")}
                value={String(data.ventas.count_mes)}
                sub={`${t("mes pasado")}: ${data.ventas.count_mes_prev}`}
                tone="slate"
              />
              <KpiCard
                href="/clientes"
                label={t("Clientes atendidos")}
                value={String(data.clientes.total_atendidos)}
                sub={t("acumulado")}
                tone="fuchsia"
              />
            </section>

            {/* Panel de comparativas + interpretación (Tanda 16) */}
            <ComparativasPanel data={data} fmt={fmtGs} t={t} />

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Últimas ventas */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                  <h2 className="text-sm font-bold text-slate-800">{t("Últimas ventas")}</h2>
                  <Link href="/ventas" className="text-xs text-[#4FAEB2] hover:underline">{t("Ver todas")} →</Link>
                </header>
                {data.ventas.ultimas.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">{t("Sin ventas todavía.")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.ventas.ultimas.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {v.cliente_nombre ?? t("Consumidor final")}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {v.numero_control && <>{v.numero_control} · </>}
                            {fmtFechaHora(v.fecha, locale)}
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
                  <h2 className="text-sm font-bold text-slate-800">{t("Clientes atendidos recientemente")}</h2>
                  <Link href="/clientes" className="text-xs text-[#4FAEB2] hover:underline">{t("Ver todos")} →</Link>
                </header>
                {data.clientes.recientes.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">{t("Sin clientes atendidos todavía.")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.clientes.recientes.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <Link href={`/clientes/${c.id}`} className="text-sm font-medium text-slate-800 truncate hover:underline">
                            {c.nombre}
                          </Link>
                          <p className="text-[11px] text-slate-500">
                            {c.telefono && <>{t("Tel")} {c.telefono} · </>}
                            {t("última compra")} {fmtFecha(c.ultima_fecha, locale)}
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
              <h2 className="text-sm font-bold text-slate-800 mb-2">{t("Accesos rápidos")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <QuickLink href="/atencion/nueva" label={t("Nueva atención")} />
                <QuickLink href="/ventas/nueva" label={t("Nueva venta")} />
                <QuickLink href="/clientes" label={t("Clientes")} />
                <QuickLink href="/atencion/pendientes-ingreso" label={t("Recepciones pendientes")} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, tone, href }: {
  label: string; value: string; sub?: string;
  tone?: "emerald" | "sky" | "slate" | "fuchsia" | "amber" | "rose";
  href?: string;
}) {
  const toneClasses: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50/60",
    sky: "border-sky-200 bg-sky-50/60",
    slate: "border-slate-200 bg-white",
    fuchsia: "border-fuchsia-200 bg-fuchsia-50/60",
    amber: "border-amber-200 bg-amber-50/60",
    rose: "border-rose-200 bg-rose-50/60",
  };
  const cls = toneClasses[tone ?? "slate"];
  const body = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`relative rounded-xl border p-3 shadow-sm ${cls} block transition hover:shadow-md hover:-translate-y-0.5 hover:border-[#4FAEB2] group`}
        title="Ver detalle"
      >
        {body}
        <span aria-hidden className="absolute bottom-1.5 right-2 text-[#4FAEB2] opacity-40 group-hover:opacity-100 transition-opacity text-xs">→</span>
      </Link>
    );
  }
  return <div className={`rounded-xl border p-3 shadow-sm ${cls}`}>{body}</div>;
}

function MetaBar({
  label, vendido, objetivo, falta, pct, fmt, t,
}: {
  label: string; vendido: number; objetivo: number; falta: number; pct: number;
  fmt: (n: number) => string;
  t: (k: string) => string;
}) {
  const alcanzado = falta <= 0 && objetivo > 0;
  const pctClamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${alcanzado ? "text-emerald-700" : "text-slate-700"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${alcanzado ? "bg-emerald-500" : "bg-[#4FAEB2]"}`}
          style={{ width: `${pctClamped}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>{fmt(vendido)} <span className="text-slate-400">/ {fmt(objetivo)}</span></span>
        {alcanzado ? (
          <span className="font-semibold text-emerald-700">✓ {t("¡Meta alcanzada!")}</span>
        ) : (
          <span>{t("faltan")} <strong className="text-slate-700">{fmt(falta)}</strong></span>
        )}
      </div>
    </div>
  );
}

function ProyeccionCierre({ meta, fmt, t }: {
  meta: MetaSuc;
  fmt: (n: number) => string;
  t: (k: string) => string;
}) {
  const ritmo = meta.ritmo ?? "sin_meta";
  const tone = ritmo === "encima" ? "emerald" : ritmo === "dentro" ? "sky" : ritmo === "debajo" ? "rose" : "slate";
  const bg = tone === "emerald" ? "border-emerald-200 bg-emerald-50/60"
    : tone === "sky" ? "border-sky-200 bg-sky-50/60"
    : tone === "rose" ? "border-rose-200 bg-rose-50/60"
    : "border-slate-200 bg-slate-50/60";
  const label = ritmo === "encima" ? t("🚀 Por encima del ritmo")
    : ritmo === "dentro" ? t("✓ Dentro del ritmo")
    : ritmo === "debajo" ? t("⚠️ Por debajo del ritmo")
    : t("Sin meta configurada");
  const proyMayor = (meta.proyeccion_cierre_mes ?? 0) >= (meta.meta_mensual ?? 0);
  return (
    <div className={`rounded-lg border ${bg} p-3 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase font-semibold text-slate-600">{t("Proyección de cierre")}</p>
        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div>
          <p className="text-slate-500">{t("Ritmo actual")}</p>
          <p className="font-bold text-slate-800 tabular-nums">{fmt(meta.promedio_diario_actual ?? 0)}/d</p>
        </div>
        <div>
          <p className="text-slate-500">{t("Necesario/día")}</p>
          <p className="font-bold text-slate-800 tabular-nums">{fmt(meta.necesario_por_dia_mes ?? 0)}</p>
        </div>
        <div>
          <p className="text-slate-500">{t("Cierre proyectado")}</p>
          <p className={`font-bold tabular-nums ${proyMayor ? "text-emerald-700" : "text-slate-800"}`}>{fmt(meta.proyeccion_cierre_mes ?? 0)}</p>
        </div>
        <div>
          <p className="text-slate-500">{t("Comisión estimada")}</p>
          <p className="font-bold text-slate-800 tabular-nums">
            {fmt(meta.comision_estimada ?? 0)}
            <span className="text-[10px] text-slate-500 font-normal ml-1">({(meta.comision_pct_actual ?? 0).toFixed(2)}%)</span>
          </p>
        </div>
      </div>
      {(meta.dias_restantes_mes ?? 0) > 0 && (
        <p className="text-[11px] text-slate-500">
          {t("Quedan")} <strong className="text-slate-700">{meta.dias_restantes_mes}</strong> {t("días este mes")}.
          {ritmo === "debajo" && (meta.necesario_por_dia_mes ?? 0) > 0 && (
            <> {t("Necesitás vender")} <strong className="text-rose-700">{fmt(meta.necesario_por_dia_mes ?? 0)}</strong> {t("por día para llegar")}.</>
          )}
          {ritmo === "encima" && (
            <> {t("Manteniendo este ritmo cerrás en")} <strong className="text-emerald-700">{fmt(meta.proyeccion_cierre_mes ?? 0)}</strong>.</>
          )}
        </p>
      )}
    </div>
  );
}

function ComparativasPanel({ data, fmt, t }: {
  data: Data;
  fmt: (n: number) => string;
  t: (k: string) => string;
}) {
  const v = data.ventas;
  const totalAyer = v.total_ayer ?? 0;
  const totalMismoDia = v.total_mismo_dia_sem_pasada ?? 0;
  const totalMesPrevHastaHoy = v.total_mes_prev_hasta_hoy ?? 0;
  const ticketMes = v.ticket_prom_mes ?? 0;
  const ticketMesPrev = v.ticket_prom_mes_prev ?? 0;

  const pct = (actual: number, base: number): number | null => {
    if (base <= 0) return null;
    return Math.round(((actual - base) / base) * 1000) / 10;
  };

  const pctAyer = pct(v.total_hoy, totalAyer);
  const pctSemPasada = pct(v.total_hoy, totalMismoDia);
  const pctMes = pct(v.total_mes, totalMesPrevHastaHoy);
  const pctTicket = pct(ticketMes, ticketMesPrev);

  // Mensajes automáticos de interpretación
  const mensajes: Array<{ tono: "up" | "down" | "flat"; texto: string }> = [];
  if (pctAyer != null) {
    if (pctAyer >= 5) mensajes.push({ tono: "up", texto: `${t("Vendiste")} ${pctAyer}% ${t("más que ayer")}.` });
    else if (pctAyer <= -5) mensajes.push({ tono: "down", texto: `${t("Vendiste")} ${Math.abs(pctAyer)}% ${t("menos que ayer")}.` });
  }
  if (pctMes != null) {
    if (pctMes >= 10) mensajes.push({ tono: "up", texto: `${t("El mes va")} ${pctMes}% ${t("mejor que el mes pasado")}.` });
    else if (pctMes <= -10) mensajes.push({ tono: "down", texto: `${t("El mes va")} ${Math.abs(pctMes)}% ${t("por debajo del mes pasado")}.` });
  }
  if (pctTicket != null && Math.abs(pctTicket) >= 5) {
    const tono: "up" | "down" = pctTicket > 0 ? "up" : "down";
    mensajes.push({
      tono,
      texto: `${t("Ticket promedio")} ${pctTicket > 0 ? t("subió") : t("bajó")} ${Math.abs(pctTicket)}% ${t("vs mes pasado")}.`,
    });
  }
  if (v.total_hoy === 0 && v.count_hoy === 0) {
    mensajes.push({ tono: "flat", texto: t("Todavía no hay ventas registradas hoy.") });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <h2 className="text-sm font-bold text-slate-800">{t("Cómo vamos")}</h2>

      {/* 4 comparativas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ComparCard label={t("Hoy vs ayer")}
          actual={fmt(v.total_hoy)} base={`${t("Ayer")}: ${fmt(totalAyer)}`} pct={pctAyer} />
        <ComparCard label={t("Hoy vs mismo día semana pasada")}
          actual={fmt(v.total_hoy)} base={`${t("Hace 7d")}: ${fmt(totalMismoDia)}`} pct={pctSemPasada} />
        <ComparCard label={t("Mes actual vs mes anterior (mismo rango)")}
          actual={fmt(v.total_mes)} base={`${t("Mes prev.")}: ${fmt(totalMesPrevHastaHoy)}`} pct={pctMes} />
        <ComparCard label={t("Ticket promedio del mes")}
          actual={fmt(ticketMes)} base={`${t("Mes prev.")}: ${fmt(ticketMesPrev)}`} pct={pctTicket} />
      </div>

      {/* Interpretación */}
      {mensajes.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 pt-3">
          {mensajes.map((m, idx) => (
            <li key={idx} className={`text-xs flex items-start gap-1.5 ${
              m.tono === "up" ? "text-emerald-700"
              : m.tono === "down" ? "text-rose-700"
              : "text-slate-500"
            }`}>
              <span aria-hidden>{m.tono === "up" ? "↑" : m.tono === "down" ? "↓" : "•"}</span>
              <span>{m.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ComparCard({ label, actual, base, pct }: {
  label: string; actual: string; base: string; pct: number | null;
}) {
  const tono = pct == null ? "slate" : pct >= 0 ? "emerald" : "rose";
  const bg = tono === "emerald" ? "border-emerald-200 bg-emerald-50/40"
    : tono === "rose" ? "border-rose-200 bg-rose-50/40"
    : "border-slate-200 bg-white";
  const arrow = pct == null ? "—" : pct >= 0 ? "↑" : "↓";
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <div className="flex items-baseline justify-between gap-1 mt-1">
        <p className="text-base font-bold tabular-nums text-slate-900">{actual}</p>
        {pct != null && (
          <span className={`text-xs font-bold ${tono === "emerald" ? "text-emerald-700" : tono === "rose" ? "text-rose-700" : "text-slate-500"}`}>
            {arrow} {Math.abs(pct)}%
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-500 mt-0.5">{base}</p>
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
