"use client";

/**
 * "¿De dónde vengo?" — para el botón Volver que aparece en todo el ERP.
 *
 * El problema que resuelve: cada pantalla tenía (o no tenía) su propio link
 * de vuelta, y siempre apuntaba a un lugar fijo. Si entrabas a Explorar desde
 * el dashboard, el link te mandaba a Órdenes de venta igual. Y en la mayoría
 * de las pantallas directamente no había salida.
 *
 * Cómo funciona: en cada cambio de ruta se guarda la ruta ACTUAL en
 * sessionStorage. La próxima pantalla la lee y ya sabe de dónde viene.
 *
 * Guardar la actual (y no la anterior) es lo que hace que funcione también
 * con las navegaciones que recargan el documento entero —como el clic en una
 * fila de los exploradores, que usa window.location—. Si guardáramos la
 * anterior, al recargar leeríamos la de dos pantallas atrás: entrabas a una
 * venta desde Explorar y el botón ofrecía volver al Inicio.
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** Última ruta visitada. La próxima pantalla la usa como "de dónde vengo". */
const SS_ULTIMA = "neura.erp.ultima_ruta.v1";

type Ctx = { anterior: string | null };
const RutaAnteriorCtx = createContext<Ctx>({ anterior: null });

export function RutaAnteriorProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [anterior, setAnterior] = useState<string | null>(null);
  /** Ruta que estamos viendo. Ref y no state: cambiarla no debe re-renderizar. */
  const actual = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    if (actual.current === null) {
      // Primera pantalla de este documento (carga directa, F5 o navegación
      // dura). Lo que haya quedado guardado es de dónde venimos.
      try {
        const ultima = window.sessionStorage.getItem(SS_ULTIMA);
        if (ultima && ultima !== pathname) setAnterior(ultima);
      } catch { /* sessionStorage bloqueado: el botón simplemente no aparece */ }
    } else if (actual.current !== pathname) {
      // Navegación dentro de la misma carga: la anterior la tenemos en memoria.
      setAnterior(actual.current);
    }

    actual.current = pathname;
    // Siempre se deja la ruta actual anotada, para la pantalla que venga
    // después aunque llegue recargando el documento.
    try {
      window.sessionStorage.setItem(SS_ULTIMA, pathname);
    } catch { /* ídem */ }
  }, [pathname]);

  return (
    <RutaAnteriorCtx.Provider value={{ anterior }}>
      {children}
    </RutaAnteriorCtx.Provider>
  );
}

export function useRutaAnterior(): string | null {
  return useContext(RutaAnteriorCtx).anterior;
}
