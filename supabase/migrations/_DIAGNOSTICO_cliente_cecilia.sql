-- ============================================================================
--  Qué hay REALMENTE guardado de un cliente.
--
--  Sirve para separar dos cosas que se confunden:
--    · si el dato está mal GUARDADO  → lo trajo así la importación
--    · si está bien guardado y se ve mal → es la pantalla
--
--  Solo CONSULTA. Cambiá el nombre si querés mirar otro cliente.
-- ============================================================================

\set nombre_buscado 'Cecilia'

-- 1) Las fichas que coinciden con ese nombre. Si sale más de una, el cliente
--    está duplicado y su historial está repartido.
SELECT id, nombre_contacto, nombre, empresa, telefono, ruc,
       scope_clientes, origen, created_at
  FROM pronimerp.clientes
 WHERE deleted_at IS NULL
   AND (nombre_contacto ILIKE '%Cecilia%' OR nombre ILIKE '%Cecilia%' OR empresa ILIKE '%Cecilia%')
 ORDER BY created_at;

-- 2) VENTAS del cliente, con la fecha cruda y cómo se ve.
--    Si `fecha_guardada` y `se_ve_como` coinciden, el dato está bien y el
--    problema era de pantalla (ya corregido).
SELECT v.numero_control,
       v.fecha                       AS fecha_guardada,
       v.fecha::date                 AS solo_fecha,
       to_char(v.fecha, 'DD/MM/YYYY HH24:MI') AS se_ve_como,
       v.total, v.estado
  FROM pronimerp.ventas v
  JOIN pronimerp.clientes c ON c.id = v.cliente_id
 WHERE c.nombre_contacto ILIKE '%Cecilia%' OR c.nombre ILIKE '%Cecilia%'
 ORDER BY v.fecha;

-- 3) RECEPCIONES (lo que el cliente trae). Acá es donde ella ve todas con
--    fecha 01/10: si `fecha` sale igual para todas, la importación no trajo
--    la fecha real y puso la del día de carga.
SELECT r.numero_control,
       r.fecha            AS fecha_guardada,
       r.created_at       AS cargado_el,
       r.estado,
       r.total_pagado
  FROM pronimerp.cliente_recepciones r
  JOIN pronimerp.clientes c ON c.id = r.cliente_id
 WHERE c.nombre_contacto ILIKE '%Cecilia%' OR c.nombre ILIKE '%Cecilia%'
 ORDER BY r.fecha;

-- 4) MOVIMIENTOS DE CRÉDITO: de dónde salió y en qué se usó cada guaraní.
--    El saldo es la suma de ENTRADA + AJUSTE menos SALIDA.
SELECT m.fecha, m.tipo, m.origen, m.monto, m.referencia_numero, m.observaciones
  FROM pronimerp.cliente_creditos_movimientos m
  JOIN pronimerp.clientes c ON c.id = m.cliente_id
 WHERE c.nombre_contacto ILIKE '%Cecilia%' OR c.nombre ILIKE '%Cecilia%'
 ORDER BY m.fecha, m.created_at;

-- 5) El saldo que calcula el sistema, para comparar contra el que ella espera.
SELECT c.nombre_contacto,
       SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo_credito
  FROM pronimerp.clientes c
  LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
 WHERE c.nombre_contacto ILIKE '%Cecilia%' OR c.nombre ILIKE '%Cecilia%'
 GROUP BY c.id, c.nombre_contacto;

-- 6) ¿Cuántas recepciones de TODA la base quedaron con la fecha de carga?
--    Si este número es grande, la importación perdió las fechas originales.
SELECT r.fecha::date AS fecha, count(*) AS recepciones
  FROM pronimerp.cliente_recepciones r
 GROUP BY 1
 ORDER BY recepciones DESC
 LIMIT 10;
