"use client";

/**
 * "Sucursal activa" — en qué local está parado el usuario ahora.
 *
 * Por qué existe: un usuario con `sucursal_id` fijo siempre opera en la suya y
 * el backend lo fuerza. Pero el ADMIN no tiene sucursal fija, y hasta ahora
 * toda venta/evaluación/caja suya caía por defecto en la sucursal Principal
 * aunque estuviera físicamente en otra — dejando el stock y la caja mal
 * atribuidos. El backend ya acepta un `sucursal_id` explícito para admins
 * (ver lib/sucursales/enforce.ts); esto es la pieza de UI que faltaba.
 *
 * La elección se guarda en localStorage (es una preferencia del dispositivo:
 * la notebook que está en Palmeras queda en Palmeras).
 */

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const LS_KEY = "neura.erp.sucursal_activa.v1";
/** Evento propio para que todas las pantallas abiertas se enteren del cambio. */
const EVENTO = "neura:sucursal-activa";

export type SucursalMin = { id: string; nombre: string; es_principal?: boolean };

/** Lee la sucursal activa fuera de React (para armar payloads). null = sin elegir. */
export function getSucursalActivaId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY) || null;
  } catch {
    return null;
  }
}

export function setSucursalActivaId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(LS_KEY, id);
    else window.localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }));
  } catch { /* storage bloqueado: la sesión sigue funcionando sin recordar */ }
}

export function useSucursalActiva() {
  const [sucursales, setSucursales] = useState<SucursalMin[]>([]);
  /** sucursal fija del usuario (null = admin global, puede elegir). */
  const [sucursalFija, setSucursalFija] = useState<string | null>(null);
  const [activaId, setActivaId] = useState<string | null>(() => getSucursalActivaId());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [rMe, rSuc] = await Promise.all([
          fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
          fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancel) return;
        const fija = (rMe?.usuario?.sucursal_id as string | null) ?? null;
        const lista = (rSuc?.data?.sucursales ?? rSuc?.sucursales ?? []) as SucursalMin[];
        setSucursalFija(fija);
        setSucursales(lista);
        // Si el usuario tiene sucursal fija, la activa ES esa (no se elige).
        if (fija) {
          setActivaId(fija);
        } else {
          // Admin: si lo guardado ya no existe (sucursal borrada), se descarta.
          const guardada = getSucursalActivaId();
          if (guardada && !lista.some((s) => s.id === guardada)) {
            setSucursalActivaId(null);
            setActivaId(null);
          }
        }
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Sincroniza entre pestañas y entre componentes de la misma pantalla.
  useEffect(() => {
    const onCambio = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | null | undefined;
      setActivaId(detail ?? getSucursalActivaId());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) setActivaId(getSucursalActivaId());
    };
    window.addEventListener(EVENTO, onCambio);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENTO, onCambio);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const elegir = useCallback((id: string | null) => {
    setSucursalActivaId(id);
    setActivaId(id);
  }, []);

  const puedeElegir = !sucursalFija && sucursales.length > 1;
  const efectiva = sucursalFija ?? activaId;
  const nombre = sucursales.find((s) => s.id === efectiva)?.nombre ?? null;

  return {
    /** Lista de sucursales de la empresa. */
    sucursales,
    /** true si el usuario puede cambiar de sucursal (admin sin sucursal fija). */
    puedeElegir,
    /** Sucursal que debe usarse en las operaciones. null = admin que aún no eligió. */
    sucursalId: efectiva,
    /** Nombre de la sucursal efectiva, para mostrar. */
    nombre,
    /** true si el admin todavía no eligió (el backend caería en la Principal). */
    sinElegir: !sucursalFija && !activaId,
    elegir,
    cargando,
  };
}
