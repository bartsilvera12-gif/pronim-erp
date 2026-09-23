import { fmtActive } from "@/lib/i18n/currency";

/**
 * Formato de moneda para reportes (acepta null → "—").
 *
 * Usa la moneda ACTIVA: parada en un local de Brasil los cierres se leen en
 * R$, no en Gs. El nombre quedó de cuando era solo guaraníes.
 */
export function formatGs(v: number | null | undefined): string {
  if (v == null) return "—";
  return fmtActive(v);
}

/** Fecha+hora corta es-PY (acepta null → "—"). */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PY", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia",
};
export function metodoPagoLabel(m: string | null | undefined): string {
  return m ? METODO_LABEL[m] ?? m : "—";
}
