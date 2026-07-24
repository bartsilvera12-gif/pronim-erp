"use client";

/**
 * /otros-ingresos — Ingresos manuales que no son ventas.
 * Suman a caja, no tocan inventario. Aislado por sucursal (principal ve todo).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, X, Search, CheckCircle2, XCircle, AlertCircle, Calendar, Wallet,
} from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getEntidadesBancarias, type EntidadBancaria } from "@/lib/entidades/storage";
import { useT, useMoney } from "@/lib/i18n/context";

type MetodoPago =
  | "efectivo" | "transferencia" | "tarjeta" | "qr" | "billetera" | "credito_cliente" | "otro";

type Ingreso = {
  id: string;
  empresa_id: string;
  sucursal_id: string | null;
  caja_id: string | null;
  fecha: string;
  concepto: string;
  monto: number;
  metodo_pago: MetodoPago;
  entidad_bancaria_id: string | null;
  referencia: string | null;
  observaciones: string | null;
  creado_por: string | null;
  creado_por_email: string | null;
  anulado_at: string | null;
  anulado_by: string | null;
  anulacion_motivo: string | null;
  created_at: string;
};

const METODOS: { value: MetodoPago; labelKey: string }[] = [
  { value: "efectivo", labelKey: "Efectivo" },
  { value: "transferencia", labelKey: "Transferencia" },
  { value: "tarjeta", labelKey: "Tarjeta" },
  { value: "qr", labelKey: "QR" },
  { value: "billetera", labelKey: "Billetera" },
  { value: "credito_cliente", labelKey: "Crédito cliente" },
  { value: "otro", labelKey: "Otro" },
];

function fmtFechaCorta(d: string): string {
  try {
    // fecha viene YYYY-MM-DD
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
    return d;
  } catch { return d; }
}

export default function OtrosIngresosPage() {
  const t = useT();
  const money = useMoney();

  const [items, setItems] = useState<Ingreso[]>([]);
  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Filtros
  const [estado, setEstado] = useState<"activos" | "anulados" | "todos">("activos");
  const [metodo, setMetodo] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDeb, setBusquedaDeb] = useState("");

  const [creando, setCreando] = useState(false);

  useEffect(() => {
    const to = setTimeout(() => setBusquedaDeb(busqueda), 350);
    return () => clearTimeout(to);
  }, [busqueda]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      p.set("estado", estado);
      if (metodo) p.set("metodo_pago", metodo);
      if (fechaDesde) p.set("fecha_desde", fechaDesde);
      if (fechaHasta) p.set("fecha_hasta", fechaHasta);
      if (busquedaDeb) p.set("q", busquedaDeb);
      const r = await fetchWithSupabaseSession(`/api/otros-ingresos?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Error");
      setItems((j.data?.ingresos ?? []) as Ingreso[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [estado, metodo, fechaDesde, fechaHasta, busquedaDeb]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getEntidadesBancarias().then(setEntidades).catch(() => {}); }, []);

  function notifyOk(msg: string) {
    setOkMsg(msg);
    setTimeout(() => setOkMsg(null), 2800);
  }

  async function anular(ing: Ingreso) {
    const motivo = window.prompt(t("Anular ingreso \"{c}\" ({m}). Motivo (opcional):", { c: ing.concepto, m: money.format(Number(ing.monto)) }), "");
    if (motivo === null) return;
    try {
      const r = await fetchWithSupabaseSession(`/api/otros-ingresos/${ing.id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Error");
      notifyOk(t("Ingreso anulado."));
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t("No se pudo anular."));
    }
  }

  const totalActivos = useMemo(
    () => items.filter((i) => !i.anulado_at).reduce((s, i) => s + Number(i.monto || 0), 0),
    [items]
  );

  const inputClass =
    "h-10 rounded-lg border-2 border-slate-200 bg-white px-3 text-sm outline-none transition-all hover:border-slate-300 focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#4FAEB2]/10 border border-[#4FAEB2]/30 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3F8E91] mb-3">
            <Wallet className="h-3 w-3" />
            {t("Finanzas · Caja")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 tracking-tight leading-tight">
            {t("Otros ingresos")}
          </h1>
          <p className="text-[14px] text-slate-500 mt-1.5">
            {t("Ingresos manuales que no provienen de ventas. Suman a caja, no tocan inventario.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-bold px-4 py-2.5 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {t("Nuevo ingreso")}
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="h-4 w-4 text-red-500" /></button>
        </div>
      )}
      {okMsg && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />{okMsg}
        </div>
      )}

      <section className="bg-white rounded-2xl border-2 border-[#4FAEB2]/20 shadow-[0_2px_10px_-2px_rgba(79,174,178,0.12)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#4FAEB2]/15 bg-gradient-to-r from-[#4FAEB2]/5 to-transparent">
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(["activos","anulados","todos"] as const).map((e) => {
              const sel = estado === e;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEstado(e)}
                  className={`inline-flex items-center rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition-all ${
                    sel ? "border-[#4FAEB2] bg-[#4FAEB2] text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {e === "activos" ? t("Activos") : e === "anulados" ? t("Anulados") : t("Todos")}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={t("Buscar por concepto…")}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={`${inputClass} w-full pl-9 pr-9`}
              />
              {busqueda && (
                <button onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={`${inputClass} md:col-span-3`}>
              <option value="">{t("Todos los métodos")}</option>
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
              ))}
            </select>
            <div className="md:col-span-2 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                max={fechaHasta || undefined} className={`${inputClass} w-full`} />
            </div>
            <div className="md:col-span-2">
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                min={fechaDesde || undefined} className={`${inputClass} w-full`} />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50/70 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 font-semibold">{t("Fecha")}</th>
                <th className="px-3 py-3 font-semibold">{t("Concepto")}</th>
                <th className="px-3 py-3 font-semibold">{t("Método")}</th>
                <th className="px-3 py-3 font-semibold">{t("Entidad")}</th>
                <th className="px-3 py-3 font-semibold">{t("Usuario")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Monto")}</th>
                <th className="px-3 py-3 font-semibold">{t("Estado")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Acción")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-400">{t("Cargando…")}</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[#4FAEB2]/10 border border-[#4FAEB2]/20 mb-3">
                      <Wallet className="h-6 w-6 text-[#4FAEB2]" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{t("No hay ingresos para mostrar.")}</p>
                  </td>
                </tr>
              ) : (
                items.map((i) => {
                  const isAnulado = !!i.anulado_at;
                  const ent = entidades.find((e) => e.id === i.entidad_bancaria_id);
                  return (
                    <tr key={i.id} className={`hover:bg-[#4FAEB2]/5 transition-colors ${isAnulado ? "opacity-60" : ""}`}>
                      <td className="px-5 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">{fmtFechaCorta(i.fecha)}</td>
                      <td className="px-3 py-3">
                        <p className={`font-semibold text-slate-800 ${isAnulado ? "line-through" : ""}`}>{i.concepto}</p>
                        {i.observaciones && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{i.observaciones}</p>}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 capitalize">{i.metodo_pago}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{ent?.nombre ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{i.creado_por_email ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-[#3F8E91]">{money.format(Number(i.monto))}</td>
                      <td className="px-3 py-3">
                        {isAnulado ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600" title={i.anulacion_motivo ?? undefined}>
                            <XCircle className="h-3 w-3" />{t("Anulado")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />{t("Activo")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {!isAnulado && (
                          <button onClick={() => anular(i)} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                            <XCircle className="h-3 w-3" />{t("Anular")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-slate-50/40 border-t-2 border-slate-100">
                <tr>
                  <td colSpan={5} className="px-5 py-3 text-right font-bold text-slate-700">{t("Total activos del filtro")}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-lg text-[#3F8E91]">{money.format(totalActivos)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {creando && (
        <CrearIngresoModal
          entidades={entidades}
          onClose={() => setCreando(false)}
          onCreated={async () => {
            setCreando(false);
            notifyOk(t("Ingreso registrado."));
            await load();
          }}
        />
      )}
    </div>
  );
}

function CrearIngresoModal({
  entidades,
  onClose,
  onCreated,
}: {
  entidades: EntidadBancaria[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const t = useT();
  const money = useMoney();
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [entidadId, setEntidadId] = useState<string>("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const m = Number(monto);
    if (!concepto.trim()) return setError(t("Concepto requerido."));
    if (!Number.isFinite(m) || m <= 0) return setError(t("El monto debe ser mayor a 0."));
    setBusy(true); setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/otros-ingresos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha, concepto: concepto.trim(), monto: m, metodo_pago: metodo,
          entidad_bancaria_id: entidadId || null,
          referencia: referencia.trim() || null,
          observaciones: observaciones.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-sm focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20 outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border-2 border-[#4FAEB2]/20 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-[#4FAEB2]/5 to-transparent flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">{t("Nuevo ingreso")}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t("Suma a caja. No toca inventario.")}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Fecha")}</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Monto")} ({money.symbol}) *</label>
              <input type="number" min={0} step="any" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${inputCls} tabular-nums`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Concepto")} *</label>
            <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)}
              placeholder={t("Ej: Alquiler, venta de servicios")} maxLength={200} autoFocus className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Método de pago")} *</label>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={inputCls}>
                {METODOS.map((m) => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Entidad bancaria")}</label>
              <select value={entidadId} onChange={(e) => setEntidadId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {entidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Referencia")}</label>
            <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)}
              placeholder={t("Nº de comprobante, transferencia, etc.")} maxLength={200} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t("Observaciones")}</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} maxLength={1000}
              placeholder={t("Detalle adicional…")} className={`${inputCls} resize-none`} />
          </div>
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg disabled:opacity-50">{t("Cancelar")}</button>
          <button onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-bold px-5 py-2 transition-colors">
            {busy ? t("Registrando…") : t("Registrar")}
          </button>
        </div>
      </div>
    </div>
  );
}
