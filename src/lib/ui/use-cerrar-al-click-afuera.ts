"use client";

import { useEffect, type RefObject } from "react";

/**
 * Cierra un desplegable al hacer clic fuera o al apretar Escape.
 *
 * Los buscadores del POS (cliente, franja) quedaban abiertos tapando media
 * pantalla hasta que elegías algo: no había forma de arrepentirse.
 *
 * Se escucha `mousedown` y no `click` para que el cierre ocurra antes de que
 * el navegador dispare el click; con `click` un botón que queda debajo del
 * panel llegaba a recibirlo.
 */
export function useCerrarAlClickAfuera(
  abierto: boolean,
  ref: RefObject<HTMLElement | null>,
  cerrar: () => void,
): void {
  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (t && ref.current && !ref.current.contains(t)) cerrar();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto, ref, cerrar]);
}
