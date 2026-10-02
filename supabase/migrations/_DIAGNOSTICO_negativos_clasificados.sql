-- ============================================================================
--  LOS NEGATIVOS, SEPARADOS POR LO QUE HAY QUE HACER CON CADA UNO
--
--  El listado anterior mostró que "tiene gemelo" no alcanza como respuesta.
--  Mirando los 50 peores aparecieron tres situaciones muy distintas:
--
--    a) Michaal Baten / Michal Baten → −456.000 y +456.000.
--       Es la misma persona escrita de dos formas. Unir arregla el caso.
--
--    b) Cecilia Guerero / Cecilia Guerrero → −159.000 y 0.
--       Es la misma persona, pero la gemela está vacía. Unir limpia la base
--       pero NO devuelve la plata: esa entrada nunca se importó.
--
--    c) Ale Rolon / Yelsy Bogarin → mismo teléfono, otra persona.
--       Son dos clientas que comparten un número (familia, pareja, el
--       teléfono del local). Unirlas sería un error.
--
--  Esta consulta clasifica a LOS 217, no solo a los peores, y para cada uno
--  elige su mejor candidato a gemelo (no todos los cruces, que duplican el
--  conteo). Así se sabe cuánta plata se recupera uniendo y cuánta no.
--
--  Solo CONSULTA.
-- ============================================================================

-- "Cecilia Guerero" y "Cecilia Guerrero" → "ceciliaguerero" / "ceciliaguerrero"
CREATE OR REPLACE FUNCTION pg_temp.norm(txt text) RETURNS text AS $$
  SELECT regexp_replace(
           lower(translate(COALESCE(txt,''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
           '[^a-z0-9]', '', 'g')
$$ LANGUAGE sql IMMUTABLE;

-- La última palabra del nombre, para detectar "mismo apellido".
CREATE OR REPLACE FUNCTION pg_temp.apellido(txt text) RETURNS text AS $$
  SELECT pg_temp.norm(
           (regexp_split_to_array(trim(COALESCE(txt,'')), '\s+'))
           [array_length(regexp_split_to_array(trim(COALESCE(txt,'')), '\s+'), 1)]
         )
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE TEMP VIEW v_saldos AS
  SELECT c.id,
         COALESCE(c.nombre_contacto, c.nombre, c.empresa, '?')          AS nombre,
         regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g')         AS tel,
         pg_temp.norm(COALESCE(c.nombre_contacto, c.nombre, c.empresa)) AS nom_norm,
         pg_temp.apellido(COALESCE(c.nombre_contacto, c.nombre, c.empresa)) AS ape,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre, c.empresa, c.telefono;

-- Para cada negativo, UN solo gemelo: el más parecido y, a igual parecido,
-- el que mejor deja el saldo combinado.
CREATE OR REPLACE TEMP VIEW v_mejor_gemelo AS
  SELECT DISTINCT ON (n.id)
         n.id AS neg_id, n.nombre AS ficha_en_rojo, n.saldo AS saldo_rojo,
         o.id AS otro_id, o.nombre AS ficha_gemela,  o.saldo AS saldo_gemela,
         n.saldo + o.saldo AS queda_en,
         CASE
           WHEN n.nom_norm = o.nom_norm                        THEN 'nombre idéntico'
           WHEN left(n.nom_norm,5) = left(o.nom_norm,5)
            AND abs(length(n.nom_norm) - length(o.nom_norm)) <= 3
                                                               THEN 'nombre casi igual'
           WHEN n.ape = o.ape AND length(n.ape) >= 4           THEN 'mismo apellido'
           ELSE                                                     'nombre distinto'
         END AS parecido,
         CASE WHEN length(n.tel) >= 6 AND o.tel = n.tel THEN 'sí' ELSE 'no' END AS mismo_telefono
    FROM v_saldos n
    JOIN v_saldos o
      ON o.id <> n.id
     AND ( (length(n.tel) >= 6 AND o.tel = n.tel)
        OR (length(n.nom_norm) >= 5 AND left(n.nom_norm,5) = left(o.nom_norm,5)
            AND abs(length(n.nom_norm) - length(o.nom_norm)) <= 3) )
   WHERE n.saldo < 0
   ORDER BY n.id,
            CASE
              WHEN n.nom_norm = o.nom_norm THEN 1
              WHEN left(n.nom_norm,5) = left(o.nom_norm,5)
               AND abs(length(n.nom_norm) - length(o.nom_norm)) <= 3 THEN 2
              WHEN n.ape = o.ape AND length(n.ape) >= 4 THEN 3
              ELSE 4
            END,
            (n.saldo + o.saldo) DESC;

-- Cada negativo cae en UNA de estas cajas. La columna `plata` dice cuánto
-- del agujero de −29.579.200 corresponde a cada situación.
CREATE OR REPLACE TEMP VIEW v_clasificados AS
  SELECT s.id, s.nombre, s.saldo,
         g.ficha_gemela, g.saldo_gemela, g.queda_en, g.parecido, g.mismo_telefono,
         CASE
           WHEN g.neg_id IS NULL
             THEN 'D · sin gemelo — falta la entrada'
           WHEN g.parecido IN ('nombre idéntico','nombre casi igual') AND g.queda_en >= 0
             THEN 'A · unir y queda sano'
           WHEN g.parecido IN ('nombre idéntico','nombre casi igual')
             THEN 'B · unir ayuda pero no alcanza'
           ELSE 'C · gemelo dudoso — revisar a mano'
         END AS caja
    FROM v_saldos s
    LEFT JOIN v_mejor_gemelo g ON g.neg_id = s.id
   WHERE s.saldo < 0;

-- 1) EL RESUMEN. Esto decide el plan.
SELECT caja,
       count(*)    AS clientes,
       SUM(saldo)  AS plata
  FROM v_clasificados
 GROUP BY caja
 ORDER BY caja;

-- 2) CAJA A — los que se arreglan solos uniendo. Son los seguros.
SELECT nombre, saldo, ficha_gemela, saldo_gemela, queda_en, parecido
  FROM v_clasificados
 WHERE caja LIKE 'A%'
 ORDER BY saldo;

-- 3) CAJA C — mismo teléfono pero otro nombre. NO unir sin mirarlos.
SELECT nombre, saldo, ficha_gemela, saldo_gemela, parecido, mismo_telefono
  FROM v_clasificados
 WHERE caja LIKE 'C%'
 ORDER BY saldo
 LIMIT 40;

-- 4) CAJA D — sin gemelo. Acá la entrada de crédito directamente no existe:
--    o no vino en el Excel, o el cliente ya tenía saldo de antes.
SELECT nombre, saldo
  FROM v_clasificados
 WHERE caja LIKE 'D%'
 ORDER BY saldo
 LIMIT 40;
