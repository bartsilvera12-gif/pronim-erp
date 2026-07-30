-- Fase 2 · Tanda 7: metas configurables + comisiones con bonos
--
-- Extiende `pronimerp.metas_sucursal` con:
--   - monto_meta_semanal   → si NULL se deriva (meta_diaria × 6 días laborables)
--   - monto_meta_mensual   → si NULL se deriva (meta_diaria × 26)
--   - bono_meta_superada_pct → % adicional cuando la sucursal SUPERA la meta
--                              (además de comision_alcanza_pct)
--   - bono_ticket_prom_min → si el ticket promedio del período supera este
--                              monto, se agrega bono_ticket_prom_pct al %
--   - bono_ticket_prom_pct
--
-- Todo nullable / defaults 0 — no rompe filas existentes ni la comisión legacy.
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='pronimerp' AND table_name='metas_sucursal') THEN
    RETURN; -- la tabla base todavía no está creada; nada que hacer
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='metas_sucursal'
                    AND column_name='monto_meta_semanal') THEN
    ALTER TABLE pronimerp.metas_sucursal
      ADD COLUMN monto_meta_semanal numeric(14,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='metas_sucursal'
                    AND column_name='monto_meta_mensual') THEN
    ALTER TABLE pronimerp.metas_sucursal
      ADD COLUMN monto_meta_mensual numeric(14,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='metas_sucursal'
                    AND column_name='bono_meta_superada_pct') THEN
    ALTER TABLE pronimerp.metas_sucursal
      ADD COLUMN bono_meta_superada_pct numeric(5,2) NOT NULL DEFAULT 0
      CHECK (bono_meta_superada_pct >= 0 AND bono_meta_superada_pct <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='metas_sucursal'
                    AND column_name='bono_ticket_prom_min') THEN
    ALTER TABLE pronimerp.metas_sucursal
      ADD COLUMN bono_ticket_prom_min numeric(14,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='metas_sucursal'
                    AND column_name='bono_ticket_prom_pct') THEN
    ALTER TABLE pronimerp.metas_sucursal
      ADD COLUMN bono_ticket_prom_pct numeric(5,2) NOT NULL DEFAULT 0
      CHECK (bono_ticket_prom_pct >= 0 AND bono_ticket_prom_pct <= 100);
  END IF;
END
$mig$;
