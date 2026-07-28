-- Setea moneda='BRL' para las sucursales de Brasil (Betim, BH, El Dorado).
-- Sin esto quedaban con el default 'PYG' y el dashboard las mostraba en Gs.
-- Match por nombre case-insensitive y trim para tolerar variantes.
-- Idempotente: WHERE moneda <> 'BRL' evita reescrituras innecesarias.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp' AND table_name = 'sucursales' AND column_name = 'moneda'
  ) THEN
    UPDATE pronimerp.sucursales
       SET moneda = 'BRL'
     WHERE moneda <> 'BRL'
       AND LOWER(TRIM(nombre)) IN ('betim','bh','belo horizonte','el dorado','eldorado');
  END IF;
END $$;
