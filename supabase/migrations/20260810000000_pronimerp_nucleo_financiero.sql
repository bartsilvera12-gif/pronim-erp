-- =====================================================================
-- Akakua'a / Pronim Consultoría — Núcleo financiero
-- ---------------------------------------------------------------------
-- Aplica SOLO al schema `pronimerp`. No modifica otros schemas.
--
-- Fully idempotent: usa CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS, DROP CONSTRAINT IF EXISTS
-- + ADD CONSTRAINT, DROP POLICY IF EXISTS + CREATE POLICY, DO blocks
-- para renames y para columnas con checks/refs condicionales. Puede
-- correrse múltiples veces sin romper el estado.
--
-- Contenido:
--   1) Nuevas tablas (crea si faltan; NO modifica columnas existentes).
--   2) Completar columnas faltantes en tablas parcialmente creadas
--      (cliente_recepciones_pagos, cambios).
--   3) Alteraciones a tablas existentes (empresas, cliente_recepciones,
--      cliente_recepciones_items, cajas, ventas, productos).
--   4) Función advisory lock por (empresa_id, cliente_id).
--   5) Append-only: REVOKE UPDATE/DELETE en tablas críticas.
--   6) RLS + policies alineadas con puede_acceder_empresa.
--
-- Precondiciones verificadas antes de escribir:
--   - 0 filas en cliente_recepciones (bloque 9 diagnóstico).
--   - 0 duplicados de franjas por (empresa_id, precio_venta) activas.
--   - cajas ya tiene sucursal_id (bloque 6).
--   - Falta uq_cajas_una_abierta (bloque 7).
--   - No hay policies RLS en las tablas del núcleo (bloque 8).
--   - Tablas huérfanas cuentas_por_cobrar / cobros_clientes /
--     ventas_pagos_detalle / entidades_bancarias no existen (bloque 1).
-- =====================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- 1) NUEVAS TABLAS
-- ═════════════════════════════════════════════════════════════════════

