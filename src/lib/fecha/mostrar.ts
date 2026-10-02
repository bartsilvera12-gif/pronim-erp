/**
 * Mostrar fechas sin que se corran un día.
 *
 * `new Date("2026-08-26")` lo interpreta JavaScript como medianoche UTC. En
 * Paraguay (UTC−3) y en Brasil (UTC−3) eso es las 21:00 del 25, así que al
 * mostrarlo aparecía **un día antes** del real. Pasaba con todo lo que se
 * guarda como fecha pura: recepciones, movimientos de crédito, gastos.
 *
 * La regla:
 *   - Fecha pura ("2026-08-26") → se arma con los números, sin pasar por UTC.
 *   - Timestamp ("2026-08-26T14:30:00Z") → es un instante, y ahí sí
 *     corresponde convertir a la hora local.
 */

/** true si el valor es una fecha pura, sin hora. */
function esFechaPura(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

/**
 * dd/mm/aaaa. Acepta fecha pura o timestamp; devuelve `vacio` si no hay dato.
 */
export function fechaCorta(
  valor: string | Date | null | undefined,
  locale = "es-PY",
  vacio = "—",
): string {
  if (!valor) return vacio;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? vacio : valor.toLocaleDateString(locale);
  }
  const s = String(valor).trim();
  if (!s) return vacio;

  if (esFechaPura(s)) {
    const [a, m, d] = s.split("-");
    // Sin Date de por medio: no hay zona horaria que pueda correrla.
    return `${d}/${m}/${a}`;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? vacio : dt.toLocaleDateString(locale);
}

/** dd/mm/aaaa HH:MM. Para una fecha pura no inventa hora. */
export function fechaHoraCorta(
  valor: string | Date | null | undefined,
  locale = "es-PY",
  vacio = "—",
): string {
  if (!valor) return vacio;
  const s = valor instanceof Date ? valor.toISOString() : String(valor).trim();
  if (!s) return vacio;
  if (esFechaPura(s)) return fechaCorta(s, locale, vacio);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return vacio;
  return `${dt.toLocaleDateString(locale)} ${dt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Convierte a Date SIN correr el día: una fecha pura se ancla al mediodía
 * local, así ningún cambio de huso la empuja al día anterior o siguiente.
 * Útil para ordenar o restar días.
 */
export function aFechaLocal(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const s = String(valor).trim();
  if (!s) return null;
  if (esFechaPura(s)) {
    const [a, m, d] = s.split("-").map(Number);
    return new Date(a, m - 1, d, 12, 0, 0, 0);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
