import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export type CarteraConfig = {
  /** Días de vigencia del cashback. 0 = sin vencimiento. Default 30. */
  cashback_vencimiento_dias: number;
  /** El crédito normal vence? Siempre false por ahora (crédito no caduca). */
  credito_vence: boolean;
};

export const CARTERA_CONFIG_DEFAULT: CarteraConfig = {
  cashback_vencimiento_dias: 30,
  credito_vence: false,
};

export function normalizarCarteraConfig(raw: unknown): CarteraConfig {
  const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const dias = Number(o.cashback_vencimiento_dias);
  return {
    cashback_vencimiento_dias: Number.isFinite(dias) && dias >= 0 ? Math.floor(dias) : 30,
    credito_vence: o.credito_vence === true,
  };
}

/**
 * Lee la config de cartera de la empresa. Degrada al default si la columna
 * `cartera_config` aún no existe (migración pendiente).
 */
export async function fetchCarteraConfig(schema: string, empresaId: string): Promise<CarteraConfig> {
  const pool = getChatPostgresPool();
  if (!pool) return CARTERA_CONFIG_DEFAULT;
  const empresasT = quoteSchemaTable(schema, "empresas");
  try {
    const r = await pool.query<{ cartera_config: unknown }>(
      `SELECT cartera_config FROM ${empresasT} WHERE id = $1 LIMIT 1`,
      [empresaId],
    );
    return normalizarCarteraConfig(r.rows[0]?.cartera_config);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "42703") return CARTERA_CONFIG_DEFAULT;
    throw e;
  }
}
