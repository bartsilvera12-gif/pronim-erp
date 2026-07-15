-- =====================================================================
-- Pronim ERP — Transferencias de stock entre sucursales (append-only)
-- ---------------------------------------------------------------------
-- Aplica SOLO al schema `pronimerp`. Idempotente.
--
-- Modelo:
--   pronimerp.transferencias_stock       — cabecera (empresa, sucursal
--                                          origen, sucursal destino, estado)
--   pronimerp.transferencias_stock_items — líneas (producto, cantidad)
--
-- La aplicación se encarga de mover el stock atómicamente en la tabla
-- pronimerp.producto_stock_sucursal (decrementa origen, incrementa destino)
-- dentro de una única transacción. Este SQL sólo define las tablas y
-- constraints; no hay triggers para mantener el modelo simple.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pronimerp.transferencias_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  origen_sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id),
  destino_sucursal_id uuid NOT NULL REFERENCES pronimerp.sucursales(id),
  numero_control text,
  observacion text,
  estado text NOT NULL DEFAULT 'confirmada'
    CHECK (estado IN ('confirmada','anulada')),
  created_by uuid,
  created_by_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transferencias_stock_sucursales_diferentes
    CHECK (origen_sucursal_id <> destino_sucursal_id)
);

CREATE INDEX IF NOT EXISTS transferencias_stock_empresa_idx
  ON pronimerp.transferencias_stock (empresa_id);
CREATE INDEX IF NOT EXISTS transferencias_stock_origen_idx
  ON pronimerp.transferencias_stock (origen_sucursal_id);
CREATE INDEX IF NOT EXISTS transferencias_stock_destino_idx
  ON pronimerp.transferencias_stock (destino_sucursal_id);
CREATE INDEX IF NOT EXISTS transferencias_stock_fecha_idx
  ON pronimerp.transferencias_stock (created_at DESC);

CREATE TABLE IF NOT EXISTS pronimerp.transferencias_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transferencia_id uuid NOT NULL
    REFERENCES pronimerp.transferencias_stock(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  producto_nombre text,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transferencias_stock_items_transferencia_idx
  ON pronimerp.transferencias_stock_items (transferencia_id);
CREATE INDEX IF NOT EXISTS transferencias_stock_items_producto_idx
  ON pronimerp.transferencias_stock_items (producto_id);

COMMIT;