-- 1.1 entidades_bancarias --------------------------------------------
CREATE TABLE IF NOT EXISTS pronimerp.entidades_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  codigo text,
  nombre text NOT NULL CHECK (length(trim(nombre)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('caja','banco','tarjeta','billetera','otro')),
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entidades_bancarias_empresa_codigo
  ON pronimerp.entidades_bancarias (empresa_id, codigo)
  WHERE codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_entidades_bancarias_empresa_activo
  ON pronimerp.entidades_bancarias (empresa_id, activo, orden);

-- 1.2 ventas_pagos_detalle -------------------------------------------
CREATE TABLE IF NOT EXISTS pronimerp.ventas_pagos_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  venta_id uuid NOT NULL REFERENCES pronimerp.ventas(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id),
  metodo_pago text NOT NULL CHECK (metodo_pago IN
    ('efectivo','transferencia','tarjeta','qr','billetera','credito_cliente','otro')),
  entidad_bancaria_id uuid REFERENCES pronimerp.entidades_bancarias(id),
  entidad_nombre_snapshot text,
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  referencia text,
  titular text,
  fecha_acreditacion date,
  observacion text,
  conciliacion_estado text NOT NULL DEFAULT 'pendiente'
    CHECK (conciliacion_estado IN ('pendiente','conciliado','descartado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ventas_pagos_detalle_venta
  ON pronimerp.ventas_pagos_detalle (venta_id);
CREATE INDEX IF NOT EXISTS ix_ventas_pagos_detalle_empresa_fecha
  ON pronimerp.ventas_pagos_detalle (empresa_id, created_at DESC);

-- 1.3 cuentas_por_cobrar (una fila por venta a crédito) --------------
CREATE TABLE IF NOT EXISTS pronimerp.cuentas_por_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id),
  venta_id uuid NOT NULL REFERENCES pronimerp.ventas(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id),
  numero_venta text NOT NULL,
  moneda text NOT NULL DEFAULT 'GS' CHECK (moneda IN ('GS','USD')),
  total numeric(14,2) NOT NULL CHECK (total > 0),
  saldo numeric(14,2) NOT NULL CHECK (saldo >= 0),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','parcial','pagado','anulado')),
  fecha_emision timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cuentas_por_cobrar_empresa_venta
  ON pronimerp.cuentas_por_cobrar (empresa_id, venta_id);
CREATE INDEX IF NOT EXISTS ix_cuentas_por_cobrar_cliente_estado
  ON pronimerp.cuentas_por_cobrar (cliente_id, estado);

-- 1.4 cobros_clientes (aplicaciones de pago a CxC) --------------------
CREATE TABLE IF NOT EXISTS pronimerp.cobros_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES pronimerp.clientes(id),
  cuenta_por_cobrar_id uuid NOT NULL REFERENCES pronimerp.cuentas_por_cobrar(id),
  venta_id uuid NOT NULL REFERENCES pronimerp.ventas(id),
  sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id),
  fecha_pago timestamptz NOT NULL DEFAULT now(),
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  metodo_pago text NOT NULL CHECK (metodo_pago IN
    ('efectivo','transferencia','tarjeta','qr','billetera','credito_cliente','otro')),
  entidad_bancaria_id uuid REFERENCES pronimerp.entidades_bancarias(id),
  entidad_nombre_snapshot text,
  referencia text,
  titular text,
  observaciones text,
  usuario_id uuid,
  usuario_nombre text,
  conciliacion_estado text NOT NULL DEFAULT 'pendiente'
    CHECK (conciliacion_estado IN ('pendiente','conciliado','descartado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cobros_clientes_cxc
  ON pronimerp.cobros_clientes (cuenta_por_cobrar_id);
CREATE INDEX IF NOT EXISTS ix_cobros_clientes_empresa_fecha
  ON pronimerp.cobros_clientes (empresa_id, fecha_pago DESC);

-- ═════════════════════════════════════════════════════════════════════
-- 2) COMPLETAR TABLAS PARCIALMENTE CREADAS
-- ═════════════════════════════════════════════════════════════════════

-- cliente_recepciones_pagos: falta entidad_nombre_snapshot
ALTER TABLE pronimerp.cliente_recepciones_pagos
  ADD COLUMN IF NOT EXISTS entidad_nombre_snapshot text;

CREATE INDEX IF NOT EXISTS ix_cliente_recepciones_pagos_recepcion
  ON pronimerp.cliente_recepciones_pagos (recepcion_id);

-- cambios: falta created_by_nombre; asegurar defaults y NOT NULL en estado
ALTER TABLE pronimerp.cambios
  ADD COLUMN IF NOT EXISTS created_by_nombre text;

DO $$
BEGIN
  -- Asegurar NOT NULL + default 'borrador' en estado (por si vino sin NOT NULL)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='pronimerp' AND table_name='cambios'
             AND column_name='estado' AND is_nullable='YES') THEN
    UPDATE pronimerp.cambios SET estado = 'borrador' WHERE estado IS NULL;
    ALTER TABLE pronimerp.cambios ALTER COLUMN estado SET NOT NULL;
    ALTER TABLE pronimerp.cambios ALTER COLUMN estado SET DEFAULT 'borrador';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_cambios_cliente
  ON pronimerp.cambios (cliente_id, created_at DESC);

-- ═════════════════════════════════════════════════════════════════════
-- 3) ALTERACIONES A TABLAS EXISTENTES
-- ═════════════════════════════════════════════════════════════════════

-- 3.1 empresas: margen mínimo esperado (config por empresa) ----------
ALTER TABLE pronimerp.empresas
  ADD COLUMN IF NOT EXISTS margen_minimo_esperado_pct numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empresas_margen_minimo_check'
      AND conrelid = 'pronimerp.empresas'::regclass
  ) THEN
    ALTER TABLE pronimerp.empresas
      ADD CONSTRAINT empresas_margen_minimo_check
      CHECK (margen_minimo_esperado_pct IS NULL
             OR (margen_minimo_esperado_pct >= 0
                 AND margen_minimo_esperado_pct <= 100));
  END IF;
END $$;

-- 3.2 cliente_recepciones: estados nuevos + campos de flujo ----------
DO $$
BEGIN
  -- Reemplazar CHECK de estado
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname='cliente_recepciones_estado_check'
             AND conrelid='pronimerp.cliente_recepciones'::regclass) THEN
    ALTER TABLE pronimerp.cliente_recepciones
      DROP CONSTRAINT cliente_recepciones_estado_check;
  END IF;
  ALTER TABLE pronimerp.cliente_recepciones
    ADD CONSTRAINT cliente_recepciones_estado_check
    CHECK (estado IN ('pendiente_ingreso','ingresada','anulada'));
END $$;

