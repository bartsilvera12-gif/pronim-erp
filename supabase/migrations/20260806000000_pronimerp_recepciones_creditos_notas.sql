-- =====================================================================
-- Pronim Consultoría — Recepciones de prendas, créditos y notas
-- ---------------------------------------------------------------------
-- Modelo de consignación/segunda mano:
--   1) El cliente entrega N prendas. Se registra una recepción con
--      líneas por franja. Aumenta stock. Genera CRÉDITO ENTRADA por el
--      total valuado.
--   2) El cliente puede usar ese crédito en una venta como forma de
--      pago (parcial o total). Cuando se aplica, se registra un
--      movimiento SALIDA en cliente_creditos_movimientos.
--   3) El saldo del cliente es SUM(entradas) - SUM(salidas). Se
--      expone vía view v_cliente_creditos_saldo.
--   4) Anotaciones del equipo sobre el cliente: append + soft-delete
--      (solo autor o super_admin borran).
--
-- Aplica solo al schema `pronimerp`. Idempotente.
-- =====================================================================

BEGIN;

-- 1) cliente_recepciones (cabecera)
CREATE TABLE IF NOT EXISTS pronimerp.cliente_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id) ON DELETE RESTRICT,
  sucursal_id uuid REFERENCES pronimerp.sucursales(id) ON DELETE SET NULL,
  numero_control text NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  total_credito numeric NOT NULL DEFAULT 0 CHECK (total_credito >= 0),
  observaciones text,
  estado text NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada','anulada')),
  created_by uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero_control)
);

CREATE INDEX IF NOT EXISTS idx_cliente_recepciones_cliente
  ON pronimerp.cliente_recepciones (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_recepciones_empresa_fecha
  ON pronimerp.cliente_recepciones (empresa_id, fecha DESC);

-- 2) cliente_recepciones_items (líneas)
CREATE TABLE IF NOT EXISTS pronimerp.cliente_recepciones_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  recepcion_id uuid NOT NULL REFERENCES pronimerp.cliente_recepciones(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES pronimerp.productos(id) ON DELETE RESTRICT,
  producto_nombre text NOT NULL,
  sku text NOT NULL,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0),
  subtotal numeric NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_recepciones_items_recepcion
  ON pronimerp.cliente_recepciones_items (recepcion_id);
CREATE INDEX IF NOT EXISTS idx_cliente_recepciones_items_producto
  ON pronimerp.cliente_recepciones_items (producto_id);

-- 3) cliente_creditos_movimientos (asientos de saldo)
CREATE TABLE IF NOT EXISTS pronimerp.cliente_creditos_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE')),
  monto numeric NOT NULL CHECK (monto > 0),
  origen text NOT NULL CHECK (origen IN ('recepcion','venta','ajuste_manual','nota_credito')),
  referencia_id uuid,
  referencia_tipo text,
  referencia_numero text,
  observaciones text,
  fecha timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_creditos_mov_cliente
  ON pronimerp.cliente_creditos_movimientos (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_creditos_mov_empresa
  ON pronimerp.cliente_creditos_movimientos (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_creditos_mov_ref
  ON pronimerp.cliente_creditos_movimientos (referencia_tipo, referencia_id)
  WHERE referencia_id IS NOT NULL;

-- View: saldo actual por cliente.
CREATE OR REPLACE VIEW pronimerp.v_cliente_creditos_saldo AS
SELECT
  cliente_id,
  empresa_id,
  COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN monto
                    WHEN tipo = 'SALIDA' THEN -monto
                    WHEN tipo = 'AJUSTE' THEN monto
                    ELSE 0 END), 0) AS saldo
FROM pronimerp.cliente_creditos_movimientos
GROUP BY cliente_id, empresa_id;

-- 4) cliente_notas (anotaciones del equipo)
CREATE TABLE IF NOT EXISTS pronimerp.cliente_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id) ON DELETE CASCADE,
  autor_id uuid,
  autor_nombre text,
  texto text NOT NULL CHECK (length(trim(texto)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_nombre text
);

CREATE INDEX IF NOT EXISTS idx_cliente_notas_cliente
  ON pronimerp.cliente_notas (cliente_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 5) RLS: alinear con el patrón del schema (puede_acceder_empresa)
--    Solo si la función existe (en clonados nuevos existe).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pronimerp' AND p.proname = 'puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.cliente_recepciones ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_recepciones_all ON pronimerp.cliente_recepciones';
    EXECUTE 'CREATE POLICY p_recepciones_all ON pronimerp.cliente_recepciones
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';

    EXECUTE 'ALTER TABLE pronimerp.cliente_recepciones_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_recepciones_items_all ON pronimerp.cliente_recepciones_items';
    EXECUTE 'CREATE POLICY p_recepciones_items_all ON pronimerp.cliente_recepciones_items
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';

    EXECUTE 'ALTER TABLE pronimerp.cliente_creditos_movimientos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_creditos_mov_all ON pronimerp.cliente_creditos_movimientos';
    EXECUTE 'CREATE POLICY p_creditos_mov_all ON pronimerp.cliente_creditos_movimientos
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';

    EXECUTE 'ALTER TABLE pronimerp.cliente_notas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_cliente_notas_all ON pronimerp.cliente_notas';
    EXECUTE 'CREATE POLICY p_cliente_notas_all ON pronimerp.cliente_notas
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END $$;

-- 6) Grants para PostgREST vía roles authenticated/service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON
  pronimerp.cliente_recepciones,
  pronimerp.cliente_recepciones_items,
  pronimerp.cliente_creditos_movimientos,
  pronimerp.cliente_notas
TO authenticated, service_role;
GRANT SELECT ON pronimerp.v_cliente_creditos_saldo TO authenticated, service_role;

COMMIT;
