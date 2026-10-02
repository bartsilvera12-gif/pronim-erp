-- ============================================================================
--  REPARACIÓN DE LA IMPORTACIÓN DEL 01/10/2026 — LOS DOS PASOS, EN ORDEN
--
--  ⚠️  ESTE ARCHIVO MODIFICA DATOS. HACÉ BACKUP ANTES.
--      Supabase → Database → Backups → crear uno nuevo y esperar a que
--      termine. Después corré todo este archivo de una sola vez.
--
--  Reemplaza a _REPARAR_fechas_importacion.sql y a la parte comentada de
--  _REPARAR_fifo_creditos.sql: hace lo mismo pero en un solo bloque, porque
--  el orden importa y hacerlo al revés deja el FIFO mal armado.
--
--  QUÉ ARREGLA
--
--  1) Las fechas de las ventas. Están bien guardadas pero como medianoche
--     UTC, que en Paraguay son las 21:00 del día anterior. Por eso la
--     pantalla muestra todo un día antes. Se mueven al mediodía: la fecha
--     del calendario queda igual en cualquier huso.
--
--  2) Las fechas de los movimientos de crédito. Tienen la fecha de la
--     importación (01/10/2026 18:48), no la real. La real quedó escrita en
--     la observación: "Prendas recibidas el 04/07/2025". Se lee de ahí.
--
--  3) Las fechas de las recepciones. Todas figuran 01/10. Se toma la del
--     movimiento de crédito que cada una generó.
--
--  4) El enlace FIFO. La importación creó las ENTRADAs y las SALIDAs pero
--     nunca escribió qué salida se comió de qué lote. Son 3.532 salidas por
--     566.203.300: todas las del sistema. Por eso los lotes se ven intactos
--     aunque la plata ya se gastó. Esto va último porque FIFO reparte por
--     fecha, y con todo fechado el 01/10 el reparto sale en cualquier orden.
--
--  QUÉ NO ARREGLA
--     Los 217 clientes con saldo negativo. Ésos usaron crédito que nunca
--     entró en su ficha, y eso se resuelve uniendo duplicados o cargando el
--     saldo que traían de antes. Es el tema aparte que estamos viendo.
-- ============================================================================

BEGIN;

-- ── 1) Ventas: medianoche UTC → mediodía ──────────────────────────────────
UPDATE pronimerp.ventas
   SET fecha = (fecha AT TIME ZONE 'UTC')::date + interval '12 hours'
 WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00';

-- ── 2) Movimientos de crédito: la fecha real está en la observación ──────
UPDATE pronimerp.cliente_creditos_movimientos
   SET fecha = to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
               + interval '12 hours'
 WHERE fecha::date = DATE '2026-10-01'
   AND observaciones ~ 'el \d{2}/\d{2}/\d{4}';

-- ── 3) Recepciones: toman la fecha del crédito que generaron ─────────────
UPDATE pronimerp.cliente_recepciones r
   SET fecha = m.fecha
  FROM pronimerp.cliente_creditos_movimientos m
 WHERE m.referencia_numero = r.numero_control
   AND m.origen = 'recepcion'
   AND r.fecha::date = DATE '2026-10-01'
   AND m.fecha::date <> DATE '2026-10-01';

-- ── 4) El enlace FIFO ─────────────────────────────────────────────────────
--  Recorre cada salida sin asignar, en orden de fecha, y la descuenta de los
--  lotes más viejos que ya existían ese día. Es lo mismo que hace el sistema
--  en una venta normal. Solo toca salidas sin asignación: no duplica nada.
--
--  Lo que sobre sin lote es justamente el agujero de los clientes en rojo:
--  usaron crédito que nunca entró, así que no hay de dónde descontarlo.
DO $$
DECLARE
  r_salida  RECORD;
  r_entrada RECORD;
  restante  numeric;
  aplicar   numeric;
