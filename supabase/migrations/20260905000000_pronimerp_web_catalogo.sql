-- ============================================================================
-- Migración: modulo `web_catalogo_items` en el schema pronimerp.
-- Fecha: 2026-09-05
-- Idempotente. No destructiva.
--
-- Catálogo administrable desde el ERP → alimenta la página /catalogo del sitio
-- publico de Akakua'a (public/akakuaa/pages/catalogo.html). Es un catálogo
-- CURADO, distinto de las Categorías de precio (/admin/categorias) y de las
-- franjas de la sucursal Principal. Cada item tiene una foto (URL absoluta a
-- Cloudinary o ruta local /akakuaa/catalogo/...), nombre, descripción, precio
-- opcional, string libre de categoria/edad, orden y flags activo/destacado.
-- ============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'web_catalogo_items'
  ) THEN
    CREATE TABLE pronimerp.web_catalogo_items (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id   uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      nombre       text NOT NULL,
      descripcion  text,
      precio       numeric(14,2),
      categoria    text,
      edad         text,
      imagen_url   text NOT NULL,
      sku_franja   text,
      orden        int NOT NULL DEFAULT 0,
      activo       boolean NOT NULL DEFAULT true,
      destacado    boolean NOT NULL DEFAULT false,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      created_by   uuid
    );
  END IF;

  -- Columnas idempotentes por si la tabla ya existia con otro shape
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'web_catalogo_items'
  ) THEN
    ALTER TABLE pronimerp.web_catalogo_items
      ADD COLUMN IF NOT EXISTS descripcion text,
      ADD COLUMN IF NOT EXISTS precio      numeric(14,2),
      ADD COLUMN IF NOT EXISTS categoria   text,
      ADD COLUMN IF NOT EXISTS edad        text,
      ADD COLUMN IF NOT EXISTS sku_franja  text,
      ADD COLUMN IF NOT EXISTS orden       int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS activo      boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS destacado   boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS created_by  uuid;
  END IF;
END
$do$ LANGUAGE plpgsql;

-- Indice principal para listados publicos
CREATE INDEX IF NOT EXISTS ix_web_catalogo_items_empresa_activo_orden
  ON pronimerp.web_catalogo_items (empresa_id, activo, orden);

-- Grants (patron pronim)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA pronimerp TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON pronimerp.web_catalogo_items TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON pronimerp.web_catalogo_items TO service_role;
  END IF;
END
$do$ LANGUAGE plpgsql;

DO $do$
DECLARE n_cols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
  WHERE table_schema='pronimerp' AND table_name='web_catalogo_items';
  RAISE NOTICE 'pronimerp.web_catalogo_items -> % columnas', n_cols;
END
$do$ LANGUAGE plpgsql;
