"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { translate, type Lang } from "./dict";
import { fmtMoneda, fmtMonedaCompact, monedaSymbol, setActiveCfg, type Moneda } from "./currency";

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

  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (cancel) return;
        const u = j?.usuario as { lang?: string; sucursal_moneda?: string } | undefined;
        if (!u) return;
        const lang: Lang = (u.lang === "pt-BR" || u.lang === "en") ? u.lang as Lang : "es";
        const moneda: Moneda = (u.sucursal_moneda === "BRL" || u.sucursal_moneda === "USD" || u.sucursal_moneda === "ARS")
          ? u.sucursal_moneda as Moneda
          : "PYG";
        setCfg({ lang, moneda });
      })
      .catch(() => { /* ignore */ });
    return () => { cancel = true; };
  }, []);

  // Publicar la config al registro global — permite que helpers module-scope
  // (fmtActive/fmtActiveCompact) devuelvan valores en la moneda del usuario
  // sin necesidad de hooks.
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
