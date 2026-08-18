"use client";

// ═══════════════════════════════════════════════════════════════════════
// Compartidos entre las páginas "focus mode" de atención:
//   - /venta/nueva      → solo "el cliente lleva"
//   - /evaluacion/nueva → solo "el cliente trae"
//
// /atencion/nueva (Cambio directo) NO usa este archivo: se dejó exactamente
// como estaba para no romper el flujo atómico trae+lleva. Duplicación
// intencional acotada a los tipos y a los componentes puramente
// presentacionales que ya estaban en la caja original.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useState } from "react";
import MontoInput from "@/components/ui/MontoInput";
import { fmtActive } from "@/lib/i18n/currency";
import { PromptModal } from "@/components/ui/PromptModal";

export type Franja = {
  id: string;
  nombre: string;
  sku: string | null;
  precio_venta: number | string;
  stock_actual: number | string | null;
};

export type Cliente = {
  id: string;
  nombre: string;
  empresa?: string | null;
  ruc?: string | null;
  telefono?: string | null;
};

export type Linea = {
  franja_id: string;
  precio_referencia: number;
  precio_unitario: number;
  cantidad: number;
  tipo_prenda_id?: string | null;
  /** Descuento manual por unidad (Gs./R$). Aplicado a LLEVA en /venta/nueva. */
  descuento_unitario?: number;
};

export type TipoPrenda = { id: string; nombre: string; orden: number; activo: boolean };

export const fmtGs = fmtActive;

