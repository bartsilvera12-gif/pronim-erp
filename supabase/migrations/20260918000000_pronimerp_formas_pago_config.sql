-- Fase 2 · Tanda 12: formas de pago configurables por empresa
--
-- Tabla `pronimerp.formas_pago_config` — permite renombrar, activar/
-- desactivar y ordenar cada forma de pago que ya existe en el sistema
-- (efectivo / tarjeta / transferencia / qr / billetera / otro). El
-- `codigo` es el mismo slug usado en ventas.metodo_pago y no se cambia.
--
-- Idempotente + seed automático por empresa.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='pronimerp' AND table_name='formas_pago_config') THEN
    CREATE TABLE pronimerp.formas_pago_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      codigo text NOT NULL CHECK (codigo IN ('efectivo','tarjeta','transferencia','qr','billetera','otro')),
      label  text NOT NULL,
      orden  int  NOT NULL DEFAULT 100,
      activo boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, codigo)
    );
    CREATE INDEX idx_formas_pago_empresa
      ON pronimerp.formas_pago_config (empresa_id, activo, orden);
  END IF;

  -- Seed defaults por empresa (idempotente).
  INSERT INTO pronimerp.formas_pago_config (empresa_id, codigo, label, orden)
  SELECT e.id, d.codigo, d.label, d.orden
    FROM pronimerp.empresas e
    CROSS JOIN (VALUES
      ('efectivo',      'Efectivo',        10),
      ('tarjeta',       'Tarjeta',         20),
      ('transferencia', 'Transferencia',   30),
      ('qr',            'QR',              40),
      ('billetera',     'Billetera',       50),
      ('otro',          'Otro',            90)
    ) AS d(codigo, label, orden)
   ON CONFLICT (empresa_id, codigo) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='pronimerp' AND p.proname='puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.formas_pago_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_formas_pago_all ON pronimerp.formas_pago_config';
    EXECUTE 'CREATE POLICY p_formas_pago_all ON pronimerp.formas_pago_config
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END
$mig$;
