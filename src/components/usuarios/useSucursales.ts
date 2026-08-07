"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { SucursalOpt } from "@/components/usuarios/UsuarioForm";

export type UseSucursalesResult = {
  /**
   * `undefined` mientras carga. Así el formulario distingue "todavía no sé"
   * de "la empresa no tiene sucursales" y no muestra el aviso equivocado.
   */
  sucursales: SucursalOpt[] | undefined;
  /** Mensaje real del backend cuando la lista no se pudo traer. */
  error: string | null;
  recargar: () => void;
};

/**
 * Catálogo de sucursales activas de la empresa para los formularios de usuario.
 *
 * Un solo lugar: antes cada pantalla repetía el fetch (y `/usuarios/[id]`
 * directamente no lo hacía, por lo que el select de sucursal quedaba vacío y
 * no se podía asignar nada).
 */
export function useSucursales(): UseSucursalesResult {
  const [sucursales, setSucursales] = useState<SucursalOpt[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const recargar = useCallback(() => {
    setSucursales(undefined);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          sucursales?: SucursalOpt[];
          data?: { sucursales?: SucursalOpt[]; warning?: string };
        };
        if (cancel) return;
        if (!r.ok || j?.success === false) {
          console.error("[useSucursales] /api/sucursales fallo", { status: r.status, body: j });
          setSucursales([]);
          setError(j?.error ?? `No se pudieron cargar las sucursales (HTTP ${r.status}).`);
          return;
        }
        // El endpoint responde 200 con `warning` cuando la consulta falló
        // (p. ej. la tabla no existe en el schema). Sin esto el usuario veía
        // un desplegable vacío sin ninguna explicación.
        const warning = j?.data?.warning;
        setSucursales(j?.data?.sucursales ?? j?.sucursales ?? []);
        setError(typeof warning === "string" && warning.trim() ? warning.trim() : null);
      })
      .catch((e) => {
        if (cancel) return;
        console.error("[useSucursales] /api/sucursales fetch error", e);
        setSucursales([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar las sucursales.");
      });
    return () => {
      cancel = true;
    };
  }, [nonce]);

  return { sucursales, error, recargar };
}