ALTER TABLE pronimerp.cliente_recepciones
  ALTER COLUMN estado SET DEFAULT 'pendiente_ingreso';

-- sucursal_id NOT NULL: seguro porque diagnóstico dio 0 filas históricas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='pronimerp' AND table_name='cliente_recepciones'
             AND column_name='sucursal_id' AND is_nullable='YES') THEN
    -- Sanity check: si aparecen filas con NULL en el futuro, NO fuerza
    IF NOT EXISTS (SELECT 1 FROM pronimerp.cliente_recepciones WHERE sucursal_id IS NULL) THEN
      ALTER TABLE pronimerp.cliente_recepciones
        ALTER COLUMN sucursal_id SET NOT NULL;
    ELSE
      RAISE NOTICE 'cliente_recepciones tiene filas con sucursal_id NULL; SET NOT NULL omitido';
    END IF;
  END IF;
END $$;

ALTER TABLE pronimerp.cliente_recepciones
  ADD COLUMN IF NOT EXISTS ingresada_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingresada_by uuid,
  ADD COLUMN IF NOT EXISTS ingresada_by_nombre text,
  ADD COLUMN IF NOT EXISTS anulada_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_by uuid,
  ADD COLUMN IF NOT EXISTS anulada_by_nombre text,
  ADD COLUMN IF NOT EXISTS anulacion_motivo text,
  ADD COLUMN IF NOT EXISTS cambio_id uuid,
  ADD COLUMN IF NOT EXISTS origen_datos text NOT NULL DEFAULT 'nuevo_modelo';

-- FK a cambios (agregar solo si no está)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cliente_recepciones_cambio_id_fkey'
      AND conrelid = 'pronimerp.cliente_recepciones'::regclass
  ) THEN
    ALTER TABLE pronimerp.cliente_recepciones
      ADD CONSTRAINT cliente_recepciones_cambio_id_fkey
      FOREIGN KEY (cambio_id) REFERENCES pronimerp.cambios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.3 cliente_recepciones_items: precio_compra distinto de precio_venta
-- Rename idempotente
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='pronimerp' AND table_name='cliente_recepciones_items'
             AND column_name='precio_unitario')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='pronimerp' AND table_name='cliente_recepciones_items'
             AND column_name='precio_venta_snapshot') THEN
    ALTER TABLE pronimerp.cliente_recepciones_items
      RENAME COLUMN precio_unitario TO precio_venta_snapshot;
  END IF;
END $$;

ALTER TABLE pronimerp.cliente_recepciones_items
  ADD COLUMN IF NOT EXISTS precio_venta_snapshot numeric(14,2),
  ADD COLUMN IF NOT EXISTS precio_compra_unitario numeric(14,2),
  ADD COLUMN IF NOT EXISTS margen_bruto_pct numeric,
  ADD COLUMN IF NOT EXISTS costo_historico_incompleto boolean NOT NULL DEFAULT false;

-- 3.4 cajas: UNIQUE PARTIAL para "una caja abierta por empresa"
-- (Omitido por CLONE_SCHEMA en pronimerp; se recrea acá.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_una_abierta
  ON pronimerp.cajas (empresa_id)
  WHERE estado = 'abierta';

-- 3.5 ventas: cambio_id opcional --------------------------------------
ALTER TABLE pronimerp.ventas
  ADD COLUMN IF NOT EXISTS cambio_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_cambio_id_fkey'
      AND conrelid = 'pronimerp.ventas'::regclass
  ) THEN
    ALTER TABLE pronimerp.ventas
      ADD CONSTRAINT ventas_cambio_id_fkey
      FOREIGN KEY (cambio_id) REFERENCES pronimerp.cambios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.6 productos: revertir "nombre libre" — UNA franja activa por precio
-- (Bloque 10 diagnóstico confirmó 0 duplicados hoy.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_franjas_activas_precio
  ON pronimerp.productos (empresa_id, precio_venta)
  WHERE es_franja_precio = true AND activo = true;

-- ═════════════════════════════════════════════════════════════════════
-- 4) FUNCIÓN advisory lock por (empresa_id, cliente_id)
-- ═════════════════════════════════════════════════════════════════════
--
-- Uso: llamar DENTRO de una transacción antes de leer/mutar el saldo
-- de crédito del cliente. Serializa operaciones concurrentes sobre el
-- MISMO cliente en la MISMA empresa; no bloquea entre empresas ni
-- entre clientes distintos.
--
-- Clave: hashtextextended('cred:' || empresa_id || ':' || cliente_id, 42)
--        → int8 estable, no colisiona con locks de otros dominios.

