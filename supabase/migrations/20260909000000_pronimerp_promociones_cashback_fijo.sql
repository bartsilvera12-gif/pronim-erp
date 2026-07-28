-- Permite promociones tipo 'cashback_fijo' — monto exacto en Gs. para dar
-- de cashback (útil para promos cliente-específicas donde se quiere fijar
-- el monto exacto, no un porcentaje).
BEGIN;

ALTER TABLE pronimerp.promociones
  DROP CONSTRAINT IF EXISTS promociones_tipo_check;

ALTER TABLE pronimerp.promociones
  ADD CONSTRAINT promociones_tipo_check
  CHECK (tipo IN ('descuento_pct','descuento_fijo','lleve_n_pague_m','cashback','cashback_fijo'));

COMMIT;
