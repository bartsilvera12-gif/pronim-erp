-- =====================================================================
-- Pronim ERP — Promociones: nuevo ámbito 'segmento' (por tipo de cliente)
-- Fecha: 2026-09-07
-- Idempotente. No destructiva.
--
-- Karen quiere promociones dirigidas por segmento del cliente
-- (nuevo / habitual / vip / dormido). Reusamos el mismo esquema de
-- promociones agregando:
--   * Nueva opción de `ambito` = 'segmento'
--   * Columna `segmento_cliente text` con CHECK para los 4 segmentos
--
-- El ámbito 'cliente' ya existía (usa cliente_id). Este parche extiende
-- pero no rompe: filas viejas siguen con su ambito intacto.
-- =====================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='pronimerp' AND table_name='promociones'
  ) THEN
    RAISE NOTICE 'pronimerp.promociones no existe; saltea patch de segmento.';
    RETURN;
  END IF;

  -- Columna segmento_cliente (idempotente)
  ALTER TABLE pronimerp.promociones
    ADD COLUMN IF NOT EXISTS segmento_cliente text;

  -- Reemplazar el CHECK del ambito para incluir 'segmento'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pronimerp.promociones'::regclass
      AND conname  = 'promociones_ambito_check'
  ) THEN
    ALTER TABLE pronimerp.promociones
      DROP CONSTRAINT promociones_ambito_check;
  END IF;
  ALTER TABLE pronimerp.promociones
    ADD CONSTRAINT promociones_ambito_check
    CHECK (ambito IN ('general','franja','sucursal','cliente','segmento'));

  -- CHECK de segmento_cliente (solo cuando aplica)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pronimerp.promociones'::regclass
      AND conname  = 'promociones_segmento_check'
  ) THEN
    ALTER TABLE pronimerp.promociones
      ADD CONSTRAINT promociones_segmento_check
      CHECK (
        segmento_cliente IS NULL
        OR segmento_cliente IN ('nuevo','habitual','vip','dormido')
      );
  END IF;

END
$do$ LANGUAGE plpgsql;

DO $do$
BEGIN
  RAISE NOTICE 'promociones: ambito acepta segmento; columna segmento_cliente lista.';
END
$do$ LANGUAGE plpgsql;