CREATE OR REPLACE FUNCTION pronimerp.lock_cliente_credito(
  p_empresa_id uuid,
  p_cliente_id uuid
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_empresa_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'lock_cliente_credito requiere empresa_id y cliente_id no nulos';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'pronimerp:cred:' || p_empresa_id::text || ':' || p_cliente_id::text,
      42
    )
  );
END;
$$;

-- ═════════════════════════════════════════════════════════════════════
-- 5) APPEND-ONLY: revocar UPDATE/DELETE en tablas críticas
-- ═════════════════════════════════════════════════════════════════════
--
-- service_role mantiene todos los permisos (necesarios para reversiones
-- vía asientos, backfills controlados, etc.).
-- authenticated solo puede INSERTAR (append) y SELECT (leer).

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN VALUES
    ('cliente_creditos_movimientos'),
    ('cliente_creditos_consumos'),
    ('movimientos_inventario'),
    ('cobros_clientes'),
    ('ventas_pagos_detalle'),
    ('caja_movimientos')
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='pronimerp' AND table_name=t) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON pronimerp.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 6) RLS + POLICIES
-- ═════════════════════════════════════════════════════════════════════
--
-- Solo si la función puede_acceder_empresa existe en pronimerp (el
-- clone debería haberla copiado). Si no existe, se omite este bloque
-- sin fallar; el acceso queda limitado a service_role.

DO $$
DECLARE
  t text;
  policy_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='pronimerp' AND p.proname='puede_acceder_empresa'
  ) THEN
    RAISE NOTICE 'pronimerp.puede_acceder_empresa no existe; RLS omitida';
    RETURN;
  END IF;

  FOR t IN VALUES
    ('entidades_bancarias'),
    ('ventas_pagos_detalle'),
    ('cuentas_por_cobrar'),
    ('cobros_clientes'),
    ('cliente_recepciones_pagos'),
    ('cambios'),
    ('cajas'),
    ('caja_movimientos')
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='pronimerp' AND table_name=t) THEN
      policy_name := 'p_' || t || '_all';
      EXECUTE format('ALTER TABLE pronimerp.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON pronimerp.%I', policy_name, t);
      EXECUTE format(
        'CREATE POLICY %I ON pronimerp.%I
           FOR ALL
           USING (pronimerp.puede_acceder_empresa(empresa_id))
           WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))',
        policy_name, t
      );
    END IF;
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 7) GRANTS a authenticated y service_role
-- ═════════════════════════════════════════════════════════════════════
--
-- authenticated: SELECT + INSERT (append-only en las que corresponda;
-- UPDATE/DELETE ya revocados arriba en las críticas).
-- service_role: ALL.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN VALUES
    ('entidades_bancarias'),
    ('ventas_pagos_detalle'),
    ('cuentas_por_cobrar'),
    ('cobros_clientes'),
    ('cliente_recepciones_pagos'),
    ('cambios')
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='pronimerp' AND table_name=t) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON pronimerp.%I TO service_role', t);
      EXECUTE format('GRANT SELECT, INSERT ON pronimerp.%I TO authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Las tablas que revocan UPDATE/DELETE arriba mantienen INSERT+SELECT
-- para authenticated (append-only real).

COMMIT;

-- =====================================================================
-- FIN — Núcleo financiero pronimerp
--
-- Verificación rápida post-migración:
--
--   -- Tablas nuevas creadas
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='pronimerp' AND table_name IN (
--     'entidades_bancarias','ventas_pagos_detalle',
--     'cuentas_por_cobrar','cobros_clientes',
--     'cliente_recepciones_pagos','cambios');
--
--   -- Índices críticos
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='pronimerp' AND indexname IN (
--     'uq_cajas_una_abierta','uq_franjas_activas_precio');
--
--   -- Función advisory lock
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='pronimerp' AND proname='lock_cliente_credito';
--
--   -- RLS activo
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='pronimerp' AND tablename IN (
--     'entidades_bancarias','ventas_pagos_detalle','cuentas_por_cobrar',
--     'cobros_clientes','cliente_recepciones_pagos','cambios',
--     'cajas','caja_movimientos');
-- =====================================================================
