-- ============================================================================
-- Migración: modulo `web_tesoros` en el schema pronimerp.
-- Fecha: 2026-09-04
-- Idempotente. No destructiva.
--
-- Tesoros administrables desde el ERP → alimenta la sección "Tesoros que
-- acaban de llegar" del sitio publico de Akakua'a. Solo Principal tiene web,
-- pero server-side todo se scopea por empresa_id igual (patron pronim).
-- Cada tesoro es una foto o video con url (relativa a /akakuaa/tesoros/ o
-- absoluta a Cloudinary), titulo/subtitulo/precio/sku opcionales, orden e
-- indicador activo.
-- ============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'web_tesoros'
  ) THEN
    CREATE TABLE pronimerp.web_tesoros (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id   uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      tipo         text NOT NULL CHECK (tipo IN ('foto','video')),
      url          text NOT NULL,
      titulo       text,
      subtitulo    text,
      precio       numeric(14,2),
      sku_franja   text,
      orden        int NOT NULL DEFAULT 0,
      activo       boolean NOT NULL DEFAULT true,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      created_by   uuid
    );
  END IF;

  -- Columnas idempotentes por si la tabla ya existia con otro shape
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'web_tesoros'
  ) THEN
    ALTER TABLE pronimerp.web_tesoros
      ADD COLUMN IF NOT EXISTS titulo     text,
      ADD COLUMN IF NOT EXISTS subtitulo  text,
      ADD COLUMN IF NOT EXISTS precio     numeric(14,2),
      ADD COLUMN IF NOT EXISTS sku_franja text,
      ADD COLUMN IF NOT EXISTS orden      int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS activo     boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS created_by uuid;
  END IF;
END
$do$ LANGUAGE plpgsql;

-- Indice principal para listados publicos
CREATE INDEX IF NOT EXISTS ix_web_tesoros_empresa_activo_orden
  ON pronimerp.web_tesoros (empresa_id, activo, orden);

-- Grants (patron pronim)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA pronimerp TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON pronimerp.web_tesoros TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON pronimerp.web_tesoros TO service_role;
  END IF;
END
$do$ LANGUAGE plpgsql;

DO $do$
DECLARE n_cols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
  WHERE table_schema='pronimerp' AND table_name='web_tesoros';
  RAISE NOTICE 'pronimerp.web_tesoros -> % columnas', n_cols;
END
$do$ LANGUAGE plpgsql;
