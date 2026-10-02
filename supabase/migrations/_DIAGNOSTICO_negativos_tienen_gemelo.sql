-- ============================================================================
--  ¿LOS NEGATIVOS SE ARREGLAN UNIENDO FICHAS?
--
--  Lo que ya sabemos:
--    · El saldo GLOBAL es +21.945.000 → la plata está cargada, no falta.
--    · Hay 217 clientes en negativo que suman −29.579.200.
--    · De esos, 164 arrancan con una SALIDA: usaron crédito que el sistema
--      nunca vio entrar.
--
--  Si la plata global está bien pero 217 fichas están en rojo, entonces el
--  crédito entró en UNA ficha y se usó desde OTRA. Esta consulta busca, para
--  cada negativo, su ficha gemela y calcula el saldo de las dos juntas: si
--  da >= 0, unirlas arregla el caso sin inventar ningún ajuste.
--
--  Busca gemelos de dos formas, porque muchos negativos no tienen teléfono:
--    a) mismo teléfono
--    b) nombre casi igual (sin tildes, sin espacios, en minúsculas)
--
--  Solo CONSULTA.
-- ============================================================================

-- Normaliza un nombre para poder comparar "Cecilia Guerero" con "Cecilia Guerrero".
CREATE OR REPLACE FUNCTION pg_temp.norm(txt text) RETURNS text AS $$
  SELECT regexp_replace(
           lower(translate(COALESCE(txt,''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
           '[^a-z0-9]', '', 'g')
$$ LANGUAGE sql IMMUTABLE;

WITH saldos AS (
  SELECT c.id,
         COALESCE(c.nombre_contacto, c.nombre, c.empresa, '?') AS nombre,
         regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g') AS tel,
         pg_temp.norm(COALESCE(c.nombre_contacto, c.nombre, c.empresa)) AS nom_norm,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre, c.empresa, c.telefono
),
negativos AS (SELECT * FROM saldos WHERE saldo < 0),
-- Gemelo por teléfono.
par_tel AS (
  SELECT n.id AS neg_id, n.nombre AS neg_nombre, n.saldo AS neg_saldo,
         o.id AS otro_id, o.nombre AS otro_nombre, o.saldo AS otro_saldo,
         'telefono' AS por
    FROM negativos n
    JOIN saldos o ON o.tel = n.tel AND o.id <> n.id
   WHERE length(n.tel) >= 6
),
-- Gemelo por nombre parecido (mismos caracteres al normalizar).
par_nom AS (
  SELECT n.id, n.nombre, n.saldo,
         o.id, o.nombre, o.saldo, 'nombre'
    FROM negativos n
    JOIN saldos o ON o.nom_norm = n.nom_norm AND o.id <> n.id
   WHERE length(n.nom_norm) >= 5
),
pares AS (SELECT * FROM par_tel UNION SELECT * FROM par_nom)

-- 1) RESUMEN: cuántos negativos tienen gemelo y cuántos se arreglarían.
SELECT
  (SELECT count(*) FROM negativos)                                    AS negativos_totales,
  (SELECT count(DISTINCT neg_id) FROM pares)                          AS con_gemelo,
  (SELECT count(*) FROM negativos
    WHERE id NOT IN (SELECT neg_id FROM pares))                       AS sin_gemelo,
  (SELECT COALESCE(SUM(neg_saldo),0) FROM (
      SELECT DISTINCT neg_id, neg_saldo FROM pares) z)                AS plata_recuperable_uniendo,
  (SELECT COALESCE(SUM(saldo),0) FROM negativos
    WHERE id NOT IN (SELECT neg_id FROM pares))                       AS plata_sin_explicacion;

-- 2) EL DETALLE: cada negativo con su gemelo y el saldo de los dos juntos.
--    `queda_en` >= 0 significa que unir las fichas deja el caso sano.
WITH saldos AS (
  SELECT c.id,
         COALESCE(c.nombre_contacto, c.nombre, c.empresa, '?') AS nombre,
         regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g') AS tel,
         pg_temp.norm(COALESCE(c.nombre_contacto, c.nombre, c.empresa)) AS nom_norm,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre, c.empresa, c.telefono
),
negativos AS (SELECT * FROM saldos WHERE saldo < 0)
SELECT n.nombre AS ficha_en_rojo, n.saldo AS saldo_rojo,
       o.nombre AS ficha_gemela,  o.saldo AS saldo_gemela,
       n.saldo + o.saldo AS queda_en,
       CASE WHEN o.tel = n.tel AND length(n.tel) >= 6 THEN 'mismo teléfono' ELSE 'nombre parecido' END AS motivo
  FROM negativos n
  JOIN saldos o
    ON o.id <> n.id
   AND ((length(n.tel) >= 6 AND o.tel = n.tel) OR (length(n.nom_norm) >= 5 AND o.nom_norm = n.nom_norm))
 ORDER BY n.saldo
 LIMIT 60;
