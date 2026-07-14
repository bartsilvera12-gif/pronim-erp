-- =====================================================================
-- Akakua'a / Pronim — PREREQUISITO para 20260810/20260811
-- ---------------------------------------------------------------------
-- Crea cliente_recepciones_pagos y cambios ANTES de la migración
-- 20260810_pronimerp_nucleo_financiero, que hace ALTER TABLE sobre ellas.
--
-- Este archivo se agrega DESPUÉS de que 20260810/11 ya se aplicaron en
-- producción. En una base fresca (reconstrucción), corre primero por
-- orden de timestamp (20260809500000 < 20260810000000) y las tablas
-- existen cuando las migraciones siguientes intentan alterarlas.
--
-- Completamente idempotente: si las tablas ya existen (caso producción),
-- CREATE IF NOT EXISTS es no-op.
--
-- Aplica SOLO al schema `pronimerp`.
-- =====================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- cliente_recepciones_pagos (una fila por método de pago de recepción)
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pronimerp.cliente_recepciones_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  recepcion_id uuid NOT NULL REFERENCES pronimerp.cliente_recepciones(id) ON DELETE CASCADE,
  metodo text NOT NULL CHECK (metodo IN ('credito','efectivo','transferencia')),
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  entidad_bancaria_id uuid,
  entidad_nombre_snapshot text,
  referencia text,
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═════════════════════════════════════════════════════════════════════
-- cambios (operación unificada recepción + venta)
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pronimerp.cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id),
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id),
  numero_control text NOT NULL,
  recepcion_id uuid REFERENCES pronimerp.cliente_recepciones(id),
  venta_id uuid REFERENCES pronimerp.ventas(id),
  credito_generado numeric(14,2) NOT NULL DEFAULT 0,
  credito_previo_usado numeric(14,2) NOT NULL DEFAULT 0,
  diferencia_pagada numeric(14,2) NOT NULL DEFAULT 0,
  credito_restante numeric(14,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','confirmado','anulado')),
  created_by uuid,
  created_by_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero_control)
);

COMMIT;

-- ---------------------------------------------------------------------
-- Aplicación en producción:
--
-- Este archivo tiene timestamp anterior a migraciones YA aplicadas
-- (20260810, 20260811). Supabase CLI lo detecta como "no aplicada".
--
-- Comando para aplicar solo esta migración en la base actual:
--   supabase db push --include-all
--
-- El flag --include-all fuerza la inclusión de migraciones con timestamp
-- anterior al último aplicado. Es idempotente: CREATE IF NOT EXISTS
-- no hace nada si la tabla ya existe.
--
-- Verificación:
--   supabase db diff --schema pronimerp
-- No debería reportar diferencias.
-- ---------------------------------------------------------------------
