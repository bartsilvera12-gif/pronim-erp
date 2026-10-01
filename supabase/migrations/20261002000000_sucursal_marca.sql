-- Marca comercial POR SUCURSAL (nombre y logo del comprobante).
--
-- Akakua'a opera con dos marcas: en Paraguay (Lillo, Palmeras) el ticket sale
-- como "Akakua'a", y en Brasil (Betim, BH, Contagem) la tienda se llama
-- "Novo Outra Vez". Hasta ahora el nombre del comprobante era uno solo para
-- toda la empresa, así que en Brasil se imprimía la marca equivocada.
--
-- `logo_url` queda en la misma tabla para que, cuando haya un logo propio de
-- cada marca, se cargue acá y no en otro lado.
--
-- Si una sucursal deja estos campos vacíos, el comprobante sigue usando el
-- nombre de la empresa como siempre.
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
        WHERE table_schema = s AND table_name = 'sucursales' AND column_name = 'nombre_comercial'
    ) THEN
      EXECUTE format('ALTER TABLE %I.sucursales ADD COLUMN nombre_comercial text', s);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'sucursales' AND column_name = 'logo_url'
    ) THEN
      EXECUTE format('ALTER TABLE %I.sucursales ADD COLUMN logo_url text', s);
    END IF;
  END LOOP;
END
$mig$;

-- ── Marcas de Akakua'a ───────────────────────────────────────────────────
-- Las sucursales que cobran en reales son las de Brasil.
UPDATE pronimerp.sucursales
   SET nombre_comercial = 'Novo Outra Vez'
 WHERE moneda = 'BRL'
   AND (nombre_comercial IS NULL OR nombre_comercial = '');

UPDATE pronimerp.sucursales
   SET nombre_comercial = 'Akakua''a'
 WHERE COALESCE(moneda, 'PYG') <> 'BRL'
   AND (nombre_comercial IS NULL OR nombre_comercial = '');

NOTIFY pgrst, 'reload schema';

-- ── Verificación ─────────────────────────────────────────────────────────
SELECT nombre, moneda, nombre_comercial, logo_url
  FROM pronimerp.sucursales
 ORDER BY nombre;
