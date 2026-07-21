-- Multi-moneda por sucursal + multi-idioma por usuario.
--
-- pronimerp.sucursales.moneda:
--   Código ISO 4217. 'PYG' (guaraníes) por defecto — Karen opera en
--   Paraguay salvo las sucursales de Brasil (BRL). Otras monedas se
--   pueden habilitar ampliando el CHECK más adelante.
--
-- pronimerp.usuarios.lang:
--   Código IETF BCP 47 corto. 'es' por defecto. Las sucursales de
--   Brasil usan 'pt-BR'. El frontend lee usuario.lang para decidir
--   qué diccionario cargar.
--
-- Idempotente: agrega la columna solo si no existe y sin sobrescribir
-- valores actuales.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'sucursales'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp' AND table_name = 'sucursales' AND column_name = 'moneda'
  ) THEN
    ALTER TABLE pronimerp.sucursales
      ADD COLUMN moneda text NOT NULL DEFAULT 'PYG'
      CHECK (moneda IN ('PYG','BRL','USD','ARS'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'usuarios'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp' AND table_name = 'usuarios' AND column_name = 'lang'
  ) THEN
    ALTER TABLE pronimerp.usuarios
      ADD COLUMN lang text NOT NULL DEFAULT 'es'
      CHECK (lang IN ('es','pt-BR','en'));
  END IF;
END $$;
