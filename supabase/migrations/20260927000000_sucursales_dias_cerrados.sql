-- Días de cierre POR SUCURSAL (para el cálculo de metas y comisiones).
--
-- Hasta ahora el ERP asumía que toda la empresa cerraba los domingos, con una
-- constante en el código. Pero Akakua'a opera en Paraguay y Brasil, y cada
-- local puede tener su propio día de descanso (o abrir los 7 días).
--
-- `dias_cerrados` guarda los días de la semana en que la sucursal NO abre,
-- usando la convención de PostgreSQL EXTRACT(DOW): 0=domingo … 6=sábado.
--   '{0}'   → cierra domingos (valor por defecto, el comportamiento actual)
--   '{0,1}' → cierra domingos y lunes
--   '{}'    → abre los 7 días
--
-- Idempotente. Aplica en el schema donde exista `sucursales`.

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'sucursales' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'sucursales' AND column_name = 'dias_cerrados'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.sucursales ADD COLUMN dias_cerrados smallint[] NOT NULL DEFAULT ''{0}''::smallint[]', s
      );
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
