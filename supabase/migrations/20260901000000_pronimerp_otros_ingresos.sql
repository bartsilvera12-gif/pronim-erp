-- ============================================================================
-- Migración: modulo `otros_ingresos` en el schema pronimerp.
-- Fecha: 2026-09-01
-- Idempotente. No destructiva.
--
-- Otros ingresos son movimientos que suman a caja sin ser venta de producto:
-- alquileres, servicios, ajustes positivos, cartones, etc.
--
-- Aislado por empresa + sucursal. `anulado_at` permite anulacion soft
-- preservando auditoria (creador + timestamp + motivo).
-- ============================================================================

DO $do$
BEGIN
  -- Tabla base
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'otros_ingresos'
  ) THEN
    CREATE TABLE pronimerp.otros_ingresos (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id          uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      sucursal_id         uuid REFERENCES pronimerp.sucursales(id) ON DELETE SET NULL,
      caja_id             uuid REFERENCES pronimerp.cajas(id) ON DELETE SET NULL,
      fecha               date NOT NULL DEFAULT (now()::date),
      concepto            text NOT NULL,
      monto               numeric(14,2) NOT NULL CHECK (monto > 0),
      metodo_pago         text NOT NULL CHECK (metodo_pago IN
        ('efectivo','transferencia','tarjeta','qr','billetera','credito_cliente','otro')),
      entidad_bancaria_id uuid REFERENCES pronimerp.entidades_bancarias(id) ON DELETE SET NULL,
      referencia          text,
      observaciones       text,
      creado_por          uuid,
      creado_por_email    text,
      anulado_at          timestamptz,
      anulado_by          uuid,
      anulacion_motivo    text,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  -- Columnas de anulacion (por si la tabla ya existia sin ellas)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'otros_ingresos'
  ) THEN
    ALTER TABLE pronimerp.otros_ingresos
      ADD COLUMN IF NOT EXISTS sucursal_id      uuid,
      ADD COLUMN IF NOT EXISTS caja_id          uuid,
      ADD COLUMN IF NOT EXISTS referencia       text,
      ADD COLUMN IF NOT EXISTS observaciones    text,
      ADD COLUMN IF NOT EXISTS creado_por       uuid,
      ADD COLUMN IF NOT EXISTS creado_por_email text,
      ADD COLUMN IF NOT EXISTS anulado_at       timestamptz,
      ADD COLUMN IF NOT EXISTS anulado_by       uuid,
      ADD COLUMN IF NOT EXISTS anulacion_motivo text,
      ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();
  END IF;
END
$do$ LANGUAGE plpgsql;

-- Indices para listados filtrados
CREATE INDEX IF NOT EXISTS ix_otros_ingresos_empresa_fecha
  ON pronimerp.otros_ingresos (empresa_id, fecha DESC);

CREATE INDEX IF NOT EXISTS ix_otros_ingresos_empresa_sucursal_fecha
  ON pronimerp.otros_ingresos (empresa_id, sucursal_id, fecha DESC);

CREATE INDEX IF NOT EXISTS ix_otros_ingresos_activos
  ON pronimerp.otros_ingresos (empresa_id, sucursal_id, (anulado_at IS NULL), fecha DESC);

-- Grants (patron pronim)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA pronimerp TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON pronimerp.otros_ingresos TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON pronimerp.otros_ingresos TO service_role;
  END IF;
END
$do$ LANGUAGE plpgsql;

-- Verificacion
DO $do$
DECLARE
  n_cols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
  WHERE table_schema='pronimerp' AND table_name='otros_ingresos';
  RAISE NOTICE 'pronimerp.otros_ingresos -> % columnas', n_cols;
END
$do$ LANGUAGE plpgsql;
