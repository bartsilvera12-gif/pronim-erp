-- ============================================================================
--  ¿DE DÓNDE SALE EL AGUJERO QUE QUEDA?
--
--  Ya sabemos que unificar duplicados recupera poco: la caja A suma apenas
--  2.575.000 de los ~29.000.000. La explicación de "la plata está en la ficha
--  de al lado" alcanza para unos pocos casos, no para esto.
--
--  Queda una sola hipótesis con sentido: estos clientes YA TENÍAN saldo antes
--  del período que trajo el Excel. Compraron con ese crédito viejo, y como la
--  recepción que lo generó nunca se importó, la salida quedó colgada.
--
--  Se prueba mirando CUÁNDO usaron crédito por primera vez. Si el agujero son
--  compras hechas ANTES de su primera recepción, es saldo anterior. Si están
--  repartidas por todo el período, es otra cosa y hay que buscar en el Excel.
--
--  Solo CONSULTA. Correr después de reparar las fechas.
-- ============================================================================

-- 1) La prueba principal: de los ~29 millones, ¿cuánto se gastó ANTES de que
--    el cliente tuviera su primera entrada de crédito?
--    Si "gastado_antes_de_la_primera_entrada" se parece al agujero total,
--    la hipótesis del saldo anterior queda confirmada.
WITH neg AS (
  SELECT c.id
    FROM pronimerp.clientes c
    JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
  HAVING SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) < 0
),
primera_entrada AS (
  SELECT n.id AS cliente_id,
         MIN(e.fecha) FILTER (WHERE e.tipo IN ('ENTRADA','AJUSTE')) AS desde
    FROM neg n
    LEFT JOIN pronimerp.cliente_creditos_movimientos e ON e.cliente_id = n.id
   GROUP BY n.id
)
SELECT
  SUM(s.monto) FILTER (WHERE pe.desde IS NULL)                AS de_clientes_sin_ninguna_entrada,
  SUM(s.monto) FILTER (WHERE pe.desde IS NOT NULL AND s.fecha < pe.desde)
                                                              AS gastado_antes_de_la_primera_entrada,
  SUM(s.monto) FILTER (WHERE pe.desde IS NOT NULL AND s.fecha >= pe.desde)
                                                              AS gastado_despues,
  SUM(s.monto)                                                AS total_salidas_de_los_negativos
  FROM primera_entrada pe
  JOIN pronimerp.cliente_creditos_movimientos s ON s.cliente_id = pe.cliente_id
 WHERE s.tipo = 'SALIDA';

-- 2) Las salidas que el FIFO no pudo enlazar, por mes. Si se amontonan en los
--    primeros meses del período importado, es saldo que venía de antes. Si
--    están repartidas parejo, el Excel perdió recepciones en todo el rango.
SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
       count(*)                    AS salidas_colgadas,
       SUM(s.monto)                AS plata
  FROM pronimerp.cliente_creditos_movimientos s
 WHERE s.tipo = 'SALIDA'
   AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_consumos c
                    WHERE c.salida_id = s.id)
 GROUP BY 1
 ORDER BY 1;

-- 3) Comparación contra el total: en esos mismos meses, ¿cuántas salidas SÍ
--    se enlazaron? Sirve para ver si el primer mes es anormal o si todo el
--    período tiene el mismo porcentaje de agujero.
SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
       count(*)                                   AS salidas_totales,
       count(*) FILTER (WHERE c.salida_id IS NULL) AS sin_enlazar,
       round(100.0 * count(*) FILTER (WHERE c.salida_id IS NULL) / count(*), 1) AS pct_sin_enlazar
  FROM pronimerp.cliente_creditos_movimientos s
  LEFT JOIN LATERAL (SELECT 1 AS salida_id FROM pronimerp.cliente_creditos_consumos x
                      WHERE x.salida_id = s.id LIMIT 1) c ON TRUE
 WHERE s.tipo = 'SALIDA'
 GROUP BY 1
 ORDER BY 1;

-- 4) Los 10 peores de la caja D, con su primer y último movimiento. Si el
--    primero es una SALIDA de los primeros días del período, es saldo viejo.
WITH neg AS (
  SELECT c.id, COALESCE(c.nombre_contacto, c.nombre, '?') AS nombre
    FROM pronimerp.clientes c
    JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre
  HAVING SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) < -100000
)
SELECT n.nombre,
       MIN(m.fecha)::date AS primer_movimiento,
       MAX(m.fecha)::date AS ultimo_movimiento,
       (SELECT p.tipo FROM pronimerp.cliente_creditos_movimientos p
         WHERE p.cliente_id = n.id ORDER BY p.fecha, p.created_at LIMIT 1) AS primero_fue,
       SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo
  FROM neg n
  JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = n.id
 GROUP BY n.id, n.nombre
 ORDER BY saldo
 LIMIT 10;
