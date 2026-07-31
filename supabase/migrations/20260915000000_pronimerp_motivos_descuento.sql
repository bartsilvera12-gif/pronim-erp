-- Fase 2 · Tanda 9: motivos de descuento configurables
--
-- Tabla `pronimerp.motivos_descuento` — catálogo editable por empresa que
-- reemplaza la lista hard-coded en el UI (Redondeo / Negociación / Defecto /
-- Promoción / Cortesía / Intercambio / Otro).
--
-- - `codigo` es un slug estable usado en la BD (venta.descuento_motivo). Se
--   preservan los códigos default para no romper filas ya persistidas.
-- - `label` es el texto que ve el usuario (editable, i18n con etiqueta única).
-- - `orden` controla el orden en el <select>.
-- - `activo` deja quitar del combo sin borrar histórico.
--
-- Seed automático de los 7 defaults por cada empresa que exista en el momento
-- de aplicar la migración.
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='pronimerp' AND table_name='motivos_descuento') THEN
    CREATE TABLE pronimerp.motivos_descuento (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      codigo text NOT NULL,
      label  text NOT NULL,
      orden  int  NOT NULL DEFAULT 100,
      activo boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, codigo)
    );
    CREATE INDEX idx_motivos_descuento_empresa
      ON pronimerp.motivos_descuento (empresa_id, activo, orden);
  END IF;

  -- Seed de defaults por cada empresa (idempotente por (empresa_id, codigo)).
  INSERT INTO pronimerp.motivos_descuento (empresa_id, codigo, label, orden)
  SELECT e.id, d.codigo, d.label, d.orden
    FROM pronimerp.empresas e
    CROSS JOIN (VALUES
      ('redondeo',    'Redondeo',            10),
      ('negociacion', 'Negociación',         20),
      ('defecto',     'Producto con defecto',30),
      ('promocion',   'Promoción',           40),
      ('cortesia',    'Cortesía',            50),
      ('intercambio', 'Intercambio (BR)',    60),
      ('otro',        'Otro',                90)
    ) AS d(codigo, label, orden)
   ON CONFLICT (empresa_id, codigo) DO NOTHING;

  -- RLS con puede_acceder_empresa (si existe la función)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='pronimerp' AND p.proname='puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.motivos_descuento ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_motivos_descuento_all ON pronimerp.motivos_descuento';
    EXECUTE 'CREATE POLICY p_motivos_descuento_all ON pronimerp.motivos_descuento
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END
$mig$;
