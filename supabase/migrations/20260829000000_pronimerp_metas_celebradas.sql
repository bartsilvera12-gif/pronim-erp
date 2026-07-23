-- Persistencia server-side de las celebraciones de meta.
--
-- Motivación: hasta ahora la celebración usaba localStorage/sessionStorage
-- para no repetirse. Eso rompe: (a) si el usuario cambia de dispositivo,
-- (b) si dos usuarios de la misma sucursal disparan la meta a la vez,
-- (c) si borra el storage.
--
-- Solución: una tabla que registra qué (empresa, sucursal, fecha_meta)
-- ya se celebró. UNIQUE constraint impide duplicados aunque dos requests
-- concurrentes intenten insertar al mismo tiempo (uno gana con ON CONFLICT).
--
-- fecha_meta es DATE (día en que se alcanzó la meta diaria). Si mañana
-- vuelve a alcanzar meta, es una fila nueva.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS pronimerp.metas_celebradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id) ON DELETE CASCADE,
  fecha_meta date NOT NULL,
  pct_meta integer NOT NULL,
  vendido numeric(14,2) NOT NULL,
  meta_diaria numeric(14,2) NOT NULL,
  usuario_id uuid,
  usuario_nombre text,
  cerrado_por_usuario boolean NOT NULL DEFAULT false,
  celebrada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_celebradas_unicidad UNIQUE (empresa_id, sucursal_id, fecha_meta)
);

CREATE INDEX IF NOT EXISTS metas_celebradas_empresa_fecha_idx
  ON pronimerp.metas_celebradas (empresa_id, fecha_meta DESC);
CREATE INDEX IF NOT EXISTS metas_celebradas_sucursal_fecha_idx
  ON pronimerp.metas_celebradas (sucursal_id, fecha_meta DESC);
