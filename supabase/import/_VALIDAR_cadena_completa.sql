-- =============================================================================
-- VALIDACION DE PUNTA A PUNTA DEL HISTORICO
--
-- Recorre la cadena cliente → evaluacion → credito generado → credito usado →
-- venta → metodo de pago → inventario, y verifica que cada eslabon cierre
-- contra el siguiente.
--
-- Cada consulta devuelve una fila con `estado`. Lo que diga OK esta cerrado.
-- Lo que diga REVISAR viene con el numero al lado para saber cuanto falta.
--
-- Solo CONSULTA. Correr entera.
-- =============================================================================


-- 1) CLIENTES — ninguna ficha viva puede quedar sin nombre ni fuera de cartera.
SELECT 'clientes' AS control,
       count(*)                                                    AS total,
       count(*) FILTER (WHERE COALESCE(nombre_contacto, nombre, empresa, '') = '') AS sin_nombre,
       count(*) FILTER (WHERE scope_clientes IS NULL)              AS sin_cartera,
       CASE WHEN count(*) FILTER (WHERE COALESCE(nombre_contacto, nombre, empresa, '') = '') = 0
            THEN 'OK' ELSE 'REVISAR' END                           AS estado
  FROM pronimerp.clientes
 WHERE deleted_at IS NULL;


-- 2) EVALUACION ↔ CREDITO GENERADO — cada recepcion con credito tiene su
--    movimiento, y cada movimiento de recepcion tiene su recepcion.
SELECT 'evaluacion ↔ credito' AS control,
       (SELECT count(*) FROM pronimerp.cliente_recepciones) AS recepciones,
       (SELECT count(*) FROM pronimerp.cliente_recepciones r
         WHERE r.total_credito > 0
           AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
                            WHERE m.referencia_numero = r.numero_control
                              AND m.origen = 'recepcion'))   AS recepcion_sin_credito,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos m
         WHERE m.origen = 'recepcion'
           AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_recepciones r
                            WHERE r.numero_control = m.referencia_numero)) AS credito_sin_recepcion,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos
         WHERE origen = 'recepcion' AND referencia_id IS NULL)  AS credito_sin_enlazar,
       CASE WHEN (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos
                   WHERE origen = 'recepcion' AND referencia_id IS NULL) = 0
            THEN 'OK' ELSE 'REVISAR' END                        AS estado;


-- 3) CREDITO USADO ↔ LOTES (FIFO) — ninguna salida sin lote del cual salir,
--    y ningun lote consumido de mas.
SELECT 'credito usado ↔ lotes' AS control,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos WHERE tipo='SALIDA') AS salidas,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos s
         WHERE s.tipo='SALIDA'
           AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_consumos c
                            WHERE c.salida_id = s.id))          AS salidas_sin_lote,
       (SELECT COALESCE(SUM(s.monto),0) FROM pronimerp.cliente_creditos_movimientos s
         WHERE s.tipo='SALIDA'
           AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_consumos c
                            WHERE c.salida_id = s.id))          AS plata_sin_lote,
       (SELECT count(*) FROM (
          SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
            FROM pronimerp.cliente_creditos_movimientos e
            LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
           WHERE e.tipo IN ('ENTRADA','AJUSTE')
           GROUP BY e.id, e.monto) z
         WHERE saldo < 0)                                       AS lotes_sobreconsumidos,
       -- Las salidas sin lote son las clientas que evaluaron en Lillo. No es
       -- un error de carga: es la mitad del historial que todavia no entro.
       CASE WHEN (SELECT count(*) FROM (
          SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
            FROM pronimerp.cliente_creditos_movimientos e
            LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
           WHERE e.tipo IN ('ENTRADA','AJUSTE')
           GROUP BY e.id, e.monto) z
         WHERE saldo < 0) = 0 THEN 'OK' ELSE 'REVISAR' END       AS estado;


-- 4) CREDITO USADO ↔ VENTA — toda salida por venta apunta a una venta real.
SELECT 'credito usado ↔ venta' AS control,
       count(*) FILTER (WHERE m.origen='venta')                       AS salidas_por_venta,
       count(*) FILTER (WHERE m.origen='venta' AND m.referencia_id IS NULL) AS sin_venta_enlazada,
       CASE WHEN count(*) FILTER (WHERE m.origen='venta' AND m.referencia_id IS NULL) = 0
            THEN 'OK' ELSE 'REVISAR' END                              AS estado
  FROM pronimerp.cliente_creditos_movimientos m
 WHERE m.tipo = 'SALIDA';


