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
-- Idempotente: ON CONFLICT + WHERE NOT EXISTS.
-- =====================================================================

BEGIN;

INSERT INTO zentra_erp.dashboard_views (slug, nombre, orden, activo)
VALUES ('clientes', 'Clientes', 50, true)
ON CONFLICT (slug) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  orden = EXCLUDED.orden,
  activo = EXCLUDED.activo;

-- Habilitar la vista solo para tenants Pronim. Otras marcas la ven en
-- el catálogo pero no la tienen activada en su empresa hasta que un
-- admin la habilite manualmente vía config.
INSERT INTO zentra_erp.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
SELECT e.id, dv.id, true
FROM zentra_erp.empresas e
CROSS JOIN zentra_erp.dashboard_views dv
WHERE e.data_schema = 'pronimerp'
  AND dv.slug = 'clientes'
ON CONFLICT (empresa_id, dashboard_view_id) DO UPDATE SET activo = true;

COMMIT;