BEGIN
  FOR r_salida IN
    SELECT s.id, s.empresa_id, s.cliente_id, s.monto, s.fecha
      FROM pronimerp.cliente_creditos_movimientos s
     WHERE s.tipo = 'SALIDA'
       AND NOT EXISTS (
         SELECT 1 FROM pronimerp.cliente_creditos_consumos c
          WHERE c.salida_id = s.id)
     ORDER BY s.cliente_id, s.fecha ASC, s.created_at ASC
  LOOP
    restante := r_salida.monto;

    FOR r_entrada IN
      SELECT e.id,
             e.monto - COALESCE((
               SELECT SUM(c.monto_aplicado)
                 FROM pronimerp.cliente_creditos_consumos c
                WHERE c.entrada_id = e.id), 0) AS saldo
        FROM pronimerp.cliente_creditos_movimientos e
       WHERE e.cliente_id = r_salida.cliente_id
         AND e.empresa_id = r_salida.empresa_id
         AND e.tipo IN ('ENTRADA','AJUSTE')
         AND e.fecha <= r_salida.fecha
       ORDER BY e.fecha ASC, e.created_at ASC
    LOOP
      EXIT WHEN restante <= 0;
      CONTINUE WHEN r_entrada.saldo <= 0;
      aplicar := LEAST(r_entrada.saldo, restante);
      INSERT INTO pronimerp.cliente_creditos_consumos
             (empresa_id, entrada_id, salida_id, monto_aplicado)
      VALUES (r_salida.empresa_id, r_entrada.id, r_salida.id, aplicar);
      restante := restante - aplicar;
    END LOOP;
  END LOOP;
END $$;

COMMIT;


-- ============================================================================
--  CONTROLES — correr después, ya no modifican nada
-- ============================================================================

-- Debería dar 0: ninguna venta sigue en medianoche UTC.
SELECT count(*) AS ventas_sin_corregir
  FROM pronimerp.ventas
 WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00';

-- Debería bajar casi a 0. Lo que quede son movimientos sin fecha en la
-- observación, que no se pueden recuperar.
SELECT count(*) AS movimientos_aun_con_fecha_de_importacion
  FROM pronimerp.cliente_creditos_movimientos
 WHERE fecha::date = DATE '2026-10-01';

SELECT count(*) AS recepciones_aun_en_01_10
  FROM pronimerp.cliente_recepciones
 WHERE fecha::date = DATE '2026-10-01';

-- Lo que quede acá es el agujero real de los clientes en rojo.
-- Esperado: cerca de 29.579.200, no 566 millones.
SELECT count(*)     AS salidas_que_siguen_sin_enlace,
       SUM(s.monto) AS plata
  FROM pronimerp.cliente_creditos_movimientos s
 WHERE s.tipo = 'SALIDA'
   AND NOT EXISTS (
     SELECT 1 FROM pronimerp.cliente_creditos_consumos c WHERE c.salida_id = s.id);

-- Debería dar 0: ningún lote puede quedar consumido de más.
SELECT count(*) AS lotes_sobreconsumidos
  FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
          FROM pronimerp.cliente_creditos_movimientos e
          LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
         WHERE e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id, e.monto) z
 WHERE saldo < 0;

-- Cecilia Araujo, para verlo con un caso conocido.
-- Esperado: el lote de 140.000 (15/06) consumido 140.000 — 129.000 en junio
-- y 11.000 en julio. El de 40.000 (22/07) consumido entero.
SELECT e.fecha::date AS fecha_lote,
       e.referencia_numero,
       e.monto                                      AS monto_inicial,
       COALESCE(SUM(c.monto_aplicado), 0)           AS consumido,
       e.monto - COALESCE(SUM(c.monto_aplicado), 0) AS saldo_restante
  FROM pronimerp.cliente_creditos_movimientos e
  JOIN pronimerp.clientes cl ON cl.id = e.cliente_id
  LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
 WHERE cl.nombre_contacto ILIKE '%Cecilia Araujo%'
   AND e.tipo IN ('ENTRADA','AJUSTE')
 GROUP BY e.id, e.fecha, e.referencia_numero, e.monto
 ORDER BY e.fecha;
