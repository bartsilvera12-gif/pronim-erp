-- Cambia el UNIQUE de "una franja activa por (empresa, precio)" a
-- "una franja activa por (empresa, precio, sucursal)" — así cada
-- sucursal puede tener su propia franja al mismo precio sin chocar.
--
-- Contexto: al aislar sucursales (BR en R$, PY en Gs.) surgen precios
-- que coinciden numéricamente entre sucursales pero son categorías
-- distintas (Gs. 6.000 en Principal vs R$ 6,00 en Betim). El índice
-- anterior las trataba como duplicadas. También bloqueaba a Sucursal 2
-- de crear su propia franja al mismo precio que Principal.
--
-- COALESCE(sucursal_id, uuid nil) evita que NULLs se traten como
-- distintos entre sí: si dos franjas quedan como "globales" (sin
-- sucursal), el UNIQUE sí las bloquea al mismo precio.
--
-- Idempotente: DROP IF EXISTS ambos índices y CREATE IF NOT EXISTS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'productos'
  ) THEN
    DROP INDEX IF EXISTS pronimerp.uq_franjas_activas_precio;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_franjas_activas_precio_por_sucursal
      ON pronimerp.productos (
        empresa_id,
        precio_venta,
        COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
      WHERE es_franja_precio = true AND activo = true;
  END IF;
END $$;
