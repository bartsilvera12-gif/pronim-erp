-- Segmentación: flag manual VIP por cliente.
--
-- Idempotente. Aplica en el schema donde exista `clientes` (public o
-- pronimerp) — instalaciones monocliente tienen la tabla en pronimerp.

DO $mig$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'clientes'
        AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'clientes' AND column_name = 'es_vip'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.clientes ADD COLUMN es_vip boolean NOT NULL DEFAULT false',
        s
      );
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
