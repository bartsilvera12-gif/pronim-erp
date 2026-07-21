/**
 * Formateo de moneda por sucursal.
 *
 * PYG (guaraníes): sin decimales, separador de miles con punto.
 * BRL (reales):    2 decimales, separador de miles con punto y decimal con coma.
 * USD:             2 decimales, formato es-PY para consistencia.
 * ARS:             sin decimales, formato es-AR.
 */

import type { Lang } from "./dict";

export type Moneda = "PYG" | "BRL" | "USD" | "ARS";

/**
 * Registro global de la moneda/lang activos (los mismos que expone el
 * I18nProvider). Útil para funciones de formateo que se ejecutan fuera
 * del render de React (helpers a nivel de módulo, callbacks async,
 * etc.), donde no se puede llamar a un hook. El provider lo actualiza
 * en cada render con setActiveCfg.
 */
let ACTIVE_MONEDA: Moneda = "PYG";
let ACTIVE_LANG: Lang = "es";
export function setActiveCfg(m: Moneda, l: Lang) {
  ACTIVE_MONEDA = m;
  ACTIVE_LANG = l;
}
export function getActiveMoneda(): Moneda { return ACTIVE_MONEDA; }
export function getActiveLang(): Lang { return ACTIVE_LANG; }
/**
 * Formatea SEGÚN la moneda activa. Reemplazo drop-in del viejo
 * fmtGs / formatGs — devuelve "Gs. X" para usuarios PYG y "R$ X,00"
 * para usuarios BRL. Sin hooks; safe para llamar desde cualquier lado.
 */
export function fmtActive(n: number): string {
  return fmtMoneda(n, ACTIVE_MONEDA, ACTIVE_LANG);
}
export function fmtActiveCompact(n: number): string {
  return fmtMonedaCompact(n, ACTIVE_MONEDA, ACTIVE_LANG);
}

export function monedaSymbol(m: Moneda): string {
  switch (m) {
    case "BRL": return "R$";
    case "USD": return "US$";
    case "ARS": return "$";
    case "PYG":
    default:    return "Gs.";
  }
}

function localeOf(m: Moneda, lang: Lang): string {
  if (m === "BRL") return "pt-BR";
  if (m === "USD") return lang === "pt-BR" ? "pt-BR" : "es-PY";
  if (m === "ARS") return "es-AR";
  return "es-PY";
}

export function fmtMoneda(n: number, m: Moneda, lang: Lang): string {
  const locale = localeOf(m, lang);
  const decimals = (m === "PYG" || m === "ARS") ? 0 : 2;
  const val = (n || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${monedaSymbol(m)} ${val}`;
}

export function fmtMonedaCompact(n: number, m: Moneda, lang: Lang): string {
  const abs = Math.abs(n);
  const sym = monedaSymbol(m);
  const locale = localeOf(m, lang);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${sym} ${v.toLocaleString(locale, { minimumFractionDigits: abs >= 10_000_000 ? 0 : 1, maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return `${sym} ${v.toLocaleString(locale, { maximumFractionDigits: 0 })}K`;
  }
  return fmtMoneda(n, m, lang);
}
