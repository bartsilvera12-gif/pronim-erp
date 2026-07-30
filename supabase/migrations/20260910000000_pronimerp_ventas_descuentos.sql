-- Fase 2 · Tanda 1: descuentos manuales
--   1) venta_items.descuento_unitario  → descuento por línea (Gs./R$ por unidad)
--   2) ventas.descuento_general        → descuento aplicado al total al cerrar
--   3) ventas.descuento_motivo         → motivo del descuento general
--                                        (redondeo, negociacion, defecto,
--                                         promocion, cortesia, intercambio, otro)
-- Todo es idempotente y con default 0 / NULL para preservar filas existentes.

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp'
      AND table_name  = 'venta_items'
      AND column_name = 'descuento_unitario'
  ) THEN
    ALTER TABLE pronimerp.venta_items
      ADD COLUMN descuento_unitario NUMERIC(20,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp'
      AND table_name  = 'ventas'
      AND column_name = 'descuento_general'
  ) THEN
    ALTER TABLE pronimerp.ventas
      ADD COLUMN descuento_general NUMERIC(20,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp'
      AND table_name  = 'ventas'
      AND column_name = 'descuento_motivo'
  ) THEN
    ALTER TABLE pronimerp.ventas
      ADD COLUMN descuento_motivo TEXT;
  END IF;
END
$mig$;
