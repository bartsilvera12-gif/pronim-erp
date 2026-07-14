-- =====================================================================
-- Akakua'a / Pronim — Correcciones al núcleo financiero (append-only)
-- ---------------------------------------------------------------------
-- Aplica SOLO al schema `pronimerp`. No modifica otros schemas.
--
-- Fully idempotent (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP INDEX IF EXISTS + CREATE INDEX IF NOT EXISTS). NO edita ni borra
-- migraciones previas. Todo aditivo.
--
-- Contenido:
--   1) Reproducibilidad: CREATE TABLE cliente_recepciones_pagos + cambios
--      con el DDL canónico (para que un reset del schema desde cero funcione).
--   2) Columnas nuevas de atribución en cliente_recepciones_pagos
--      (caja_id, sucursal_id, venta_ref) para poder cerrar caja correctamente.
--   3) cliente_recepciones.total_compra (separado de total_credito).
--   4) uq_cajas_una_abierta: DROP + recrear con (empresa_id, sucursal_id).
--   5) contadores_correlativos: tabla + seed idempotente desde MAX() actual.
--   6) UNIQUE (empresa_id, numero_control) en ventas.
-- =====================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- 1) Reproducibilidad — CREATE TABLE de tablas que estaban "manuales"
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

-- ═════════════════════════════════════════════════════════════════════
-- 2) Atribución de pagos de recepción a caja/sucursal
-- ═════════════════════════════════════════════════════════════════════
-- Necesario para que el arqueo de la caja pueda contar egresos por
-- efectivo de recepciones sin duplicar contra caja_movimientos.

ALTER TABLE pronimerp.cliente_recepciones_pagos
  ADD COLUMN IF NOT EXISTS caja_id uuid,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='cliente_recepciones_pagos_caja_id_fkey'
      AND conrelid='pronimerp.cliente_recepciones_pagos'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones_pagos
      ADD CONSTRAINT cliente_recepciones_pagos_caja_id_fkey
      FOREIGN KEY (caja_id) REFERENCES pronimerp.cajas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='cliente_recepciones_pagos_sucursal_id_fkey'
      AND conrelid='pronimerp.cliente_recepciones_pagos'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones_pagos
      ADD CONSTRAINT cliente_recepciones_pagos_sucursal_id_fkey
      FOREIGN KEY (sucursal_id) REFERENCES pronimerp.sucursales(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Regla: si metodo='efectivo', DEBE tener caja_id (para que el arqueo lo
-- pueda contar). Se aplica solo a filas nuevas — filas existentes pueden
-- tener caja_id NULL sin bloquear la migración.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='cliente_recepciones_pagos_caja_si_efectivo'
      AND conrelid='pronimerp.cliente_recepciones_pagos'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones_pagos
      ADD CONSTRAINT cliente_recepciones_pagos_caja_si_efectivo
      CHECK (metodo <> 'efectivo' OR caja_id IS NOT NULL)
      NOT VALID;  -- NOT VALID: no valida filas viejas, sí filas nuevas
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_cliente_recepciones_pagos_caja
  ON pronimerp.cliente_recepciones_pagos (caja_id)
  WHERE metodo = 'efectivo';
CREATE INDEX IF NOT EXISTS ix_cliente_recepciones_pagos_sucursal
  ON pronimerp.cliente_recepciones_pagos (sucursal_id);

-- Idem: agregar caja_id/sucursal_id a ventas_pagos_detalle si no tienen.
-- (ventas_pagos_detalle se creó en la migración anterior con sucursal_id NOT NULL.)
ALTER TABLE pronimerp.ventas_pagos_detalle
  ADD COLUMN IF NOT EXISTS caja_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ventas_pagos_detalle_caja_id_fkey'
      AND conrelid='pronimerp.ventas_pagos_detalle'::regclass
  ) THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD CONSTRAINT ventas_pagos_detalle_caja_id_fkey
      FOREIGN KEY (caja_id) REFERENCES pronimerp.cajas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ventas_pagos_detalle_caja_si_efectivo'
      AND conrelid='pronimerp.ventas_pagos_detalle'::regclass
  ) THEN
    ALTER TABLE pronimerp.ventas_pagos_detalle
      ADD CONSTRAINT ventas_pagos_detalle_caja_si_efectivo
      CHECK (metodo_pago <> 'efectivo' OR caja_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_ventas_pagos_detalle_caja
  ON pronimerp.ventas_pagos_detalle (caja_id)
  WHERE metodo_pago = 'efectivo';

-- ═════════════════════════════════════════════════════════════════════
-- 3) Separar total_compra de total_credito en cliente_recepciones
-- ═════════════════════════════════════════════════════════════════════
-- total_compra = importe total de la recepción (SUM items.subtotal).
-- total_credito = solo la parte entregada como crédito al cliente.
-- Backfill: para las filas históricas (que solo pagaban crédito) usamos
-- total_credito como valor de total_compra.

ALTER TABLE pronimerp.cliente_recepciones
  ADD COLUMN IF NOT EXISTS total_compra numeric(14,2);

UPDATE pronimerp.cliente_recepciones
   SET total_compra = total_credito
 WHERE total_compra IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='cliente_recepciones_total_compra_check'
      AND conrelid='pronimerp.cliente_recepciones'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones
      ADD CONSTRAINT cliente_recepciones_total_compra_check
      CHECK (total_compra IS NULL OR total_compra >= 0);
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 4) UNIQUE una caja abierta POR SUCURSAL (no por empresa)
-- ═════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS pronimerp.uq_cajas_una_abierta;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_una_abierta_por_sucursal
  ON pronimerp.cajas (empresa_id, sucursal_id)
  WHERE estado = 'abierta';

