-- Asegura que la tabla `clientes` tenga la columna `usa_nota_remision`.
--
-- El formulario de cliente (crear/editar) maneja el flag "Usa nota de remisión"
-- (se genera junto al ticket al venderle). El código lo lee y escribe, pero
-- ninguna migración creaba la columna, así que en algunos schemas editar un
-- cliente fallaba con: "Could not find the 'usa_nota_remision' column ...".
--
-- Idempotente. Aplica en el schema donde exista `clientes` (public o pronimerp).

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'clientes' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'clientes' AND column_name = 'usa_nota_remision'
    ) THEN
      EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN usa_nota_remision boolean NOT NULL DEFAULT false', s);
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
