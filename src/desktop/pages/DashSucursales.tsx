"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Dashboard OPERATIVO de Sucursales. Consume /api/dashboard/sucursales
 * (agregado server-side, ver docs/dashboards-formulas.md).
 *
 * Estructura:
 *  1. Resumen general (KPIs consolidados con Δ vs anterior)
 *  2. Flujo de atención
 *  3. Recepciones y evaluaciones
 *  4. Créditos
 *  5. Inventario
 *  6. Ventas
 *  7. Tabla comparativa entre sucursales
 *  8. Tipos de prenda más traídos
 *
 * Cada KPI tiene tooltip con la fórmula y — cuando aplica — es
 * clickeable para abrir un modal de drill-down (/api/dashboard/drill).
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
    ticket_promedio: number; prendas_por_venta_prom: number | null;
    promociones_aplicadas: number; cashback_total: number; descuento_total: number;
    beneficios_entregados: number; cambios: number;
    anulaciones_venta: number; anulaciones_recep: number;
    pagos: { metodo: string; total: number; ops: number }[];
    evolucion_diaria: { dia: string; total: number; ops: number }[];
  };
  sucursales: {
    sucursal_id: string; nombre: string;
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
};

function fmtGs(n: number) { return "Gs. " + Math.round(n || 0).toLocaleString("es-PY"); }
function fmtN(n: number) { return (n || 0).toLocaleString("es-PY"); }
const DOW = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