-- ═════════════════════════════════════════════════════════════════════
-- 5) Contadores atómicos (reemplazan MAX(numero)+1)
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pronimerp.contadores_correlativos (
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  entidad text NOT NULL CHECK (entidad IN ('venta','recepcion','cambio')),
  prefijo text NOT NULL,
  ultimo bigint NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, entidad)
);

GRANT SELECT, INSERT, UPDATE ON pronimerp.contadores_correlativos TO service_role;

-- RPC atómica: incrementa y devuelve el próximo numero_control.
-- Uso: SELECT * FROM pronimerp.siguiente_numero_control($empresa, 'venta');
CREATE OR REPLACE FUNCTION pronimerp.siguiente_numero_control(
  p_empresa_id uuid,
  p_entidad text
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_prefijo text;
  v_siguiente bigint;
BEGIN
  IF p_entidad NOT IN ('venta','recepcion','cambio') THEN
    RAISE EXCEPTION 'entidad inválida: %', p_entidad;
  END IF;
  v_prefijo := CASE p_entidad
                 WHEN 'venta' THEN 'V-'
                 WHEN 'recepcion' THEN 'REC-'
                 WHEN 'cambio' THEN 'CMB-'
               END;
  -- Insertar si no existe (idempotente); luego UPDATE...RETURNING atómico
  INSERT INTO pronimerp.contadores_correlativos (empresa_id, entidad, prefijo)
  VALUES (p_empresa_id, p_entidad, v_prefijo)
  ON CONFLICT (empresa_id, entidad) DO NOTHING;

  UPDATE pronimerp.contadores_correlativos
     SET ultimo = ultimo + 1, updated_at = now()
   WHERE empresa_id = p_empresa_id AND entidad = p_entidad
   RETURNING ultimo INTO v_siguiente;

  RETURN v_prefijo || lpad(v_siguiente::text, 6, '0');
END $$;

-- Seed inicial desde MAX() existente para cada empresa. Idempotente: si
-- ya existe una fila en contadores_correlativos, no la sobrescribe.
INSERT INTO pronimerp.contadores_correlativos (empresa_id, entidad, prefijo, ultimo)
SELECT e.id, 'venta', 'V-',
       COALESCE(MAX(CASE WHEN v.numero_control ~ '^V-[0-9]+$'
                         THEN substring(v.numero_control from 3)::bigint
                         ELSE 0 END), 0)
FROM pronimerp.empresas e
LEFT JOIN pronimerp.ventas v ON v.empresa_id = e.id
GROUP BY e.id
ON CONFLICT (empresa_id, entidad) DO NOTHING;

INSERT INTO pronimerp.contadores_correlativos (empresa_id, entidad, prefijo, ultimo)
SELECT e.id, 'recepcion', 'REC-',
       COALESCE(MAX(CASE WHEN r.numero_control ~ '^REC-[0-9]+$'
                         THEN substring(r.numero_control from 5)::bigint
                         ELSE 0 END), 0)
FROM pronimerp.empresas e
LEFT JOIN pronimerp.cliente_recepciones r ON r.empresa_id = e.id
GROUP BY e.id
ON CONFLICT (empresa_id, entidad) DO NOTHING;

INSERT INTO pronimerp.contadores_correlativos (empresa_id, entidad, prefijo, ultimo)
SELECT e.id, 'cambio', 'CMB-',
       COALESCE(MAX(CASE WHEN c.numero_control ~ '^CMB-[0-9]+$'
                         THEN substring(c.numero_control from 5)::bigint
                         ELSE 0 END), 0)
FROM pronimerp.empresas e
LEFT JOIN pronimerp.cambios c ON c.empresa_id = e.id
GROUP BY e.id
ON CONFLICT (empresa_id, entidad) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- 6) UNIQUE (empresa_id, numero_control) en ventas
-- ═════════════════════════════════════════════════════════════════════
-- cliente_recepciones y cambios ya tienen UNIQUE. Solo falta ventas.

CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_empresa_numero_control
  ON pronimerp.ventas (empresa_id, numero_control);

-- ═════════════════════════════════════════════════════════════════════
-- 7) RLS + grants para tablas nuevas de esta fase
-- ═════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='pronimerp' AND p.proname='puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.contadores_correlativos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_contadores_all ON pronimerp.contadores_correlativos';
    EXECUTE 'CREATE POLICY p_contadores_all ON pronimerp.contadores_correlativos
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Verificación rápida (SELECT-only, correr después):
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--      WHERE table_schema='pronimerp' AND table_name='cliente_recepciones'
--      AND column_name='total_compra') AS total_compra_agregada,
--     (SELECT count(*) FROM information_schema.columns
--      WHERE table_schema='pronimerp' AND table_name='cliente_recepciones_pagos'
--      AND column_name='caja_id') AS caja_id_pagos,
--     (SELECT count(*) FROM information_schema.columns
--      WHERE table_schema='pronimerp' AND table_name='ventas_pagos_detalle'
--      AND column_name='caja_id') AS caja_id_ventas_pagos,
--     (SELECT count(*) FROM pg_indexes
--      WHERE schemaname='pronimerp' AND indexname='uq_cajas_una_abierta_por_sucursal') AS uq_caja_por_sucursal,
--     (SELECT count(*) FROM pg_indexes
--      WHERE schemaname='pronimerp' AND indexname='uq_ventas_empresa_numero_control') AS uq_venta_numero,
--     (SELECT count(*) FROM pronimerp.contadores_correlativos) AS contadores_seed,
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='pronimerp' AND proname='siguiente_numero_control') AS rpc_contador;
-- =====================================================================
