-- ============================================================================
-- Defensivo: asegurar que el UNIQUE de "una caja abierta" sea POR PUNTO,
-- no por empresa ni por sucursal. Si migraciones anteriores no dropearon
-- los índices viejos (por orden de aplicación o instancia manual), Karen
-- veía "Ya hay una caja abierta" al abrir en Sucursal 2 mientras Principal
-- tenía otra abierta.
-- ============================================================================

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'cajas'
  ) THEN
    -- Dropear cualquier variante vieja
    DROP INDEX IF EXISTS pronimerp.uq_cajas_una_abierta;
    DROP INDEX IF EXISTS pronimerp.uq_cajas_una_abierta_por_sucursal;

    -- Asegurar la version correcta: 1 caja abierta por punto_caja.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_una_abierta_por_punto
      ON pronimerp.cajas (punto_caja_id)
      WHERE estado = 'abierta' AND punto_caja_id IS NOT NULL;
  END IF;
END
$do$ LANGUAGE plpgsql;
