-- ============================================================================
--  PROPUESTA — NO ejecutar sin backup y aprobación explícita
--
--  Idempotency key duro para pronimerp.ventas_devoluciones (PASO 4 follow-up).
--
--  Qué resuelve:
--    La idempotencia "suave" ya implementada en devolucion-pg.ts cubre doble-
--    clic y reintentos en una ventana de 15s (mismo empresa+venta+user+total).
--    Esta migración agrega una llave idempotente OPCIONAL a nivel BD, que
--    cubre reintentos arbitrarios: robots con política de retry, dos pestañas
--    que disparan en momentos distintos, reintento desde la app móvil luego
--    de dormir el dispositivo, etc.
--
--  Cómo se usa (después de aplicar):
--    1. El cliente genera un UUID por submit (useRef/useMemo en el modal).
--    2. El cliente lo manda en el body como "idempotency_key".
--    3. El servidor lo guarda en la fila de ventas_devoluciones.
--    4. Si llega otro request con el mismo (empresa_id, idempotency_key),
--       el INSERT viola el UNIQUE parcial → se captura el conflicto y se
--       devuelve la devolución existente con duplicadoEvitado: true.
--
--  Seguridad del apply:
--    · ALTER sin default ni NOT NULL → no reescribe filas → sin lock largo.
--    · UNIQUE parcial sobre (empresa_id, idempotency_key) WHERE key IS NOT NULL
--      → las filas históricas (key = NULL) no participan del índice.
--    · Idempotente (IF NOT EXISTS): se puede re-correr sin efecto.
--
--  Rollback:
--    DROP INDEX pronimerp.ventas_devoluciones_idempotency_key_uq;
--    ALTER TABLE pronimerp.ventas_devoluciones DROP COLUMN idempotency_key;
-- ============================================================================

BEGIN;

ALTER TABLE pronimerp.ventas_devoluciones
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ventas_devoluciones_idempotency_key_uq
  ON pronimerp.ventas_devoluciones (empresa_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;

-- Verificación:
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'pronimerp'
   AND table_name = 'ventas_devoluciones'
   AND column_name = 'idempotency_key';

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'pronimerp'
   AND indexname = 'ventas_devoluciones_idempotency_key_uq';
