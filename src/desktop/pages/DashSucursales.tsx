"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { MetaCelebrationModal } from "@/components/metas/MetaCelebrationModal";
import DashSucursalDiario from "./DashSucursalDiario";

/**
 * Dashboard OPERATIVO de Sucursales — rediseño visual.
 *
 * Jerarquía:
 *   1. Filtro por sucursal (persistente)
 *   2. Hero KPIs — 4 tarjetas grandes con Δ vs anterior.
 *   3. Salud del período — barras de progreso (meta, conversión, rotación, recurrentes).
 *   4. Evolución diaria — mini area chart (SVG inline).
 *   5. Cards por sucursal — comparación visual (una card por sucursal).
 *   6. Tipos de prenda más traídos — barras horizontales.
 *   7. Secciones detalladas colapsables — Flujo, Recepciones, Crédito, Inventario, Ventas.
 *
 * Todas las KPIs vienen del mismo endpoint /api/dashboard/sucursales.
 * Documentación de fórmulas: docs/dashboards-formulas.md.
 */

type Payload = {
  periodo: { desde: string; hasta: string };
  alcance: { es_admin: boolean; sucursal_forzada: string | null; sucursal_filtro: string | null };
  flujo: {
    visitas: number; clientes_unicos: number;
    clientes_nuevos: number; clientes_recurrentes: number;
    solo_trae: number; solo_lleva: number; trae_lleva: number;
    prendas_por_visita_prom: number | null;
    dias_entre_visitas_prom: number | null;
    dow: { dow: number; n: number }[];
    hora: { hora: number; n: number }[];
  };
  recepciones: {
    prendas: number; recepciones: number;
    subtotal_evaluado: number; ajuste_positivo: number; ajuste_negativo: number;
    total_final: number; ratio_ajuste_pct: number | null;
    eval_prom_prenda: number | null;
    evaluadores: { usuario: string | null; recepciones: number; total_final: number }[];
  };
  credito: {
    generado: number; usado: number; disponible: number;
    ventas_100_credito: number; ventas_mixto: number;
    tiempo_gen_uso_dias_prom: number | null;
    clientes_con_credito_sin_volver: number;
  };
  inventario: {
    prendas_entradas: number; prendas_salidas: number; diferencia_neta: number;
    stock_actual: number; antig_dias_prom: number | null; rotacion_pct: number | null;
  };
  ventas: {
    cantidad: number; prendas: number; total: number;
    costo_total: number; margen_bruto: number; margen_pct: number | null;
    ticket_promedio: number; prendas_por_venta_prom: number | null;
    promociones_aplicadas: number; cashback_total: number; descuento_total: number;
    beneficios_entregados: number; cambios: number;
    anulaciones_venta: number; anulaciones_recep: number;
    pagos: { metodo: string; total: number; ops: number }[];
    evolucion_diaria: { dia: string; total: number; ops: number }[];
    evolucion_por_sucursal: { dia: string; sucursal_id: string; nombre: string; total: number }[];
  };
  sucursales: {
    sucursal_id: string; nombre: string; moneda: string;
    ventas: number; operaciones: number; ticket_promedio: number;
    clientes_atendidos: number; prendas_vendidas: number; prendas_recibidas: number;
    stock: number; cajas_abiertas: number; cajas_cerradas: number;
    meta_diaria: number | null; vendido_periodo: number; dias_periodo: number;
    pct_meta: number | null; ventas_prev: number; operaciones_prev: number;
    var_ventas_pct: number | null;
    visitas: number; recurrentes: number;
    credito_generado: number; credito_usado: number;
    conversion_pct: number | null;
  }[];
  totales: {
    ventas: number; operaciones: number; prendas_vendidas: number;
    prendas_recibidas: number; stock: number; clientes_atendidos_aprox: number;
    cajas_abiertas: number; cajas_cerradas: number; ventas_prev: number;
  };
  tipos_prenda: { tipo_id: string | null; tipo_nombre: string; cantidad: number }[];
  tipos_prenda_por_sucursal: { sucursal_id: string; sucursal_nombre: string; tipo_id: string; tipo_nombre: string; cantidad: number }[];
};

