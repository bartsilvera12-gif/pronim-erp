-- =============================================================================
-- IMPORTACION DE PALMERAS · LAS DEVOLUCIONES SE CONTARON DOS VECES
--
-- QUE ENCONTRAMOS
-- En las 14 filas de tipo 'devolucion' el Excel anota el mismo monto en DOS
-- columnas: credito_generado y credito_utilizado. El importador tomó las dos
-- al pie de la letra y creó una ENTRADA y una SALIDA por el mismo importe.
--
-- La SALIDA no existe. En esas filas no hubo compra:
--   . la columna `venta` es 0 en las 14
--   . `prendas` y `estoque` son POSITIVOS: la ropa ENTRÓ, no salió nada
--
-- La prueba cuadra sola: las salidas de crédito que no apuntan a ninguna
-- venta suman 584.000, y las salidas de las filas de devolución suman
-- exactamente 584.000. Son las mismas ocho.
--
-- EL CASO DE ADI BARRIOS, PASO A PASO
--   28/01/2026  devolvió 3 prendas por 102.000  → se le generó el crédito
--               y en el mismo día se le descontó, sin que comprara nada
--   11/04/2026  compró 157.000: pagó 55.000 en efectivo y 102.000 con
--               crédito — justo el de la devolución
--
-- Hoy ese uso del 11/04 figura sin lote del cual salir, porque el lote lo
-- había consumido la salida fantasma de enero. Al borrarla, el crédito de la
-- devolución queda libre y el FIFO lo asigna a la compra de abril, que es
-- donde realmente se usó.
--
-- Su saldo pasa de −279.000 a −177.000. Lo que queda es de otro origen: su
-- primera operación, el 30/07/2025, ya fue una compra pagada con 177.000 de
-- crédito que nunca entró en esta planilla. Eso es lo de Lillo.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee)
-- ─────────────────────────────────────────────────────────────────────────

-- Las salidas que se van a borrar, una por una.
SELECT c.nombre_contacto AS cliente,
       m.fecha::date, m.monto, m.referencia_numero,
       i.devolucion, i.prendas, i.estoque, i.venta
  FROM pronimerp.cliente_creditos_movimientos m
  JOIN pronimerp.clientes c ON c.id = m.cliente_id
  JOIN pronimerp.import_palmeras i
    ON m.referencia_numero = 'H-' || lpad(i.fila_excel::text, 6, '0')
 WHERE m.tipo = 'SALIDA'
   AND i.tipo = 'devolucion'
 ORDER BY m.fecha;

-- Control: las 14 filas de devolución no tienen venta y la ropa entró.
-- `con_venta` tiene que dar 0 y `saco_ropa` también.
SELECT count(*)                                            AS filas_devolucion,
       count(*) FILTER (WHERE coalesce(venta,0) > 0)       AS con_venta,
       count(*) FILTER (WHERE coalesce(prendas,0) < 0)     AS saco_ropa,
       to_char(sum(coalesce(credito_generado,0)),  '999G999G999') AS genero,
       to_char(sum(coalesce(credito_utilizado,0)), '999G999G999') AS uso_fantasma
  FROM pronimerp.import_palmeras
 WHERE tipo = 'devolucion';


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1) Borra la salida fantasma. Los consumos FIFO que colgaban de ella se van
--    solos por la clave foránea, así que los lotes quedan libres otra vez.
DELETE FROM pronimerp.cliente_creditos_movimientos m
 USING pronimerp.import_palmeras i
 WHERE m.referencia_numero = 'H-' || lpad(i.fila_excel::text, 6, '0')
   AND m.tipo = 'SALIDA'
   AND i.tipo = 'devolucion';

-- 2) La entrada que quedó es una devolución, no una recepción de prendas
--    para evaluar. Que lo diga, para que la ficha se entienda.
UPDATE pronimerp.cliente_creditos_movimientos m
   SET observaciones = 'Devolucion de prendas el '
                       || to_char(i.fecha, 'DD/MM/YYYY')
  FROM pronimerp.import_palmeras i
 WHERE m.referencia_numero = 'FILA-' || i.fila_excel
   AND m.tipo = 'ENTRADA'
   AND i.tipo = 'devolucion';

