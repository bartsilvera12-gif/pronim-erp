-- Fase 2 · Tanda 8: conciliación bancaria con estados extendidos
--
-- ventas_pagos_detalle.conciliacion_estado pasa de 3 a 5 valores:
--   🟡 pendiente   (default; recién creada)
--   🔵 en_proceso  (marcada, esperando confirmación bancaria)
--   🟢 confirmada  (confirmada por el banco / operadora)
--   👀 conciliada  (matcheada contra extracto por el financiero)
--   ❌ descartada  (rechazada / duplicada)
--
-- Backfill:
--   'conciliado' (legacy) → 'conciliada'
--   'descartado' (legacy) → 'descartada'
--   'pendiente'           → se preserva
--
-- Agrega:
--   conciliado_at        → cuándo se conciliada
--   conciliado_by        → usuario que concilió
--   conciliado_by_nombre → snapshot legible
--   conciliacion_nota    → texto libre (diff con banco, ref externa, etc.)
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='pronimerp' AND table_name='ventas_pagos_detalle') THEN
    RETURN;
  END IF;

  -- Backfill de valores legacy antes de cambiar el CHECK.
  UPDATE pronimerp.ventas_pagos_detalle
     SET conciliacion_estado = 'conciliada'
   WHERE conciliacion_estado = 'conciliado';
  UPDATE pronimerp.ventas_pagos_detalle
     SET conciliacion_estado = 'descartada'
   WHERE conciliacion_estado = 'descartado';

  -- CHECK ampliado. Nombre canónico del constraint autogenerado.
  ALTER TABLE pronimerp.ventas_pagos_detalle
    DROP CONSTRAINT IF EXISTS ventas_pagos_detalle_conciliacion_estado_check;
  ALTER TABLE pronimerp.ventas_pagos_detalle
    ADD CONSTRAINT ventas_pagos_detalle_conciliacion_estado_check
    CHECK (conciliacion_estado IN ('pendiente','en_proceso','confirmada','conciliada','descartada'));

  -- Columnas de trazabilidad
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='ventas_pagos_detalle'
                    AND column_name='conciliado_at') THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD COLUMN conciliado_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='ventas_pagos_detalle'
                    AND column_name='conciliado_by') THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD COLUMN conciliado_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='ventas_pagos_detalle'
                    AND column_name='conciliado_by_nombre') THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD COLUMN conciliado_by_nombre text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='ventas_pagos_detalle'
                    AND column_name='conciliacion_nota') THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD COLUMN conciliacion_nota text;
  END IF;

  -- Índice para consulta habitual: por sucursal + estado + fecha.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='pronimerp' AND indexname='ix_pagos_conciliacion_estado_fecha') THEN
    CREATE INDEX ix_pagos_conciliacion_estado_fecha
      ON pronimerp.ventas_pagos_detalle (empresa_id, conciliacion_estado, created_at DESC);
  END IF;
END
$mig$;
