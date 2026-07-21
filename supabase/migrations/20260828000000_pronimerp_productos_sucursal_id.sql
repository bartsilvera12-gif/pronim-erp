-- Franjas / productos por sucursal.
--
-- Motivación: Karen tiene sucursales que operan en distintas monedas
-- (guaraníes en Paraguay, reales en Brasil). Las franjas de precio
-- ("Gs. 6.000", "R$ 24,00") deben ser INDEPENDIENTES por sucursal —
-- las de Paraguay no deben aparecer en la caja de El Dorado/Betim/BH.
--
-- Solución: agrego `sucursal_id` a productos. NULL = compartido con
-- todas las sucursales (fallback para catálogos legados). Las franjas
-- existentes se asignan a la sucursal Principal — así los usuarios de
-- Principal las siguen viendo y las sucursales nuevas arrancan con
-- catálogo vacío hasta que carguen sus propias franjas.
--
-- Idempotente: agrega columna y FK solo si no existen. El backfill
-- solo aplica a filas con sucursal_id IS NULL (no pisa asignaciones
-- previas).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'productos'
  ) THEN
    -- 1) Agregar columna si no existe.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'pronimerp' AND table_name = 'productos' AND column_name = 'sucursal_id'
    ) THEN
      ALTER TABLE pronimerp.productos
        ADD COLUMN sucursal_id uuid;
    END IF;

    -- 2) FK a sucursales.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'productos_sucursal_id_fkey'
    ) THEN
      ALTER TABLE pronimerp.productos
        ADD CONSTRAINT productos_sucursal_id_fkey
        FOREIGN KEY (sucursal_id) REFERENCES pronimerp.sucursales(id) ON DELETE SET NULL;
    END IF;

    -- 3) Índice para búsquedas por sucursal.
    CREATE INDEX IF NOT EXISTS productos_sucursal_id_idx
      ON pronimerp.productos (sucursal_id);

    -- 4) Backfill: asignar franjas existentes sin sucursal a la Principal
    --    de cada empresa. Solo franjas de precio (es_franja_precio=true),
    --    para no tocar productos "normales" que puedan compartirse.
    UPDATE pronimerp.productos p
    SET sucursal_id = (
      SELECT s.id FROM pronimerp.sucursales s
      WHERE s.empresa_id = p.empresa_id AND s.es_principal = true
      LIMIT 1
    )
    WHERE p.sucursal_id IS NULL
      AND p.es_franja_precio = true
      AND EXISTS (
        SELECT 1 FROM pronimerp.sucursales s
        WHERE s.empresa_id = p.empresa_id AND s.es_principal = true
      );
  END IF;
END $$;
