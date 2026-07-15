"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Promo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: "descuento_pct" | "descuento_fijo" | "lleve_n_pague_m" | "cashback";
  valor: number | string;
  lleve_n: number | null;
  pague_m: number | null;
  cupon_codigo: string | null;
  ambito: "general" | "franja" | "sucursal" | "cliente";
  fecha_desde: string | null;
  fecha_hasta: string | null;
  minimo_compra: number | string;
  activo: boolean;
  created_at: string;
};

const TIPO_LABEL: Record<string, string> = {
  descuento_pct: "Descuento %",
  descuento_fijo: "Descuento Gs.",
  lleve_n_pague_m: "Lleve X pague Y",
  cashback: "Cashback %",
};

function fmtValor(p: Promo): string {
  if (p.tipo === "descuento_pct") return `${p.valor}%`;
  if (p.tipo === "cashback") return `${p.valor}% cashback`;
  if (p.tipo === "descuento_fijo") return `Gs. ${Math.round(Number(p.valor)).toLocaleString("es-PY")}`;
  if (p.tipo === "lleve_n_pague_m") return `Lleve ${p.lleve_n} pague ${p.pague_m}`;
  return "-";
}

export default function AdminPromocionesPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function cargar() {
    setError(null); setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/promociones", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "Error");
      setPromos((j?.data?.promociones ?? []) as Promo[]);
      if (j?.data?.warning) setError(j.data.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function toggleActivo(p: Promo) {
    try {
      const r = await fetchWithSupabaseSession("/api/promociones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, activo: !p.activo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "Error");
      cargar();
      setOk(!p.activo ? "Promoción activada." : "Promoción pausada.");
      setTimeout(() => setOk(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Promociones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Descuentos, cupones, 3x2 y cashback. Se aplican desde la Caja al confirmar la venta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 bg-[#4FAEB2] hover:bg-[#3F8E91] text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm"
        >
          + Nueva promoción
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        {cargando ? (
          <p className="py-16 text-center text-sm text-gray-400 animate-pulse">Cargando…</p>
        ) : promos.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Aún no hay promociones. Creá la primera con el botón de arriba.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Nombre</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Tipo</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Valor</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Ámbito</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Cupón</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Vigencia</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {promos.map((p) => (
                <tr key={p.id} className={p.activo ? "" : "opacity-60"}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {p.nombre}
                    {p.descripcion && <p className="text-xs text-slate-500 mt-0.5">{p.descripcion}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{TIPO_LABEL[p.tipo]}</td>
                  <td className="px-4 py-3 font-medium">{fmtValor(p)}</td>
                  <td className="px-4 py-3 text-xs capitalize">{p.ambito}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.cupon_codigo ?? <span className="text-slate-400">(auto)</span>}</td>
                  <td className="px-4 py-3 text-xs">
                    {(p.fecha_desde || p.fecha_hasta)
                      ? `${p.fecha_desde ?? "…"} → ${p.fecha_hasta ?? "…"}`
                      : <span className="text-slate-400">sin límite</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      p.activo ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    }`}>
                      {p.activo ? "Activa" : "Pausada"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleActivo(p)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {p.activo ? "Pausar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-slate-400">
        Las promociones activas se aplican automáticamente en la <Link href="/atencion/nueva" className="underline">Caja</Link>.
        Las que requieren código se aplican al escribir el cupón en el bloque de balance.
      </div>

      {modalOpen && <NuevaPromocionModal onClose={() => setModalOpen(false)} onCreated={() => { setModalOpen(false); cargar(); setOk("Promoción creada."); setTimeout(() => setOk(null), 3000); }} />}
    </div>
  );
}

function NuevaPromocionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<"descuento_pct" | "descuento_fijo" | "lleve_n_pague_m" | "cashback">("descuento_pct");
  const [valor, setValor] = useState("10");
  const [lleveN, setLleveN] = useState("3");
  const [pagueM, setPagueM] = useState("2");
  const [cupon, setCupon] = useState("");
  const [ambito, setAmbito] = useState<"general" | "franja" | "sucursal" | "cliente">("general");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [minimo, setMinimo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!nombre.trim()) { setErr("Nombre obligatorio."); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        tipo,
        valor: Number(valor) || 0,
        ambito,
        cupon_codigo: cupon.trim() || null,
        fecha_desde: fechaDesde || null,
        fecha_hasta: fechaHasta || null,
        minimo_compra: Number(minimo) || 0,
        activo: true,
      };
      if (tipo === "lleve_n_pague_m") {
        body.lleve_n = Number(lleveN);
        body.pague_m = Number(pagueM);
      }
      const r = await fetchWithSupabaseSession("/api/promociones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "Error");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Nueva promoción</h3>
        {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Nombre *</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Ej: Descuento invierno"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Descripción (opcional)</label>
            <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tipo</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["descuento_pct","descuento_fijo","lleve_n_pague_m","cashback"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    tipo === t ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91] ring-2 ring-[#4FAEB2]/20" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}>{TIPO_LABEL[t]}</button>
              ))}
            </div>
          </div>
          {tipo === "lleve_n_pague_m" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Lleve</label>
                <input type="number" min={2} value={lleveN} onChange={(e) => setLleveN(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pague</label>
                <input type="number" min={1} value={pagueM} onChange={(e) => setPagueM(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {tipo === "descuento_pct" || tipo === "cashback" ? "Porcentaje (%)" : "Monto (Gs.)"}
              </label>
              <input type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Ámbito</label>
            <select value={ambito} onChange={(e) => setAmbito(e.target.value as "general"|"franja"|"sucursal"|"cliente")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]">
              <option value="general">General (toda venta)</option>
              <option value="franja">Franja de precio específica</option>
              <option value="sucursal">Sucursal específica</option>
              <option value="cliente">Cliente específico</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Cuando el ámbito es específico, la restricción se puede ajustar por SQL en un update posterior (MVP).</p>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Código de cupón (opcional)
            </label>
            <input type="text" value={cupon} onChange={(e) => setCupon(e.target.value.toUpperCase())} placeholder="Ej: INVIERNO2026"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
            <p className="text-[11px] text-slate-400 mt-1">Si dejás vacío, la promoción se aplica automáticamente cuando corresponde. Con código, solo si la cajera lo escribe.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Vigencia desde</label>
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Vigencia hasta</label>
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Mínimo de compra (Gs.) <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input type="number" min={0} value={minimo} onChange={(e) => setMinimo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || !nombre.trim()} className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 shadow-sm">
            {saving ? "Creando…" : "Crear promoción"}
          </button>
        </div>
      </div>
    </div>
  );
}
