/**
 * Días hábiles para el cálculo de metas.
 *
 * Cada sucursal define en qué días NO abre (`sucursales.dias_cerrados`, con la
 * convención de PostgreSQL: 0=domingo … 6=sábado). El grupo opera en Paraguay
 * y Brasil, y cada local puede descansar un día distinto, así que el criterio
 * NO puede ser global: se pasa por parámetro.
 *
 * Si no se indica nada se asume el default histórico: cierra los domingos.
 */

/** Días cerrados por defecto cuando la sucursal no tiene configuración. */
export const DIAS_CERRADOS_DEFAULT: number[] = [0];

/** Días de venta por semana según los días cerrados. */
export function diasHabilesPorSemana(diasCerrados: number[] = DIAS_CERRADOS_DEFAULT): number {
  const cerrados = new Set(diasCerrados);
  let n = 0;
  for (let d = 0; d < 7; d++) if (!cerrados.has(d)) n++;
  return n;
}

/** true si ese día la sucursal abre. */
export function esDiaHabil(d: Date, diasCerrados: number[] = DIAS_CERRADOS_DEFAULT): boolean {
  return !diasCerrados.includes(d.getDay());
}

/**
 * Cantidad de días hábiles entre dos fechas, ambas inclusive.
 * Se interpretan en hora local (no UTC) para que el conteo coincida con los
 * días que efectivamente abrió el local.
 */
export function diasHabilesEnRango(
  desde: Date,
  hasta: Date,
  diasCerrados: number[] = DIAS_CERRADOS_DEFAULT,
): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  if (b < a) return 0;
  const cerrados = new Set(diasCerrados);
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (!cerrados.has(d.getDay())) n++;
  }
  return n;
}

/** Días hábiles del mes calendario que contiene `ref`. */
export function diasHabilesDelMes(ref: Date, diasCerrados: number[] = DIAS_CERRADOS_DEFAULT): number {
  const primero = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return diasHabilesEnRango(primero, ultimo, diasCerrados);
}

/** Días hábiles del mes ya transcurridos hasta `ref` (inclusive). */
export function diasHabilesTranscurridosDelMes(
  ref: Date,
  diasCerrados: number[] = DIAS_CERRADOS_DEFAULT,
): number {
  const primero = new Date(ref.getFullYear(), ref.getMonth(), 1);
  return diasHabilesEnRango(primero, ref, diasCerrados);
}

/** Normaliza lo que viene de la DB (puede ser null o strings) a number[]. */
export function normalizarDiasCerrados(v: unknown): number[] {
  if (!Array.isArray(v)) return DIAS_CERRADOS_DEFAULT;
  return v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** Nombres cortos para la UI. Índice = getDay(). */
export const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
