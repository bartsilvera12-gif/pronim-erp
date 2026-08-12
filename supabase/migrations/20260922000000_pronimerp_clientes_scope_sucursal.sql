-- ═════════════════════════════════════════════════════════════════════
-- Scope de clientes/créditos por sucursal (pronimerp)
-- ═════════════════════════════════════════════════════════════════════
-- Regla del negocio:
--   Los clientes y los créditos NO son compartidos entre todas las
--   sucursales. Solo Lilo y Palmeras comparten cartera; el resto de
--   sucursales tiene su propia cartera aislada.
--
-- Diseño elegido (opción "columna scope_clientes en sucursales"):
--   - `pronimerp.sucursales.scope_clientes text` — identificador del
--     grupo de cartera al que pertenece la sucursal. Lilo y Palmeras
--     comparten `'lilo_palmeras'`; el resto usa su propio `slug`.
--   - `pronimerp.clientes.scope_clientes text` — a qué grupo pertenece
--     cada cliente. El filtrado se hace por igualdad de este valor con
--     el scope del usuario (leído desde su sucursal_id).
--
-- Backfill de clientes existentes:
--   1) Cada cliente se asigna al scope de la sucursal de su PRIMERA
--      venta (min(fecha)).
--   2) Clientes sin ventas caen a `'lilo_palmeras'`.
--   Se puede corregir manualmente después vía UPDATE.
-- ═════════════════════════════════════════════════════════════════════

-- Toda la migration es no-op si el schema pronimerp no existe (deploys de
-- prueba sobre otros tenants).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pronimerp') THEN
    RAISE NOTICE 'schema pronimerp no existe; migration no-op';
    RETURN;
  END IF;

  -- 1) sucursales.scope_clientes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='scope_clientes'
  ) THEN
    ALTER TABLE pronimerp.sucursales ADD COLUMN scope_clientes text;
  END IF;

  -- Default: slug (cada sucursal aislada)
  UPDATE pronimerp.sucursales
     SET scope_clientes = slug
   WHERE scope_clientes IS NULL OR scope_clientes = '';

  -- Fusión Lilo + Palmeras → 'lilo_palmeras'
  --   Match por nombre (case-insensitive) o por slug que contenga "lilo"/"palmera".
  UPDATE pronimerp.sucursales
     SET scope_clientes = 'lilo_palmeras'
   WHERE lower(coalesce(nombre,'')) ~ '(lilo|palmera)'
      OR lower(coalesce(slug,''))   ~ '(lilo|palmera)';

  CREATE INDEX IF NOT EXISTS sucursales_scope_clientes_idx
    ON pronimerp.sucursales (empresa_id, scope_clientes);

  -- 2) clientes.scope_clientes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='pronimerp' AND table_name='clientes' AND column_name='scope_clientes'
  ) THEN
    ALTER TABLE pronimerp.clientes ADD COLUMN scope_clientes text;
  END IF;

  -- 3) Backfill por sucursal de primera venta (si la tabla ventas existe
  --    y tiene sucursal_id + fecha).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='pronimerp' AND table_name='ventas' AND column_name='sucursal_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='pronimerp' AND table_name='ventas' AND column_name='fecha'
  ) THEN
    WITH primera AS (
      SELECT DISTINCT ON (v.cliente_id)
             v.cliente_id,
             v.sucursal_id
        FROM pronimerp.ventas v
       WHERE v.cliente_id  IS NOT NULL
         AND v.sucursal_id IS NOT NULL
       ORDER BY v.cliente_id, v.fecha ASC NULLS LAST, v.created_at ASC NULLS LAST
    )
    UPDATE pronimerp.clientes c
       SET scope_clientes = s.scope_clientes
      FROM primera p
      JOIN pronimerp.sucursales s ON s.id = p.sucursal_id
     WHERE c.id = p.cliente_id
       AND (c.scope_clientes IS NULL OR c.scope_clientes = '');
  END IF;

  -- 4) Clientes sin ventas → grupo compartido Lilo+Palmeras
  UPDATE pronimerp.clientes
     SET scope_clientes = 'lilo_palmeras'
   WHERE scope_clientes IS NULL OR scope_clientes = '';

  CREATE INDEX IF NOT EXISTS clientes_scope_clientes_idx
    ON pronimerp.clientes (empresa_id, scope_clientes);

END
$do$;
