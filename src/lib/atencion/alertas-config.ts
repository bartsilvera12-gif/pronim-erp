/**
 * Tipos, defaults y helper para la config del modal previo al cierre de
 * atención (/caja) y sus sticky notes. Se comparte entre la pantalla de
 * caja y la de configuración (/configuracion/caja).
 */

export type SegmentoKey =
  | "vip"
  | "habitual"
  | "nuevo"
  | "dormido"
  | "con_reclamos"
  | "con_beneficios";

export const SEGMENTO_LABELS: Record<SegmentoKey, string> = {
  vip: "Cliente VIP",
  habitual: "Cliente frecuente",
  nuevo: "Cliente nuevo",
  dormido: "Hace tiempo que no visita",
  con_reclamos: "Con reclamos previos",
  con_beneficios: "Ya recibió beneficios",
};

/**
 * Orden de precedencia al elegir qué override aplicar. Los flags
 * (con_reclamos / con_beneficios) ganan sobre la categoría, porque son
 * situaciones puntuales que suelen requerir cuidado extra.
 */
export const OVERRIDE_PRIORITY: SegmentoKey[] = [
  "con_reclamos",
  "con_beneficios",
  "vip",
  "nuevo",
  "dormido",
  "habitual",
];

export type OverrideCfg = { titulo?: string; mensaje?: string };

export type AlertaBase = {
  activa: boolean;
  titulo: string;
  mensaje: string;
  overrides?: Partial<Record<SegmentoKey, OverrideCfg>>;
};

export type AlertaPrendasCaras = AlertaBase & { precio_min: number };
export type AlertaPrendasBaratas = AlertaBase & { precio_max: number };
export type AlertaPocasPrendas = AlertaBase & { cantidad_max: number };

export type BeneficioCfg = {
  id: string;
  label: string;
  tipo_evento: "beneficio" | "descuento" | "cashback" | "otro";
  pide_monto: boolean;
  genera_credito?: boolean;
  /**
   * Tope máximo por operación cuando genera_credito=true. Es OBLIGATORIO
   * en ese caso; el admin lo fija desde /configuracion/caja. Sin default
   * silencioso: si no está o es <= 0, el server rechaza el uso del
   * beneficio (evita que se manipule el request para emitir crédito
   * arbitrario).
   */
  monto_max?: number;
};

export type AlertasConfig = {
  prendas_caras: AlertaPrendasCaras;
  prendas_baratas: AlertaPrendasBaratas;
  pocas_prendas: AlertaPocasPrendas;
  beneficios: BeneficioCfg[];
};

export const ALERTAS_DEFAULTS: AlertasConfig = {
  prendas_caras: {
    activa: true,
    precio_min: 39000,
    titulo: "Invitá al cliente a traer prendas",
    mensaje:
      "Recordale que si estas prendas dejan de servirle, puede traerlas para evaluación y obtener crédito.",
    overrides: {},
  },
  prendas_baratas: {
    activa: true,
    precio_max: 14000,
    titulo: "Comentá la reposición de los lunes",
    mensaje: "Todos los lunes reponemos prendas de promoción — invitá al cliente a pasar.",
    overrides: {},
  },
  pocas_prendas: {
    activa: true,
    cantidad_max: 2,
    titulo: "¿Mostraste todo?",
    mensaje:
      "Antes de cerrar, verificá que hayas mostrado todo lo que podría interesarle al cliente.",
    overrides: {},
  },
  beneficios: [
    // El cashback default nace SIN monto_max: obligamos al admin a fijar
    // el tope desde /configuracion/caja antes de usarlo. La UI marca ese
    // input como obligatorio y bloquea guardado si falta.
    { id: "cashback",         label: "Cashback",         tipo_evento: "cashback",  pide_monto: true,  genera_credito: true  },
    { id: "ecobag",           label: "Ecobag",           tipo_evento: "beneficio", pide_monto: false, genera_credito: false },
    { id: "regalo_dia",       label: "Regalito del día", tipo_evento: "beneficio", pide_monto: false, genera_credito: false },
    { id: "descuento_manual", label: "Descuento manual", tipo_evento: "descuento", pide_monto: true,  genera_credito: false },
  ],
};

/**
 * Merge parcial: toma un JSON crudo (puede venir con campos faltantes) y
 * lo completa con los defaults. Preserva overrides existentes.
 */
export function mergeConfig(raw: unknown): AlertasConfig {
  if (!raw || typeof raw !== "object") return ALERTAS_DEFAULTS;
  const r = raw as Record<string, unknown>;
  return {
    prendas_caras: {
      ...ALERTAS_DEFAULTS.prendas_caras,
      ...((r.prendas_caras as object) ?? {}),
    } as AlertaPrendasCaras,
    prendas_baratas: {
      ...ALERTAS_DEFAULTS.prendas_baratas,
      ...((r.prendas_baratas as object) ?? {}),
    } as AlertaPrendasBaratas,
    pocas_prendas: {
      ...ALERTAS_DEFAULTS.pocas_prendas,
      ...((r.pocas_prendas as object) ?? {}),
    } as AlertaPocasPrendas,
    beneficios:
      Array.isArray(r.beneficios) && r.beneficios.length > 0
        ? (r.beneficios as BeneficioCfg[])
        : ALERTAS_DEFAULTS.beneficios,
  };
}

/**
 * Deriva las claves de segmento que aplican al cliente actual. Se pasan
 * la categoría (mutuamente excluyente) y las flags booleanas.
 */
export function segmentoKeysAplicables(opts: {
  categoria: "vip" | "habitual" | "nuevo" | "dormido" | null | undefined;
  tieneReclamos?: boolean;
  recibioBeneficios?: boolean;
}): SegmentoKey[] {
  const out: SegmentoKey[] = [];
  if (opts.tieneReclamos) out.push("con_reclamos");
  if (opts.recibioBeneficios) out.push("con_beneficios");
  if (opts.categoria) out.push(opts.categoria);
  return out;
}

/**
 * Devuelve el {titulo, mensaje} que debe mostrarse para esta alerta
 * dado el segmento del cliente. Aplica precedencia OVERRIDE_PRIORITY.
 */
export function resolverAlerta(
  alerta: AlertaBase,
  segmentoKeys: SegmentoKey[],
): { titulo: string; mensaje: string } {
  const ov = alerta.overrides ?? {};
  for (const key of OVERRIDE_PRIORITY) {
    if (!segmentoKeys.includes(key)) continue;
    const o = ov[key];
    if (o && (o.titulo || o.mensaje)) {
      return {
        titulo: o.titulo ?? alerta.titulo,
        mensaje: o.mensaje ?? alerta.mensaje,
      };
    }
  }
  return { titulo: alerta.titulo, mensaje: alerta.mensaje };
}
