"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fmtActive } from "@/lib/i18n/currency";

type Mov = {
  fecha: string; origen: string; tipo: string; concepto: string;
  metodo: string | null; entidad: string | null; referencia: string | null;
  cliente: string | null; numero: string | null;
  sucursal: string | null; caja_numero: string | null;
  monto: number; signo: number; neto: number; afecta_efectivo: boolean;
  usuario: string | null;
};
type Sucursal = { id: string; nombre: string };

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  qr: "QR",
  billetera: "Billetera",
  credito_cliente: "Crédito del cliente",
  credito: "Crédito en productos",
  consignacion: "Consignación",
  otro: "Otro",
};

const ORIGEN_LABEL: Record<string, string> = {
  venta: "Ventas",
  evaluacion: "Evaluaciones",
  compra: "Compras a proveedor",
  gasto: "Gastos",
  otro_ingreso: "Otros ingresos",
  manual: "Movimientos de caja",
  apertura: "Aperturas de caja",
};

function hoyISO() { return new Date().toISOString().slice(0, 10); }

/** Primer día del mes actual, en ISO. */
function inicioMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const fecha = d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const hora = d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  return `${fecha} ${hora}`;
}

export default function ReporteCajaMovimientosPage() {
  const [rows, setRows] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Arranca en HOY: el uso principal es cerrar el día y que cuadre.
  const [desde, setDesde] = useState<string>(hoyISO);
  const [hasta, setHasta] = useState<string>(hoyISO);
  const [sucursalId, setSucursalId] = useState<string>("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  useEffect(() => {
    fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSucursales((j?.data?.sucursales ?? j?.sucursales ?? []) as Sucursal[]))
      .catch(() => { /* el filtro simplemente no aparece */ });
  }, []);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams({ desde, hasta });
    if (sucursalId) qs.set("sucursal_id", sucursalId);
    fetchWithSupabaseSession(`/api/reportes/caja-movimientos?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) { setError(j?.error ?? "No se pudo cargar el reporte."); setRows([]); }
        else setRows((j.data?.movimientos ?? []) as Mov[]);
      })
      .catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : "Error de red"); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta, sucursalId]);

  const resumen = useMemo(() => {
    let entra = 0, sale = 0, efectivo = 0;
    const porMetodo = new Map<string, { entra: number; sale: number }>();
    const porOrigen = new Map<string, { entra: number; sale: number; n: number }>();
    for (const r of rows) {
      if (r.neto >= 0) entra += r.neto; else sale += -r.neto;
      if (r.afecta_efectivo) efectivo += r.neto;

      const km = r.metodo ?? "__sin__";
      const m = porMetodo.get(km) ?? { entra: 0, sale: 0 };
      if (r.neto >= 0) m.entra += r.neto; else m.sale += -r.neto;
      porMetodo.set(km, m);

      const o = porOrigen.get(r.origen) ?? { entra: 0, sale: 0, n: 0 };
      if (r.neto >= 0) o.entra += r.neto; else o.sale += -r.neto;
      o.n += 1;
      porOrigen.set(r.origen, o);
    }
    return {
      entra, sale, neto: entra - sale, efectivo,
      porMetodo: [...porMetodo.entries()].sort((a, b) => (b[1].entra + b[1].sale) - (a[1].entra + a[1].sale)),
      porOrigen: [...porOrigen.entries()].sort((a, b) => (b[1].entra + b[1].sale) - (a[1].entra + a[1].sale)),
    };
  }, [rows]);

  /** Cuántos movimientos no declaran forma de pago (gastos y compras). */
  const sinMetodo = useMemo(() => rows.filter((r) => !r.metodo).length, [rows]);

  const preset = (d: string, h: string) => { setDesde(d); setHasta(h); };
  const esPreset = (d: string, h: string) => desde === d && hasta === h;

  const botonPreset = "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";
  const presetOn = "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]";
  const presetOff = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400 print:hidden">
        <Link href="/reportes" className="hover:text-[#4FAEB2] transition-colors">Reportes</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Movimientos de caja</span>
      </div>

      <PageHeader
        eyebrow="Zentra · Análisis"
        title="Movimientos de caja"
        description="Todo lo que entró y salió de plata en el período, para corroborar las transacciones del día."
      />

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>

          {sucursales.length > 1 && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Sucursal</label>
              <select
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              >
                <option value="">Todas</option>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => preset(hoyISO(), hoyISO())}
              className={`${botonPreset} ${esPreset(hoyISO(), hoyISO()) ? presetOn : presetOff}`}>Hoy</button>
            <button type="button" onClick={() => preset(sumarDias(hoyISO(), -1), sumarDias(hoyISO(), -1))}
              className={`${botonPreset} ${esPreset(sumarDias(hoyISO(), -1), sumarDias(hoyISO(), -1)) ? presetOn : presetOff}`}>Ayer</button>
            <button type="button" onClick={() => preset(sumarDias(hoyISO(), -6), hoyISO())}
              className={`${botonPreset} ${esPreset(sumarDias(hoyISO(), -6), hoyISO()) ? presetOn : presetOff}`}>7 días</button>
            <button type="button" onClick={() => preset(inicioMesISO(), hoyISO())}
              className={`${botonPreset} ${esPreset(inicioMesISO(), hoyISO()) ? presetOn : presetOff}`}>Este mes</button>
            <button type="button" onClick={() => window.print()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
              🖨 Imprimir
            </button>
            <Link href="/explorar/caja-movimientos"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
              🔎 Explorar (Excel)
            </Link>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* ── Totales ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta label="Entró" valor={fmtActive(resumen.entra)} tono="emerald" nota={`${rows.length} movimiento${rows.length === 1 ? "" : "s"}`} />
        <Tarjeta label="Salió" valor={fmtActive(resumen.sale)} tono="rose" nota="pagos, gastos, retiros" />
        <Tarjeta label="Neto del período" valor={fmtActive(resumen.neto)} tono={resumen.neto >= 0 ? "emerald" : "rose"} nota="entró − salió" />
        <Tarjeta label="Efectivo en caja" valor={fmtActive(resumen.efectivo)} tono="teal" nota="solo lo declarado en efectivo" />
      </div>

      {/* ── Cortes ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel titulo="Por forma de pago" subtitulo="Con qué se cobró y con qué se pagó">
          {resumen.porMetodo.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sin movimientos en el período.</p>
          ) : (
            <TablaCorte
              filas={resumen.porMetodo.map(([k, v]) => ({
                etiqueta: k === "__sin__" ? "Sin forma de pago registrada" : (METODO_LABEL[k] ?? k),
                entra: v.entra,
                sale: v.sale,
              }))}
            />
          )}
        </Panel>

        <Panel titulo="Por origen" subtitulo="De dónde viene cada movimiento">
          {resumen.porOrigen.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sin movimientos en el período.</p>
          ) : (
            <TablaCorte
              filas={resumen.porOrigen.map(([k, v]) => ({
                etiqueta: `${ORIGEN_LABEL[k] ?? k} (${v.n})`,
                entra: v.entra,
                sale: v.sale,
              }))}
            />
          )}
        </Panel>
      </div>

      {sinMetodo > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 print:hidden">
          <strong>{sinMetodo}</strong> movimiento{sinMetodo === 1 ? "" : "s"} sin forma de pago registrada
          (gastos y compras a proveedor no la guardan). Aparecen en el listado y en el neto, pero
          <strong> no se cuentan en &ldquo;Efectivo en caja&rdquo;</strong> para no descuadrar el arqueo.
        </p>
      )}

      {/* ── Detalle ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/15">
        <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Detalle</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Cada movimiento del período, del más reciente al más viejo</p>
          </div>
        </div>

        {cargando ? (
          <p className="animate-pulse py-12 text-center text-sm text-slate-400">Cargando movimientos…</p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">Sin movimientos en el período elegido.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {["Fecha", "Origen", "Concepto", "Cliente / Nº", "Forma de pago", "Sucursal", "Monto"].map((h) => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${h === "Monto" ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="even:bg-slate-50/40 hover:bg-[#4FAEB2]/[0.06] transition-colors">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-600">{fmtFechaHora(r.fecha)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {r.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-800">
                      {r.concepto}
                      {r.referencia && <span className="ml-2 text-[11px] text-slate-400">{r.referencia}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {r.cliente ?? "—"}
                      {r.numero && <span className="ml-2 font-mono text-[11px] text-slate-400">{r.numero}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {r.metodo ? (METODO_LABEL[r.metodo] ?? r.metodo) : <span className="text-slate-300">—</span>}
                      {r.entidad && <span className="ml-1.5 text-[11px] text-slate-400">{r.entidad}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {r.sucursal ?? "—"}
                      {r.caja_numero && <span className="ml-1.5 text-[11px] text-slate-400">caja {r.caja_numero}</span>}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${r.neto >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {r.neto >= 0 ? "+" : "−"} {fmtActive(Math.abs(r.neto))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100">
                  <td colSpan={6} className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                    Neto del período
                  </td>
                  <td className={`px-3 py-2.5 text-right text-sm font-bold tabular-nums ${resumen.neto >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {fmtActive(resumen.neto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({ label, valor, nota, tono }: {
  label: string; valor: string; nota?: string;
  tono: "emerald" | "rose" | "teal";
}) {
  const color =
    tono === "emerald" ? "text-emerald-700"
    : tono === "rose" ? "text-rose-600"
    : "text-[#3F8E91]";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm ring-1 ring-[#4FAEB2]/10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums leading-tight ${color}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-slate-400">{nota}</p>}
    </div>
  );
}

function Panel({ titulo, subtitulo, children }: {
  titulo: string; subtitulo: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-[#4FAEB2]/15">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">{titulo}</h2>
      <p className="mt-0.5 mb-3 text-[11px] text-slate-500">{subtitulo}</p>
      {children}
    </div>
  );
}

function TablaCorte({ filas }: { filas: { etiqueta: string; entra: number; sale: number }[] }) {
  const totalEntra = filas.reduce((s, f) => s + f.entra, 0);
  const totalSale = filas.reduce((s, f) => s + f.sale, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Concepto</th>
          <th className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Entró</th>
          <th className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Salió</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filas.map((f) => (
          <tr key={f.etiqueta}>
            <td className="py-2 text-xs text-slate-700">{f.etiqueta}</td>
            <td className="py-2 text-right text-xs font-medium tabular-nums text-emerald-700">
              {f.entra > 0 ? fmtActive(f.entra) : <span className="text-slate-300">—</span>}
            </td>
            <td className="py-2 text-right text-xs font-medium tabular-nums text-rose-600">
              {f.sale > 0 ? fmtActive(f.sale) : <span className="text-slate-300">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-slate-200">
          <td className="py-2 text-xs font-bold uppercase tracking-wide text-slate-600">Total</td>
          <td className="py-2 text-right text-xs font-bold tabular-nums text-emerald-700">{fmtActive(totalEntra)}</td>
          <td className="py-2 text-right text-xs font-bold tabular-nums text-rose-600">{fmtActive(totalSale)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