function fmtGs(n: number) { return "Gs. " + Math.round(n || 0).toLocaleString("es-PY"); }
function fmtGsCompact(n: number) {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return "Gs. " + (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return "Gs. " + (v / 1_000).toFixed(0) + "K";
  return "Gs. " + v.toLocaleString("es-PY");
}
function fmtN(n: number) { return (n || 0).toLocaleString("es-PY"); }

export default function DashSucursales({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [sucursalFiltro, setSucursalFiltro] = useState<string>("");
  const [sucursalesConocidas, setSucursalesConocidas] = useState<{ id: string; nombre: string }[]>([]);
  // Metas alcanzadas HOY (endpoint liviano /api/notificaciones/metas).
  // El banner celebratorio se dispara cuando alguna sucursal llegó al
  // 100% del día — el pct_meta del payload principal es del período
  // completo, así que suele quedar en 4-5% en la mayor parte del mes.
  const [metasHoy, setMetasHoy] = useState<{
    sucursal_id: string; nombre: string; pct_meta: number;
    vendido: number; meta_periodo: number; ya_celebrada?: boolean;
  }[]>([]);
  // Meta actualmente en modal celebratorio (admin ve una animación por
  // cada sucursal que alcance su meta; después del ack se pasa a la
  // siguiente pendiente).
  const [metaModal, setMetaModal] = useState<{
    sucursal_id: string; nombre: string; pct_meta: number;
    vendido: number; meta_periodo: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ metric: string; label: string } | null>(null);
  const [vista, setVista] = useState<"resumen" | "diario">("resumen");
  const [abierto, setAbierto] = useState<Record<string, boolean>>({
    flujo: true, recepciones: false, credito: false, inventario: false, ventas: false, tipos: true,
  });

  const cargar = useCallback(async () => {
    setLoading(true); setErr(null);
    // Intento con retry automático silencioso ante 502/503/504 o abort.
    // Estos son fallos transitorios comunes en cold starts de Vercel.
    const attempt = async (): Promise<Payload> => {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalFiltro) params.set("sucursal_id", sucursalFiltro);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 55_000); // < maxDuration del server
      let r: Response;
      try {
        r = await fetchWithSupabaseSession(`/api/dashboard/sucursales?${params.toString()}`, { cache: "no-store", signal: ctrl.signal });
      } finally { clearTimeout(to); }
      // Errores transitorios: propagamos con marker para poder reintentar arriba.
      if (r.status === 502 || r.status === 503 || r.status === 504) {
        throw new Error(`__RETRY__:${r.status}`);
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${r.status}`);
      return j.data as Payload;
    };
    try {
      let payload: Payload;
      try {
        payload = await attempt();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // Un solo retry con 1.5s de espera si fue transitorio o abort.
        if (msg.startsWith("__RETRY__") || msg.includes("aborted") || msg.includes("AbortError")) {
          await new Promise(res => setTimeout(res, 1500));
          payload = await attempt();
        } else {
          throw e;
        }
      }
      setData(payload);
      setSucursalesConocidas((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        for (const s of payload.sucursales) {
          if (!map.has(s.sucursal_id)) map.set(s.sucursal_id, { id: s.sucursal_id, nombre: s.nombre });
        }
        return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      // Limpiamos el marker si llegó al final.
      setErr(msg.startsWith("__RETRY__") ? "El servidor tardó demasiado. Reintentá." : msg);
    } finally { setLoading(false); }
  }, [desde, hasta, sucursalFiltro]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Poll de metas alcanzadas del día — se refresca cada 2 min. Independiente
  // del período seleccionado en el dashboard: acá siempre celebramos HOY.
  // Suena un "ding-ding-ding" cuando aparece una NUEVA meta del día (no
  // celebrada aún en localStorage por sucursal+día).
  useEffect(() => {
    let alive = true;
    async function loadMetas() {
      try {
        const r = await fetchWithSupabaseSession("/api/notificaciones/metas", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!alive || !j?.success) return;
        const metas = (j.data?.metas as {
          sucursal_id: string; nombre: string; pct_meta: number;
          vendido: number; meta_periodo: number; ya_celebrada?: boolean;
        }[]) ?? [];
        setMetasHoy(metas);
        // Encolar modal celebratorio: si hay una meta NO celebrada aún
        // y no estamos mostrando otro modal, abrir el primero. El sonido
        // lo dispara el propio modal (playCelebrationSound + playFanfare),
        // por eso NO lo repetimos acá.
        setMetaModal((actual) => {
          if (actual) return actual; // ya hay uno abierto → esperar ack
          // Solo se dispara cuando la meta se cruza por primera vez
          // (backend marca ya_celebrada=false). Una vez celebrada
          // (fila en metas_celebradas para hoy), no se repite el modal
          // en las próximas recargas.
          const pendiente = metas.find(m => m.ya_celebrada !== true);
          if (!pendiente) return null;
          return {
            sucursal_id: pendiente.sucursal_id,
            nombre: pendiente.nombre,
            pct_meta: pendiente.pct_meta,
            vendido: pendiente.vendido,
            meta_periodo: pendiente.meta_periodo,
          };
        });
      } catch { /* silencioso */ }
    }
    void loadMetas();
    const t = setInterval(loadMetas, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Ack del modal celebratorio (admin): registra la celebración en el
  // backend (metas_celebradas, INSERT idempotente), marca localmente
  // ya_celebrada=true y encola la siguiente meta pendiente (si hay).
  const celebrarMetaAckAdmin = useCallback(async (cerradoPorUsuario: boolean) => {
    const m = metaModal;
    setMetaModal(null);
    if (!m) return;
    // Marca local para no re-encolar la misma en el próximo poll.
    setMetasHoy((prev) => prev.map(x =>
      x.sucursal_id === m.sucursal_id ? { ...x, ya_celebrada: true } : x
    ));
    try {
      await fetchWithSupabaseSession("/api/notificaciones/metas/celebrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal_id: m.sucursal_id,
          pct_meta: m.pct_meta,
          vendido: m.vendido,
          meta_diaria: m.meta_periodo,
          cerrado_por_usuario: cerradoPorUsuario,
        }),
      });
    } catch { /* silencioso — el próximo poll lo reintenta si sigue pendiente */ }
    // Siguiente sucursal pendiente (si el admin todavía tiene metas por
    // celebrar en la cola). Delay chico para que la animación anterior
    // termine antes de la próxima.
    setTimeout(() => {
      setMetasHoy((prev) => {
        const pend = prev.find(x => x.sucursal_id !== m.sucursal_id && x.ya_celebrada !== true);
        if (pend) {
          setMetaModal({
            sucursal_id: pend.sucursal_id, nombre: pend.nombre, pct_meta: pend.pct_meta,
            vendido: pend.vendido, meta_periodo: pend.meta_periodo,
          });
        }
        return prev;
      });
    }, 400);
  }, [metaModal]);

  if (loading && !data) return <div className="py-10 text-center text-sm text-slate-500">Cargando…</div>;
  if (err) return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      No se pudo cargar el dashboard de sucursales.
      <div className="mt-1 text-xs">{err}</div>
      <button type="button" onClick={cargar} className="mt-2 rounded border border-rose-300 bg-white px-2 py-1 text-xs">Reintentar</button>
    </div>
  );
  if (!data) return null;

  const t = data.totales;
  const varTotal = t.ventas_prev > 0
    ? Math.round(((t.ventas - t.ventas_prev) / t.ventas_prev) * 100)
    : null;

  const maxTipo = Math.max(1, ...data.tipos_prenda.map(x => x.cantidad));

  // Cálculos de salud del período
  const conversionGeneral = data.flujo.visitas > 0
    ? Math.round((data.ventas.cantidad / data.flujo.visitas) * 100) : null;
  const metaPromedio = data.sucursales.length > 0
    ? Math.round(data.sucursales.filter(s => s.pct_meta != null).reduce((s, x) => s + (x.pct_meta ?? 0), 0)
        / Math.max(1, data.sucursales.filter(s => s.pct_meta != null).length))
    : null;
  const pctRecurrentes = data.flujo.clientes_unicos > 0
    ? Math.round((data.flujo.clientes_recurrentes / data.flujo.clientes_unicos) * 100) : null;

  // Detectar la sucursal con meta ALCANZADA. Se consideran dos fuentes:
  //   1) pct_meta del período que devuelve el endpoint principal (útil a
  //      fin de mes cuando la acumulación pasa el 100%).
  //   2) metas alcanzadas HOY (/api/notificaciones/metas), que celebra
  //      llegar a la meta diaria aunque el mes recién arranque.
  // Si 1 no encuentra nada pero 2 sí, hacemos un merge con los datos del
  // período (visitas/prendas) para poder pintar la row de métricas.
  const metaAlcanzadaPeriodo = data.sucursales
    .filter(s => s.pct_meta != null && s.pct_meta >= 100)
    .sort((a, b) => (b.pct_meta ?? 0) - (a.pct_meta ?? 0))[0] ?? null;
  const metaHoyTop = metasHoy.slice().sort((a, b) => b.pct_meta - a.pct_meta)[0] ?? null;
  const metaHoyEnriquecida = metaHoyTop
    ? (() => {
        const s = data.sucursales.find(x => x.sucursal_id === metaHoyTop.sucursal_id);
        if (!s) return null;
        return { ...s, pct_meta: metaHoyTop.pct_meta };
      })()
    : null;
  const metaAlcanzada = metaAlcanzadaPeriodo ?? metaHoyEnriquecida;
  const metaEsDelDia = metaAlcanzada != null && metaAlcanzadaPeriodo == null;

  return (
    <div className="space-y-6">
      {/* Modal celebratorio con confetti + fanfarria — se muestra por
          CADA sucursal que llega al 100%. Cuando el admin cierra (o el
          autocierre a 4s dispara), se hace ack en el backend y encola
          la siguiente sucursal pendiente. */}
      <MetaCelebrationModal
        meta={metaModal}
        onSeguir={() => void celebrarMetaAckAdmin(true)}
      />

      {/* ═════ Banner: meta alcanzada por alguna sucursal ═════ */}
      {metaAlcanzada && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            {/* Ícono check en pill verde */}
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/30">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.5} stroke="currentColor" className="h-6 w-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-emerald-900">
                ¡Meta alcanzada en {metaAlcanzada.nombre}!
              </h3>
              <p className="text-sm text-emerald-800 mt-0.5">
                La sucursal llegó al{" "}
                <strong className="tabular-nums">{metaAlcanzada.pct_meta}%</strong>{" "}
                de su meta {metaEsDelDia ? "del día" : "del período"}.
                {metaEsDelDia
                  ? " ¡Un día para celebrar!"
                  : " Este resultado se construyó con el trabajo de todo el período."}
              </p>
              {/* Métricas destacadas del logro */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm">
                <MetaMetric value={metaAlcanzada.visitas} label="visitas" />
                <span className="text-emerald-300">·</span>
                <MetaMetric value={metaAlcanzada.prendas_recibidas} label="prendas recibidas" />
                <span className="text-emerald-300">·</span>
                <MetaMetric value={metaAlcanzada.prendas_vendidas} label="prendas vendidas" />
                {metaAlcanzada.clientes_atendidos > 0 && metaAlcanzada.recurrentes > 0 && (
                  <>
                    <span className="text-emerald-300">·</span>
                    <MetaMetric
                      value={`${Math.round((metaAlcanzada.recurrentes / metaAlcanzada.clientes_atendidos) * 100)}%`}
                      label="clientes recurrentes"
                    />
                  </>
                )}
              </div>
              {/* CTA: filtrar por esta sucursal para ver el detalle */}
              <div className="flex items-center justify-end mt-3">
                <button
                  type="button"
                  onClick={() => {
                    // Filtramos por la sucursal ganadora + scroll a las
                    // cards de rendimiento (donde se ve el detalle del
                    // trabajo del período). Si el dashboard ya estaba
                    // filtrado por esa sucursal, el scroll igual dispara.
                    setSucursalFiltro(metaAlcanzada.sucursal_id);
                    setTimeout(() => {
                      document.getElementById("rendimiento-sucursales")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 shadow-sm"
                >
                  Ver cómo se logró
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M5 10a.75.75 0 0 1 .75-.75h6.638L10.23 7.29a.75.75 0 1 1 1.04-1.08l3.5 3.25a.75.75 0 0 1 0 1.08l-3.5 3.25a.75.75 0 1 1-1.04-1.08l2.158-1.96H5.75A.75.75 0 0 1 5 10Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════ Switcher de vista + filtro sucursal ═════ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setVista("resumen")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              vista === "resumen"
                ? "bg-[#4FAEB2] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >Resumen del período</button>
          <button
            type="button"
            onClick={() => {
              // Al pasar a Diario, si no hay sucursal elegida, auto-elegir la primera.
              if (!sucursalFiltro && sucursalesConocidas.length > 0) {
                setSucursalFiltro(sucursalesConocidas[0].id);
              }
              setVista("diario");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              vista === "diario"
                ? "bg-[#4FAEB2] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >Bitácora diaria</button>
        </div>
        {/* Selector de sucursal removido en la vista Resumen — Karen quiere
            ver todo dividido por sucursal en lugar de filtrar. El selector
            de la vista Diario vive dentro de DashSucursalDiario. */}
      </div>

      {vista === "diario" ? (
        <DashSucursalDiario
          sucursales={sucursalesConocidas}
          sucursalId={sucursalFiltro || (sucursalesConocidas[0]?.id ?? "")}
          onChangeSucursal={setSucursalFiltro}
        />
      ) : (
        <ResumenPeriodo />
      )}
    </div>
  );

  function ResumenPeriodo() {
    // Defensivo: el componente principal ya garantiza data != null antes de
    // renderizar, pero TS no sigue la narrowing dentro de esta función anidada.
    if (!data) return null;
    return (
      <>
      {/* Hero KPIs y Salud del período REMOVIDOS.
          Razón: hay sucursales que operan en guaraníes y otras en reales,
          entonces un total consolidado en Gs. no es fiel al negocio.
          Karen: 'no quiero total de nada porque hay sucursales que usan
          reales y otros guaranies asi que no va a quedar bien usar el
          total'. Toda la info vive en las cards por sucursal + la
          evolución diaria (que ya venía separada por sucursal). */}

      {/* ═════ Evolución diaria — chart con línea por sucursal ═════ */}
      {data.ventas.evolucion_por_sucursal.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-800">Evolución de ventas por día</h3>
            <span className="text-[11px] text-slate-400">
              Cada línea = una sucursal
            </span>
          </div>
          {/* Se pasa la lista pivoteada sin la línea 'Total' (evita mezclar
              monedas). El MultiLineChart la oculta si totalPorDia = []. */}
          <MultiLineChart
            totalPorDia={[]}
            porSucursal={data.ventas.evolucion_por_sucursal}
            baseSucursales={data.sucursales.map(s => ({ sucursal_id: s.sucursal_id, nombre: s.nombre }))}
            desde={data.periodo.desde}
            hasta={data.periodo.hasta}
          />
        </div>
      )}

      {/* ═════ Cards por sucursal ═════ */}
      {data.sucursales.length > 0 && (
        <div id="rendimiento-sucursales">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base font-bold text-slate-800">Detalle por sucursal</h3>
            <span className="text-[11px] text-slate-400">Cada card es una sucursal — no es un promedio</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.sucursales.map(s => <SucursalCard key={s.sucursal_id} s={s} />)}
          </div>
        </div>
      )}

      {/* ═════ Franjas más recibidas — DIVIDIDO POR SUCURSAL ═════
          Karen: 'me gusta el grafico de franjas quiero tener uno por
          sucursal'. Renderizamos una card por sucursal, cada una con
          su propio ranking + barras. */}
      <Accordion
        titulo="Franjas más recibidas — por sucursal"
        abierto={abierto.tipos}
        onToggle={() => setAbierto(p => ({ ...p, tipos: !p.tipos }))}
      >
        <FranjasPorSucursal filas={data.tipos_prenda_por_sucursal} />
      </Accordion>

      {/* Secciones detalladas de totales removidas — Karen pidió ver todo
          dividido por sucursal (no un total agregado). Las mismas métricas
          viven ahora dentro de las SucursalCard: ventas, ops, ticket,
          visitas, clientes atendidos, recurrentes, conversión, prendas
          recibidas/vendidas, stock, crédito y meta. Los operativos
          transversales (evaluadores, formas de pago, días/horas de más
          atención, flujo de atención global, margen bruto) siguen
          accesibles vía la Bitácora diaria. */}

      {/* Drill modal */}
      {drill && (
        <DrillModal
          metric={drill.metric}
          label={drill.label}
          desde={desde}
          hasta={hasta}
          sucursalFiltro={sucursalFiltro || null}
          onClose={() => setDrill(null)}
        />
      )}
      </>
    );
  }
}

/**
 * Ranking de franjas más recibidas — una card por sucursal.
 * Top 8 franjas por sucursal, con barra proporcional al máximo LOCAL
 * (no cross-sucursal, así cada gráfico se lee independientemente).
 */
function FranjasPorSucursal({
  filas,
}: {
  filas: { sucursal_id: string; sucursal_nombre: string; tipo_id: string; tipo_nombre: string; cantidad: number }[];
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-slate-400 py-2">Sin datos en el período.</p>;
  }
  const map = new Map<string, { nombre: string; items: { tipo_id: string; tipo_nombre: string; cantidad: number }[] }>();
  for (const r of filas) {
    if (!map.has(r.sucursal_id)) map.set(r.sucursal_id, { nombre: r.sucursal_nombre, items: [] });
    map.get(r.sucursal_id)!.items.push({ tipo_id: r.tipo_id, tipo_nombre: r.tipo_nombre, cantidad: r.cantidad });
  }
  const sucursales = Array.from(map.entries()).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sucursales.map(([id, s]) => {
        const items = s.items.slice(0, 8);
        const maxLocal = Math.max(1, ...items.map(i => i.cantidad));
        const total = s.items.reduce((sum, i) => sum + i.cantidad, 0);
        return (
          <div key={id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900">{s.nombre}</h4>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {fmtN(total)} prenda{total === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="space-y-1.5">
              {items.map(i => (
                <li key={i.tipo_id} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-slate-700 truncate">{i.tipo_nombre}</span>
                  <div className="flex-1 h-2 rounded-full bg-white overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                         style={{ width: `${(i.cantidad / maxLocal) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-slate-800 tabular-nums">
                    {fmtN(i.cantidad)}
                  </span>
                </li>
              ))}
              {s.items.length > 8 && (
                <li className="text-[10px] text-slate-400 italic pt-1">
                  +{s.items.length - 8} franjas más
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ─── UI helpers ───────────────────────────────────────────────── */

type HeroIconType = "ventas" | "visitas" | "operaciones" | "prendas";

function HeroIcon({ type }: { type: HeroIconType }) {
  // SVGs minimalistas — heroicons style. Sin dependencia externa.
  const paths: Record<HeroIconType, React.ReactNode> = {
    ventas: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12M8.25 10.5a2.25 2.25 0 0 0 2.25 2.25h3a2.25 2.25 0 0 1 0 4.5H8.25M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z" />
    ),
    visitas: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    ),
    operaciones: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
    ),
    prendas: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
    ),
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="h-5 w-5">
      {paths[type]}
    </svg>
  );
}

function HeroCard({ iconType, label, value, delta, deltaTone, color, tip, onClick }: {
  iconType: HeroIconType;
  label: string; value: string;
  delta: string | null;
  deltaTone?: "up" | "down" | "neutral";
  color: "emerald" | "sky" | "violet" | "amber";
  tip?: string;
  onClick?: () => void;
}) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200",
    sky:     "bg-sky-50 border-sky-200",
    violet:  "bg-violet-50 border-violet-200",
    amber:   "bg-amber-50 border-amber-200",
  };
  const iconBg: Record<string, string> = {
    emerald: "bg-emerald-500 text-white", sky: "bg-sky-500 text-white",
    violet: "bg-violet-500 text-white",   amber: "bg-amber-500 text-white",
  };
  const deltaColor = deltaTone === "up" ? "text-emerald-700"
    : deltaTone === "down" ? "text-rose-700" : "text-slate-500";
  const Base = onClick ? "button" : "div";
  return (
    <Base
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={tip}
      className={`rounded-2xl border ${bg[color]} p-5 text-left transition ${onClick ? "hover:shadow-lg cursor-pointer" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl ${iconBg[color]} flex items-center justify-center shrink-0`}>
          <HeroIcon type={iconType} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums truncate">{value}</p>
          {delta && <p className={`text-[11px] mt-1 ${deltaColor}`}>{delta}</p>}
        </div>
      </div>
    </Base>
  );
}

