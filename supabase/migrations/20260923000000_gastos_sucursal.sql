-- Gastos por sucursal: agrega sucursal_id (nullable) a la tabla gastos.
--
-- Nullable: los gastos históricos y los "generales de la empresa" quedan sin
-- sucursal. El explorador de gastos ya detecta la columna y la muestra si existe.
--
-- Idempotente. Aplica en el schema donde exista `gastos` (public o pronimerp).

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'gastos' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'gastos' AND column_name = 'sucursal_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN sucursal_id uuid', s);
      -- FK a sucursales si la tabla existe en el mismo schema.
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'sucursales') THEN
        BEGIN
          EXECUTE format('ALTER TABLE %I.gastos ADD CONSTRAINT gastos_sucursal_fk FOREIGN KEY (sucursal_id) REFERENCES %I.sucursales(id) ON DELETE SET NULL', s, s);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END IF;
      EXECUTE format('CREATE INDEX IF NOT EXISTS gastos_sucursal_idx ON %I.gastos (empresa_id, sucursal_id)', s);
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
