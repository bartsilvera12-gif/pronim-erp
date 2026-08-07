"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { translate, type Lang } from "./dict";
import { fmtMoneda, fmtMonedaCompact, monedaSymbol, setActiveCfg, type Moneda } from "./currency";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Provider global que carga la config del usuario (lang + moneda de su
 * sucursal) UNA sola vez al montar el árbol de client components y la
 * expone vía hooks:
 *
 *   const t = useT();
 *   const money = useMoney();
 *   t("Caja")              → "Caja" (es) / "Caixa" (pt-BR)
 *   money.format(1000000)  → "Gs. 1.000.000" o "R$ 1.000.000,00"
 *
 * Sin config disponible (ej: sin login todavía), cae a es + PYG.
 */

type UserCfg = { lang: Lang; moneda: Moneda };

const DEFAULT: UserCfg = { lang: "es", moneda: "PYG" };

const Ctx = createContext<UserCfg>(DEFAULT);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<UserCfg>(DEFAULT);

  // Función reutilizable para refetchear la cfg. Se llama al montar,
  // en cambios de auth (login/logout/token refresh) y al recuperar foco.
  const loadCfg = useCallback(async (signal?: { cancelled: boolean }) => {
    const delays = [0, 400, 1200];
    for (const d of delays) {
      if (signal?.cancelled) return;
      if (d > 0) await new Promise(res => setTimeout(res, d));
      try {
        const r = await fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" });
        if (r.status === 401) continue;
        const j = await r.json();
        const u = j?.usuario as { lang?: string; sucursal_moneda?: string } | undefined;
        if (!u) continue;
        const lang: Lang = (u.lang === "pt-BR" || u.lang === "en") ? u.lang as Lang : "es";
        const moneda: Moneda = (u.sucursal_moneda === "BRL" || u.sucursal_moneda === "USD" || u.sucursal_moneda === "ARS")
          ? u.sucursal_moneda as Moneda
          : "PYG";
        if (!signal?.cancelled) setCfg({ lang, moneda });
        return;
      } catch { /* siguiente reintento */ }
    }
  }, []);

  // Carga inicial + reset a DEFAULT en logout
  useEffect(() => {
    const signal = { cancelled: false };
    void loadCfg(signal);
    return () => { signal.cancelled = true; };
  }, [loadCfg]);

  // Reload cuando cambia el estado de auth (login/logout/switch user).
  // Antes, después de un cambio de sucursal/usuario el idioma quedaba con el
  // valor del usuario anterior hasta hard-refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supa = createBrowserClient(url, key);
    const { data: sub } = supa.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCfg(DEFAULT);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        const signal = { cancelled: false };
        void loadCfg(signal);
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [loadCfg]);

  // Refresco al recuperar foco de la ventana (usuario vuelve de otra tab
  // donde puede haber cambiado su idioma en /usuarios/[id]).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      const signal = { cancelled: false };
      void loadCfg(signal);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadCfg]);

  // Publicar la config al registro global.
  setActiveCfg(cfg.moneda, cfg.lang);
  return <Ctx.Provider value={cfg}>{children}</Ctx.Provider>;
}

/** Traducción — devuelve la clave si no hay entrada. */
export function useT() {
  const { lang } = useContext(Ctx);
  return useMemo(
    () => (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars),
    [lang],
  );
}

/** Config completa (lang + moneda) por si algún componente la necesita entera. */
export function useUserCfg(): UserCfg {
  return useContext(Ctx);
}

/** Helpers de formato de moneda que respetan la sucursal del usuario. */
export function useMoney() {
  const { moneda, lang } = useContext(Ctx);
  return useMemo(() => ({
    moneda,
    symbol: monedaSymbol(moneda),
    format: (n: number) => fmtMoneda(n, moneda, lang),
    formatCompact: (n: number) => fmtMonedaCompact(n, moneda, lang),
  }), [moneda, lang]);
}