function SaludBar({ label, pct, countValue, tip }: {
  label: string; pct: number; countValue?: string; tip?: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const color = p >= 80 ? "bg-emerald-500" : p >= 50 ? "bg-sky-500" : p >= 25 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div title={tip}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-slate-600 font-medium">{label}</span>
        <span className="text-sm font-bold text-slate-800 tabular-nums">
          {countValue ?? `${p}%`}
        </span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

/**
 * Chart de líneas — una línea por sucursal + una línea "Total" gris más
 * gruesa por debajo. Hover muestra tooltip con el detalle del día.
 *
 * `totalPorDia` es el eje X canónico (fechas). `porSucursal` puede
 * tener huecos (una sucursal no vende ese día) — se toma 0 en esos casos.
 */
function MultiLineChart({
  totalPorDia,
  porSucursal,
  baseSucursales,
  desde,
  hasta,
}: {
  totalPorDia: { dia: string; total: number; ops: number }[];
  porSucursal: { dia: string; sucursal_id: string; nombre: string; total: number }[];
  /** Lista canónica de sucursales — así el chart siempre pinta todas
   *  (aunque no tengan ventas → línea en 0), no solo las que aparecen
   *  en porSucursal. */
  baseSucursales?: { sucursal_id: string; nombre: string }[];
  /** Rango del período. Cuando se pasa, el eje X se genera para TODOS
   *  los días entre desde/hasta (los días sin ventas quedan en 0), en
   *  vez de saltearse. Sin esto la línea "sube" directo de un día con
   *  ventas al próximo, dando la ilusión de tramos rectos entre puntos
   *  lejanos en el tiempo. */
  desde?: string;
  hasta?: string;
}) {
  const w = 800, h = 160, padL = 8, padR = 8, padT = 16, padB = 24;
  // Eje X canónico:
  //   - Si tenemos desde/hasta → generamos TODOS los días del rango
  //     para que se vea el ancho real del período aunque solo haya
  //     ventas en 1 o 2 días (los demás quedan en 0).
  //   - Si no, caemos al comportamiento previo (totalPorDia o union
  //     de porSucursal).
  const diasRango = (() => {
    if (!desde || !hasta) return null;
    const out: string[] = [];
    const d0 = new Date(desde + "T00:00:00");
    const d1 = new Date(hasta + "T00:00:00");
    if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null;
    // Cap defensivo: si el rango se disparó (bug de UI), no generamos
    // 10k puntos — mostramos solo los que ya vinieron con data.
    const maxDias = 366;
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
      if (out.length > maxDias) return null;
    }
    return out;
  })();
  const dias = diasRango
    ?? (totalPorDia.length > 0
      ? totalPorDia.map(d => d.dia)
      : Array.from(new Set(porSucursal.map(p => p.dia))).sort());
  // Paleta estable — se recicla si hay más de 8 sucursales.
  const PAL = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#84cc16", "#ec4899"];
  // Agrupamos por sucursal: nombre + serie [{dia,total}]. Semillamos con
  // baseSucursales para que todas aparezcan aunque no tengan ventas.
  const sucMap = new Map<string, { nombre: string; color: string; porDia: Map<string, number> }>();
  if (baseSucursales) {
    for (const b of baseSucursales) {
      sucMap.set(b.sucursal_id, {
        nombre: b.nombre,
        color: PAL[sucMap.size % PAL.length],
        porDia: new Map(),
      });
    }
  }
  porSucursal.forEach(row => {
    if (!sucMap.has(row.sucursal_id)) {
      sucMap.set(row.sucursal_id, {
        nombre: row.nombre,
        color: PAL[sucMap.size % PAL.length],
        porDia: new Map(),
      });
    }
    sucMap.get(row.sucursal_id)!.porDia.set(row.dia, row.total);
  });
  const sucursales = Array.from(sucMap.entries()).map(([id, v]) => ({
    id, nombre: v.nombre, color: v.color,
    serie: dias.map(d => v.porDia.get(d) ?? 0),
  }));

  // Máximo: si hay total lo usamos; si no, el máximo entre todas las
  // series de sucursales (para mantener escala correcta sin la línea total).
  const max = Math.max(
    1,
    ...totalPorDia.map(d => d.total),
    ...sucursales.flatMap(s => s.serie),
  );
  const step = dias.length > 1 ? (w - padL - padR) / (dias.length - 1) : 0;
  // Cuando solo hay 1 día, centramos el punto único horizontalmente en
  // lugar de dejarlo pegado a la izquierda con step=0.
  const xOf = (i: number) => dias.length === 1 ? (w / 2) : (padL + i * step);
  const yOf = (v: number) => h - padB - (v / max) * (h - padT - padB);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Con un solo día en el rango, un chart de líneas no aporta — solo
  // puntos aislados. Cambiamos a barras horizontales por sucursal
  // (más leíble). Ordenamos por valor descendente.
  if (dias.length <= 1) {
    const rows = sucursales
      .map(s => ({ id: s.id, nombre: s.nombre, color: s.color, valor: s.serie[0] ?? 0 }))
      .sort((a, b) => b.valor - a.valor);
    const localMax = Math.max(1, ...rows.map(r => r.valor));
    return (
      <div className="w-full">
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs">
          {rows.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
              {s.nombre}
            </span>
          ))}
        </div>
        <ul className="space-y-2">
          {rows.map(s => (
            <li key={s.id} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-slate-700 truncate">{s.nombre}</span>
              <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ background: s.color, width: `${(s.valor / localMax) * 100}%` }}
                />
              </div>
              <span className="w-24 text-right text-slate-800 tabular-nums font-semibold">
                {fmtGsCompact(s.valor)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-slate-400 mt-3 italic">
          Vista de barras: hay un solo día en el rango. Ampliá el filtro para ver evolución en el tiempo.
        </p>
      </div>
    );
  }

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || dias.length === 0) return;
    const rect = svg.getBoundingClientRect();
    // El viewBox es 0..w, el elemento se estira al 100%. Escala x real.
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.max(0, Math.min(dias.length - 1, Math.round((relX - padL) / (step || 1))));
    setHoverIdx(i);
  };

  return (
    <div className="w-full">
      {/* Leyenda ARRIBA del chart para que se vea de una qué color es
          cada sucursal (antes solo aparecía debajo y si había >1). */}
      {sucursales.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs">
          {sucursales.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
              {s.nombre}
            </span>
          ))}
          {totalPorDia.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" />
              Total (ref.)
            </span>
          )}
        </div>
      )}
      <div className="w-full relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-40"
          preserveAspectRatio="none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Grid horizontal */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={padL} x2={w - padR} y1={padT + (h - padT - padB) * f} y2={padT + (h - padT - padB) * f}
                  stroke="#f1f5f9" strokeWidth={1} />
          ))}
          {/* Línea Total (gris tenue) por debajo — referencia */}
          {totalPorDia.length > 1 && (
            <path
              d={totalPorDia.map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(d.total)}`).join(" ")}
              fill="none" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 3"
            />
          )}
          {/* Una línea por sucursal */}
          {sucursales.map(s => (
            <path
              key={s.id}
              d={s.serie.map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(v)}`).join(" ")}
              fill="none" stroke={s.color} strokeWidth={3}
              strokeLinejoin="round" strokeLinecap="round"
            />
          ))}
          {/* Marcadores en cada punto de cada sucursal */}
          {sucursales.map(s =>
            s.serie.map((v, i) => (
              <circle key={`${s.id}-${i}`} cx={xOf(i)} cy={yOf(v)} r={3.5} fill={s.color}
                      stroke="#fff" strokeWidth={1.5} />
            ))
          )}
          {/* Línea vertical de hover */}
          {hoverIdx != null && (
            <line x1={xOf(hoverIdx)} x2={xOf(hoverIdx)} y1={padT} y2={h - padB}
                  stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {/* Puntos grandes en hover */}
          {hoverIdx != null && sucursales.map(s => (
            <circle key={`h-${s.id}`} cx={xOf(hoverIdx)} cy={yOf(s.serie[hoverIdx])} r={4}
                    fill="#fff" stroke={s.color} strokeWidth={2} />
          ))}
        </svg>
        {/* Tooltip flotante */}
        {hoverIdx != null && (
          <div
            className="absolute top-1 pointer-events-none rounded-lg bg-white border border-slate-200 shadow-lg px-3 py-2 text-xs min-w-[180px] z-10"
            style={{
              left: `calc(${(xOf(hoverIdx) / w) * 100}% + 8px)`,
              maxWidth: 240,
              transform: xOf(hoverIdx) > w * 0.6 ? "translateX(calc(-100% - 24px))" : "none",
            }}
          >
            <p className="font-bold text-slate-800 mb-1">{dias[hoverIdx]}</p>
            <ul className="space-y-0.5">
              {sucursales
                .map(s => ({ ...s, valor: s.serie[hoverIdx] }))
                .sort((a, b) => b.valor - a.valor)
                .map(s => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="flex-1 truncate text-slate-600">{s.nombre}</span>
                    <span className="tabular-nums font-semibold text-slate-800">{fmtGsCompact(s.valor)}</span>
                  </li>
                ))}
              {totalPorDia.length > 0 && (
                <li className="flex items-center gap-2 pt-1 mt-1 border-t border-slate-100">
                  <span className="h-2 w-2 rounded-full shrink-0 bg-slate-400" />
                  <span className="flex-1 text-slate-500">Total</span>
                  <span className="tabular-nums font-bold text-slate-900">
                    {fmtGsCompact(totalPorDia[hoverIdx]?.total ?? 0)}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {/* Leyenda + eje X */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 px-1">
        <span>{dias[0] ?? ""}</span>
        <span>{dias[dias.length - 1] ?? ""}</span>
      </div>
    </div>
  );
}

function SucursalCard({ s }: {
  s: Payload["sucursales"][number];
}) {
  const metaColor = s.pct_meta == null ? "bg-slate-200"
    : s.pct_meta >= 100 ? "bg-emerald-500"
    : s.pct_meta >= 50 ? "bg-sky-500" : "bg-amber-500";
  const deltaColor = s.var_ventas_pct == null ? "text-slate-400"
    : s.var_ventas_pct >= 0 ? "text-emerald-700" : "text-rose-700";
  const creditoNeto = s.credito_generado - s.credito_usado;

  // Formateo con la moneda de LA SUCURSAL (no la del viewer). Betim/BH/
  // El Dorado se ven en R$ aunque el admin PY las esté mirando.
  const monedaSuc = (s.moneda ?? "PYG") as "PYG" | "BRL" | "USD" | "ARS";
  const langSuc = monedaSuc === "BRL" ? "pt-BR" : "es";
  const fmt = (n: number) => {
    const abs = Math.abs(n);
    const sym = monedaSuc === "BRL" ? "R$" : monedaSuc === "USD" ? "US$" : monedaSuc === "ARS" ? "$" : "Gs.";
    const locale = monedaSuc === "BRL" ? "pt-BR" : "es-PY";
    if (abs >= 1_000_000) return `${sym} ${(n / 1_000_000).toLocaleString(locale, { minimumFractionDigits: abs >= 10_000_000 ? 0 : 1, maximumFractionDigits: 1 })}M`;
    if (abs >= 1_000) return `${sym} ${(n / 1_000).toLocaleString(locale, { maximumFractionDigits: 0 })}K`;
    const decimals = monedaSuc === "PYG" || monedaSuc === "ARS" ? 0 : 2;
    return `${sym} ${n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };
  void langSuc; // reservado para eventuales usos i18n contextuales.
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-lg font-bold text-slate-900">{s.nombre}</h4>
          <p className="text-[11px] text-slate-400">
            {s.cajas_abiertas} caja{s.cajas_abiertas !== 1 ? "s" : ""} abierta{s.cajas_abiertas !== 1 ? "s" : ""}
            {" · "}{s.cajas_cerradas} cerrada{s.cajas_cerradas !== 1 ? "s" : ""}
          </p>
        </div>
        <span className={`text-xs font-semibold ${deltaColor} tabular-nums shrink-0`}>
          {s.var_ventas_pct == null ? "—" : `${s.var_ventas_pct > 0 ? "▲" : "▼"} ${Math.abs(s.var_ventas_pct)}%`}
        </span>
      </div>

      {/* Bloque VENTAS */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Ventas</p>
        <div className="grid grid-cols-3 gap-2">
          <SucMini label="Total" value={fmt(s.ventas)} />
          <SucMini label="Ops." value={fmtN(s.operaciones)} />
          <SucMini label="Ticket" value={fmt(s.ticket_promedio)} />
        </div>
      </div>

      {/* Bloque VISITAS + CLIENTES */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Clientes</p>
        <div className="grid grid-cols-3 gap-2">
          <SucMini label="Visitas" value={fmtN(s.visitas)} />
          <SucMini label="Atendidos" value={fmtN(s.clientes_atendidos)} />
          <SucMini label="Recurrent." value={fmtN(s.recurrentes)} />
        </div>
        {s.conversion_pct != null && (
          <p className="text-[10px] text-slate-500 mt-1.5">
            Conversión visita → venta:{" "}
            <span className="font-semibold text-slate-700 tabular-nums">{s.conversion_pct}%</span>
          </p>
        )}
      </div>

      {/* Bloque PRENDAS */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Prendas</p>
        <div className="grid grid-cols-3 gap-2">
          <SucMini label="Recibidas" value={fmtN(s.prendas_recibidas)} />
          <SucMini label="Vendidas" value={fmtN(s.prendas_vendidas)} />
          <SucMini label="Stock" value={fmtN(s.stock)} />
        </div>
      </div>

      {/* Bloque CRÉDITO */}
      {(s.credito_generado > 0 || s.credito_usado > 0) && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Crédito</p>
          <div className="grid grid-cols-3 gap-2">
            <SucMini label="Generado" value={fmt(s.credito_generado)} />
            <SucMini label="Usado" value={fmt(s.credito_usado)} />
            <SucMini
              label="Neto"
              value={(creditoNeto >= 0 ? "+" : "") + fmt(creditoNeto)}
            />
          </div>
        </div>
      )}

      {/* Meta del período */}
      {s.meta_diaria != null && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[11px] text-slate-500">
              Meta del período
              <span className="text-slate-400 ml-1">
                (meta {fmt(s.meta_diaria * s.dias_periodo)})
              </span>
            </span>
            <span className={`text-xs font-bold tabular-nums ${
              s.pct_meta != null && s.pct_meta >= 100 ? "text-emerald-700" : "text-slate-800"
            }`}>
              {s.pct_meta ?? 0}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${metaColor}`} style={{ width: `${Math.min(100, s.pct_meta ?? 0)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SucMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums truncate">{value}</p>
    </div>
  );
}

function Accordion({ titulo, abierto, onToggle, children }: {
  titulo: string; abierto: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition"
      >
        <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
        <span className="text-slate-400 text-sm">{abierto ? "▾" : "▸"}</span>
      </button>
      {abierto && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function MiniKpi({ label, value, tip, onClick, valueClass }: {
  label: string; value: string; tip?: string; onClick?: () => void; valueClass?: string;
}) {
  const Base = onClick ? "button" : "div";
  return (
    <Base
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={tip}
      className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-left ${onClick ? "hover:border-[#4FAEB2] cursor-pointer transition" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${valueClass ?? "text-slate-800"}`}>{value}</p>
    </Base>
  );
}

function DrillModal({
  metric, label, desde, hasta, sucursalFiltro, onClose,
}: {
  metric: string; label: string; desde: string; hasta: string;
  sucursalFiltro: string | null; onClose: () => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ metric, desde, hasta, limit: "200" });
    if (sucursalFiltro) params.set("sucursal_id", sucursalFiltro);
    fetchWithSupabaseSession(`/api/dashboard/drill?${params.toString()}`, { cache: "no-store" })
      .then(r => r.json()).then(j => {
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setRows(j.data.filas as Record<string, unknown>[]);
      }).catch(e => setErr(e instanceof Error ? e.message : "Error"));
  }, [metric, desde, hasta, sucursalFiltro]);
  const cols = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div>
            <h4 className="text-base font-bold text-slate-800">{label}</h4>
            <p className="text-[11px] text-slate-400">{desde} → {hasta}{rows ? ` · ${rows.length} registros` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div className="overflow-auto flex-1">
          {err ? <div className="p-4 text-sm text-rose-700">{err}</div>
           : rows == null ? <div className="p-8 text-center text-sm text-slate-400">Cargando…</div>
           : rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Sin datos.</div>
           : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500 sticky top-0">
                <tr>{cols.map(c => <th key={c} className="px-3 py-2 whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {cols.map(c => <td key={c} className="px-3 py-1.5 whitespace-nowrap">{fmtCell(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-2 border-t border-slate-100 text-[11px] text-slate-400 shrink-0">
          Fórmula documentada en docs/dashboards-formulas.md
        </div>
      </div>
    </div>
  );
}

// Métrica destacada del banner de meta alcanzada.
function MetaMetric({ value, label }: { value: number | string; label: string }) {
  const shown = typeof value === "number" ? value.toLocaleString("es-PY") : value;
  return (
    <span className="inline-flex items-baseline gap-1">
      <strong className="text-emerald-900 font-bold tabular-nums">{shown}</strong>
      <span className="text-emerald-700">{label}</span>
    </span>
  );
}

function fmtCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString("es-PY");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("es-PY");
  return String(v);
}
