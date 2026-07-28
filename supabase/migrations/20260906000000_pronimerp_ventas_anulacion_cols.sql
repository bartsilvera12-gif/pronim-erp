-- Agrega columnas de anulación a pronimerp.ventas para persistir timestamp y motivo
-- cuando una venta se anula desde el modal. Sin estas columnas, /api/ventas cae
-- en un fallback resiliente que las omite del SELECT.

ALTER TABLE pronimerp.ventas
  ADD COLUMN IF NOT EXISTS anulada_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulacion_motivo text;
