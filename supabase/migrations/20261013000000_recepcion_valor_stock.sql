-- =====================================================================
-- Pronim — Valor de venta de lo que entró por una recepción.
-- ---------------------------------------------------------------------
-- El markup de una evaluación es cuánto se le va a ganar a la ropa que se
-- le compró a la clienta: el precio al que se va a vender contra lo que se
-- le pagó. Hasta ahora ese precio salía del detalle de prendas
-- (cliente_recepciones_items × productos.precio_venta), así que en las
-- recepciones del histórico importado — que no tienen ese detalle — no se
-- podía calcular y la pantalla mostraba un guion.
--
-- Pero el dato existe: la planilla trae, por cada evaluación, el valor con
-- que esas prendas ingresaron al stock. No dice CUÁLES prendas eran, pero
-- sí por cuánto entraron, que es lo que hace falta para el porcentaje.
--
--     Luján Rivero, 04/04: crédito 210.000 · entró a stock por 782.000
--     markup = (782.000 − 210.000) / 210.000 = 272 %
--
-- Esta columna guarda ese valor. Cuando hay detalle de prendas se usa el
-- detalle, que es exacto; cuando no, se usa este número.
--
-- Aplica solo al schema `pronimerp`. Idempotente.
-- =====================================================================

BEGIN;

ALTER TABLE pronimerp.cliente_recepciones
  ADD COLUMN IF NOT EXISTS valor_venta_estimado numeric(14,2);

COMMENT ON COLUMN pronimerp.cliente_recepciones.valor_venta_estimado IS
  'Valor de venta con que la mercadería entró al stock. Se usa para el markup cuando no hay detalle de prendas (recepciones importadas).';

COMMIT;
