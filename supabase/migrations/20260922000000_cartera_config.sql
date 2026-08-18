-- Config de cartera por empresa: vencimiento del cashback.
--
--   • cashback_vencimiento_dias : int >= 0. 0 = sin vencimiento. Default 30.
--   • credito_vence             : bool. El crédito normal NO vence (false).
--
-- Se guarda en empresas.cartera_config (jsonb). Idempotente. Aplica en el
-- schema donde exista `empresas` (public o pronimerp).

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'empresas' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'empresas' AND column_name = 'cartera_config'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.empresas ADD COLUMN cartera_config jsonb NOT NULL DEFAULT ''{"cashback_vencimiento_dias":30,"credito_vence":false}''::jsonb',
        s
      );
    END IF;

    -- Backfill: filas sin la clave reciben el default 30 días.
    EXECUTE format(
      'UPDATE %I.empresas
          SET cartera_config = ''{"cashback_vencimiento_dias":30,"credito_vence":false}''::jsonb
        WHERE cartera_config IS NULL OR cartera_config = ''{}''::jsonb',
      s
    );
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
