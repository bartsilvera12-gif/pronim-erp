-- =====================================================================
-- Pronim — Agrega vista de dashboard "Clientes" al catálogo global.
-- ---------------------------------------------------------------------
-- El slug 'financiero' se mantiene intacto (solo cambiamos su etiqueta
-- visible en el frontend para leerse "Sucursales"). Agregamos 'clientes'
-- como vista nueva del catálogo.
--
-- Solo la habilitamos automáticamente para empresas cuyo data_schema =
-- 'pronimerp' — no afectamos otras marcas que compartan el catálogo.
--
-- Idempotente y tolerante a la ubicación del catálogo: busca las tablas
-- en pronimerp y zentra_erp, usa la primera que exista.
-- =====================================================================

BEGIN;

DO $mig$
DECLARE
  views_schema TEXT;
  empresas_schema TEXT;
BEGIN
  -- Ubicar dashboard_views
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zentra_erp' AND table_name = 'dashboard_views'
  ) THEN
    views_schema := 'zentra_erp';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'dashboard_views'
  ) THEN
    views_schema := 'pronimerp';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dashboard_views'
  ) THEN
    views_schema := 'public';
  ELSE
    RAISE NOTICE 'dashboard_views no encontrado; skip.';
    RETURN;
  END IF;

  -- Ubicar empresas
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'empresas'
  ) THEN
    empresas_schema := 'pronimerp';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zentra_erp' AND table_name = 'empresas'
  ) THEN
    empresas_schema := 'zentra_erp';
  ELSE
    RAISE NOTICE 'catalogo de empresas no encontrado; skip habilitacion.';
  END IF;

  -- 1) UPSERT slug 'clientes' en el catálogo
  EXECUTE format($sql$
    INSERT INTO %I.dashboard_views (slug, nombre, orden, activo)
    VALUES ('clientes', 'Clientes', 50, true)
    ON CONFLICT (slug) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      orden = EXCLUDED.orden,
      activo = EXCLUDED.activo
  $sql$, views_schema);

  -- 2) Habilitar la vista para empresas Pronim, solo si tenemos ambos
  --    catálogos + empresa_dashboard_views en el mismo schema que views.
  IF empresas_schema IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = views_schema AND table_name = 'empresa_dashboard_views'
  ) THEN
    EXECUTE format($sql$
      INSERT INTO %I.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
      SELECT e.id, dv.id, true
      FROM %I.empresas e
      CROSS JOIN %I.dashboard_views dv
      WHERE e.data_schema = 'pronimerp'
        AND dv.slug = 'clientes'
      ON CONFLICT (empresa_id, dashboard_view_id) DO UPDATE SET activo = true
    $sql$, views_schema, empresas_schema, views_schema);
  ELSE
    RAISE NOTICE 'empresa_dashboard_views o empresas ausentes; catalogo actualizado pero no se habilita por-empresa.';
  END IF;
END
$mig$;

COMMIT;
