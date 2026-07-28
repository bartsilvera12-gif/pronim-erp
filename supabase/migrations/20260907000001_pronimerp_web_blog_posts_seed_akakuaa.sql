-- ============================================================================
-- Seed: posts iniciales del blog Akakua'a (los que estaban hardcoded en
-- blog.html antes de la integración con el ERP). Idempotente: si el slug
-- ya existe para esa empresa, no lo pisa (ON CONFLICT DO NOTHING).
--
-- Fecha: 2026-09-07
--
-- Nota: usamos las imágenes con paths relativos (uploads/xxx.png) porque el
-- sitio publico las sirve desde su propio dominio. En la preview del ERP no
-- van a cargar hasta que Karen las re-suba o cambie a URLs absolutas.
-- ============================================================================

DO $do$
DECLARE
  emp_id uuid;
BEGIN
  -- Solo insertamos si la tabla existe (ya la creo la migracion previa)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='pronimerp' AND table_name='web_blog_posts'
  ) THEN
    RAISE NOTICE 'web_blog_posts no existe todavia, salteo seed';
    RETURN;
  END IF;

  -- Empresa principal = sucursal.es_principal=true (mismo criterio que la API publica)
  SELECT empresa_id INTO emp_id
  FROM pronimerp.sucursales
  WHERE es_principal = true
  LIMIT 1;

  IF emp_id IS NULL THEN
    RAISE NOTICE 'No hay sucursal principal, salteo seed';
    RETURN;
  END IF;

  INSERT INTO pronimerp.web_blog_posts
    (empresa_id, slug, titulo, excerpt, cover_url, categoria, autor,
     publicado, publicado_at, destacado, orden)
  VALUES
    -- Destacado (era el featured en blog.html)
    (emp_id,
     'consumo-consciente-por-que-elegir-moda-circular',
     'Consumo consciente: por qué elegir moda circular',
     'Cada prenda que vuelve a circular es una historia que sigue. Te contamos cómo la moda circular reduce el impacto ambiental y por qué elegir segunda mano no significa resignar calidad.',
     'uploads/crecercambia.png',
     'Impacto',
     'Karen Ayala',
     true, '2026-07-02'::timestamptz, true, 0),

    (emp_id,
     '5-tips-para-organizar-el-placard-de-los-peques',
     '5 tips para organizar el placard de los peques',
     'Rotación por temporada, cajones etiquetados y el sistema de "una prenda entra, una sale". Simple y sostenible.',
     'uploads/1.png',
     'Organización',
     'Equipo Akakua''a',
     true, '2026-07-15'::timestamptz, false, 1),

    (emp_id,
     'guia-de-talles-segun-edad-de-0-a-16-anos',
     'Guía de talles según edad — de 0 a 16 años',
     'Tabla completa por edad y estatura para elegir el talle correcto sin salir de casa. Descargable en PDF.',
     'uploads/2.png',
     'Guías',
     'Equipo Akakua''a',
     true, '2026-06-20'::timestamptz, false, 2),

    (emp_id,
     'el-impacto-de-tu-placard-cuanto-ahorra-reciclar-ropa',
     'El impacto de tu placard: cuánto ahorra reciclar ropa',
     'Litros de agua, kilos de CO₂ y toneladas de textiles. Los números detrás de cada prenda que vuelve a circular.',
     'uploads/3.png',
     'Impacto',
     'Equipo Akakua''a',
     true, '2026-06-10'::timestamptz, false, 3),

    (emp_id,
     'la-primera-vez-de-sofi-vendiendo-la-ropita-de-su-hijo',
     'La primera vez de Sofi vendiendo la ropita de su hijo',
     '"Pensé que iba a ser un trámite y terminó siendo un ritual". Testimonios reales de familias que confían en nosotros.',
     'uploads/4.png',
     'Historias',
     'Equipo Akakua''a',
     true, '2026-05-28'::timestamptz, false, 4)

  ON CONFLICT (empresa_id, slug) DO NOTHING;

  RAISE NOTICE 'Seed web_blog_posts aplicado a empresa %', emp_id;
END
$do$ LANGUAGE plpgsql;
