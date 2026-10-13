-- =============================================================================
-- IMPORTACION DE PALMERAS · PASO 6: el valor con que entro la ropa al stock
--
-- Con esto el markup del historico deja de ser un guion.
--
-- La planilla trae, por cada evaluacion, el valor con que esas prendas
-- ingresaron al stock (columna `estoque`). No dice QUE prendas eran, pero si
-- por cuanto entraron, que es lo que hace falta para el porcentaje:
--
--     Lujan Rivero: credito 210.000 · entro a stock por 782.000
--     markup = (782.000 - 210.000) / 210.000 = 272 %
--
-- Copia ese valor a cliente_recepciones.valor_venta_estimado. Cuando una
-- recepcion tiene detalle de prendas se sigue usando el detalle, que es
-- exacto; este numero es el respaldo para las que no lo tienen.
--
-- Solo se toman los `estoque` POSITIVOS: en las filas donde es negativo la
-- ropa salio, no entro, y ahi no corresponde.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- ⚠️ Requiere la migracion 20261013000000_recepcion_valor_stock.sql.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee)
-- ─────────────────────────────────────────────────────────────────────────

-- Cuantas recepciones van a quedar con valor de venta, y que markup promedio
-- da el conjunto. Si el promedio es absurdo (negativo, o miles por ciento),
-- frena y avisame.
SELECT count(*)                                                      AS recepciones,
       to_char(sum(i.estoque), '999G999G999G999')                    AS valor_en_vitrina,
       to_char(sum(r.total_credito), '999G999G999G999')              AS pagado,
       round(((sum(i.estoque) - sum(r.total_credito))
              / NULLIF(sum(r.total_credito),0) * 100)::numeric, 1)   AS markup_promedio_pct
  FROM pronimerp.cliente_recepciones r
  JOIN pronimerp.import_palmeras i
    ON r.numero_control = 'FILA-' || i.fila_excel
 WHERE coalesce(i.estoque,0) > 0;

-- El caso que menciono la clienta, para contrastar contra su planilla.
SELECT i.fila_excel, i.fecha, i.cliente_nombre,
       i.credito_generado AS credito, i.estoque AS entro_a_stock,
       round(((i.estoque - i.credito_generado)
              / NULLIF(i.credito_generado,0)::numeric * 100), 1) AS markup_pct
  FROM pronimerp.import_palmeras i
 WHERE i.cliente_nombre ILIKE '%Lujan Rivero%'
    OR i.cliente_nombre ILIKE '%Luján Rivero%'
 ORDER BY i.fecha;

-- Los diez markups mas altos, para revisar que no haya un dato disparatado.
SELECT i.fila_excel, i.fecha, i.cliente_nombre,
       i.credito_generado AS credito, i.estoque AS entro_a_stock,
       round(((i.estoque - i.credito_generado)
              / NULLIF(i.credito_generado,0)::numeric * 100), 1) AS markup_pct
  FROM pronimerp.import_palmeras i
 WHERE coalesce(i.estoque,0) > 0 AND coalesce(i.credito_generado,0) > 0
 ORDER BY (i.estoque::numeric / i.credito_generado) DESC
 LIMIT 10;


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE pronimerp.cliente_recepciones r
   SET valor_venta_estimado = i.estoque
  FROM pronimerp.import_palmeras i
 WHERE r.numero_control = 'FILA-' || i.fila_excel
   AND coalesce(i.estoque,0) > 0
   AND r.valor_venta_estimado IS NULL;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
--  CONTROL
-- ─────────────────────────────────────────────────────────────────────────

-- Cuantas quedaron con valor y cuantas sin el. Las que queden sin valor son
-- las evaluaciones que en la planilla no registraron ingreso a stock: son
-- las mismas que estan pendientes de ingresar, asi que esta bien que no
-- tengan markup todavia.
SELECT count(*)                                                AS recepciones,
       count(valor_venta_estimado)                             AS con_valor,
       count(*) - count(valor_venta_estimado)                  AS sin_valor,
       to_char(sum(valor_venta_estimado), '999G999G999G999')   AS valor_total
  FROM pronimerp.cliente_recepciones;
