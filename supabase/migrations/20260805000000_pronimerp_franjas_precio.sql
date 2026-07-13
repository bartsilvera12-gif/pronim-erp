-- =====================================================================
-- Pronim Consultoría — Modelo por FRANJAS DE PRECIO
-- ---------------------------------------------------------------------
-- Reemplaza el modelo tradicional (producto individual con SKU) por 20
-- productos "virtuales" que representan cada franja de precio. Se usa
-- la infraestructura existente (productos, movimientos_inventario,
-- ventas_items, producto_stock_sucursal) sin cambios estructurales.
--
-- Cambios:
--   1) productos.es_franja_precio boolean (flag por producto).
--   2) empresas.autoseed_categorias_desde_proveedor boolean
--      (permite desactivar el auto-seed sin afectar otros clientes).
--   3) Categoría paraguas "Prendas por franja" (una por empresa).
--   4) Recrea unique indexes que el clone de schema omitió.
--
-- Los PRECIOS de las franjas NO se cargan acá — se agregan desde
-- /admin/franjas (botón "Sembrar franjas iniciales" o creación manual).
--
-- SEGURA de correr múltiples veces (idempotente).
-- Aplica al schema `pronimerp`. No toca otros schemas.
-- =====================================================================

BEGIN;

-- 0) El clone de schema (CLONE_SCHEMA_PRONIMERP.sql) omitió los UNIQUE
--    INDEXES al clonar de joyeriaartesanos (línea "AND NOT i.indisunique").
--    Los recreamos idempotentemente antes del seed, porque el ON CONFLICT
--    depende de ellos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_empresa_sku
  ON pronimerp.productos (empresa_id, sku);

-- (producto_stock_sucursal tiene PRIMARY KEY (producto_id, sucursal_id)
--  vía la migración de sucursales; verificamos y si falta la creamos.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'pronimerp'
      AND t.relname = 'producto_stock_sucursal'
      AND c.contype IN ('p','u')
  ) THEN
    -- Si tampoco hay unique index, lo creamos
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'pronimerp'
        AND tablename = 'producto_stock_sucursal'
        AND indexdef ILIKE '%UNIQUE%(producto_id, sucursal_id)%'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_stock_sucursal
               ON pronimerp.producto_stock_sucursal (producto_id, sucursal_id)';
    END IF;
  END IF;
END $$;

-- 1) Flag de producto virtual "franja"
ALTER TABLE pronimerp.productos
  ADD COLUMN IF NOT EXISTS es_franja_precio boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_productos_es_franja_precio
  ON pronimerp.productos (empresa_id)
  WHERE es_franja_precio = true;

-- 2) Config por empresa: permitir desactivar el auto-seed de categorías
--    desde rubros de proveedor (evita ensuciar el catálogo en Pronim).
--    Default true = mantiene comportamiento anterior para el resto.
ALTER TABLE pronimerp.empresas
  ADD COLUMN IF NOT EXISTS autoseed_categorias_desde_proveedor boolean
  NOT NULL DEFAULT true;

-- 3) Categoría paraguas para las franjas (idempotente).
INSERT INTO pronimerp.categorias_productos
  (empresa_id, nombre, codigo, descripcion, activo, visible_web)
SELECT e.id,
       'Prendas por franja',
       'FRANJA',
       'Categoría auto-creada para franjas de precio (modelo Pronim)',
       true,
       false
FROM pronimerp.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM pronimerp.categorias_productos c
  WHERE c.empresa_id = e.id AND c.codigo = 'FRANJA'
);

-- (Los precios de las franjas NO se siembran acá — se cargan desde
--  /admin/franjas con el botón "Sembrar franjas iniciales" o creándolas
--  una a una. Así los valores no viven en el código.)

-- 4) Desactivar auto-seed de categorías desde proveedor para empresas
--    Pronim (esta migración corre solo en el schema `pronimerp`, así
--    que aplicamos a todas las empresas del schema — que es una sola).
UPDATE pronimerp.empresas
   SET autoseed_categorias_desde_proveedor = false;

COMMIT;
