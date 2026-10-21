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

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const LS_KEY = "neura.erp.sucursal_activa.v1";
/**
 * Moneda de la sucursal activa. Se guarda junto al id para que el formateo
 * (fmtActive / I18nProvider) pueda resolverla sin esperar un fetch: si no,
 * al pararse en BETIM los precios se veian un instante en Gs. y despues en R$.
 */
const LS_MONEDA = "neura.erp.sucursal_activa_moneda.v1";
/** Evento propio para que todas las pantallas abiertas se enteren del cambio. */
const EVENTO = "neura:sucursal-activa";

export type SucursalMin = { id: string; nombre: string; es_principal?: boolean; moneda?: string | null };

/** Lee la sucursal activa fuera de React (para armar payloads). null = sin elegir. */
export function getSucursalActivaId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Moneda de la sucursal activa. null = desconocida, hay que resolverla.
 *
 * Se guarda junto al id de la sucursal, separados por "|". Antes se guardaba
 * sola, y si alguien pasaba de BETIM a PALMERAS podía quedar un "BRL" viejo
 * pegado a una sucursal paraguaya: el valor no estaba vacío, así que nadie
 * lo corregía y la pantalla salía en portugués. Si el id guardado no es el
 * de la sucursal activa, se descarta.
 */
export function getSucursalActivaMoneda(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(LS_MONEDA);
    if (!crudo) return null;
    const corte = crudo.indexOf("|");
    // Formato viejo, sin id: no se puede confiar en a qué sucursal pertenece.
    if (corte < 0) return null;
    const id = crudo.slice(0, corte);
    const moneda = crudo.slice(corte + 1);
    return id && moneda && id === getSucursalActivaId() ? moneda : null;
  } catch {
    return null;
  }
}

export function setSucursalActivaId(id: string | null, moneda?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(LS_KEY, id);
    else window.localStorage.removeItem(LS_KEY);
    if (id && moneda) window.localStorage.setItem(LS_MONEDA, `${id}|${moneda}`);
    else window.localStorage.removeItem(LS_MONEDA);
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }));
  } catch { /* storage bloqueado: la sesión sigue funcionando sin recordar */ }
}

/**
 * Suscripción liviana al id de sucursal activa, para pantallas que solo
 * necesitan saber "donde estoy parado" y volver a pedir sus datos cuando
 * eso cambia (el POS, por ejemplo). No dispara los fetch de useSucursalActiva.
 */
function subscribeSucursalActiva(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useSucursalActivaId(): string | null {
  return useSyncExternalStore(
    subscribeSucursalActiva,
    getSucursalActivaId,
    () => null,
  );
}

export function useSucursalActivaMoneda(): string | null {
  const cacheada = useSyncExternalStore(
    subscribeSucursalActiva,
    getSucursalActivaMoneda,
    () => null,
  );
  const activa = useSyncExternalStore(
    subscribeSucursalActiva,
    getSucursalActivaId,
    () => null,
  );
  const [resuelta, setResuelta] = useState<string | null>(null);

  // Si hay sucursal elegida pero su moneda no quedó en el navegador, se
  // consulta. Sin esto el sistema cae a la moneda del usuario, y un admin
  // configurado en reales veía Paraguay en portugués.
  useEffect(() => {
    if (!activa || cacheada) { setResuelta(null); return; }
    let cancel = false;
    fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const lista = (j?.data?.sucursales ?? j?.sucursales ?? []) as SucursalMin[];
        const suc = lista.find((x) => x.id === activa);
        const m = suc?.moneda ?? null;
        if (m) { setSucursalActivaId(activa, m); setResuelta(m); }
      })
      .catch(() => { /* sin red: queda la preferencia del usuario */ });
    return () => { cancel = true; };
  }, [activa, cacheada]);

  return cacheada ?? resuelta;
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
          const suc = guardada ? lista.find((s) => s.id === guardada) : null;
          if (guardada && !suc) {
            setSucursalActivaId(null);
            setActivaId(null);
          } else if (suc && (suc.moneda ?? null) !== getSucursalActivaMoneda()) {
            // Refrescar la moneda cacheada por si la cambiaron en Sucursales.
            setSucursalActivaId(suc.id, suc.moneda ?? null);
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
    const suc = id ? sucursales.find((x) => x.id === id) : null;
    setSucursalActivaId(id, suc?.moneda ?? null);
    setActivaId(id);
  }, [sucursales]);

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
