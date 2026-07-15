-- =====================================================================
-- Pronim ERP — Asignación de sucursal por usuario (append-only, idempotente)
-- ---------------------------------------------------------------------
-- Aplica SOLO al schema `pronimerp`. No modifica otros schemas.
--
-- Objetivo:
--   1) Verificar que la infraestructura de sucursales existe con la forma
--      real completa (heredada del clone de joyeriaartesanos). Si la
--      estructura existente es incompatible, la migración FALLA con un
--      mensaje claro en lugar de crear una tabla parcial.
--   2) Garantizar `usuarios.sucursal_id uuid REFERENCES sucursales(id)`.
--   3) Garantizar `compras.sucursal_id uuid REFERENCES sucursales(id)`
--      (columna ya poblada best-effort por el endpoint /api/compras).
--   4) Backfill conservador de `usuarios.sucursal_id`:
--        - Solo para usuarios NO administradores.
--        - Solo si `sucursal_id` es NULL.
--        - Solo si la empresa tiene EXACTAMENTE UNA sucursal activa.
--      Si la empresa tiene varias sucursales, se deja en NULL para
--      asignación manual desde el módulo Usuarios.
--
-- Nada se borra ni se renombra. Idempotente: correr N veces produce el
-- mismo estado que correr 1 vez.
-- =====================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- 0) Sanity check: schema y tablas requeridas deben existir con la
--    estructura real. Fallar con mensaje claro si falta algo esencial,
--    en vez de crear una versión parcial que rompa el ERP silenciosamente.
-- ═════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pronimerp') THEN
    RAISE EXCEPTION
      'Schema pronimerp no existe. Corré primero CLONE_SCHEMA_PRONIMERP.sql o las migraciones base.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'empresas'
  ) THEN
    RAISE EXCEPTION
      'pronimerp.empresas no existe. Estructura base incompleta; abortando para no crear datos huérfanos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'usuarios'
  ) THEN
    RAISE EXCEPTION
      'pronimerp.usuarios no existe. Estructura base incompleta; abortando.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'sucursales'
  ) THEN
    -- Existe: validar columnas mínimas exactas antes de operar.
    PERFORM 1;
    IF NOT (
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='id')
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='empresa_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='nombre')
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='slug')
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='es_principal')
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='sucursales' AND column_name='activo')
    ) THEN
      RAISE EXCEPTION
        'pronimerp.sucursales existe pero le faltan columnas requeridas (id, empresa_id, nombre, slug, es_principal, activo). Reparar manualmente antes de continuar.';
    END IF;
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 1) Sucursales: crear con estructura COMPLETA sólo si no existe.
--    Si ya existe (caso real: viene del clone), no se toca.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pronimerp.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  slug text NOT NULL,
  es_principal boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS sucursales_una_principal_por_empresa
  ON pronimerp.sucursales (empresa_id)
  WHERE es_principal;

-- Seed defensivo: garantizar UNA sucursal Principal por empresa que aún
-- no tenga ninguna. No pisa nada existente.
INSERT INTO pronimerp.sucursales (empresa_id, nombre, slug, es_principal, activo)
SELECT e.id, 'Principal', 'principal', true, true
FROM pronimerp.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM pronimerp.sucursales s
  WHERE s.empresa_id = e.id
);

-- ═════════════════════════════════════════════════════════════════════
-- 2) usuarios.sucursal_id: asegurar columna + FK.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE pronimerp.usuarios
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='usuarios_sucursal_id_fkey'
      AND conrelid='pronimerp.usuarios'::regclass
  ) THEN
    ALTER TABLE pronimerp.usuarios
      ADD CONSTRAINT usuarios_sucursal_id_fkey
      FOREIGN KEY (sucursal_id) REFERENCES pronimerp.sucursales(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS usuarios_sucursal_id_idx
  ON pronimerp.usuarios (sucursal_id);

-- ═════════════════════════════════════════════════════════════════════
-- 3) compras.sucursal_id: asegurar columna + FK (opcional según hubo o no
--    clone previo). Nullable: compras históricas quedan sin sucursal
--    asignada; se puede completar manualmente. El endpoint ya persiste
--    la sucursal para las nuevas.
-- ═════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='pronimerp' AND table_name='compras'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='pronimerp' AND table_name='compras' AND column_name='sucursal_id'
    ) THEN
      ALTER TABLE pronimerp.compras ADD COLUMN sucursal_id uuid;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='compras_sucursal_id_fkey'
        AND conrelid='pronimerp.compras'::regclass
    ) THEN
      ALTER TABLE pronimerp.compras
        ADD CONSTRAINT compras_sucursal_id_fkey
        FOREIGN KEY (sucursal_id) REFERENCES pronimerp.sucursales(id) ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS compras_sucursal_id_idx
      ON pronimerp.compras (sucursal_id);
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 4) Backfill conservador: solo asignar sucursal cuando la empresa tiene
--    exactamente UNA sucursal activa; y solo a usuarios NO admin cuya
--    sucursal_id sea NULL. Los admin siguen como estaban (NULL = ve todas).
--    Empresas con varias sucursales quedan pendientes de asignación manual.
-- ═════════════════════════════════════════════════════════════════════

WITH empresas_una_suc AS (
  -- Postgres no tiene MIN(uuid); usamos array_agg y tomamos el único elemento
  -- (el HAVING COUNT(*) = 1 garantiza cardinalidad 1 por empresa).
  SELECT s.empresa_id, (array_agg(s.id))[1] AS sucursal_id
  FROM pronimerp.sucursales s
  WHERE s.activo = true
  GROUP BY s.empresa_id
  HAVING COUNT(*) = 1
)
UPDATE pronimerp.usuarios u
   SET sucursal_id = e.sucursal_id
  FROM empresas_una_suc e
 WHERE u.empresa_id = e.empresa_id
   AND u.sucursal_id IS NULL
   AND LOWER(COALESCE(TRIM(u.rol), '')) NOT IN
       ('administrador','admin','super_admin','super admin','superadmin');

COMMIT;
