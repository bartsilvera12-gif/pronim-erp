-- =====================================================================
-- Akakua'a / Pronim — Reversiones append-only con dirección
-- ---------------------------------------------------------------------
-- Agrega `direccion` (ingreso/egreso) + `reversa_de_id` a las tablas de
-- pagos, garantizando append-only real y preservando el arqueo histórico:
--   * El pago original NUNCA se modifica ni se borra.
--   * Una reversión es una fila nueva con direccion opuesta,
--     reversa_de_id apuntando al original, y monto siempre positivo.
--   * computeResumen aplica signo según direccion.
--   * El pago original queda en su caja original (histórica).
--     La reversión va a la caja vigente donde físicamente entra o sale
--     el dinero.
--
-- Aplica SOLO al schema `pronimerp`.
-- Idempotente. Append-only.
-- =====================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- ventas_pagos_detalle: direccion + reversa_de_id
-- ═════════════════════════════════════════════════════════════════════
-- direccion por defecto 'ingreso' (pago recibido en una venta).
-- Reversiones al anular venta llevan direccion='egreso'.

ALTER TABLE pronimerp.ventas_pagos_detalle
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS reversa_de_id uuid;

-- Backfill: filas existentes son pagos originales = ingreso
UPDATE pronimerp.ventas_pagos_detalle
   SET direccion = 'ingreso'
 WHERE direccion IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_pagos_detalle_direccion_check'
      AND conrelid = 'pronimerp.ventas_pagos_detalle'::regclass
  ) THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD CONSTRAINT ventas_pagos_detalle_direccion_check
      CHECK (direccion IN ('ingreso','egreso'));
  END IF;
END $$;

ALTER TABLE pronimerp.ventas_pagos_detalle
  ALTER COLUMN direccion SET DEFAULT 'ingreso',
  ALTER COLUMN direccion SET NOT NULL;

-- FK a la misma tabla para reversa_de_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_pagos_detalle_reversa_de_id_fkey'
      AND conrelid = 'pronimerp.ventas_pagos_detalle'::regclass
  ) THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD CONSTRAINT ventas_pagos_detalle_reversa_de_id_fkey
      FOREIGN KEY (reversa_de_id) REFERENCES pronimerp.ventas_pagos_detalle(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- UNIQUE parcial: un pago no puede tener dos reversiones distintas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_pagos_detalle_reversa_de_id
  ON pronimerp.ventas_pagos_detalle (reversa_de_id)
  WHERE reversa_de_id IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════
-- cliente_recepciones_pagos: direccion + reversa_de_id
-- ═════════════════════════════════════════════════════════════════════
-- direccion por defecto 'egreso' (dinero que sale de la tienda hacia
-- el cliente cuando le compramos prendas).
-- Reversiones al anular recepción llevan direccion='ingreso'.

ALTER TABLE pronimerp.cliente_recepciones_pagos
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS reversa_de_id uuid;

-- Backfill: filas existentes son pagos originales = egreso
UPDATE pronimerp.cliente_recepciones_pagos
   SET direccion = 'egreso'
 WHERE direccion IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cliente_recepciones_pagos_direccion_check'
      AND conrelid = 'pronimerp.cliente_recepciones_pagos'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones_pagos
      ADD CONSTRAINT cliente_recepciones_pagos_direccion_check
      CHECK (direccion IN ('ingreso','egreso'));
  END IF;
END $$;

ALTER TABLE pronimerp.cliente_recepciones_pagos
  ALTER COLUMN direccion SET DEFAULT 'egreso',
  ALTER COLUMN direccion SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cliente_recepciones_pagos_reversa_de_id_fkey'
      AND conrelid = 'pronimerp.cliente_recepciones_pagos'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones_pagos
      ADD CONSTRAINT cliente_recepciones_pagos_reversa_de_id_fkey
      FOREIGN KEY (reversa_de_id) REFERENCES pronimerp.cliente_recepciones_pagos(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_recepciones_pagos_reversa_de_id
  ON pronimerp.cliente_recepciones_pagos (reversa_de_id)
  WHERE reversa_de_id IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════
-- Reglas server-side (implementadas en TS, documentadas acá):
--   1) La reversión debe corresponder a la MISMA venta o recepción que
--      el pago original (validado en anular-venta-pg y anular-recepcion).
--   2) Una reversión no puede apuntar a otra reversión (o sea, el pago
--      referenciado en reversa_de_id NO puede tener reversa_de_id él
--      mismo). Se valida en la transacción de anulación.
--   3) empresa_id de la reversión = empresa_id del original.
--   4) La reversión va a la caja abierta ACTUAL, no a la del pago
--      original (que podría estar cerrada).
-- ═════════════════════════════════════════════════════════════════════

COMMIT;

-- ---------------------------------------------------------------------
-- Verificación post-migración (SELECT-only):
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='pronimerp'
--     AND table_name IN ('ventas_pagos_detalle','cliente_recepciones_pagos')
--     AND column_name IN ('direccion','reversa_de_id')
--   ORDER BY table_name, column_name;
--
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='pronimerp'
--     AND indexname IN (
--       'uq_ventas_pagos_detalle_reversa_de_id',
--       'uq_cliente_recepciones_pagos_reversa_de_id'
--     );
-- ---------------------------------------------------------------------
