-- =====================================================================
-- Pronim ERP — Puntos de caja (Caja 1, Caja 2 …) por sucursal
-- ---------------------------------------------------------------------
-- Aplica SOLO al schema `pronimerp`. Append-only e idempotente.
--
-- Reemplaza la restricción "una caja abierta por sucursal" por
-- "una caja abierta por punto de caja". Cada sucursal puede tener
-- múltiples puntos (Caja 1, Caja 2 …) y cada punto abre/cierra su
-- propio turno de forma independiente.
--
-- Preservación de datos históricos:
--   - Se crea un punto de caja predeterminado ("Caja 1") por sucursal.
--   - Las cajas existentes se re-asignan a ese punto predeterminado.
--   - El índice único anterior se dropea sólo si existe, para poder
--     insertar nuevas cajas paralelas.
-- =====================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- 1) Tabla puntos_caja
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pronimerp.puntos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sucursal_id, nombre)
);

CREATE INDEX IF NOT EXISTS puntos_caja_empresa_idx
  ON pronimerp.puntos_caja (empresa_id);
CREATE INDEX IF NOT EXISTS puntos_caja_sucursal_idx
  ON pronimerp.puntos_caja (sucursal_id);

-- Seed defensivo: al menos un "Caja 1" por sucursal que aún no tenga puntos.
INSERT INTO pronimerp.puntos_caja (empresa_id, sucursal_id, nombre, orden, activo)
SELECT s.empresa_id, s.id, 'Caja 1', 1, true
FROM pronimerp.sucursales s
WHERE NOT EXISTS (
  SELECT 1 FROM pronimerp.puntos_caja p WHERE p.sucursal_id = s.id
);

-- ═════════════════════════════════════════════════════════════════════
-- 2) cajas.punto_caja_id + FK
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE pronimerp.cajas
  ADD COLUMN IF NOT EXISTS punto_caja_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cajas_punto_caja_id_fkey'
      AND conrelid = 'pronimerp.cajas'::regclass
  ) THEN
    ALTER TABLE pronimerp.cajas
      ADD CONSTRAINT cajas_punto_caja_id_fkey
      FOREIGN KEY (punto_caja_id) REFERENCES pronimerp.puntos_caja(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cajas_punto_caja_id_idx
  ON pronimerp.cajas (punto_caja_id);

-- ═════════════════════════════════════════════════════════════════════
-- 3) Backfill: toda caja histórica queda apuntando al primer punto de
--    su sucursal (idempotente — sólo pisa nulos).
-- ═════════════════════════════════════════════════════════════════════

UPDATE pronimerp.cajas c
   SET punto_caja_id = p.id
  FROM (
    SELECT DISTINCT ON (sucursal_id) id, sucursal_id
      FROM pronimerp.puntos_caja
      WHERE activo = true
     ORDER BY sucursal_id, orden, created_at
  ) p
 WHERE c.punto_caja_id IS NULL
   AND c.sucursal_id = p.sucursal_id;

-- ═════════════════════════════════════════════════════════════════════
-- 4) Constraint de "una caja abierta por punto"
--    Dropear la restricción por sucursal (si existe) y crear una por
--    punto_caja_id. Sólo aplica cuando punto_caja_id no es null.
-- ═════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS pronimerp.uq_cajas_una_abierta_por_sucursal;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_una_abierta_por_punto
  ON pronimerp.cajas (punto_caja_id)
  WHERE estado = 'abierta' AND punto_caja_id IS NOT NULL;

COMMIT;
