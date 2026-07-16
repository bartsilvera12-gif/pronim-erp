"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import MontoInput from "@/components/ui/MontoInput";
import { GlobalConfigSubpageShell } from "@/components/config/GlobalConfigSubpageShell";
import {
  ConfigFormCard,
  ConfigSectionTitle,
  ConfigHelpText,
  F_INPUT,
  F_LABEL,
} from "@/components/config/global-config-primitives";
import {
  ALERTAS_DEFAULTS,
  mergeConfig,
  SEGMENTO_LABELS,
  type AlertasConfig,
  type BeneficioCfg,
  type OverrideCfg,
  type SegmentoKey,
} from "@/lib/atencion/alertas-config";

// Claves de las 3 alertas cableadas hoy. El nombre `umbral` es el mismo
// campo numérico que valida cada una, con un label distinto por alerta.
type AlertaKey = "prendas_caras" | "prendas_baratas" | "pocas_prendas";
const ALERTAS_META: Record<AlertaKey, {
  titulo: string;
  descripcion: string;
  campoUmbral: "precio_min" | "precio_max" | "cantidad_max";
  labelUmbral: string;
  formato: "gs" | "int";
}> = {
  prendas_caras: {
    titulo: "Prendas caras",
    descripcion: "Se dispara cuando al menos una prenda en el carrito ‘lleva’ vale igual o más que el umbral.",
    campoUmbral: "precio_min",
    labelUmbral: "Precio mínimo (Gs.)",
    formato: "gs",
  },
  prendas_baratas: {
    titulo: "Prendas baratas",
    descripcion: "Se dispara cuando hay 2 o más líneas en ‘lleva’ con precio igual o menor al umbral.",
    campoUmbral: "precio_max",
    labelUmbral: "Precio máximo por prenda (Gs.)",
    formato: "gs",
  },
  pocas_prendas: {
    titulo: "Pocas prendas",
    descripcion: "Se dispara cuando el cliente lleva una cantidad total de prendas igual o menor al umbral.",
    campoUmbral: "cantidad_max",
    labelUmbral: "Cantidad máxima de prendas",
    formato: "int",
  },
};
const SEGMENTOS_EDITABLES: SegmentoKey[] = [
  "vip", "habitual", "nuevo", "dormido", "con_reclamos", "con_beneficios",
];

