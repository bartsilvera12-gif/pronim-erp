/**
 * Búsqueda de clientes por teléfono.
 *
 * Los teléfonos están guardados de varias formas ("981234567", "0981234567",
 * "981 234567", "+595 981 234567", y algunos sin el primer 9). Para que el
 * buscador los encuentre sin importar cómo los escribió el cajero, se comparan
 * "normalizados": solo dígitos, sin el 0 inicial ni el 595 del país.
 */
export function normalizarTelefono(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > 9 && d.startsWith("595")) d = d.slice(3);
  return d.replace(/^0+/, "");
}

/** ¿El teléfono guardado coincide con lo que se tipeó en el buscador? */
export function telefonoCoincide(
  guardado: string | null | undefined,
  tipeado: string,
): boolean {
  const q = normalizarTelefono(tipeado);
  if (q.length < 3) return false;
  const t = normalizarTelefono(guardado);
  if (!t) return false;
  if (t.includes(q)) return true;
  // Número guardado sin el primer dígito (ej. "81355174" en vez de "981355174").
  return t.length >= 7 && q.length > t.length && q.endsWith(t);
}
