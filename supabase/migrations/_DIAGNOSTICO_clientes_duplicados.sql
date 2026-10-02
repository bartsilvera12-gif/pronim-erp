-- ============================================================================
--  ¿Cuántos clientes hay de verdad y cuántos están duplicados?
--
--  Solo CONSULTA: no modifica nada. Correlo entero y pasame los resultados.
-- ============================================================================

-- 1) Cuántos clientes hay en total.
--    El listado corta en 2000 porque la consulta tiene ese límite, así que
--    "2000 resultados" significa "2000 o más", no exactamente 2000.
SELECT count(*) AS clientes_totales,
       count(*) FILTER (WHERE deleted_at IS NULL) AS activos,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS borrados
  FROM pronimerp.clientes;

-- 2) De dónde salieron. Si hay miles con el mismo origen, fue una carga
--    masiva (importación, sorteos, web) y no gente escribiéndolos a mano.
SELECT COALESCE(origen, '(sin origen)') AS origen,
       count(*) AS cantidad,
       min(created_at)::date AS primero,
       max(created_at)::date AS ultimo
  FROM pronimerp.clientes
 GROUP BY 1
 ORDER BY cantidad DESC;

-- 3) Cargados por día: una importación se ve como un pico en una sola fecha.
SELECT created_at::date AS dia, count(*) AS cargados
  FROM pronimerp.clientes
 GROUP BY 1
 ORDER BY cargados DESC
 LIMIT 10;

-- 4) DUPLICADOS POR TELÉFONO (solo dígitos, ignorando espacios y guiones).
--    Esto es lo que importa: si una misma persona aparece varias veces, su
--    crédito y su historial quedan repartidos entre varias fichas.
SELECT regexp_replace(COALESCE(telefono,''), '\D', '', 'g') AS tel,
       count(*) AS fichas,
       string_agg(COALESCE(nombre_contacto, nombre, empresa, '?'), ' | ' ORDER BY created_at) AS nombres
  FROM pronimerp.clientes
 WHERE deleted_at IS NULL
   AND length(regexp_replace(COALESCE(telefono,''), '\D', '', 'g')) >= 6
 GROUP BY 1
HAVING count(*) > 1
 ORDER BY fichas DESC
 LIMIT 20;

-- 5) Cuánta plata hay en juego: fichas duplicadas CON saldo de crédito.
--    Si una persona tiene crédito en dos fichas distintas, al cobrarle solo
--    se le descuenta de una.
WITH dup AS (
  SELECT regexp_replace(COALESCE(telefono,''), '\D', '', 'g') AS tel
    FROM pronimerp.clientes
   WHERE deleted_at IS NULL
     AND length(regexp_replace(COALESCE(telefono,''), '\D', '', 'g')) >= 6
   GROUP BY 1
  HAVING count(*) > 1
)
SELECT count(DISTINCT c.id) AS fichas_duplicadas_con_credito
  FROM pronimerp.clientes c
  JOIN dup ON dup.tel = regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g')
 WHERE c.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
      WHERE m.cliente_id = c.id
   );

-- 6) Cuántos clientes tienen actividad real (compraron o trajeron prendas).
--    El tablero muestra 19 porque cuenta los del PERÍODO, no todos.
SELECT count(DISTINCT cliente_id) AS con_ventas FROM pronimerp.ventas WHERE cliente_id IS NOT NULL;
SELECT count(DISTINCT cliente_id) AS con_recepciones FROM pronimerp.cliente_recepciones WHERE cliente_id IS NOT NULL;
