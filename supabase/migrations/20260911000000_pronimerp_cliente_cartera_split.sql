-- Fase 2 · Tanda 4: cartera del cliente separada en 3 categorías
--
-- Amplía `pronimerp.cliente_creditos_movimientos` con:
--   • categoria   → 'credito' | 'cashback' | 'consignacion'
--   • vencimiento_at → timestamptz nullable (solo para cashback con vencimiento)
--   • promocion_id   → uuid nullable (origen del cashback: promociones.id)
--
-- Backfill: filas existentes reciben categoria por su `origen`
--   origen='cashback'      → categoria='cashback'
--   resto                  → categoria='credito'
--
-- Amplía el CHECK de `origen` para aceptar 'consignacion' (venta de producto
-- en consignación acredita al cliente y puede retirarse en dinero).
--
-- Nueva vista `v_cliente_cartera_saldos` con los 3 saldos por cliente,
-- consumida por /api/clientes/[id] y por la UI de cartera.
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='pronimerp' AND table_name='cliente_creditos_movimientos'
  ) THEN
    RETURN;
  END IF;

  -- 1) Columnas nuevas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='pronimerp' AND table_name='cliente_creditos_movimientos'
      AND column_name='categoria'
  ) THEN
    ALTER TABLE pronimerp.cliente_creditos_movimientos
      ADD COLUMN categoria text NOT NULL DEFAULT 'credito';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='pronimerp' AND table_name='cliente_creditos_movimientos'
      AND column_name='vencimiento_at'
  ) THEN
    ALTER TABLE pronimerp.cliente_creditos_movimientos
      ADD COLUMN vencimiento_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='pronimerp' AND table_name='cliente_creditos_movimientos'
      AND column_name='promocion_id'
  ) THEN
    ALTER TABLE pronimerp.cliente_creditos_movimientos
      ADD COLUMN promocion_id uuid;
  END IF;

  -- 2) CHECK de categoria (solo las 3 permitidas)
  ALTER TABLE pronimerp.cliente_creditos_movimientos
    DROP CONSTRAINT IF EXISTS cliente_creditos_movimientos_categoria_check;
  ALTER TABLE pronimerp.cliente_creditos_movimientos
    ADD CONSTRAINT cliente_creditos_movimientos_categoria_check
    CHECK (categoria IN ('credito','cashback','consignacion'));

  -- 3) CHECK de origen ampliado con 'consignacion'
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
      'cashback',
      'consignacion'
    ));

  -- 4) Backfill de categoria para filas históricas
  UPDATE pronimerp.cliente_creditos_movimientos
     SET categoria = 'cashback'
   WHERE origen = 'cashback' AND categoria <> 'cashback';
  UPDATE pronimerp.cliente_creditos_movimientos
     SET categoria = 'credito'
   WHERE origen <> 'cashback' AND categoria NOT IN ('credito','cashback','consignacion');
END
$mig$;

-- 5) Índice por (cliente_id, categoria) para acelerar el saldo por categoría.
CREATE INDEX IF NOT EXISTS idx_cliente_creditos_mov_categoria
  ON pronimerp.cliente_creditos_movimientos (cliente_id, categoria);

-- 6) Vista de saldos por categoría. Un cliente aparece solo si tiene algún
--    movimiento en cualquier categoría. Vencimientos vencidos NO se restan
--    automáticamente — eso es responsabilidad del proceso que expira cashback
--    (fuera de esta migración).
CREATE OR REPLACE VIEW pronimerp.v_cliente_cartera_saldos AS
SELECT
  cliente_id,
  empresa_id,
  COALESCE(SUM(CASE WHEN categoria='credito'      AND tipo='ENTRADA' THEN monto
                    WHEN categoria='credito'      AND tipo='SALIDA'  THEN -monto
                    WHEN categoria='credito'      AND tipo='AJUSTE'  THEN monto
                    ELSE 0 END), 0) AS saldo_credito,
  COALESCE(SUM(CASE WHEN categoria='cashback'     AND tipo='ENTRADA' THEN monto
                    WHEN categoria='cashback'     AND tipo='SALIDA'  THEN -monto
                    WHEN categoria='cashback'     AND tipo='AJUSTE'  THEN monto
                    ELSE 0 END), 0) AS saldo_cashback,
  COALESCE(SUM(CASE WHEN categoria='consignacion' AND tipo='ENTRADA' THEN monto
                    WHEN categoria='consignacion' AND tipo='SALIDA'  THEN -monto
                    WHEN categoria='consignacion' AND tipo='AJUSTE'  THEN monto
                    ELSE 0 END), 0) AS saldo_consignacion
FROM pronimerp.cliente_creditos_movimientos
GROUP BY cliente_id, empresa_id;
