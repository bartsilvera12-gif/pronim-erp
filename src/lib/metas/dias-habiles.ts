/**
 * Días hábiles para el cálculo de metas.
 *
 * Akakua'a abre 6 días por semana (cierra los domingos), así que las metas no
 * se pueden prorratear por días calendario: una semana son 6 días de venta, no
 * 7, y un mes son ~26 días hábiles, no 30/31.
 *
 * Si algún día cambian el día de cierre, se toca SOLO `DIA_CERRADO`.
 */

/** Día de la semana en que la tienda cierra. 0 = domingo (getDay de JS). */
export const DIA_CERRADO = 0;

/** Días de venta por semana. */
export const DIAS_HABILES_POR_SEMANA = 6;

/** true si ese día la tienda abre. */
export function esDiaHabil(d: Date): boolean {
  return d.getDay() !== DIA_CERRADO;
}

/**
 * Cantidad de días hábiles entre dos fechas, ambas inclusive.
 * Las fechas se interpretan en hora local (no UTC) para que el conteo coincida
 * con los días que efectivamente abrió el local.
 */
export function diasHabilesEnRango(desde: Date, hasta: Date): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  if (b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (esDiaHabil(d)) n++;
  }
  return n;
}

/** Días hábiles del mes calendario que contiene `ref`. */
export function diasHabilesDelMes(ref: Date): number {
  const primero = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return diasHabilesEnRango(primero, ultimo);
}

/** Días hábiles del mes ya transcurridos hasta `ref` (inclusive). */
export function diasHabilesTranscurridosDelMes(ref: Date): number {
  const primero = new Date(ref.getFullYear(), ref.getMonth(), 1);
  return diasHabilesEnRango(primero, ref);
}
