"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRutaAnterior } from "@/lib/navegacion/ruta-anterior";
import { nombreDeRuta } from "@/lib/navegacion/nombre-de-ruta";

/**
 * Botón "Volver a …" que aparece en todo el ERP.
 *
 * Dice a DÓNDE vuelve, no solo "volver": si entraste a Explorar desde el
 * dashboard dice "Volver al dashboard", y si entraste desde Órdenes de venta
 * dice "Volver a Órdenes de venta". Antes cada pantalla tenía su propio link
 * fijo —cuando lo tenía—, así que siempre te mandaba al mismo lado sin
 * importar por dónde habías entrado.
 *
 * No se muestra cuando no hay a dónde volver: primera pantalla de la sesión,
 * o cuando la anterior es la misma sección (volver de /clientes/x a
 * /clientes/y sería un botón que no lleva a ninguna parte útil).
 */
export default function BotonVolver() {
  const anterior = useRutaAnterior();
  const pathname = usePathname() ?? "";

  if (!anterior) return null;

  const nombre = nombreDeRuta(anterior);
  if (!nombre) return null;

  // Misma sección: el botón no aportaría nada.
  if (nombreDeRuta(pathname) === nombre) return null;

  const articulo = nombre === "Inicio" || nombre === "Dashboard" ? "al" : "a";

  return (
    <div className="mb-3 print:hidden">
      <Link
        href={anterior}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#4FAEB2] hover:text-[#3F8E91]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Volver {articulo} {nombre}
      </Link>
    </div>
  );
}
