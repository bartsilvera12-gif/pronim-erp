-- Dirección y teléfono POR SUCURSAL, para el comprobante.
--
-- Hasta ahora el ticket imprimía los datos de la empresa: una sola dirección
-- y un solo teléfono (el personal de la dueña, que es el que figura en el
-- RUC). El cliente que compró en Palmeras terminaba con el teléfono
-- equivocado si quería reclamar.
--
-- Además, para la factura con timbrado esto es lo correcto: cada
-- establecimiento (001 Lillo, 002 Palmeras) está declarado con SU dirección,
-- así que el comprobante tiene que llevar la del local que lo emitió, no la
-- de la casa matriz.
--
-- Idempotente. Aplica donde exista `sucursales`.

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'sucursales' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'sucursales' AND column_name = 'direccion'
    ) THEN
      EXECUTE format('ALTER TABLE %I.sucursales ADD COLUMN direccion text', s);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'sucursales' AND column_name = 'telefono'
    ) THEN
      EXECUTE format('ALTER TABLE %I.sucursales ADD COLUMN telefono text', s);
    END IF;
  END LOOP;
END
$mig$;

-- ── Datos de las sucursales paraguayas ───────────────────────────────────
UPDATE pronimerp.sucursales
   SET direccion = 'Eusebio Lillo Robles 3113 c/ Rogelio Benítez · Ykua Satí · Asunción',
       telefono  = '+595 972 842600'
 WHERE upper(nombre) LIKE '%LILLO%';

UPDATE pronimerp.sucursales
   SET direccion = 'Las Palmeras 4545 c/ Guillermo Saraví · Recoleta · Asunción',
       telefono  = '+595 972 839300'
 WHERE upper(nombre) LIKE '%PALMERA%';

NOTIFY pgrst, 'reload schema';

-- ── Verificación ─────────────────────────────────────────────────────────
SELECT nombre, nombre_comercial, direccion, telefono
  FROM pronimerp.sucursales
 ORDER BY nombre;
