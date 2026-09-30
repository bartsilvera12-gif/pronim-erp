/**
 * Importe en letras para la factura.
 *
 * La SET exige que la factura impresa lleve el total escrito en letras.
 * Guaraníes no tiene centavos, así que se trabaja siempre con enteros.
 */

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS",
  "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = [
  "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
  "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

/** 0–999 en letras. */
function hastaNovecientosNoventaYNueve(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto === 0
    ? CENTENAS[c]
    : `${CENTENAS[c]} ${hastaNovecientosNoventaYNueve(resto)}`;
}

/**
 * Apócope de "uno" delante de mil/millones: son VEINTIÚN MIL y CUATROCIENTOS
 * NOVENTA Y UN MIL, no VEINTIUNO MIL ni ... NOVENTA Y UNO MIL.
 */
function apocopar(s: string): string {
  if (s.endsWith("VEINTIUNO")) return s.slice(0, -"VEINTIUNO".length) + "VEINTIÚN";
  if (s.endsWith("UNO")) return s.slice(0, -"UNO".length) + "UN";
  return s;
}

/** 0–999.999 en letras (maneja el "UN MIL" / "MIL"). */
function hastaMillon(n: number): string {
  if (n < 1000) return hastaNovecientosNoventaYNueve(n);
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  // "MIL", no "UNO MIL".
  const prefijo = miles === 1 ? "MIL" : `${apocopar(hastaNovecientosNoventaYNueve(miles))} MIL`;
  return resto === 0 ? prefijo : `${prefijo} ${hastaNovecientosNoventaYNueve(resto)}`;
}

/**
 * Importe entero en letras, en mayúsculas y sin la moneda.
 * Ej: 1234567 → "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE".
 */
export function numeroEnLetras(valor: number): string {
  const n = Math.max(0, Math.round(Number(valor) || 0));
  if (n === 0) return "CERO";
  if (n < 1_000_000) return hastaMillon(n);

  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const prefijo = millones === 1 ? "UN MILLÓN" : `${apocopar(hastaMillon(millones))} MILLONES`;
  return resto === 0 ? prefijo : `${prefijo} ${hastaMillon(resto)}`;
}

/** Línea lista para el pie de la factura. */
export function montoEnLetrasGs(valor: number): string {
  return `${numeroEnLetras(valor)} GUARANÍES`;
}
