-- =====================================================================
-- Pronim — Catálogo de tipos de prenda
-- ---------------------------------------------------------------------
-- Habilita estadísticas reales sobre QUÉ prendas se reciben (remera,
-- pantalón, calzado, etc), independientemente del producto/franja
-- comercial (que solo representa la banda de precio).
--
-- Semilla editable por el admin desde /configuracion/tipos-prenda.
-- El dashboard de Sucursales muestra el mix por sucursal y período.
--
-- Idempotente: usa IF NOT EXISTS + ON CONFLICT.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pronimerp.tipos_prenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 100,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT tipos_prenda_empresa_nombre_uniq UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_tipos_prenda_empresa_orden
  ON pronimerp.tipos_prenda (empresa_id, orden, nombre)
  WHERE activo = true;

COMMENT ON TABLE pronimerp.tipos_prenda IS
  'Catálogo por empresa de tipos de prenda usados en la evaluación de cliente. Aliementa estadísticas del dashboard.';

-- FK en items de recepción (nullable — la línea puede no tener tipo cargado
-- en recepciones históricas).
ALTER TABLE pronimerp.cliente_recepciones_items
  ADD COLUMN IF NOT EXISTS tipo_prenda_id uuid REFERENCES pronimerp.tipos_prenda(id);

CREATE INDEX IF NOT EXISTS idx_recep_items_tipo_prenda
  ON pronimerp.cliente_recepciones_items (tipo_prenda_id)
  WHERE tipo_prenda_id IS NOT NULL;

-- Seed inicial idempotente por empresa. Buscamos primero en el catálogo
-- que exista (pronimerp.empresas o zentra_erp.empresas). Los admins
-- pueden desactivar/renombrar después desde /configuracion/tipos-prenda.
DO $seed$
DECLARE
  emp RECORD;
  tipo TEXT;
  ord INT;
  cat_schema TEXT;
BEGIN
  -- Detecta dónde está el catálogo de empresas en esta instancia.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'empresas'
  ) THEN
    cat_schema := 'pronimerp';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zentra_erp' AND table_name = 'empresas'
  ) THEN
    cat_schema := 'zentra_erp';
  ELSE
    RAISE NOTICE 'tipos_prenda seed skipped: catalogo de empresas no encontrado';
    RETURN;
  END IF;

  FOR emp IN EXECUTE format(
    'SELECT id FROM %I.empresas WHERE data_schema = %L', cat_schema, 'pronimerp'
  )
  LOOP
    ord := 10;
    FOREACH tipo IN ARRAY ARRAY[
      'Remera', 'Camisa/Blusa', 'Pantalón', 'Jean', 'Short',
      'Pollera', 'Vestido', 'Abrigo', 'Buzo', 'Calzado',
      'Accesorio', 'Otro'
    ]
    LOOP
      INSERT INTO pronimerp.tipos_prenda (empresa_id, nombre, orden)
      VALUES (emp.id, tipo, ord)
      ON CONFLICT (empresa_id, nombre) DO NOTHING;
      ord := ord + 10;
    END LOOP;
  END LOOP;
END
$seed$;

-- RLS + policies alineadas con el resto de tablas pronimerp que usan
-- puede_acceder_empresa (si existe).
DO $rls$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pronimerp' AND p.proname = 'puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.tipos_prenda ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_tipos_prenda_all ON pronimerp.tipos_prenda';
    EXECUTE 'CREATE POLICY p_tipos_prenda_all ON pronimerp.tipos_prenda
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END
$rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON pronimerp.tipos_prenda
  TO authenticated, service_role;

COMMIT;
