-- ============================================================================
--  CLIENTES REPETIDOS POR TELÉFONO
--
--  En la muestra de "Cecilia" aparecieron tres casos claros, todos por un
--  error de tipeo en el Excel original:
--
--      Cecilia Guerero / Cecilia Guerrero   → 985147976
--      Cecilia Kim     / Cecilia Kym        → 985446925
--      Cecilia rRejala / Cecilia Rejala     → 981266046
--
--  El daño no es cosmético: en Guerero/Guerrero las entradas de crédito
--  quedaron en una ficha y las salidas en la otra, y por eso una muestra
--  saldo −159.000, que es imposible.
--
--  Solo CONSULTA. Sirve para dimensionar antes de unificar nada.
-- ============================================================================

-- 1) Cuántos teléfonos tienen más de una ficha, y cuántas fichas sobran.
WITH d AS (
  SELECT regexp_replace(telefono, '\D', '', 'g') AS tel, count(*) AS fichas
    FROM pronimerp.clientes
   WHERE deleted_at IS NULL
     AND length(regexp_replace(COALESCE(telefono,''), '\D', '', 'g')) >= 6
   GROUP BY 1
  HAVING count(*) > 1
)
SELECT count(*) AS telefonos_repetidos,
       SUM(fichas) AS fichas_involucradas,
       SUM(fichas - 1) AS fichas_que_sobran
  FROM d;

-- 2) Los casos concretos, con el saldo de cada ficha.
--    Si una ficha tiene saldo NEGATIVO es señal de que el crédito entró en
--    la otra: al unificarlas el saldo se corrige solo.
WITH saldos AS (
  SELECT c.id, c.nombre_contacto,
         regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g') AS tel,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo,
         count(m.id) AS movimientos
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.telefono
), dup AS (
  SELECT tel FROM saldos
   WHERE length(tel) >= 6
   GROUP BY tel HAVING count(*) > 1
)
SELECT s.tel, s.nombre_contacto, s.movimientos, s.saldo, s.id
  FROM saldos s JOIN dup ON dup.tel = s.tel
 ORDER BY s.tel, s.movimientos DESC
 LIMIT 100;

-- 3) ¿Cuántos clientes quedaron con saldo NEGATIVO? Un crédito no puede ser
--    negativo: cada uno es un síntoma de ficha partida o de carga mal hecha.
SELECT count(*) AS clientes_con_saldo_negativo
  FROM (
    SELECT c.id,
           SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo
      FROM pronimerp.clientes c
      JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id
  ) x
 WHERE saldo < 0;

-- 4) El detalle de los negativos, para revisarlos uno por uno.
SELECT c.nombre_contacto, c.telefono,
       SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo
  FROM pronimerp.clientes c
  JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
 WHERE c.deleted_at IS NULL
 GROUP BY c.id, c.nombre_contacto, c.telefono
HAVING SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) < 0
 ORDER BY saldo
 LIMIT 50;
