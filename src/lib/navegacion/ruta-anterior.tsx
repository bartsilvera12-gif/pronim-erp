"use client";

/**
 * "¿De dónde vengo?" — para el botón Volver que aparece en todo el ERP.
 *
 * El problema que resuelve: cada pantalla tenía (o no tenía) su propio link
 * de vuelta, y siempre apuntaba a un lugar fijo. Si entrabas a Explorar desde
 * el dashboard, el link te mandaba a Órdenes de venta igual. Y en la mayoría
 * de las pantallas directamente no había salida.
 *
 * Acá se registra la ruta anterior DENTRO del ERP, así el botón puede decir
 * "Volver al dashboard" o "Volver a Clientes" según por dónde entraste.
 *
 * Se guarda en sessionStorage para que sobreviva a un F5: si recargás una
 * ficha, el botón sigue sabiendo de dónde venías.
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const LS_KEY = "neura.erp.ruta_anterior.v1";

type Ctx = { anterior: string | null };
const RutaAnteriorCtx = createContext<Ctx>({ anterior: null });

export function RutaAnteriorProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [anterior, setAnterior] = useState<string | null>(null);
  /** Última ruta vista. Ref y no state: cambiarla no debe re-renderizar. */
  const actual = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    // Primera carga del tab: recuperar lo que había guardado.
    if (actual.current === null) {
      try {
        const guardada = window.sessionStorage.getItem(LS_KEY);
        if (guardada && guardada !== pathname) setAnterior(guardada);
      } catch { /* sessionStorage bloqueado: el botón simplemente no aparece */ }
      actual.current = pathname;
      return;
    }

    if (actual.current === pathname) return;

    const previa = actual.current;
    actual.current = pathname;
    setAnterior(previa);
    try {
      window.sessionStorage.setItem(LS_KEY, previa);
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