/** Quita "Prenda - Categoría" y precios embebidos ("Gs. XXX"/"R$ XXX"). */
export function short(str: string): string {
  return str
    .replace(/^Prenda\s*-\s*Categor[ií]a\s*/i, "")
    .replace(/Gs\.?\s*[\d.,]+/gi, "")
    .replace(/R\$\s*[\d.,]+/gi, "")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Columna reusable (misma implementación que caja original)
// ─────────────────────────────────────────────────────────────────────────
export function ColumnaAtencion(props: {
  titulo: string;
  descripcion: string;
  tono: "emerald" | "sky";
  franjas: Franja[];
  cargando: boolean;
  lineas: Linea[];
  total: number;
  onAgregar: (f: Franja) => void;
  onActualizar: (idx: number, patch: Partial<Linea>) => void;
  onQuitar: (idx: number) => void;
  permitirEditarPrecio: boolean;
  /** Muestra columna Desc. por línea (LLEVA). */
  permitirDescuento?: boolean;
  subtotalItems?: number;
  accionesHeader?: React.ReactNode;
  slotDebajo?: React.ReactNode;
  tiposPrenda?: TipoPrenda[];
  /** Si viene, se muestra botón "+ Franja con precio manual" al pie del grid.
   *  Crea la franja server-side y devuelve la Franja para agregarla al toque. */
  onCrearFranjaManual?: (precio: number) => Promise<Franja | null>;
}) {
  const {
    titulo, descripcion, tono, franjas, cargando, lineas, total,
    onAgregar, onActualizar, onQuitar, permitirEditarPrecio, permitirDescuento,
    subtotalItems, accionesHeader, slotDebajo, tiposPrenda, onCrearFranjaManual,
  } = props;
  const [modalManualOpen, setModalManualOpen] = useState(false);
  const [creandoManual, setCreandoManual] = useState(false);
  const [errorManual, setErrorManual] = useState<string | null>(null);
  const border = tono === "emerald" ? "border-emerald-200" : "border-sky-200";
  const bg = tono === "emerald" ? "bg-emerald-50/40" : "bg-sky-50/40";
  const btn = tono === "emerald"
    ? "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
    : "border-sky-200 hover:border-sky-400 hover:bg-sky-50";
  const title = tono === "emerald" ? "text-emerald-700" : "text-sky-700";
  const delta = subtotalItems != null ? total - subtotalItems : 0;
  const hayAjuste = subtotalItems != null && delta !== 0;

  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 sm:p-5`}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className={`text-sm font-bold uppercase tracking-wider ${title}`}>{titulo}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
          {accionesHeader && <div className="mt-2">{accionesHeader}</div>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase text-slate-500">{hayAjuste ? "A pagar (final)" : "Subtotal"}</p>
          <p className="text-lg font-bold text-slate-800">{fmtGs(total)}</p>
          {hayAjuste && subtotalItems != null && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Subtotal <span className="line-through">{fmtGs(subtotalItems)}</span>
              <span className={`ml-1 font-semibold ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {delta > 0 ? "+" : ""}{fmtGs(delta)}
              </span>
            </p>
          )}
        </div>
      </div>

      {cargando ? (
        <p className="text-xs text-slate-400 py-4 text-center animate-pulse">Cargando categorías…</p>
      ) : franjas.length === 0 ? (
        <p className="text-xs text-amber-700 py-4 text-center">
          No hay franjas de precio configuradas. Un administrador debe crearlas en <Link href="/admin/franjas" className="underline">Categorías</Link>.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {franjas.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onAgregar(f)}
                title={f.nombre}
                className={`rounded-lg border bg-white px-2 py-2 text-center transition-colors active:scale-95 ${btn}`}
              >
                {short(f.nombre) && <p className="text-[10px] text-slate-400 uppercase">{short(f.nombre)}</p>}
                <p className="text-sm font-bold text-slate-800">{fmtGs(Number(f.precio_venta) || 0)}</p>
              </button>
            ))}
          </div>
          {onCrearFranjaManual && (
            <button type="button"
              onClick={() => { setErrorManual(null); setModalManualOpen(true); }}
              className={`mt-2 w-full rounded-lg border border-dashed py-2 text-xs font-medium hover:bg-slate-50 ${
                tono === "emerald"
                  ? "border-emerald-300 text-emerald-700 hover:border-emerald-400"
                  : "border-sky-300 text-sky-700 hover:border-sky-400"
              }`}>
              ＋ Franja con precio manual
            </button>
          )}
        </>
      )}
      {errorManual && (
        <p className="mt-1 text-xs text-rose-600">{errorManual}</p>
      )}
      <PromptModal
        open={modalManualOpen}
        title="Franja con precio manual"
        description="Escribí el precio exacto. Se crea la categoría al vuelo y se agrega al carrito."
        inputType="number"
        placeholder="Ej: 27.500"
        confirmLabel={creandoManual ? "Creando…" : "Crear y agregar"}
        onCancel={() => setModalManualOpen(false)}
        onConfirm={async (v) => {
          const precio = Number(String(v).replace(/[^\d]/g, ""));
          if (!(precio > 0) || !onCrearFranjaManual) {
            setErrorManual("Precio inválido.");
            setModalManualOpen(false);
            return;
          }
          setCreandoManual(true); setErrorManual(null);
          try {
            const franja = await onCrearFranjaManual(precio);
            if (franja) onAgregar(franja);
            else setErrorManual("No se pudo crear la franja.");
            setModalManualOpen(false);
          } catch (e) {
            setErrorManual(e instanceof Error ? e.message : "Error al crear la franja.");
            setModalManualOpen(false);
          } finally {
            setCreandoManual(false);
          }
        }}
      />

      {lineas.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide">Categoría</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-20">Cant.</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-32">Precio unit.</th>
                {permitirDescuento && (
                  <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-24" title="Descuento por unidad">Desc.</th>
                )}
                <th className="text-right text-[11px] font-semibold text-slate-500 px-3 py-2 uppercase tracking-wide w-28">Subtotal</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((l, idx) => (
                <tr key={`${l.franja_id}::${l.tipo_prenda_id ?? ""}::${idx}`}>
                  <td className="px-3 py-2 text-slate-700">
                    {fmtGs(l.precio_referencia)}
                    {tiposPrenda && tiposPrenda.length > 0 && (
                      <select
                        value={l.tipo_prenda_id ?? ""}
                        onChange={(e) => onActualizar(idx, { tipo_prenda_id: e.target.value || null })}
                        className="ml-2 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        aria-label="Tipo de prenda"
                        title="Tipo de prenda (opcional)"
                      >
                        <option value="">— tipo —</option>
                        {tiposPrenda.map((t) => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={l.cantidad === 0 ? "" : l.cantidad}
                      onChange={(e) => {
                        const v = e.target.value;
                        const n = v === "" ? 0 : Number(v);
                        onActualizar(idx, { cantidad: Number.isFinite(n) && n >= 0 ? n : 0 });
                      }}
                      onBlur={() => { if (l.cantidad <= 0) onQuitar(idx); }}
                      placeholder="0"
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {permitirEditarPrecio ? (
                      <MontoInput
                        value={l.precio_unitario}
                        onChange={(n) => onActualizar(idx, { precio_unitario: Math.max(0, n) })}
                        decimals={false}
                        className="w-28 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                      />
                    ) : (
                      <span className="text-slate-700">{fmtGs(l.precio_unitario)}</span>
                    )}
                  </td>
                  {permitirDescuento && (
                    <td className="px-3 py-2 text-right">
                      <MontoInput
                        value={Number(l.descuento_unitario) || 0}
                        onChange={(n) => onActualizar(idx, { descuento_unitario: Math.max(0, Math.min(n, l.precio_unitario)) })}
                        decimals={false}
                        className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-medium text-slate-800">
                    {(() => {
                      const desc = Math.max(0, Math.min(Number(l.descuento_unitario) || 0, l.precio_unitario));
                      const sub = (l.precio_unitario - desc) * l.cantidad;
                      return (
                        <>
                          {fmtGs(sub)}
                          {desc > 0 && (
                            <p className="text-[10px] text-emerald-700 mt-0.5">−{fmtGs(desc * l.cantidad)}</p>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onQuitar(idx)}
                      title="Quitar"
                      className="text-slate-400 hover:text-red-600 text-lg leading-none"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {slotDebajo && <div className="mt-4">{slotDebajo}</div>}
    </div>
  );
}

export function ResumenRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-2 ${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function BalanceItem({ label, value, tone }: { label: string; value: string; tone: "emerald" | "sky" | "amber" | "slate" }) {
  const bg = tone === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : tone === "sky" ? "bg-sky-50 border-sky-200 text-sky-800"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-slate-50 border-slate-200 text-slate-700";
  return (
    <div className={`rounded-lg border px-3 py-2 ${bg}`}>
      <p className="text-[10px] uppercase font-semibold">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modal de alta rápida de cliente (mismo comportamiento que caja original)
// ─────────────────────────────────────────────────────────────────────────
export function NuevoClienteRapidoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Cliente) => void;
}) {
  const [tipo, setTipo] = useState<"empresa" | "persona">("empresa");
  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [telefono, setTelefono] = useState("");
  const [comoConocio, setComoConocio] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const puedeGuardar = razonSocial.trim().length > 0 && !saving;

  async function submit() {
    setErr(null);
    if (!razonSocial.trim()) {
      setErr(tipo === "empresa" ? "La razón social es obligatoria." : "El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tipo_cliente: tipo,
        nombre_contacto: razonSocial.trim().toUpperCase(),
        empresa: tipo === "empresa" ? razonSocial.trim().toUpperCase() : null,
        ruc: ruc.trim() || null,
        telefono: telefono.trim() || null,
        como_conocio: comoConocio.trim() || null,
        estado: "activo",
      };
      const res = await fetch("/api/clientes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) {
        throw new Error(j?.error ?? `No se pudo crear el cliente (${res.status}).`);
      }
      const data = (j.data ?? {}) as {
        id?: string; empresa?: string | null; nombre?: string | null;
        nombre_contacto?: string | null; ruc?: string | null;
      };
      if (!data.id) throw new Error("El servidor no devolvió el id del cliente.");
      const nombre =
        (data.empresa ?? "").trim() ||
        (data.nombre_contacto ?? "").trim() ||
        (data.nombre ?? "").trim() ||
        razonSocial.trim().toUpperCase();
      onCreated({
        id: data.id, nombre,
        empresa: data.empresa ?? null,
        ruc: (data.ruc ?? "").trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al crear el cliente.");
    } finally {
      setSaving(false);
    }
  }

  const nombreLabel = tipo === "empresa" ? "Razón social" : "Nombre completo";
  const nombrePlaceholder = tipo === "empresa" ? "Ej: TALLER VIDAL S.A." : "Ej: MARÍA PÉREZ";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Nuevo cliente</h3>
            <p className="mt-1 text-xs text-slate-500">
              Solo los datos mínimos. Podés completar el resto desde la ficha del cliente.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-1">
          {(["empresa", "persona"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                tipo === t ? "bg-white text-slate-900 shadow-sm ring-1 ring-[#4FAEB2]/40" : "text-slate-500 hover:text-slate-800"
              }`}>
              {t === "empresa" ? "Empresa" : "Persona"}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {nombreLabel} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)}
              placeholder={nombrePlaceholder} autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {tipo === "empresa" ? "RUC" : "RUC / CI (opcional)"}
            </label>
            <input type="text" value={ruc} onChange={(e) => setRuc(e.target.value)}
              placeholder="Ej: 80011405-1"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Teléfono <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 0991 234 567"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              ¿Cómo conoció la tienda? <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input type="text" value={comoConocio} onChange={(e) => setComoConocio(e.target.value)}
              placeholder="Ej: Instagram, referida por María…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
          </div>
        </div>

        {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={!puedeGuardar}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
            {saving ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

