-- ============================================================================
--  POR QUÉ UN LOTE DICE "CONSUMIDO —" AUNQUE EL HISTORIAL DIGA QUE SE USÓ
--
--  La pantalla no se contradice: lee de dos lugares distintos.
--
--    · "Crédito disponible" y el HISTORIAL salen de
--      cliente_creditos_movimientos (las ENTRADAs y SALIDAs). Ahí está todo
--      bien: por eso el disponible da 0 y el historial muestra los usos.
--
--    · "CONSUMIDO" y "SALDO RESTANTE" de cada lote salen de
--      cliente_creditos_consumos, que es la tabla que dice QUÉ SALIDA comió
--      DE QUÉ ENTRADA. Esa tabla la escribe el sistema cuando se hace una
--      venta. La importación del 01/10 creó las ENTRADAs y las SALIDAs pero
--      NO escribió ninguna fila acá.
--
--  Resultado: cada lote se cree intacto (consumido 0, saldo = monto inicial)
--  aunque la plata ya se gastó. Ningún dato se perdió — falta reconstruir el
--  enlace entre uno y otro.
--
--  La migración 20260807000000 ya trae esa reconstrucción, pero corrió en
--  agosto, antes de la importación. Hay que volver a correrla: solo toca las
--  SALIDAs que todavía no tienen asignación, así que no duplica nada.
--
--  ⚠️ ORDEN IMPORTANTE
--     1º  _REPARAR_fechas_importacion.sql   (las fechas reales)
--     2º  este archivo
--     FIFO significa "se gasta primero el crédito más viejo". Si todos los
--     movimientos tienen la misma fecha de importación, el reparto sale en
--     cualquier orden. Con las fechas arregladas, sale bien.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACIÓN (solo lee) — correr esto primero
-- ─────────────────────────────────────────────────────────────────────────

-- 1) El tamaño del problema: salidas de crédito sin enlace a ningún lote.
SELECT count(*)      AS salidas_sin_enlace,
       SUM(s.monto)  AS plata_sin_enlazar
  FROM pronimerp.cliente_creditos_movimientos s
 WHERE s.tipo = 'SALIDA'
   AND NOT EXISTS (
     SELECT 1 FROM pronimerp.cliente_creditos_consumos c WHERE c.salida_id = s.id
   );

-- 2) ¿Siguen las fechas sin arreglar? Si esto devuelve algo, falta el paso 1º.
SELECT count(*) AS movimientos_aun_con_fecha_de_importacion
  FROM pronimerp.cliente_creditos_movimientos
 WHERE fecha::date = DATE '2026-10-01';

-- 3) El caso de Cecilia Araujo, lote por lote, como lo ve la pantalla hoy.
SELECT e.fecha        AS fecha_lote,
       e.origen,
       e.referencia_numero,
       e.monto        AS monto_inicial,
       COALESCE(SUM(c.monto_aplicado), 0)             AS consumido,
       e.monto - COALESCE(SUM(c.monto_aplicado), 0)   AS saldo_restante
  FROM pronimerp.cliente_creditos_movimientos e
  JOIN pronimerp.clientes cl ON cl.id = e.cliente_id
  LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
 WHERE cl.nombre_contacto ILIKE '%Cecilia Araujo%'
   AND e.tipo IN ('ENTRADA','AJUSTE')
 GROUP BY e.id, e.fecha, e.origen, e.referencia_numero, e.monto
 ORDER BY e.fecha;

-- 4) Las ENTRADAS de Cecilia contra las recepciones que las generaron.
--    Karen contó: 03/06 → 203.000 de crédito, 15/06 → 129.000, 22/07 → 40.000.
--    Si acá aparecen 202.000 y 140.000, la importación cargó mal el monto
--    (140.000 fue el EFECTIVO del 15/06, no el crédito) y eso es un problema
--    aparte del FIFO.
SELECT m.fecha, m.tipo, m.origen, m.monto, m.referencia_numero, m.observaciones
  FROM pronimerp.cliente_creditos_movimientos m
  JOIN pronimerp.clientes cl ON cl.id = m.cliente_id
 WHERE cl.nombre_contacto ILIKE '%Cecilia Araujo%'
 ORDER BY m.fecha, m.created_at;


-- ─────────────────────────────────────────────────────────────────────────
--  REPARACIÓN — descomentar SOLO después de arreglar las fechas
--
--  Reconstruye el enlace: recorre cada SALIDA sin asignar, en orden de
--  fecha, y la va descontando de las ENTRADAs más viejas que ya existían en
--  ese momento. Es exactamente lo que hace el sistema en una venta normal.
-- ─────────────────────────────────────────────────────────────────────────

-- BEGIN;
--
-- DO $$
-- DECLARE
--   r_salida  RECORD;
--   r_entrada RECORD;
--   restante  numeric;
--   aplicar   numeric;
-- BEGIN
--   FOR r_salida IN
--     SELECT s.id, s.empresa_id, s.cliente_id, s.monto, s.fecha
--       FROM pronimerp.cliente_creditos_movimientos s
--      WHERE s.tipo = 'SALIDA'
--        AND NOT EXISTS (
--          SELECT 1 FROM pronimerp.cliente_creditos_consumos c
--           WHERE c.salida_id = s.id)
--      ORDER BY s.cliente_id, s.fecha ASC, s.created_at ASC
--   LOOP
--     restante := r_salida.monto;
--
--     FOR r_entrada IN
--       SELECT e.id,
--              e.monto - COALESCE((
--                SELECT SUM(c.monto_aplicado)
--                  FROM pronimerp.cliente_creditos_consumos c
--                 WHERE c.entrada_id = e.id), 0) AS saldo
--         FROM pronimerp.cliente_creditos_movimientos e
--        WHERE e.cliente_id = r_salida.cliente_id
--          AND e.empresa_id = r_salida.empresa_id
--          AND e.tipo IN ('ENTRADA','AJUSTE')
--          AND e.fecha <= r_salida.fecha
--        ORDER BY e.fecha ASC, e.created_at ASC
--     LOOP
--       EXIT WHEN restante <= 0;
--       CONTINUE WHEN r_entrada.saldo <= 0;
--       aplicar := LEAST(r_entrada.saldo, restante);
--       INSERT INTO pronimerp.cliente_creditos_consumos
--              (empresa_id, entrada_id, salida_id, monto_aplicado)
--       VALUES (r_salida.empresa_id, r_entrada.id, r_salida.id, aplicar);
--       restante := restante - aplicar;
--     END LOOP;
--   END LOOP;
-- END $$;
--
-- -- Qué quedó sin enlazar. Lo que sobre acá son los clientes en rojo: usaron
-- -- crédito que nunca entró, así que no hay lote del cual descontarlo.
-- SELECT count(*) AS salidas_que_siguen_sin_enlace,
--        SUM(s.monto) AS plata
--   FROM pronimerp.cliente_creditos_movimientos s
--  WHERE s.tipo = 'SALIDA'
--    AND NOT EXISTS (
--      SELECT 1 FROM pronimerp.cliente_creditos_consumos c WHERE c.salida_id = s.id);
--
-- -- Control: ningún lote puede quedar con saldo negativo.
-- SELECT count(*) AS lotes_sobreconsumidos
--   FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
--           FROM pronimerp.cliente_creditos_movimientos e
--           LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
--          WHERE e.tipo IN ('ENTRADA','AJUSTE')
--          GROUP BY e.id, e.monto) z
--  WHERE saldo < 0;
--
-- COMMIT;   -- o ROLLBACK; si los controles no cierran
