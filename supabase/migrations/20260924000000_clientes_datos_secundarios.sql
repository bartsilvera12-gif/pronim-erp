-- Asegura que la tabla `clientes` tenga los campos de contacto secundario.
--
-- El formulario "Nuevo cliente" ahora persiste telefono_secundario y
-- email_secundario. Estas columnas ya están en la plantilla de provisión de
-- tenants, pero esta migración las agrega por si algún schema quedó sin ellas
-- (evita que crear/editar un cliente falle por "column does not exist").
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
        WHERE table_schema = s AND table_name = 'clientes' AND column_name = 'telefono_secundario'
    ) THEN
      EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN telefono_secundario text', s);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'clientes' AND column_name = 'email_secundario'
    ) THEN
      EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN email_secundario text', s);
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
