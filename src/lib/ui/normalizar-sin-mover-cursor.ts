/**
 * Normaliza lo que se escribe en un campo (mayúsculas, minúsculas, guiones…)
 * sin que el cursor salte al final.
 *
 * En un input controlado React pinta el valor que guardamos en el estado. Si
 * ese valor no es exactamente el que el campo tenía escrito, el navegador
 * reescribe el contenido y el cursor se va al final: escribir "Prueba" delante
 * de "@gmail.com" terminaba en "p@gmail.comrueba" porque la "P" se guardaba
 * en minúscula.
 *
 * El truco es dejar el campo ya normalizado y el cursor en su lugar ANTES de
 * que React haga su commit: cuando compara, ve el mismo texto, no toca el
 * campo, y el cursor queda donde estaba.
 */
export function normalizarSinMoverCursor(
  campo: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  normalizar: (valor: string) => string,
): string {
  const escrito = campo.value;
  const normalizado = normalizar(escrito);
  if (normalizado === escrito) return normalizado;

  // Los <select> no tienen cursor; tampoco los inputs de tipo email o number
  // en algunos navegadores (selectionStart tira o devuelve null).
  let cursor: number | null = null;
  try { cursor = (campo as HTMLInputElement).selectionStart; } catch { cursor = null; }

  campo.value = normalizado;

  if (cursor != null) {
    const pos = Math.min(cursor, normalizado.length);
    try { (campo as HTMLInputElement).setSelectionRange(pos, pos); } catch { /* sin soporte */ }
  }

  return normalizado;
}
