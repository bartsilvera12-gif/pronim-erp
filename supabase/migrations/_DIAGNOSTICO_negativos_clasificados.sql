-- ============================================================================
--  LOS NEGATIVOS, SEPARADOS POR LO QUE HAY QUE HACER CON CADA UNO
--
--  Hay tres situaciones muy distintas mezcladas en los 217:
--
--    a) Michaal Baten / Michal Baten → −456.000 y +456.000.
--       Es la misma persona escrita de dos formas. Unir arregla el caso.
--
--    b) Devani Rojas / Devany Rojas → −900.000 y 0.
--       Es la misma persona, pero la gemela está vacía. Unir limpia la base
--       pero NO devuelve la plata: esa entrada nunca se importó.
--
--    c) Ale Rolon / Ale Demestri → mismo teléfono, otra persona.
--       Dos clientas que comparten un número (familia, pareja, el teléfono
--       del local). Unirlas sería un error.
--
--  CÓMO MIDE EL PARECIDO (importa, porque la versión anterior se equivocaba):
--  usa distancia de edición — cuántas letras hay que cambiar para pasar de un
--  nombre al otro. "ceciliaguerero" → "ceciliaguerrero" es 1 letra: la misma
--  persona. "antonellacattoni" → "antonellaboselli" son 7: dos personas que
--  se llaman igual de nombre. El intento anterior comparaba las primeras
--  letras y el largo, y por eso daba por gemelas a seis Andreas distintas.
--
--  Solo CONSULTA. Son tres statements; corré los tres de una.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  0) La función levenshtein() viene en esta extensión.
--     Si diera error de permisos, avisame y lo resuelvo de otra forma.
-- ─────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;


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
-- "Cecilia Guerero" → "ceciliaguerero": sin tildes, sin espacios, minúsculas.
saldos AS (
  SELECT id, nombre, tel, saldo,
         regexp_replace(lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
                        '[^a-z0-9]', '', 'g') AS nom_norm
    FROM base
),
-- Todos los cruces posibles de un negativo con otra ficha, por nombre o por
-- teléfono. `dist` es cuántas letras de diferencia hay.
cruces AS (
  SELECT n.id AS neg_id, n.saldo AS neg_saldo,
         o.id AS otro_id, o.nombre AS otro_nombre, o.saldo AS otro_saldo,
         n.saldo + o.saldo AS queda_en,
         levenshtein(n.nom_norm, o.nom_norm) AS dist,
         (length(n.tel) >= 6 AND o.tel = n.tel) AS mismo_tel,
         -- Tolerancia: 2 letras, 3 si el nombre es largo.
         CASE WHEN length(n.nom_norm) >= 14 THEN 3 ELSE 2 END AS tope
    FROM saldos n
    JOIN saldos o ON o.id <> n.id
   WHERE n.saldo < 0
     AND length(n.nom_norm) >= 6
     AND length(o.nom_norm) >= 6
     AND ( (length(n.tel) >= 6 AND o.tel = n.tel)
        OR levenshtein(n.nom_norm, o.nom_norm)
             <= CASE WHEN length(n.nom_norm) >= 14 THEN 3 ELSE 2 END )
),
-- Un solo gemelo por negativo: el más parecido, y a igual parecido el que
-- mejor deja el saldo combinado.
mejor AS (
  SELECT DISTINCT ON (neg_id) *
    FROM cruces
   ORDER BY neg_id,
            CASE WHEN dist = 0 THEN 1 WHEN dist <= tope THEN 2 ELSE 3 END,
            queda_en DESC
)
SELECT CASE
         WHEN m.neg_id IS NULL                        THEN 'D - sin gemelo, falta la entrada'
         WHEN m.dist <= m.tope AND m.queda_en >= 0    THEN 'A - unir y queda sano'
         WHEN m.dist <= m.tope                        THEN 'B - unir ayuda pero no alcanza'
         ELSE                                              'C - gemelo dudoso, revisar a mano'
       END          AS caja,
       count(*)     AS clientes,
       SUM(s.saldo) AS plata
  FROM saldos s
  LEFT JOIN mejor m ON m.neg_id = s.id
 WHERE s.saldo < 0
 GROUP BY 1
 ORDER BY 1;


-- ─────────────────────────────────────────────────────────────────────────
--  2) EL DETALLE: los 217, cada uno con su caja, su gemelo y cuántas letras
--     de diferencia hay. Revisá que los de la caja A sean de verdad la misma
--     persona antes de aprobar nada.
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
                        '[^a-z0-9]', '', 'g') AS nom_norm
    FROM base
),
cruces AS (
  SELECT n.id AS neg_id, n.saldo AS neg_saldo,
         o.id AS otro_id, o.nombre AS otro_nombre, o.saldo AS otro_saldo,
         n.saldo + o.saldo AS queda_en,
         levenshtein(n.nom_norm, o.nom_norm) AS dist,
         (length(n.tel) >= 6 AND o.tel = n.tel) AS mismo_tel,
         CASE WHEN length(n.nom_norm) >= 14 THEN 3 ELSE 2 END AS tope
    FROM saldos n
    JOIN saldos o ON o.id <> n.id
   WHERE n.saldo < 0
     AND length(n.nom_norm) >= 6
     AND length(o.nom_norm) >= 6
     AND ( (length(n.tel) >= 6 AND o.tel = n.tel)
        OR levenshtein(n.nom_norm, o.nom_norm)
             <= CASE WHEN length(n.nom_norm) >= 14 THEN 3 ELSE 2 END )
),
mejor AS (
  SELECT DISTINCT ON (neg_id) *
    FROM cruces
   ORDER BY neg_id,
            CASE WHEN dist = 0 THEN 1 WHEN dist <= tope THEN 2 ELSE 3 END,
            queda_en DESC
)
SELECT CASE
         WHEN m.neg_id IS NULL                        THEN 'D - sin gemelo, falta la entrada'
         WHEN m.dist <= m.tope AND m.queda_en >= 0    THEN 'A - unir y queda sano'
         WHEN m.dist <= m.tope                        THEN 'B - unir ayuda pero no alcanza'
         ELSE                                              'C - gemelo dudoso, revisar a mano'
       END AS caja,
       s.nombre AS ficha_en_rojo, s.saldo AS saldo_rojo,
       m.otro_nombre AS ficha_gemela, m.otro_saldo AS saldo_gemela,
       m.queda_en,
       m.dist AS letras_de_diferencia,
       CASE WHEN m.mismo_tel THEN 'sí' ELSE 'no' END AS mismo_telefono,
       s.id AS id_rojo, m.otro_id AS id_gemela
  FROM saldos s
  LEFT JOIN mejor m ON m.neg_id = s.id
 WHERE s.saldo < 0
 ORDER BY 1, s.saldo;
