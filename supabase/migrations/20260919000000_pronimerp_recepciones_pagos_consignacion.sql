-- Fase 2 · Post-launch fix: agregar 'consignacion' al CHECK de
-- pronimerp.cliente_recepciones_pagos.metodo
--
-- El pago metodo='consignacion' fue añadido al UI + backend en la tanda 19
-- pero el CHECK constraint de esta tabla seguía con la whitelist original
-- (credito/efectivo/transferencia). Al confirmar una evaluación con
-- pago consignación → INSERT falla con:
--   new row for relation "cliente_recepciones_pagos" violates check constraint
--   "cliente_recepciones_pagos_metodo_check"
--
-- Idempotente.

ALTER TABLE pronimerp.cliente_recepciones_pagos
  DROP CONSTRAINT IF EXISTS cliente_recepciones_pagos_metodo_check;

ALTER TABLE pronimerp.cliente_recepciones_pagos
  ADD CONSTRAINT cliente_recepciones_pagos_metodo_check
  CHECK (metodo IN ('credito','efectivo','transferencia','consignacion'));
