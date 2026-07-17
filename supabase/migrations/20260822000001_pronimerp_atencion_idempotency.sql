-- =====================================================================
-- Pronim — Idempotencia para /api/atencion/confirmar.
-- ---------------------------------------------------------------------
-- El orquestador de "Confirmar atención" es transaccional y agrupa
-- recepción + venta + cambio. Un doble-clic no debe crear operaciones
-- duplicadas.
--
-- Estrategia:
--   1) El cliente envía `idempotency_key` (UUID generado al armar el
--      submit). Un mismo submit reintentado reusa la misma key; cambiar
--      cualquier dato regenera la key en el frontend.
--   2) Se guarda además `request_hash` (SHA-256 hex del payload
--      canonicalizado). Si llega la misma key con distinto hash → 409.
--   3) Si la key ya existe con el MISMO hash → 200 con el `resultado`
--      cacheado (no re-ejecuta nada).
--
-- La fila se inserta DENTRO de la transacción del orquestador con
-- `INSERT ... ON CONFLICT (empresa_id, idempotency_key) DO NOTHING
-- RETURNING id` — si no devuelve nada, otro proceso está corriendo la
-- misma key: se espera con SELECT ... FOR UPDATE.
--
-- El unique compuesto en (empresa_id, idempotency_key) da:
--   - aislamiento por empresa (una key no colisiona entre tenants).
--   - protección real contra doble-clic dentro de la misma empresa.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pronimerp.atencion_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  resultado jsonb,
  estado text NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok','error')),
  error_mensaje text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atencion_operaciones_empresa_key_uniq
    UNIQUE (empresa_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_atencion_operaciones_empresa_fecha
  ON pronimerp.atencion_operaciones (empresa_id, created_at DESC);

COMMENT ON TABLE pronimerp.atencion_operaciones IS
  'Log idempotente del orquestador /api/atencion/confirmar. Una key por submit lógico. Guarda resultado para servir reintentos.';
COMMENT ON COLUMN pronimerp.atencion_operaciones.request_hash IS
  'SHA-256 hex del payload canonicalizado. Si la key llega con distinto hash → conflicto (409).';
COMMENT ON COLUMN pronimerp.atencion_operaciones.resultado IS
  'JSON con recepcion_id, venta_id, cambio_id y montos — se devuelve tal cual en reintentos.';

-- RLS: alineado con el resto de tablas pronimerp que usan puede_acceder_empresa.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pronimerp' AND p.proname = 'puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.atencion_operaciones ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_atencion_operaciones_all ON pronimerp.atencion_operaciones';
    EXECUTE 'CREATE POLICY p_atencion_operaciones_all ON pronimerp.atencion_operaciones
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON pronimerp.atencion_operaciones
  TO authenticated, service_role;

COMMIT;
