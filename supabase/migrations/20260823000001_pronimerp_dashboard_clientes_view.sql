-- =====================================================================
-- Pronim — Agrega vista de dashboard "Clientes" al catálogo.
-- ---------------------------------------------------------------------
-- Toca SOLO el schema `pronimerp`. Si el catálogo pronimerp.dashboard_views
-- no existe, la migración hace NOTICE y sale sin fallar.
--
-- El slug 'financiero' se mantiene intacto (solo cambiamos su etiqueta
-- visible en el frontend para leerse "Sucursales"). Acá agregamos
-- 'clientes' como vista nueva y — si existe la tabla de habilitación —
-- la activamos para todas las empresas del schema pronimerp.
--
-- Idempotente.
-- =====================================================================

BEGIN;

DO $mig$
BEGIN
  -- Nada que hacer si el catálogo no está en pronimerp.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'dashboard_views'
  ) THEN
    RAISE NOTICE 'pronimerp.dashboard_views no encontrado; skip.';
    RETURN;
  END IF;

  -- 1) UPSERT slug 'clientes' en el catálogo pronimerp.
  INSERT INTO pronimerp.dashboard_views (slug, nombre, orden, activo)
  VALUES ('clientes', 'Clientes', 50, true)
  ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    orden = EXCLUDED.orden,
    activo = EXCLUDED.activo;

  -- 2) Habilitar TODAS las vistas activas del catálogo para todas las
  --    empresas pronimerp — no solo 'clientes'.
  --    Motivo: la app usa la regla "si empresa_dashboard_views está
  --    vacía => mostrar TODAS las del catálogo; si tiene filas =>
  --    mostrar SOLO las que están ahí". Si insertáramos únicamente
  --    'clientes', las demás pestañas (financiero, inventario, ventas)
  --    dejarían de aparecer para esa empresa. Insertamos todas para
  --    preservar el comportamiento previo.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'empresa_dashboard_views'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'empresas'
  ) THEN
    INSERT INTO pronimerp.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
    SELECT e.id, dv.id, true
    FROM pronimerp.empresas e
    CROSS JOIN pronimerp.dashboard_views dv
    WHERE dv.activo = true
    ON CONFLICT (empresa_id, dashboard_view_id) DO UPDATE SET activo = true;
  ELSE
    RAISE NOTICE 'pronimerp.empresa_dashboard_views o pronimerp.empresas ausentes; catalogo actualizado pero no se habilita por-empresa.';
  END IF;
END
$mig$;

COMMIT;
