-- ============================================================================
--  ¿POR QUÉ HAY TANTOS SALDOS NEGATIVOS?
--
--  Un crédito negativo no puede existir: significa que el cliente usó más
--  crédito del que generó. Como son decenas de clientes y montos grandes,
--  no alcanza con los duplicados: hay algo sistemático en la importación.
--
--  La hipótesis a confirmar: el Excel traía TODAS las ventas con crédito
--  usado, pero solo las recepciones de cierto período. El saldo que el
--  cliente ya tenía ANTES de ese período nunca se cargó, así que las salidas
--  quedaron sin su entrada correspondiente.
--
--  Solo CONSULTA.
-- ============================================================================

-- 1) El total en juego.
SELECT count(*)                           AS clientes_negativos,
       SUM(saldo)                         AS suma_de_negativos,
       MIN(saldo)                         AS peor_caso
  FROM (
    SELECT c.id, SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo
      FROM pronimerp.clientes c
      JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id
  ) x
 WHERE saldo < 0;

-- 2) Contra el total general: ¿cuánta plata entró y cuánta salió?
--    Si las salidas superan a las entradas en el conjunto, falta el saldo
--    inicial de la gente, no es un problema de unos pocos clientes.
SELECT SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto ELSE 0 END) AS total_entradas,
       SUM(CASE WHEN tipo = 'SALIDA' THEN monto ELSE 0 END)              AS total_salidas,
       SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto ELSE -monto END) AS saldo_global
  FROM pronimerp.cliente_creditos_movimientos;

-- 3) La prueba de la hipótesis: en los clientes negativos, ¿su PRIMER
--    movimiento es una SALIDA? Si usó crédito antes de generar ninguno,
--    es que el saldo anterior no se importó.
WITH neg AS (
  SELECT c.id
    FROM pronimerp.clientes c
    JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
  HAVING SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) < 0
), primero AS (
  SELECT DISTINCT ON (m.cliente_id) m.cliente_id, m.tipo, m.observaciones
    FROM pronimerp.cliente_creditos_movimientos m
    JOIN neg ON neg.id = m.cliente_id
   ORDER BY m.cliente_id,
            COALESCE(
              to_date(substring(m.observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY'),
              m.fecha::date
            ),
            m.created_at
)
SELECT tipo AS primer_movimiento, count(*) AS clientes
  FROM primero
 GROUP BY 1
 ORDER BY clientes DESC;

-- 4) La fecha más vieja de cada tipo. Si las ventas arrancan mucho antes que
--    las recepciones, el Excel no traía el historial completo de recepciones.
SELECT 'recepciones' AS tipo,
       MIN(to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')) AS desde,
       MAX(to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')) AS hasta,
       count(*) AS cantidad
  FROM pronimerp.cliente_creditos_movimientos
 WHERE origen = 'recepcion' AND observaciones ~ 'el \d{2}/\d{2}/\d{4}'
UNION ALL
SELECT 'usos de credito',
       MIN(to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')),
       MAX(to_date(substring(observaciones from 'el (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')),
       count(*)
  FROM pronimerp.cliente_creditos_movimientos
 WHERE origen = 'venta' AND observaciones ~ 'el \d{2}/\d{2}/\d{4}';
