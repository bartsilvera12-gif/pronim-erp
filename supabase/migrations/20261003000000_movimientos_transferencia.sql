-- Las transferencias entre sucursales ahora dejan rastro en Movimientos.
--
-- Hasta ahora una transferencia solo tocaba `producto_stock_sucursal` y su
-- propia tabla: el stock cambiaba de local sin que apareciera nada en
-- Inventario → Movimientos. Para alguien mirando el historial, la mercadería
-- se movía sola.
--
-- Dos cambios:
--   1. `origen` acepta 'transferencia' (antes solo compra/venta/ajuste/etc.).
--   2. `sucursal_id` en movimientos_inventario. La tabla era global por
--      empresa y la sucursal se deducía de la venta o recepción referenciada;
--      en una transferencia eso no alcanza, porque el MISMO movimiento tiene
--      una salida en un local y una entrada en otro. Guardarla explícita
--      también deja el filtro por sucursal más barato para el resto.
--
-- Idempotente. Aplica donde exista `movimientos_inventario`.

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'movimientos_inventario'
        AND table_schema IN ('public','pronimerp')
  LOOP
    -- ── 1) sucursal_id ──────────────────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'movimientos_inventario'
          AND column_name = 'sucursal_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I.movimientos_inventario ADD COLUMN sucursal_id uuid', s);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS movimientos_inventario_sucursal_idx
           ON %I.movimientos_inventario (empresa_id, sucursal_id)', s
      );
    END IF;

    -- ── 2) origen = 'transferencia' ─────────────────────────────────────
    -- Se reconstruye el CHECK conservando los valores que ya aceptaba, para
    -- no invalidar filas existentes.
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_origen_check', s
      );
      EXECUTE format($chk$
        ALTER TABLE %I.movimientos_inventario
          ADD CONSTRAINT movimientos_inventario_origen_check
          CHECK (origen IN ('compra','venta','ajuste_manual','inventario_inicial',
                            'venta_regalo','recepcion','transferencia'))
      $chk$, s);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo recrear el check de origen en %: %', s, SQLERRM;
    END;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ─────────────────────────────────────────────────────────
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'pronimerp'
   AND table_name = 'movimientos_inventario'
   AND column_name = 'sucursal_id';