export default function DashSucursales({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [sucursalFiltro, setSucursalFiltro] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ metric: string; label: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalFiltro) params.set("sucursal_id", sucursalFiltro);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25_000);
      let r: Response;
      try {
        r = await fetchWithSupabaseSession(`/api/dashboard/sucursales?${params.toString()}`, { cache: "no-store", signal: ctrl.signal });
      } finally { clearTimeout(to); }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setData(j.data as Payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }, [desde, hasta, sucursalFiltro]);

  useEffect(() => { void cargar(); }, [cargar]);

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
  const maxDow = Math.max(1, ...data.flujo.dow.map(x => x.n));
  const maxHora = Math.max(1, ...data.flujo.hora.map(x => x.n));

  return (
    <div className="space-y-6">
      {/* Filtro por sucursal */}
      {data.alcance.es_admin && data.sucursales.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Sucursal:</label>
          <select
            value={sucursalFiltro}
            onChange={(e) => setSucursalFiltro(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            <option value="">Todas</option>
            {data.sucursales.map(s => <option key={s.sucursal_id} value={s.sucursal_id}>{s.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Resumen general */}
      <Section title="Resumen general">
        <Grid>
          <Kpi label="Ventas del período" value={fmtGs(t.ventas)}
            sub={varTotal != null ? `${varTotal > 0 ? "▲" : "▼"} ${Math.abs(varTotal)}% vs. anterior` : "—"}
            subTone={varTotal != null ? (varTotal >= 0 ? "up" : "down") : "neutral"}
            tip="SUM(total) de ventas no anuladas en el período. Comparación con el mismo largo del período anterior." />
          <Kpi label="Operaciones" value={fmtN(t.operaciones)} tip="Cantidad de ventas no anuladas." />
          <Kpi label="Ticket promedio" value={fmtGs(t.operaciones > 0 ? t.ventas / t.operaciones : 0)} tip="Ventas ÷ operaciones." />
          <Kpi label="Clientes atendidos" value={fmtN(t.clientes_atendidos_aprox)} tip="DISTINCT cliente_id sobre ventas ∪ recepciones (suma por sucursal)." />
          <Kpi label="Prendas recibidas" value={fmtN(t.prendas_recibidas)} tip="SUM(cantidad) de items de recepciones no anuladas." onClick={() => setDrill({ metric: "prendas_recibidas", label: "Prendas recibidas" })} />
          <Kpi label="Prendas vendidas" value={fmtN(t.prendas_vendidas)} tip="SUM(cantidad) de items de ventas no anuladas." onClick={() => setDrill({ metric: "prendas_vendidas", label: "Prendas vendidas" })} />
          <Kpi label="Stock actual" value={fmtN(t.stock)} tip="SUM(stock_actual) de producto_stock_sucursal." />
          <Kpi label="Cajas abiertas / cerradas" value={`${t.cajas_abiertas} / ${t.cajas_cerradas}`} tip="Estado actual + cierres del período." />
        </Grid>
      </Section>

      {/* Flujo de atención */}
      <Section title="Flujo de atención">
        <Grid>
          <Kpi label="Visitas totales" value={fmtN(data.flujo.visitas)}
            tip="Una atención (trae+lleva con mismo cambio_id) = 1 visita. Recepción o venta sueltas = 1 visita cada una. Excluye anuladas."
            onClick={() => setDrill({ metric: "visitas", label: "Visitas del período" })} />
          <Kpi label="Clientes únicos" value={fmtN(data.flujo.clientes_unicos)} tip="COUNT(DISTINCT cliente_id) sobre visitas." />
          <Kpi label="Clientes nuevos" value={fmtN(data.flujo.clientes_nuevos)}
            tip="Clientes cuya PRIMERA visita histórica cayó dentro del período." />
          <Kpi label="Clientes recurrentes" value={fmtN(data.flujo.clientes_recurrentes)}
            tip="Clientes con 2+ visitas en el período."
            onClick={() => setDrill({ metric: "clientes_recurrentes", label: "Clientes recurrentes" })} />
          <Kpi label="Solo trae" value={fmtN(data.flujo.solo_trae)} tip="Recepciones sin cambio_id."
            onClick={() => setDrill({ metric: "visitas_solo_trae", label: "Visitas: solo trae" })} />
          <Kpi label="Solo lleva" value={fmtN(data.flujo.solo_lleva)} tip="Ventas sin cambio_id."
            onClick={() => setDrill({ metric: "visitas_solo_lleva", label: "Visitas: solo lleva" })} />
          <Kpi label="Trae + lleva" value={fmtN(data.flujo.trae_lleva)} tip="Cambios confirmados (recepción y venta en el mismo orquestador)."
            onClick={() => setDrill({ metric: "visitas_trae_lleva", label: "Visitas: trae+lleva" })} />
          <Kpi label="Prendas/visita (prom)" value={data.flujo.prendas_por_visita_prom != null ? String(data.flujo.prendas_por_visita_prom) : "—"}
            tip="SUM(prendas recibidas) ÷ visitas con recepción." />
          <Kpi label="Días entre visitas (prom)" value={data.flujo.dias_entre_visitas_prom != null ? `${data.flujo.dias_entre_visitas_prom} d` : "—"}
            tip="AVG de LAG por cliente sobre visitas." />
        </Grid>
        {/* Barras: DOW + Hora */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <MiniBars titulo="Días con más atención" datos={DOW.map((d, i) => ({ label: d, n: data.flujo.dow.find(x => x.dow === i)?.n ?? 0 }))} max={maxDow} />
          <MiniBars titulo="Horas con más atención" datos={data.flujo.hora.map(x => ({ label: `${x.hora}h`, n: x.n }))} max={maxHora} />
        </div>
      </Section>

      {/* Recepciones */}
      <Section title="Recepciones y evaluaciones">
        <Grid>
          <Kpi label="Recepciones" value={fmtN(data.recepciones.recepciones)} tip="COUNT de recepciones no anuladas." />
          <Kpi label="Prendas recibidas" value={fmtN(data.recepciones.prendas)} tip="SUM(cantidad) de items." />
          <Kpi label="Subtotal evaluado" value={fmtGs(data.recepciones.subtotal_evaluado)} tip="SUM(subtotal_evaluado) — antes de ajustes." />
          <Kpi label="Ajustes +" value={fmtGs(data.recepciones.ajuste_positivo)} tip="SUM(ajuste_evaluacion) > 0." />
          <Kpi label="Ajustes −" value={fmtGs(data.recepciones.ajuste_negativo)} tip="SUM(ajuste_evaluacion) < 0." />
          <Kpi label="Total final" value={fmtGs(data.recepciones.total_final)} tip="SUM(total_final) — lo acreditado al cliente." />
          <Kpi label="Ratio ajuste vs subtotal" value={data.recepciones.ratio_ajuste_pct != null ? `${data.recepciones.ratio_ajuste_pct}%` : "—"} tip="Ajuste neto ÷ subtotal_evaluado × 100." />
          <Kpi label="Eval. prom. por prenda" value={data.recepciones.eval_prom_prenda != null ? fmtGs(data.recepciones.eval_prom_prenda) : "—"} tip="Total final ÷ SUM(cantidad items)." />
        </Grid>
        {data.recepciones.evaluadores.length > 0 && (
          <div className="mt-3">
            <p className="text-xs uppercase font-bold text-slate-500 mb-2">Operadores evaluadores</p>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-1.5">Operador</th><th className="px-3 py-1.5 text-right">Recepciones</th><th className="px-3 py-1.5 text-right">Total final</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recepciones.evaluadores.map((e, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{e.usuario}</td>
                    <td className="px-3 py-1.5 text-right">{fmtN(e.recepciones)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtGs(e.total_final)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Crédito */}
      <Section title="Crédito">
        <Grid>
          <Kpi label="Generado" value={fmtGs(data.credito.generado)} tip="SUM ENTRADAs origen='recepcion' en el período."
            onClick={() => setDrill({ metric: "credito_generado", label: "Crédito generado" })} />
          <Kpi label="Usado" value={fmtGs(data.credito.usado)} tip="SUM SALIDAs origen='venta' en el período."
            onClick={() => setDrill({ metric: "credito_usado", label: "Crédito usado" })} />
          <Kpi label="Disponible (proxy)" value={fmtGs(data.credito.disponible)} tip="Generado − Usado (aproximación del delta neto del período)." />
          <Kpi label="Ventas 100% crédito" value={fmtN(data.credito.ventas_100_credito)} tip="Ventas donde crédito usado ≈ total." />
          <Kpi label="Ventas mixto" value={fmtN(data.credito.ventas_mixto)} tip="Ventas con crédito > 0 y pagos inmediatos > 0." />
          <Kpi label="Tiempo gen → uso (prom)" value={data.credito.tiempo_gen_uso_dias_prom != null ? `${data.credito.tiempo_gen_uso_dias_prom} d` : "—"} tip="AVG(fecha_salida − fecha_entrada) sobre cliente_creditos_consumos." />
          <Kpi label="Clientes con crédito sin volver" value={fmtN(data.credito.clientes_con_credito_sin_volver)} tip="Saldo > 0 y último movimiento hace > 30 días."
            onClick={() => setDrill({ metric: "clientes_con_credito_sin_volver", label: "Clientes con crédito sin volver" })} />
        </Grid>
      </Section>

      {/* Inventario */}
      <Section title="Inventario">
        <Grid>
          <Kpi label="Prendas ingresadas" value={fmtN(data.inventario.prendas_entradas)} tip="SUM(cantidad) mov ENTRADA origen='compra' en período." />
          <Kpi label="Prendas salidas" value={fmtN(data.inventario.prendas_salidas)} tip="SUM(cantidad) mov SALIDA origen='venta' en período." />
          <Kpi label="Diferencia neta" value={fmtN(data.inventario.diferencia_neta)} tip="Ingresadas − Salidas." />
          <Kpi label="Stock actual" value={fmtN(data.inventario.stock_actual)} tip="SUM(stock_actual)." />
          <Kpi label="Antigüedad prom (aprox)" value={data.inventario.antig_dias_prom != null ? `${data.inventario.antig_dias_prom} d` : "—"} tip="Días desde última ENTRADA por producto, ponderado por stock." />
          <Kpi label="Rotación (aprox)" value={data.inventario.rotacion_pct != null ? `${data.inventario.rotacion_pct}%` : "—"} tip="Salidas del período ÷ stock actual × 100." />
        </Grid>
      </Section>

      {/* Ventas */}
      <Section title="Ventas">
        <Grid>
          <Kpi label="Ventas" value={fmtN(data.ventas.cantidad)} tip="COUNT ventas no anuladas." />
          <Kpi label="Prendas vendidas" value={fmtN(data.ventas.prendas)} tip="SUM(cantidad) de items." />
          <Kpi label="Total" value={fmtGs(data.ventas.total)} tip="SUM(total)." />
          <Kpi label="Ticket promedio" value={fmtGs(data.ventas.ticket_promedio)} tip="Total ÷ cantidad ventas." />
          <Kpi label="Prendas/venta (prom)" value={data.ventas.prendas_por_venta_prom != null ? String(data.ventas.prendas_por_venta_prom) : "—"} tip="Prendas ÷ ventas." />
          <Kpi label="Promociones" value={fmtN(data.ventas.promociones_aplicadas)} tip="COUNT promocion_aplicaciones en período." />
          <Kpi label="Cashback total" value={fmtGs(data.ventas.cashback_total)} tip="SUM(cashback_generado)." />
          <Kpi label="Descuento total" value={fmtGs(data.ventas.descuento_total)} tip="SUM(descuento_aplicado)." />
          <Kpi label="Beneficios entregados" value={fmtN(data.ventas.beneficios_entregados)} tip="cliente_eventos tipo IN (cashback|beneficio|descuento|cambio)." />
          <Kpi label="Cambios" value={fmtN(data.ventas.cambios)} tip="cambios confirmados en período." />
          <Kpi label="Anulaciones venta" value={fmtN(data.ventas.anulaciones_venta)} tip="Ventas con estado='anulada'." onClick={() => setDrill({ metric: "anulaciones", label: "Anulaciones" })} />
          <Kpi label="Anulaciones recep." value={fmtN(data.ventas.anulaciones_recep)} tip="Recepciones con estado='anulada'." />
        </Grid>
        {data.ventas.pagos.length > 0 && (
          <div className="mt-3">
            <p className="text-xs uppercase font-bold text-slate-500 mb-2">Formas de pago</p>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-1.5">Método</th><th className="px-3 py-1.5 text-right">Operaciones</th><th className="px-3 py-1.5 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.ventas.pagos.map((p, i) => (
                  <tr key={i}><td className="px-3 py-1.5 capitalize">{p.metodo}</td><td className="px-3 py-1.5 text-right">{fmtN(p.ops)}</td><td className="px-3 py-1.5 text-right">{fmtGs(p.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Tabla comparativa sucursales */}
      <Section title="Comparación entre sucursales">
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2 text-right">Ventas</th>
                <th className="px-3 py-2 text-right">Ops.</th>
                <th className="px-3 py-2 text-right">Ticket</th>
                <th className="px-3 py-2 text-right">Visitas</th>
                <th className="px-3 py-2 text-right">Recurrentes</th>
                <th className="px-3 py-2 text-right">Conv.</th>
                <th className="px-3 py-2 text-right">Recibidas</th>
                <th className="px-3 py-2 text-right">Vendidas</th>
                <th className="px-3 py-2 text-right">Cred. gen/uso</th>
                <th className="px-3 py-2 text-right">Meta</th>
                <th className="px-3 py-2 text-right">Δ prev.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.sucursales.map(s => (
                <tr key={s.sucursal_id}>
                  <td className="px-3 py-2 font-medium text-slate-800">{s.nombre}</td>
                  <td className="px-3 py-2 text-right">{fmtGs(s.ventas)}</td>
                  <td className="px-3 py-2 text-right">{fmtN(s.operaciones)}</td>
                  <td className="px-3 py-2 text-right">{fmtGs(s.ticket_promedio)}</td>
                  <td className="px-3 py-2 text-right">{fmtN(s.visitas)}</td>
                  <td className="px-3 py-2 text-right">{fmtN(s.recurrentes)}</td>
                  <td className="px-3 py-2 text-right">{s.conversion_pct != null ? `${s.conversion_pct}%` : "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtN(s.prendas_recibidas)}</td>
                  <td className="px-3 py-2 text-right">{fmtN(s.prendas_vendidas)}</td>
                  <td className="px-3 py-2 text-right text-xs">{fmtGs(s.credito_generado)} / {fmtGs(s.credito_usado)}</td>
                  <td className="px-3 py-2 text-right">{s.pct_meta != null ? `${s.pct_meta}%` : "—"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${
                    s.var_ventas_pct == null ? "text-slate-400"
                    : s.var_ventas_pct >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}>{s.var_ventas_pct == null ? "—" : `${s.var_ventas_pct > 0 ? "+" : ""}${s.var_ventas_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Tipos de prenda */}
      <Section title={`Tipos de prenda más traídos (${data.periodo.desde} → ${data.periodo.hasta})`}>
        {data.tipos_prenda.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.tipos_prenda.map(t => (
              <li key={t.tipo_id ?? "sin_tipo"} className="flex items-center gap-3">
                <button
                  className="w-40 shrink-0 text-sm text-left text-slate-700 truncate hover:underline"
                  onClick={() => setDrill({ metric: "tipos_prenda_top", label: `Tipo: ${t.tipo_nombre}` })}
                >{t.tipo_nombre}</button>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${(t.cantidad / maxTipo) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-sm font-semibold text-slate-800 tabular-nums">{fmtN(t.cantidad)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

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
    </div>
  );
}

// ─── UI helpers ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wider font-bold text-slate-500">{title}</h3>
      {children}
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{children}</div>;
}
function Kpi({ label, value, sub, subTone, tip, onClick }: {
  label: string; value: string; sub?: string;
  subTone?: "up" | "down" | "neutral";
  tip?: string;
  onClick?: () => void;
}) {
  const subColor = subTone === "up" ? "text-emerald-700" : subTone === "down" ? "text-rose-700" : "text-slate-500";
  const Base = onClick ? "button" : "div";
  return (
    <Base
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={tip}
      className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left ${onClick ? "hover:border-[#4FAEB2] hover:shadow cursor-pointer transition" : ""}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-800">{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</p>}
    </Base>
  );
}
function MiniBars({ titulo, datos, max }: { titulo: string; datos: { label: string; n: number }[]; max: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase font-bold text-slate-500 mb-2">{titulo}</p>
      <ul className="space-y-1">
        {datos.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="w-10 shrink-0 text-slate-500">{d.label}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
              <div className="h-full bg-sky-500" style={{ width: `${(d.n / max) * 100}%` }} />
            </div>
            <span className="w-10 text-right tabular-nums">{d.n}</span>
          </li>
        ))}
      </ul>
    </div>
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
      <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 shrink-0">
          <h4 className="text-sm font-semibold text-slate-800">{label} <span className="text-slate-400 font-normal">— detalle</span></h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="overflow-auto flex-1">
          {err ? <div className="p-4 text-sm text-rose-700">{err}</div>
           : rows == null ? <div className="p-6 text-center text-sm text-slate-400">Cargando…</div>
           : rows.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">Sin datos.</div>
           : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500 sticky top-0">
                <tr>{cols.map(c => <th key={c} className="px-2 py-1.5">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i}>{cols.map(c => <td key={c} className="px-2 py-1 whitespace-nowrap">{fmtCell(r[c])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 shrink-0">
          Fórmula documentada en docs/dashboards-formulas.md.
        </div>
      </div>
    </div>
  );
}
function fmtCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString("es-PY");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("es-PY");
  return String(v);
}
