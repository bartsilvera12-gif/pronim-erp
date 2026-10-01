-- Logo en la factura impresa.
--
-- `logo_url` puede ser una ruta del propio sitio (ej: /akakuaa/brand/akakuaa.png)
-- o una URL absoluta. Si está vacío, la factura sale sin logo, como hasta ahora.
--
-- Idempotente. Aplica donde exista `empresa_autoimpresor_config`.

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'empresa_autoimpresor_config'
        AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'empresa_autoimpresor_config'
          AND column_name = 'logo_url'
    ) THEN
      EXECUTE format('ALTER TABLE %I.empresa_autoimpresor_config ADD COLUMN logo_url text', s);
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
