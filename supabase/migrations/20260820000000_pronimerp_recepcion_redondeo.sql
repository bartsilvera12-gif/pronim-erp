-- =====================================================================
-- Pronim Consultoría — Redondeo automático de recepciones
-- ---------------------------------------------------------------------
-- Configuración por empresa: al recibir prendas del cliente (columna
-- "El cliente trae"), el subtotal estimado se redondea hacia arriba al
-- múltiplo definido. Ej. 5000 → 136.500 se paga 140.000.
-- Default 5000. 0 = sin redondeo.
-- =====================================================================

BEGIN;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS redondeo_recepcion_multiplo integer NOT NULL DEFAULT 5000;

COMMENT ON COLUMN public.empresas.redondeo_recepcion_multiplo IS
  'Múltiplo al que se redondea hacia arriba el subtotal de una recepción de prendas del cliente. 0 = sin redondeo.';

COMMIT;
