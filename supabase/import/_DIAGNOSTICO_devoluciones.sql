-- =============================================================================
-- ¿QUE PASO CON LAS DEVOLUCIONES DE LA PLANILLA?
--
-- La mesa de trabajo tiene una columna `devolucion` y un tipo de fila
-- 'devolucion'. El importador NO las proceso como tales: solo creo
--
--   . ventas             cuando tipo = 'venta'
--   . credito ENTRADA    cuando credito_generado > 0   (sin mirar el tipo)
--   . credito SALIDA     cuando credito_utilizado > 0  (sin mirar el tipo)
--
-- Entonces, si en el Excel una devolucion se anoto con su credito en la
-- columna `credito_generado`, el saldo entro igual y esta bien. Pero si se
-- anoto SOLO en la columna `devolucion`, no genero nada: la clienta devolvio
-- ropa, uso ese saldo despues, y el sistema ve el gasto sin la entrada.
--
-- Esta consulta separa un caso del otro con numeros, y despues sigue el caso
-- puntual de Adi Barrios de punta a punta.
--
-- Solo CONSULTA.
-- =============================================================================


-- 1) EL TAMAÑO DEL TEMA. `sin_credito` son las que no generaron nada.
SELECT count(*)                                                          AS filas_con_devolucion,
       to_char(sum(devolucion), '999G999G999G999')                       AS monto_devuelto,
       count(*) FILTER (WHERE coalesce(credito_generado,0) > 0)          AS con_credito,
       count(*) FILTER (WHERE coalesce(credito_generado,0) = 0)          AS sin_credito,
       to_char(sum(devolucion) FILTER (WHERE coalesce(credito_generado,0) = 0),
               '999G999G999G999')                                        AS monto_sin_credito
  FROM pronimerp.import_palmeras
 WHERE coalesce(devolucion,0) > 0;


-- 2) LO MISMO MIRANDO EL TIPO DE FILA, por si la devolucion se anoto en otra
--    columna y lo unico que la identifica es el tipo.
SELECT tipo,
       count(*)                                              AS filas,
       to_char(sum(coalesce(devolucion,0)),       '999G999G999G999') AS devolucion,
       to_char(sum(coalesce(venta,0)),            '999G999G999G999') AS venta,
       to_char(sum(coalesce(credito_generado,0)), '999G999G999G999') AS credito_generado,
       to_char(sum(coalesce(credito_utilizado,0)),'999G999G999G999') AS credito_usado
  FROM pronimerp.import_palmeras
 GROUP BY tipo
 ORDER BY filas DESC;


-- 3) ADI BARRIOS EN LA PLANILLA — todas sus filas, tal como vinieron.
SELECT fila_excel, fecha, tipo, cliente_nombre,
       venta, evaluacion, devolucion, prendas, estoque,
       efectivo_in, efectivo_out, credito_generado, credito_utilizado
  FROM pronimerp.import_palmeras
 WHERE cliente_nombre ILIKE '%Adi Barrios%'
    OR cliente_nombre ILIKE '%Ada Barrios%'
 ORDER BY fecha, fila_excel;


-- 4) ADI BARRIOS EN EL SISTEMA — que quedo cargado de todo eso.
SELECT m.fecha::date, m.tipo, m.origen, m.monto,
       m.referencia_numero, m.observaciones,
       c.nombre_contacto AS ficha
  FROM pronimerp.cliente_creditos_movimientos m
  JOIN pronimerp.clientes c ON c.id = m.cliente_id
 WHERE c.nombre_contacto ILIKE '%Adi Barrios%'
    OR c.nombre_contacto ILIKE '%Ada Barrios%'
 ORDER BY m.fecha, m.created_at;


-- 5) LA TRAZABILIDAD: de que lote salio cada peso que uso.
--    Si una salida no aparece acá, es que no tuvo lote del cual descontarse.
SELECT sal.fecha::date  AS uso_fecha,
       sal.monto        AS uso_monto,
       sal.referencia_numero AS uso_en,
       ent.fecha::date  AS lote_fecha,
       ent.referencia_numero AS lote,
       con.monto_aplicado
  FROM pronimerp.cliente_creditos_movimientos sal
  JOIN pronimerp.clientes c ON c.id = sal.cliente_id
  LEFT JOIN pronimerp.cliente_creditos_consumos con ON con.salida_id = sal.id
  LEFT JOIN pronimerp.cliente_creditos_movimientos ent ON ent.id = con.entrada_id
 WHERE sal.tipo = 'SALIDA'
   AND (c.nombre_contacto ILIKE '%Adi Barrios%' OR c.nombre_contacto ILIKE '%Ada Barrios%')
 ORDER BY sal.fecha;


-- 6) EL SALDO DE CADA FICHA, para cerrar.
SELECT c.nombre_contacto, c.telefono,
       to_char(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END),
               '999G999G999') AS saldo,
       count(*) AS movimientos
  FROM pronimerp.clientes c
  JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
 WHERE c.deleted_at IS NULL
   AND (c.nombre_contacto ILIKE '%Adi Barrios%' OR c.nombre_contacto ILIKE '%Ada Barrios%')
 GROUP BY c.id, c.nombre_contacto, c.telefono;
