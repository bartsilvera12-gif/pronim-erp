-- ============================================================================
--  REPARA LAS FECHAS QUE DEJÓ MAL LA IMPORTACIÓN DEL 01/10/2026
--
--  Dos problemas distintos, los dos visibles en los datos:
--
--  1) VENTAS: la fecha está bien, pero guardada como medianoche UTC
--     (2025-05-03 00:00:00+00). En Paraguay (UTC−3) esa medianoche son las
--     21:00 del día 2, así que la pantalla muestra UN DÍA ANTES.
--     Arreglo: mover la hora al mediodía. La fecha del calendario queda igual
--     en cualquier huso y deja de correrse.
--
--  2) RECEPCIONES y MOVIMIENTOS DE CRÉDITO: la fecha guardada es la del
--     momento de la importación (01/10/2026 18:48), no la real. La fecha real
--     quedó escrita en la observación: "Prendas recibidas el 04/07/2025".
--     Arreglo: leer esa fecha del texto y usarla.
--
--  ⚠️ ESTO SÍ MODIFICA DATOS. Corré primero el bloque de VERIFICACIÓN de
--     abajo, mirá los números, y recién después descomentá los UPDATE.
--     Hacé un backup de la base antes (Supabase → Database → Backups).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACIÓN (solo lee) — correr esto PRIMERO
-- ─────────────────────────────────────────────────────────────────────────

-- Cuántas ventas tienen la hora en medianoche UTC (las de la importación).
SELECT count(*) AS ventas_a_corregir
  FROM pronimerp.ventas
 WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00';

-- Cuántos movimientos de crédito tienen la fecha de la importación y una
-- fecha real recuperable en la observación.
SELECT count(*) AS movimientos_con_fecha_recuperable
  FROM pronimerp.cliente_creditos_movimientos
 WHERE fecha::date = DATE '2026-10-01'
   AND observaciones ~ 'el \d{2}/\d{2}/\d{4}';

-- Cuántas recepciones quedaron con la fecha de la importación.
SELECT count(*) AS recepciones_con_fecha_de_carga
  FROM pronimerp.cliente_recepciones
 WHERE fecha::date = DATE '2026-10-01';

-- Muestra de cómo quedarían los movimientos (sin tocar nada).
SELECT fecha AS fecha_actual,
       to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
         + interval '12 hours' AS fecha_corregida,
       observaciones
  FROM pronimerp.cliente_creditos_movimientos
 WHERE fecha::date = DATE '2026-10-01'
   AND observaciones ~ 'el \d{2}/\d{2}/\d{4}'
 LIMIT 10;


-- ─────────────────────────────────────────────────────────────────────────
--  REPARACIÓN — descomentar SOLO después de revisar lo de arriba
-- ─────────────────────────────────────────────────────────────────────────

-- BEGIN;
--
-- -- 1) Ventas: medianoche UTC → mediodía, para que no se corra el día.
-- UPDATE pronimerp.ventas
--    SET fecha = (fecha AT TIME ZONE 'UTC')::date + interval '12 hours'
--  WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00';
--
-- -- 2) Movimientos de crédito: la fecha real está en la observación.
-- UPDATE pronimerp.cliente_creditos_movimientos
--    SET fecha = to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
--                + interval '12 hours'
--  WHERE fecha::date = DATE '2026-10-01'
--    AND observaciones ~ 'el \d{2}/\d{2}/\d{4}';
--
-- -- 3) Recepciones: se toma la fecha del movimiento de crédito que generaron.
-- --    El vínculo es `referencia_numero` = FILA-nnnn contra numero_control.
-- UPDATE pronimerp.cliente_recepciones r
--    SET fecha = m.fecha
--   FROM pronimerp.cliente_creditos_movimientos m
--  WHERE m.referencia_numero = r.numero_control
--    AND m.origen = 'recepcion'
--    AND r.fecha::date = DATE '2026-10-01'
--    AND m.fecha::date <> DATE '2026-10-01';
--
-- -- Revisá los totales antes de confirmar.
-- SELECT count(*) FILTER (WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00') AS ventas_sin_corregir
--   FROM pronimerp.ventas;
-- SELECT count(*) AS recepciones_aun_en_01_10
--   FROM pronimerp.cliente_recepciones WHERE fecha::date = DATE '2026-10-01';
--
-- COMMIT;   -- o ROLLBACK; si algo no cierra
