-- =====================================================================
-- Pronim — Evaluación con monto final distinto al subtotal.
-- ---------------------------------------------------------------------
-- Agrega a pronimerp.cliente_recepciones los campos que auditan el
-- ajuste manual que puede aplicar la cajera al evaluar prendas:
--   - subtotal_evaluado : SUM(cantidad × precio) crudo por líneas.
--   - ajuste_evaluacion : delta manual (puede ser + o −).
--   - total_final       : lo que realmente vale la evaluación
--                         (subtotal_evaluado + ajuste_evaluacion).
--
-- Reglas invariantes:
--   * total_final = subtotal_evaluado + ajuste_evaluacion.
--   * total_final > 0.
--   * ajuste_evaluacion no tiene límite (positivo o negativo).
--
-- La distribución proporcional del ajuste entre las líneas la hace el
-- orquestador (para que el WACP se calcule con el costo realmente
-- pagado, no con el subtotal crudo). Estas columnas son solo la huella
-- para auditoría.
--
-- Backfill: en filas existentes se asume ajuste = 0.
-- No se toca `total_compra` para no romper reportes existentes; queda
-- como espejo del `total_final` en la carga histórica.
-- =====================================================================

BEGIN;

ALTER TABLE pronimerp.cliente_recepciones
  ADD COLUMN IF NOT EXISTS subtotal_evaluado numeric(14,2),
  ADD COLUMN IF NOT EXISTS ajuste_evaluacion numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_final      numeric(14,2);

-- Backfill: subtotal=total_final=total_compra existente; ajuste queda en 0.
UPDATE pronimerp.cliente_recepciones
SET subtotal_evaluado = COALESCE(subtotal_evaluado, total_compra),
    total_final       = COALESCE(total_final,       total_compra)
WHERE subtotal_evaluado IS NULL OR total_final IS NULL;

-- Invariantes: ambos campos son NOT NULL post-backfill; total_final > 0.
ALTER TABLE pronimerp.cliente_recepciones
  ALTER COLUMN subtotal_evaluado SET NOT NULL,
  ALTER COLUMN total_final       SET NOT NULL;

ALTER TABLE pronimerp.cliente_recepciones
  DROP CONSTRAINT IF EXISTS cliente_recepciones_eval_montos_check;
ALTER TABLE pronimerp.cliente_recepciones
  ADD  CONSTRAINT cliente_recepciones_eval_montos_check
  CHECK (total_final = subtotal_evaluado + ajuste_evaluacion
     AND total_final > 0);

COMMENT ON COLUMN pronimerp.cliente_recepciones.subtotal_evaluado IS
  'Suma cruda de cantidad × precio_compra_unitario por línea (antes de ajuste).';
COMMENT ON COLUMN pronimerp.cliente_recepciones.ajuste_evaluacion IS
  'Ajuste manual que aplicó la cajera al monto final. Puede ser positivo o negativo.';
COMMENT ON COLUMN pronimerp.cliente_recepciones.total_final IS
  'Monto que realmente vale la evaluación = subtotal_evaluado + ajuste_evaluacion. Es el que genera el crédito.';

COMMIT;
