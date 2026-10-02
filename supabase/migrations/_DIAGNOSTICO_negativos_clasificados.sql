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
--  Solo CONSULTA. Son dos statements independientes: el editor de Supabase
--  no comparte vistas ni funciones temporales entre uno y otro, así que cada
--  uno se arma solo.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  1) EL RESUMEN. Esto decide el plan.
-- ─────────────────────────────────────────────────────────────────────────
WITH base AS (
  SELECT c.id,
         COALESCE(c.nombre_contacto, c.nombre, c.empresa, '?')  AS nombre,
         regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g') AS tel,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre, c.empresa, c.telefono
),
-- nom_norm: "Cecilia Guerero" → "ceciliaguerero", para comparar sin tildes
-- ni espacios. ape: la última palabra, para detectar "mismo apellido".
saldos AS (
  SELECT id, nombre, tel, saldo,
         regexp_replace(lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
                        '[^a-z0-9]', '', 'g') AS nom_norm,
         regexp_replace(lower(translate(regexp_replace(trim(nombre), '^.*\s', ''),
                                        'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
                        '[^a-z0-9]', '', 'g') AS ape
    FROM base
),
-- Para cada negativo UN solo gemelo: el más parecido y, a igual parecido,
-- el que mejor deja el saldo combinado.
mejor AS (
  SELECT DISTINCT ON (n.id)
         n.id AS neg_id,
         n.saldo + o.saldo AS queda_en,
         CASE
           WHEN n.nom_norm = o.nom_norm                      THEN 'nombre idéntico'
           WHEN left(n.nom_norm,5) = left(o.nom_norm,5)
            AND abs(length(n.nom_norm) - length(o.nom_norm)) <= 3
                                                             THEN 'nombre casi igual'
           WHEN n.ape = o.ape AND length(n.ape) >= 4         THEN 'mismo apellido'
           ELSE                                                   'nombre distinto'
         END AS parecido
    FROM saldos n
    JOIN saldos o
      ON o.id <> n.id
     AND ( (length(n.tel) >= 6 AND o.tel = n.tel)
        OR (length(n.nom_norm) >= 5
            AND left(n.nom_norm,5) = left(o.nom_norm,5)
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
            (n.saldo + o.saldo) DESC
)
SELECT CASE
         WHEN m.neg_id IS NULL
           THEN 'D - sin gemelo, falta la entrada'
         WHEN m.parecido IN ('nombre idéntico','nombre casi igual') AND m.queda_en >= 0
           THEN 'A - unir y queda sano'
         WHEN m.parecido IN ('nombre idéntico','nombre casi igual')
           THEN 'B - unir ayuda pero no alcanza'
         ELSE 'C - gemelo dudoso, revisar a mano'
       END         AS caja,
       count(*)    AS clientes,
       SUM(s.saldo) AS plata
  FROM saldos s
  LEFT JOIN mejor m ON m.neg_id = s.id
 WHERE s.saldo < 0
 GROUP BY 1
 ORDER BY 1;


-- ─────────────────────────────────────────────────────────────────────────
--  2) EL DETALLE: los 217, cada uno con su caja y su gemelo.
--     Mirá sobre todo la caja C: ahí hay teléfonos compartidos entre
--     personas distintas y unirlas sería peor que el problema.
-- ─────────────────────────────────────────────────────────────────────────
WITH base AS (
  SELECT c.id,
         COALESCE(c.nombre_contacto, c.nombre, c.empresa, '?')  AS nombre,
         regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g') AS tel,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre, c.empresa, c.telefono
),
saldos AS (
  SELECT id, nombre, tel, saldo,
         regexp_replace(lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
                        '[^a-z0-9]', '', 'g') AS nom_norm,
         regexp_replace(lower(translate(regexp_replace(trim(nombre), '^.*\s', ''),
                                        'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
                        '[^a-z0-9]', '', 'g') AS ape
    FROM base
),
mejor AS (
  SELECT DISTINCT ON (n.id)
         n.id AS neg_id,
         o.id AS otro_id,
         o.nombre AS ficha_gemela,
         o.saldo  AS saldo_gemela,
         n.saldo + o.saldo AS queda_en,
         CASE
           WHEN n.nom_norm = o.nom_norm                      THEN 'nombre idéntico'
           WHEN left(n.nom_norm,5) = left(o.nom_norm,5)
            AND abs(length(n.nom_norm) - length(o.nom_norm)) <= 3
                                                             THEN 'nombre casi igual'
           WHEN n.ape = o.ape AND length(n.ape) >= 4         THEN 'mismo apellido'
           ELSE                                                   'nombre distinto'
         END AS parecido,
         CASE WHEN length(n.tel) >= 6 AND o.tel = n.tel THEN 'sí' ELSE 'no' END AS mismo_telefono
    FROM saldos n
    JOIN saldos o
      ON o.id <> n.id
     AND ( (length(n.tel) >= 6 AND o.tel = n.tel)
        OR (length(n.nom_norm) >= 5
            AND left(n.nom_norm,5) = left(o.nom_norm,5)
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
            (n.saldo + o.saldo) DESC
)
SELECT CASE
         WHEN m.neg_id IS NULL
           THEN 'D - sin gemelo, falta la entrada'
         WHEN m.parecido IN ('nombre idéntico','nombre casi igual') AND m.queda_en >= 0
           THEN 'A - unir y queda sano'
         WHEN m.parecido IN ('nombre idéntico','nombre casi igual')
           THEN 'B - unir ayuda pero no alcanza'
         ELSE 'C - gemelo dudoso, revisar a mano'
       END AS caja,
       s.nombre AS ficha_en_rojo, s.saldo AS saldo_rojo,
       m.ficha_gemela, m.saldo_gemela, m.queda_en,
       m.parecido, m.mismo_telefono,
       s.id AS id_rojo, m.otro_id AS id_gemela
  FROM saldos s
  LEFT JOIN mejor m ON m.neg_id = s.id
 WHERE s.saldo < 0
 ORDER BY 1, s.saldo;
