-- Fase 2 · Tanda 6: auditoría de operaciones
--
-- Tabla `pronimerp.auditoria_eventos` — ledger de cambios sensibles para
-- gestión (venta anulada, descuento fuera de política, cambio de precio,
-- cambio de datos de cliente, modificación de meta/comisión, etc.).
--
-- Contrato:
--   - fecha        : cuándo ocurrió
--   - usuario_*    : quién (id + nombre snapshot para sobrevivir cambios)
--   - sucursal_id  : dónde (nullable — algunas ops son globales)
--   - tipo         : slug corto de la operación (venta_anulada, descuento_manual,
--                    precio_actualizado, cliente_editado, meta_cambiada, etc.)
--   - entidad      : sobre qué se actuó (venta, cliente, producto, meta, …)
--   - entidad_id   : uuid del registro afectado (nullable)
--   - referencia   : texto legible (ej. "VTA-000123", "META Betim")
--   - dato_anterior/dato_nuevo : jsonb con snapshot; puede ser null si no aplica
--   - motivo       : texto opcional (obligatorio en algunas UIs, no en el CHECK)
--   - meta         : jsonb para info extra sin schema fijo
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='pronimerp' AND table_name='auditoria_eventos') THEN
    CREATE TABLE pronimerp.auditoria_eventos (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    uuid NOT NULL,
      fecha         timestamptz NOT NULL DEFAULT now(),
      usuario_id    uuid,
      usuario_nombre text,
      sucursal_id   uuid,
      sucursal_nombre text,
      tipo          text NOT NULL,
      entidad       text NOT NULL,
      entidad_id    uuid,
      referencia    text,
      dato_anterior jsonb,
      dato_nuevo    jsonb,
      motivo        text,
      meta          jsonb,
      dispositivo   text,
      ip            text,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  -- FK opcional a empresas si existe la tabla — best effort.
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='pronimerp' AND table_name='empresas')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                      WHERE constraint_schema='pronimerp'
                        AND table_name='auditoria_eventos'
                        AND constraint_name='auditoria_eventos_empresa_fk') THEN
    ALTER TABLE pronimerp.auditoria_eventos
      ADD CONSTRAINT auditoria_eventos_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES pronimerp.empresas(id) ON DELETE CASCADE;
  END IF;

  -- Índices de consulta habitual (empresa+fecha desc, entidad, usuario)
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='pronimerp' AND indexname='idx_auditoria_empresa_fecha') THEN
    CREATE INDEX idx_auditoria_empresa_fecha
      ON pronimerp.auditoria_eventos (empresa_id, fecha DESC);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='pronimerp' AND indexname='idx_auditoria_entidad') THEN
    CREATE INDEX idx_auditoria_entidad
      ON pronimerp.auditoria_eventos (empresa_id, entidad, entidad_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='pronimerp' AND indexname='idx_auditoria_usuario') THEN
    CREATE INDEX idx_auditoria_usuario
      ON pronimerp.auditoria_eventos (empresa_id, usuario_id, fecha DESC);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='pronimerp' AND indexname='idx_auditoria_tipo') THEN
    CREATE INDEX idx_auditoria_tipo
      ON pronimerp.auditoria_eventos (empresa_id, tipo, fecha DESC);
  END IF;

  -- RLS con el patrón puede_acceder_empresa (si existe la función)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='pronimerp' AND p.proname='puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.auditoria_eventos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_auditoria_all ON pronimerp.auditoria_eventos';
    EXECUTE 'CREATE POLICY p_auditoria_all ON pronimerp.auditoria_eventos
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END
$mig$;