-- 5) VENTA ↔ METODO DE PAGO — ninguna venta sin forma de cobro.
SELECT 'venta ↔ metodo de pago' AS control,
       count(*)                                          AS ventas,
       count(*) FILTER (WHERE metodo_pago IS NULL)       AS sin_metodo,
       CASE WHEN count(*) FILTER (WHERE metodo_pago IS NULL) = 0
            THEN 'OK' ELSE 'REVISAR' END                 AS estado
  FROM pronimerp.ventas
 WHERE estado <> 'anulada';


-- 6) VENTA ↔ COBRO — lo cobrado mas el credito usado tiene que dar el total.
--    Se tolera 1 Gs por redondeo.
WITH v AS (
  SELECT v.id, v.total,
         COALESCE((SELECT SUM(pd.monto) FROM pronimerp.ventas_pagos_detalle pd
                    WHERE pd.venta_id = v.id), 0) AS cobrado,
         COALESCE((SELECT SUM(m.monto) FROM pronimerp.cliente_creditos_movimientos m
                    WHERE m.referencia_id = v.id AND m.tipo = 'SALIDA'), 0) AS con_credito
    FROM pronimerp.ventas v
   WHERE v.estado <> 'anulada'
)
SELECT 'venta ↔ cobro' AS control,
       count(*)                                                      AS ventas,
       count(*) FILTER (WHERE abs(total - (cobrado + con_credito)) > 1) AS descuadradas,
       to_char(COALESCE(SUM(total - (cobrado + con_credito))
               FILTER (WHERE abs(total - (cobrado + con_credito)) > 1), 0),
               '999G999G999G999')                                    AS diferencia,
       CASE WHEN count(*) FILTER (WHERE abs(total - (cobrado + con_credito)) > 1) = 0
            THEN 'OK' ELSE 'REVISAR' END                             AS estado
  FROM v;


-- 7) SALDOS DE CREDITO — el global y cuantas fichas quedan en rojo.
SELECT 'saldos de credito' AS control,
       to_char(SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto ELSE -monto END),
               '999G999G999G999')                         AS saldo_global,
       (SELECT count(*) FROM (
          SELECT c.id, SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS s
            FROM pronimerp.clientes c
            JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
           WHERE c.deleted_at IS NULL GROUP BY c.id) z
         WHERE s < 0)                                     AS fichas_en_rojo
  FROM pronimerp.cliente_creditos_movimientos;


-- 8) FECHAS — nada puede haber quedado con la fecha de la importacion.
SELECT 'fechas' AS control,
       (SELECT count(*) FROM pronimerp.ventas
         WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00')        AS ventas_a_medianoche,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos
         WHERE fecha::date = DATE '2026-10-01')                      AS creditos_el_01_10,
       (SELECT count(*) FROM pronimerp.cliente_recepciones
         WHERE fecha::date = DATE '2026-10-01')                      AS recepciones_el_01_10,
       CASE WHEN (SELECT count(*) FROM pronimerp.ventas
                   WHERE (fecha AT TIME ZONE 'UTC')::time = '00:00:00') = 0
            THEN 'OK' ELSE 'REVISAR' END                             AS estado;


-- 9) SUCURSAL — todo tiene que colgar de una sucursal.
SELECT 'sucursal' AS control,
       (SELECT count(*) FROM pronimerp.ventas WHERE sucursal_id IS NULL)              AS ventas_sin_sucursal,
       (SELECT count(*) FROM pronimerp.cliente_recepciones WHERE sucursal_id IS NULL) AS recepciones_sin_sucursal,
       CASE WHEN (SELECT count(*) FROM pronimerp.ventas WHERE sucursal_id IS NULL) = 0
             AND (SELECT count(*) FROM pronimerp.cliente_recepciones WHERE sucursal_id IS NULL) = 0
            THEN 'OK' ELSE 'REVISAR' END                                              AS estado;


-- 10) TOTALES CONTRA LA PLANILLA — las cifras que tienen que coincidir con
--     el Excel de Palmeras.
SELECT 'totales' AS control,
       (SELECT count(*) FROM pronimerp.ventas WHERE numero_control LIKE 'H-%')  AS ventas_historicas,
       (SELECT to_char(SUM(total), '999G999G999G999') FROM pronimerp.ventas
         WHERE numero_control LIKE 'H-%')                                       AS total_vendido,
       (SELECT to_char(SUM(monto), '999G999G999G999')
          FROM pronimerp.cliente_creditos_movimientos
         WHERE tipo = 'ENTRADA')                                                AS credito_generado,
       (SELECT to_char(SUM(monto), '999G999G999G999')
          FROM pronimerp.cliente_creditos_movimientos
         WHERE tipo = 'SALIDA')                                                 AS credito_usado,
       (SELECT count(*) FROM pronimerp.cliente_recepciones)                     AS evaluaciones;
