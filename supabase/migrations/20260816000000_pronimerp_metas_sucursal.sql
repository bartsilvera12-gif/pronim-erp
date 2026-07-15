-- =====================================================================
-- Pronim ERP — Metas de venta por sucursal
-- ---------------------------------------------------------------------
-- Aplica SOLO al schema `pronimerp`. Append-only e idempotente.
--
-- Cada sucursal tiene una meta DIARIA de venta (Gs.) configurable. La
-- meta semanal se calcula como suma de las metas diarias de los días
-- trabajados. La comisión se paga al final de la semana como % del
-- total vendido:
--   * `comision_alcanza_pct`  si el total semanal >= meta semanal.
--   * `comision_no_alcanza_pct` en caso contrario.
-- (Defaults del spec: 1% y 0.5%).
--
-- Modelo simple: 1 fila activa por sucursal (histórico se guarda vía
-- vigente_desde/vigente_hasta pero por ahora se sobreescribe con PATCH
-- para mantener la UX simple).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pronimerp.metas_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id) ON DELETE CASCADE,
  monto_meta_diaria numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_meta_diaria >= 0),
  comision_alcanza_pct numeric(5,2) NOT NULL DEFAULT 1 CHECK (comision_alcanza_pct >= 0 AND comision_alcanza_pct <= 100),
  comision_no_alcanza_pct numeric(5,2) NOT NULL DEFAULT 0.5 CHECK (comision_no_alcanza_pct >= 0 AND comision_no_alcanza_pct <= 100),
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_nombre text,
  UNIQUE (sucursal_id, activo) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS metas_sucursal_empresa_idx
  ON pronimerp.metas_sucursal (empresa_id);
CREATE INDEX IF NOT EXISTS metas_sucursal_sucursal_activo_idx
  ON pronimerp.metas_sucursal (sucursal_id) WHERE activo = true;

-- Seed: crear meta 0 para cada sucursal existente que aún no tenga.
INSERT INTO pronimerp.metas_sucursal (empresa_id, sucursal_id, monto_meta_diaria, activo)
SELECT s.empresa_id, s.id, 0, true
FROM pronimerp.sucursales s
WHERE s.activo = true
  AND NOT EXISTS (
    SELECT 1 FROM pronimerp.metas_sucursal m
    WHERE m.sucursal_id = s.id AND m.activo = true
  );

COMMIT;
