-- Repara productos con `costo_promedio` NEGATIVO.
--
-- Causa: el WACP del ingreso de recepciones usaba productos.stock_actual sin
-- validar el signo. Cuando el stock estaba negativo (franjas vendidas sin
-- stock), el término stock_prev*costo_prev arrastraba el promedio a negativo:
--
--   stock -10 @ costo 10.000  +  ingresan 20 @ 1.000
--   => (-100.000 + 20.000) / 10 = -8.000   <-- costo promedio negativo
--
-- Consecuencia: al vender esa franja, el INSERT en ventas_items violaba el
-- check `ventas_items_costo_snapshot_nonneg` y la venta no se podía cerrar
-- ("new row for relation ventas_items violates check constraint ...").
--
-- El cálculo ya quedó corregido en el código (no vuelve a producirse). Esta
-- migración limpia los valores negativos que quedaron guardados, llevándolos
-- a 0 (un costo negativo no tiene significado contable).
--
-- Idempotente. Aplica en el schema donde exista `productos` (public o pronimerp).

DO $mig$
DECLARE s text; n integer;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'productos' AND table_schema IN ('public','pronimerp')
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'productos' AND column_name = 'costo_promedio'
    ) THEN
      EXECUTE format(
        'UPDATE %I.productos SET costo_promedio = 0, updated_at = now() WHERE costo_promedio < 0', s
      );
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE 'schema %: % producto(s) con costo_promedio negativo corregido(s) a 0', s, n;
    END IF;
  END LOOP;
END
$mig$;

-- Los snapshots ya guardados en ventas_items no se tocan: son historia y el
-- check solo aplica a filas nuevas.

NOTIFY pgrst, 'reload schema';
