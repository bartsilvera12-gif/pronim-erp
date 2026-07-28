-- ============================================================================
-- Migración: modulo `web_blog_posts` en el schema pronimerp.
-- Fecha: 2026-09-07
-- Idempotente. No destructiva.
--
-- Blog administrable desde el ERP → alimenta el /blog del sitio publico de
-- Akakua'a (blog.html + post.html). Karen crea / edita / publica notas
-- desde /admin/web/blog; el HTML estático las lee por fetch a
-- /api/publico/blog-posts.
--
-- Mismo patrón que web_catalogo_items y web_tesoros.
-- ============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'web_blog_posts'
  ) THEN
    CREATE TABLE pronimerp.web_blog_posts (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id     uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      slug           text NOT NULL,
      titulo         text NOT NULL,
      excerpt        text,
      cover_url      text,
      cuerpo_html    text,
      categoria      text,
      autor          text,
      publicado      boolean NOT NULL DEFAULT false,
      publicado_at   timestamptz,
      destacado      boolean NOT NULL DEFAULT false,
      orden          int NOT NULL DEFAULT 0,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      created_by     uuid
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'web_blog_posts'
  ) THEN
    ALTER TABLE pronimerp.web_blog_posts
      ADD COLUMN IF NOT EXISTS slug         text,
      ADD COLUMN IF NOT EXISTS titulo       text,
      ADD COLUMN IF NOT EXISTS excerpt      text,
      ADD COLUMN IF NOT EXISTS cover_url    text,
      ADD COLUMN IF NOT EXISTS cuerpo_html  text,
      ADD COLUMN IF NOT EXISTS categoria    text,
      ADD COLUMN IF NOT EXISTS autor        text,
      ADD COLUMN IF NOT EXISTS publicado    boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS publicado_at timestamptz,
      ADD COLUMN IF NOT EXISTS destacado    boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS orden        int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS created_by   uuid;
  END IF;
END
$do$ LANGUAGE plpgsql;

-- Slug único por empresa (evita colisiones al hidratar por ?slug=)
CREATE UNIQUE INDEX IF NOT EXISTS ux_web_blog_posts_empresa_slug
  ON pronimerp.web_blog_posts (empresa_id, slug);

-- Listado público: por empresa + publicado + orden/publicado_at
CREATE INDEX IF NOT EXISTS ix_web_blog_posts_empresa_pub_orden
  ON pronimerp.web_blog_posts (empresa_id, publicado, orden, publicado_at DESC);

-- Grants (patron pronim)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA pronimerp TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON pronimerp.web_blog_posts TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON pronimerp.web_blog_posts TO service_role;
  END IF;
END
$do$ LANGUAGE plpgsql;

DO $do$
DECLARE n_cols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
  WHERE table_schema='pronimerp' AND table_name='web_blog_posts';
  RAISE NOTICE 'pronimerp.web_blog_posts -> % columnas', n_cols;
END
$do$ LANGUAGE plpgsql;
