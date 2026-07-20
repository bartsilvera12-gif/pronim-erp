-- Amplía el CHECK de pronimerp.cliente_creditos_movimientos.origen para
-- aceptar los orígenes que ya usa confirmar-atencion:
--   - 'descuento_promo' → ENTRADA técnica que materializa el descuento
--                          server-side de una promo antes de la venta.
--   - 'cashback'        → ENTRADA de crédito generado por cashback de promo.
--
-- Antes de este parche, ambas variantes rompían el INSERT con:
--   "violates check constraint cliente_creditos_movimientos_origen_check"
--
-- Idempotente: dropea el constraint anterior si existe (con cualquier
-- lista de valores) y lo recrea con la lista completa.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'cliente_creditos_movimientos'
  ) THEN
    -- Nombre canónico del constraint autogenerado.
    ALTER TABLE pronimerp.cliente_creditos_movimientos
      DROP CONSTRAINT IF EXISTS cliente_creditos_movimientos_origen_check;
    ALTER TABLE pronimerp.cliente_creditos_movimientos
      ADD CONSTRAINT cliente_creditos_movimientos_origen_check
      CHECK (origen IN (
        'recepcion',
        'venta',
        'ajuste_manual',
        'nota_credito',
        'descuento_promo',
        'cashback'
      ));
  END IF;
END $$;