export default function ConfiguracionCajaPage() {
  const [config, setConfig] = useState<AlertasConfig>(ALERTAS_DEFAULTS);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [seccionOverridesAbierta, setSeccionOverridesAbierta] = useState<Record<AlertaKey, boolean>>({
    prendas_caras: false, prendas_baratas: false, pocas_prendas: false,
  });

  const cargar = useCallback(async () => {
    setError(null); setCargando(true);
    try {
      const [rc, ra] = await Promise.all([
        fetchWithSupabaseSession("/api/configuracion/atencion-alertas", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/auth/empresa-context", { cache: "no-store" }),
      ]);
      const jc = await rc.json();
      const ja = await ra.json().catch(() => ({}));
      if (jc?.success) setConfig(mergeConfig(jc.data?.config));
      if (ja?.success) setEsAdmin(Boolean(ja.data?.es_admin));
    } catch {
      setError("No se pudo cargar la configuración.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    if (!esAdmin) { setError("Solo un administrador puede guardar."); return; }
    setError(null); setOkMsg(null); setGuardando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/configuracion/atencion-alertas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? "Falló el guardado.");
      setConfig(mergeConfig(j.data?.config));
      setOkMsg("Guardado.");
      setTimeout(() => setOkMsg(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  function updateAlerta<K extends AlertaKey>(key: K, patch: Partial<AlertasConfig[K]>) {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function updateOverride(alerta: AlertaKey, seg: SegmentoKey, patch: OverrideCfg | null) {
    setConfig((prev) => {
      const overrides = { ...(prev[alerta].overrides ?? {}) };
      if (patch === null) {
        delete overrides[seg];
      } else {
        overrides[seg] = { ...(overrides[seg] ?? {}), ...patch };
        // Si quedó vacío, borrarlo
        if (!overrides[seg]?.titulo && !overrides[seg]?.mensaje) delete overrides[seg];
      }
      return { ...prev, [alerta]: { ...prev[alerta], overrides } };
    });
  }

  function updateBeneficio(idx: number, patch: Partial<BeneficioCfg>) {
    setConfig((prev) => ({
      ...prev,
      beneficios: prev.beneficios.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  }
  function addBeneficio() {
    setConfig((prev) => ({
      ...prev,
      beneficios: [
        ...prev.beneficios,
        { id: `custom_${Date.now()}`, label: "Nuevo beneficio", tipo_evento: "beneficio", pide_monto: false, genera_credito: false },
      ],
    }));
  }
  function removeBeneficio(idx: number) {
    setConfig((prev) => ({ ...prev, beneficios: prev.beneficios.filter((_, i) => i !== idx) }));
  }

  return (
    <GlobalConfigSubpageShell
      title="Caja — Alertas y beneficios"
      description="Configurá los mensajes que le aparecen al vendedor al armar y cerrar una atención en /caja. Cada alerta puede tener un mensaje distinto según el tipo de cliente."
    >
      {cargando ? (
        <ConfigFormCard>
          <p className="text-sm text-slate-500">Cargando…</p>
        </ConfigFormCard>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
          {okMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>
          )}
          {!esAdmin && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Estás viendo la configuración en modo lectura. Solo un administrador puede guardar cambios.
            </div>
          )}

          {(Object.keys(ALERTAS_META) as AlertaKey[]).map((key) => {
            const meta = ALERTAS_META[key];
            const a = config[key];
            const overrides = a.overrides ?? {};
            const overridesCount = Object.keys(overrides).length;
            return (
              <ConfigFormCard key={key}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <ConfigSectionTitle>{meta.titulo}</ConfigSectionTitle>
                    <p className="text-sm text-slate-600 -mt-3">{meta.descripcion}</p>
                  </div>
                  <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={a.activa}
                      onChange={(e) => updateAlerta(key, { activa: e.target.checked } as Partial<AlertasConfig[typeof key]>)}
                      disabled={!esAdmin}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700 font-medium">Activa</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={F_LABEL}>{meta.labelUmbral}</label>
                    {meta.formato === "gs" ? (
                      <MontoInput
                        value={Number((a as unknown as Record<string, number>)[meta.campoUmbral] ?? 0) || 0}
                        onChange={(n) => updateAlerta(key, { [meta.campoUmbral]: n } as Partial<AlertasConfig[typeof key]>)}
                        decimals={false}
                        disabled={!esAdmin}
                        className={F_INPUT}
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={Number((a as unknown as Record<string, number>)[meta.campoUmbral] ?? 0) || 0}
                        onChange={(e) => updateAlerta(key, { [meta.campoUmbral]: Number(e.target.value) || 0 } as Partial<AlertasConfig[typeof key]>)}
                        disabled={!esAdmin}
                        className={F_INPUT}
                      />
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <label className={F_LABEL}>Título (default)</label>
                  <input
                    type="text"
                    value={a.titulo}
                    onChange={(e) => updateAlerta(key, { titulo: e.target.value } as Partial<AlertasConfig[typeof key]>)}
                    disabled={!esAdmin}
                    className={F_INPUT}
                  />
                </div>
                <div className="mb-2">
                  <label className={F_LABEL}>Mensaje (default)</label>
                  <textarea
                    value={a.mensaje}
                    rows={2}
                    onChange={(e) => updateAlerta(key, { mensaje: e.target.value } as Partial<AlertasConfig[typeof key]>)}
                    disabled={!esAdmin}
                    className={F_INPUT + " resize-y"}
                  />
                  <ConfigHelpText>
                    Este mensaje se usa cuando el cliente no calza con ningún override.
                  </ConfigHelpText>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setSeccionOverridesAbierta((p) => ({ ...p, [key]: !p[key] }))}
                    className="flex items-center justify-between w-full text-left text-sm font-semibold text-slate-700 hover:text-[#3F8E91]"
                  >
                    <span>
                      Mensajes personalizados por tipo de cliente
                      {overridesCount > 0 && (
                        <span className="ml-2 rounded-full bg-[#4FAEB2]/15 text-[#3F8E91] px-2 py-0.5 text-[11px] font-semibold">
                          {overridesCount} activo{overridesCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    <span aria-hidden className="text-slate-400">{seccionOverridesAbierta[key] ? "▾" : "▸"}</span>
                  </button>
                  {seccionOverridesAbierta[key] && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-slate-500">
                        Precedencia: <em>Con reclamos</em> &gt; <em>Con beneficios</em> &gt; VIP &gt; Nuevo &gt; Dormido &gt; Frecuente &gt; default.
                        Dejá vacío para usar el mensaje default.
                      </p>
                      {SEGMENTOS_EDITABLES.map((seg) => {
                        const ov = overrides[seg];
                        const activo = Boolean(ov && (ov.titulo || ov.mensaje));
                        return (
                          <div
                            key={seg}
                            className={`rounded-xl border p-3 ${activo ? "border-[#4FAEB2]/40 bg-[#4FAEB2]/5" : "border-slate-200"}`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-sm font-semibold text-slate-800">{SEGMENTO_LABELS[seg]}</p>
                              {activo && esAdmin && (
                                <button
                                  type="button"
                                  onClick={() => updateOverride(key, seg, null)}
                                  className="text-xs text-rose-600 hover:underline"
                                >
                                  Borrar override
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <input
                                type="text"
                                placeholder={`Título específico para ${SEGMENTO_LABELS[seg].toLowerCase()} (opcional)`}
                                value={ov?.titulo ?? ""}
                                onChange={(e) => updateOverride(key, seg, { titulo: e.target.value })}
                                disabled={!esAdmin}
                                className={F_INPUT + " text-sm"}
                              />
                              <textarea
                                rows={2}
                                placeholder="Mensaje específico (opcional)"
                                value={ov?.mensaje ?? ""}
                                onChange={(e) => updateOverride(key, seg, { mensaje: e.target.value })}
                                disabled={!esAdmin}
                                className={F_INPUT + " text-sm resize-y"}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ConfigFormCard>
            );
          })}

          <ConfigFormCard>
            <div className="flex items-center justify-between mb-3">
              <ConfigSectionTitle>Beneficios entregables</ConfigSectionTitle>
              {esAdmin && (
                <button
                  type="button"
                  onClick={addBeneficio}
                  className="text-sm rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] text-white px-3 py-1.5 font-semibold shadow-sm"
                >
                  + Agregar
                </button>
              )}
            </div>
            <ConfigHelpText>
              Aparecen como checklist en el modal previo al cierre. Lo marcado se guarda en el historial del cliente y alimenta el chip “Ya recibió beneficios”.
            </ConfigHelpText>
            <div className="mt-4 space-y-3">
              {config.beneficios.map((b, i) => (
                <div key={`${b.id}-${i}`} className="rounded-xl border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                  <div className="sm:col-span-2">
                    <label className={F_LABEL}>Etiqueta</label>
                    <input
                      type="text"
                      value={b.label}
                      onChange={(e) => updateBeneficio(i, { label: e.target.value })}
                      disabled={!esAdmin}
                      className={F_INPUT + " text-sm"}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={F_LABEL}>Tipo de evento</label>
                    <select
                      value={b.tipo_evento}
                      onChange={(e) => updateBeneficio(i, { tipo_evento: e.target.value as BeneficioCfg["tipo_evento"] })}
                      disabled={!esAdmin}
                      className={F_INPUT + " text-sm"}
                    >
                      <option value="beneficio">Beneficio</option>
                      <option value="descuento">Descuento</option>
                      <option value="cashback">Cashback</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={b.pide_monto}
                      onChange={(e) => updateBeneficio(i, { pide_monto: e.target.checked })}
                      disabled={!esAdmin}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Pide monto
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(b.genera_credito)}
                      onChange={(e) => updateBeneficio(i, { genera_credito: e.target.checked })}
                      disabled={!esAdmin || b.tipo_evento !== "cashback"}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Genera crédito
                  </label>
                  {esAdmin && (
                    <div className="sm:col-span-6 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeBeneficio(i)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ConfigFormCard>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cargar}
              disabled={guardando}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Descartar cambios
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!esAdmin || guardando}
              className="rounded-lg bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 shadow-sm"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </GlobalConfigSubpageShell>
  );
}
