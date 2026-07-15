import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type {
  Caja,
  CajaDetalle,
  CajaResumen,
  EstadoCuentaLomiteria,
  MedioPagoCaja,
  TipoMovimientoCaja,
} from "./types";

type Ok<T> = { success: true } & T;
type Err = { success: false; error: string };

/**
 * Mensaje amigable cuando el backend devuelve HTML (típicamente páginas de
 * error de Cloudflare 5xx). Sin esto, los <!DOCTYPE ...> del error de
 * Cloudflare terminaban pegados en el banner de error de la UI.
 */
function friendlyServerError(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return "El servidor tardó en responder o no está disponible. Reintentá en unos segundos.";
  }
  if (status === 520 || status === 521 || status === 522 || status === 523 || status === 524) {
    return "El servidor no respondió a tiempo (Cloudflare " + status + "). Reintentá en unos segundos.";
  }
  if (status >= 500) {
    return `Error del servidor (código ${status}). Reintentá en unos segundos.`;
  }
  return `Respuesta inesperada del servidor (código ${status}).`;
}

async function postJson<T>(url: string, body: unknown): Promise<Ok<T> | Err> {
  let res: Response;
  try {
    res = await fetchWithSupabaseSession(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red." };
  }

  // Si el content-type no es JSON, probablemente sea una página de error
  // de Cloudflare / proxy. Nunca queremos mostrar HTML crudo en la UI.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { success: false, error: friendlyServerError(res.status) };
  }

  let json: { success?: boolean; data?: T; error?: string };
  try {
    json = (await res.json()) as { success?: boolean; data?: T; error?: string };
  } catch {
    return { success: false, error: friendlyServerError(res.status) };
  }

  if (!res.ok || !json.success || !json.data) {
    return { success: false, error: json.error ?? friendlyServerError(res.status) };
  }
  return { success: true, ...(json.data as T) };
}

/** Caja abierta actual (o null si no hay). */
export async function getCajaAbierta(): Promise<Caja | null> {
  try {
    const res = await fetchWithSupabaseSession("/api/caja/abierta", { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { caja: Caja | null }; error?: string };
    if (!res.ok || !json.success) return null;
    return json.data?.caja ?? null;
  } catch {
    return null;
  }
}

export function abrirCaja(
  montoApertura: number,
  observacion: string | null,
  sucursalId?: string | null,
  puntoCajaId?: string | null,
) {
  return postJson<{ caja: Caja }>("/api/caja/abrir", {
    monto_apertura: montoApertura,
    observacion,
    sucursal_id: sucursalId ?? null,
    punto_caja_id: puntoCajaId ?? null,
  });
}

export type PuntoCajaLite = {
  id: string;
  empresa_id: string;
  sucursal_id: string;
  nombre: string;
  orden: number;
  activo: boolean;
};

export async function getPuntosCaja(sucursalId?: string | null): Promise<PuntoCajaLite[]> {
  try {
    const qs = sucursalId ? `?sucursal_id=${encodeURIComponent(sucursalId)}` : "";
    const res = await fetchWithSupabaseSession(`/api/puntos-caja${qs}`, { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { puntos: PuntoCajaLite[] }; error?: string };
    if (!res.ok || !json.success) return [];
    return json.data?.puntos ?? [];
  } catch {
    return [];
  }
}

export async function getCajasAbiertas(): Promise<Caja[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/caja/abierta", { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { cajas: Caja[] }; error?: string };
    if (!res.ok || !json.success) return [];
    return json.data?.cajas ?? [];
  } catch {
    return [];
  }
}

export function cerrarCaja(montoCierreContado: number, observacion: string | null, cajaId?: string) {
  return postJson<{ resumen: CajaResumen }>("/api/caja/cerrar", {
    monto_cierre_contado: montoCierreContado,
    observacion,
    caja_id: cajaId ?? null,
  });
}

export function registrarMovimiento(payload: {
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  medio_pago: MedioPagoCaja;
  observacion: string | null;
}) {
  return postJson<{ movimiento: unknown }>("/api/caja/movimiento", payload);
}

/** Resumen/arqueo de la caja abierta (sin id) o de una caja puntual. */
export async function getResumenCaja(cajaId?: string): Promise<CajaResumen | null> {
  try {
    const url = cajaId ? `/api/caja/resumen?caja_id=${encodeURIComponent(cajaId)}` : "/api/caja/resumen";
    const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { resumen: CajaResumen | null }; error?: string };
    if (!res.ok || !json.success) return null;
    return json.data?.resumen ?? null;
  } catch {
    return null;
  }
}

export async function getHistorialCajas(): Promise<CajaResumen[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/caja/historial", { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { cajas: CajaResumen[] }; error?: string };
    if (!res.ok || !json.success) return [];
    return json.data?.cajas ?? [];
  } catch {
    return [];
  }
}

// ── Reportes ────────────────────────────────────────────────────────────────

/** Listado de cierres de caja (turnos) con totales. */
export async function getCierresCaja(): Promise<CajaResumen[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/reportes/cierres-caja", { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { cajas: CajaResumen[] }; error?: string };
    if (!res.ok || !json.success) return [];
    return json.data?.cajas ?? [];
  } catch {
    return [];
  }
}

/** Detalle de una caja: arqueo + movimientos + ventas asociadas. */
export async function getCajaDetalle(cajaId: string): Promise<CajaDetalle | null> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/reportes/cierres-caja/${encodeURIComponent(cajaId)}`,
      { cache: "no-store" }
    );
    const json = (await res.json()) as { success?: boolean; data?: { detalle: CajaDetalle }; error?: string };
    if (!res.ok || !json.success) return null;
    return json.data?.detalle ?? null;
  } catch {
    return null;
  }
}

/** Estado de cuenta de la lomitería (agregado sobre cajas cerradas en un rango). */
export async function getEstadoCuenta(
  desde?: string | null,
  hasta?: string | null
): Promise<EstadoCuentaLomiteria | null> {
  try {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetchWithSupabaseSession(`/api/reportes/estado-cuenta-lomiteria${suffix}`, { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { estado: EstadoCuentaLomiteria }; error?: string };
    if (!res.ok || !json.success) return null;
    return json.data?.estado ?? null;
  } catch {
    return null;
  }
}
