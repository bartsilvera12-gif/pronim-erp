-- =====================================================================
-- Pronim Consultoría — Historial ampliado del cliente
-- ---------------------------------------------------------------------
--   1) clientes.como_conocio (cómo llegó a la tienda).
--   2) cliente_eventos: bitácora append-only de reclamos, elogios,
--      beneficios, descuentos, cashback, cambios y otros manuales.
--      Cronológica, jamás sobreescribe: soft-delete solo super_admin.
-- =====================================================================

BEGIN;

-- 1) Campo de cómo conoció la tienda (opcional). No rompe alta existente.
ALTER TABLE pronimerp.clientes
  ADD COLUMN IF NOT EXISTS como_conocio text;

-- 2) Bitácora manual
CREATE TABLE IF NOT EXISTS pronimerp.cliente_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'reclamo','elogio','beneficio','descuento','cashback','cambio','otro'
  )),
  titulo text,
  descripcion text NOT NULL CHECK (length(trim(descripcion)) > 0),
  monto numeric CHECK (monto IS NULL OR monto >= 0),
  referencia_tipo text,
  referencia_id uuid,
  referencia_numero text,
  fecha timestamptz NOT NULL DEFAULT now(),
  autor_id uuid,
  autor_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_nombre text
);

CREATE INDEX IF NOT EXISTS idx_cliente_eventos_cliente
  ON pronimerp.cliente_eventos (cliente_id, fecha DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_eventos_empresa_fecha
  ON pronimerp.cliente_eventos (empresa_id, fecha DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_eventos_tipo
  ON pronimerp.cliente_eventos (cliente_id, tipo)
  WHERE deleted_at IS NULL;

-- RLS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pronimerp' AND p.proname = 'puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.cliente_eventos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_cliente_eventos_all ON pronimerp.cliente_eventos';
    EXECUTE 'CREATE POLICY p_cliente_eventos_all ON pronimerp.cliente_eventos
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON pronimerp.cliente_eventos
  TO authenticated, service_role;

COMMIT;
