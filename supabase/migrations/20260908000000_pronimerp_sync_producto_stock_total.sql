-- Sincroniza pronimerp.productos.stock_actual = SUM(producto_stock_sucursal.stock_actual)
--
-- Motivo: la venta descuenta stock por sucursal (producto_stock_sucursal), pero
-- pronimerp.productos.stock_actual quedaba desactualizado. La lista de Inventario
-- lee productos.stock_actual, así que las ventas sin stock (que dejan negativo en
-- la sucursal) no se reflejaban en la vista global.
--
-- Mismo patrón que joyeriaartesanos.sync_producto_stock_total.

BEGIN;

CREATE OR REPLACE FUNCTION pronimerp.sync_producto_stock_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_producto_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  UPDATE pronimerp.productos p
  SET stock_actual = COALESCE((
    SELECT SUM(pss.stock_actual)
    FROM pronimerp.producto_stock_sucursal pss
    WHERE pss.producto_id = v_producto_id
  ), 0),
  updated_at = now()
  WHERE p.id = v_producto_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producto_stock_total_aiud
  ON pronimerp.producto_stock_sucursal;

CREATE TRIGGER trg_sync_producto_stock_total_aiud
AFTER INSERT OR UPDATE OR DELETE ON pronimerp.producto_stock_sucursal
FOR EACH ROW
EXECUTE FUNCTION pronimerp.sync_producto_stock_total();

-- Backfill una vez para dejar todo consistente (incluye franjas ya vendidas
-- sin stock que quedaron negativas en producto_stock_sucursal).
UPDATE pronimerp.productos p
SET stock_actual = COALESCE((
  SELECT SUM(pss.stock_actual)
  FROM pronimerp.producto_stock_sucursal pss
  WHERE pss.producto_id = p.id
), 0);

COMMIT;