UPDATE pronimerp.cliente_recepciones r
   SET observaciones = 'Devolucion de prendas importada del diario de Palmeras (fila '
                       || i.fila_excel || ')'
  FROM pronimerp.import_palmeras i
 WHERE r.numero_control = 'FILA-' || i.fila_excel
   AND i.tipo = 'devolucion';

-- 3) Rehace el enlace FIFO. Ahora el crédito de cada devolución queda libre
--    y se asigna a la compra donde realmente se usó.
DO $$
DECLARE
  r_salida  RECORD;
  r_entrada RECORD;
  restante  numeric;
  aplicar   numeric;
BEGIN
  FOR r_salida IN
    SELECT s.id, s.empresa_id, s.cliente_id, s.monto, s.fecha
      FROM pronimerp.cliente_creditos_movimientos s
     WHERE s.tipo = 'SALIDA'
       AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_consumos c
                        WHERE c.salida_id = s.id)
     ORDER BY s.cliente_id, s.fecha ASC, s.created_at ASC
  LOOP
    restante := r_salida.monto;
    FOR r_entrada IN
      SELECT e.id,
             e.monto - COALESCE((SELECT SUM(c.monto_aplicado)
                                   FROM pronimerp.cliente_creditos_consumos c
                                  WHERE c.entrada_id = e.id), 0) AS saldo
        FROM pronimerp.cliente_creditos_movimientos e
       WHERE e.cliente_id = r_salida.cliente_id
         AND e.empresa_id = r_salida.empresa_id
         AND e.tipo IN ('ENTRADA','AJUSTE')
         AND e.fecha <= r_salida.fecha
       ORDER BY e.fecha ASC, e.created_at ASC
    LOOP
      EXIT WHEN restante <= 0;
      CONTINUE WHEN r_entrada.saldo <= 0;
      aplicar := LEAST(r_entrada.saldo, restante);
      INSERT INTO pronimerp.cliente_creditos_consumos
             (empresa_id, entrada_id, salida_id, monto_aplicado)
      VALUES (r_salida.empresa_id, r_entrada.id, r_salida.id, aplicar);
      restante := restante - aplicar;
    END LOOP;
  END LOOP;
END $$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
--  CONTROLES
-- ─────────────────────────────────────────────────────────────────────────

-- Adi Barrios: de −279.000 tiene que pasar a −177.000, y la compra del
-- 11/04 tiene que aparecer consumiendo el lote del 28/01.
SELECT sal.fecha::date AS uso, sal.monto, sal.referencia_numero AS uso_en,
       ent.fecha::date AS lote, ent.referencia_numero AS lote_num, con.monto_aplicado
  FROM pronimerp.cliente_creditos_movimientos sal
  JOIN pronimerp.clientes c ON c.id = sal.cliente_id
  LEFT JOIN pronimerp.cliente_creditos_consumos con ON con.salida_id = sal.id
  LEFT JOIN pronimerp.cliente_creditos_movimientos ent ON ent.id = con.entrada_id
 WHERE sal.tipo = 'SALIDA' AND c.nombre_contacto ILIKE '%Adi Barrios%'
 ORDER BY sal.fecha;

-- Ninguna salida puede quedar sin apuntar a una venta. Tiene que dar 0.
SELECT count(*) AS salidas_sin_venta, COALESCE(SUM(monto),0) AS monto
  FROM pronimerp.cliente_creditos_movimientos
 WHERE tipo = 'SALIDA' AND referencia_id IS NULL;

-- Ningún lote consumido de más. Tiene que dar 0.
SELECT count(*) AS lotes_sobreconsumidos
  FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
          FROM pronimerp.cliente_creditos_movimientos e
          LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
         WHERE e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id, e.monto) z
 WHERE saldo < 0;

-- Cuánto mejoró el agujero global.
SELECT count(*) AS fichas_en_rojo, to_char(SUM(s), '999G999G999G999') AS suma
  FROM (SELECT c.id, SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS s
          FROM pronimerp.clientes c
          JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
         WHERE c.deleted_at IS NULL
         GROUP BY c.id) z
 WHERE s < 0;
