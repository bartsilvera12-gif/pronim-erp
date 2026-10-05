-- =============================================================================
-- IMPORTACION DEL DIARIO DE PALMERAS  ·  PASO 5: el metodo de pago que falto
--
-- POR QUE HAY VENTAS "SIN METODO DE PAGO"
--
-- Al importar, el metodo salia de las columnas de dinero del Excel:
--   tarjeta_in > 0  → tarjeta
--   transf_in  > 0  → transferencia
--   efectivo_in > 0 → efectivo
--   si no      → NULL
--
-- El credito quedo fuera de esa lista. Una venta pagada ENTERA con credito
-- no movio ninguna de esas tres columnas, asi que se guardo sin metodo. Es
-- el caso de Ariana Olmedo.
--
-- Tampoco quedo marcado "mixto" cuando se combinaron dos o mas formas.
--
-- Este archivo completa el metodo mirando otra vez las columnas del Excel:
--   . una sola forma de pago → esa
--   . dos o mas             → mixto
--   . solo credito          → credito
--
-- Ningun monto cambia: se completa una etiqueta que quedo vacia o incompleta.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee)
-- ─────────────────────────────────────────────────────────────────────────

-- Como estan hoy las ventas historicas.
SELECT COALESCE(metodo_pago, '(sin metodo)') AS metodo, count(*) AS ventas
  FROM pronimerp.ventas
 WHERE numero_control LIKE 'H-%'
 GROUP BY 1 ORDER BY 2 DESC;

-- Como van a quedar. `formas` es cuantos medios distintos uso esa venta.
SELECT metodo_nuevo, count(*) AS ventas
  FROM (
    SELECT CASE
             WHEN formas > 1                          THEN 'mixto'
             WHEN coalesce(i.efectivo_in,0)  > 0      THEN 'efectivo'
             WHEN coalesce(i.transf_in,0)    > 0      THEN 'transferencia'
             WHEN coalesce(i.tarjeta_in,0)   > 0      THEN 'tarjeta'
             WHEN coalesce(i.credito_utilizado,0) > 0 THEN 'credito'
             ELSE NULL
           END AS metodo_nuevo
      FROM pronimerp.import_palmeras i
      CROSS JOIN LATERAL (
        SELECT (CASE WHEN coalesce(i.efectivo_in,0)       > 0 THEN 1 ELSE 0 END)
             + (CASE WHEN coalesce(i.transf_in,0)         > 0 THEN 1 ELSE 0 END)
             + (CASE WHEN coalesce(i.tarjeta_in,0)        > 0 THEN 1 ELSE 0 END)
             + (CASE WHEN coalesce(i.credito_utilizado,0) > 0 THEN 1 ELSE 0 END) AS formas
      ) f
     WHERE i.tipo = 'venta'
  ) x
 GROUP BY 1 ORDER BY 2 DESC;


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- La tabla puede tener un CHECK viejo que solo admite efectivo/tarjeta/
-- transferencia. Si existe y no contempla credito ni mixto, se amplia.
DO $chk$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class t ON t.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'pronimerp' AND t.relname = 'ventas'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%metodo_pago%'
  LOOP
    IF c.def NOT ILIKE '%credito%' OR c.def NOT ILIKE '%mixto%' THEN
      EXECUTE format('ALTER TABLE pronimerp.ventas DROP CONSTRAINT %I', c.conname);
      RAISE NOTICE 'CHECK ampliado: %', c.conname;
    END IF;
  END LOOP;

  ALTER TABLE pronimerp.ventas
    DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
  ALTER TABLE pronimerp.ventas
    ADD  CONSTRAINT ventas_metodo_pago_check
    CHECK (metodo_pago IS NULL OR metodo_pago IN
           ('efectivo','tarjeta','transferencia','credito','mixto','otro'));
END
$chk$;

UPDATE pronimerp.ventas v
   SET metodo_pago = CASE
         WHEN f.formas > 1                          THEN 'mixto'
         WHEN coalesce(i.efectivo_in,0)  > 0        THEN 'efectivo'
         WHEN coalesce(i.transf_in,0)    > 0        THEN 'transferencia'
         WHEN coalesce(i.tarjeta_in,0)   > 0        THEN 'tarjeta'
         WHEN coalesce(i.credito_utilizado,0) > 0   THEN 'credito'
         ELSE v.metodo_pago
       END
  FROM pronimerp.import_palmeras i
  CROSS JOIN LATERAL (
    SELECT (CASE WHEN coalesce(i.efectivo_in,0)       > 0 THEN 1 ELSE 0 END)
         + (CASE WHEN coalesce(i.transf_in,0)         > 0 THEN 1 ELSE 0 END)
         + (CASE WHEN coalesce(i.tarjeta_in,0)        > 0 THEN 1 ELSE 0 END)
         + (CASE WHEN coalesce(i.credito_utilizado,0) > 0 THEN 1 ELSE 0 END) AS formas
  ) f
 WHERE i.venta_id = v.id
   AND i.tipo = 'venta';

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
--  CONTROL
-- ─────────────────────────────────────────────────────────────────────────

-- Lo que siga "(sin metodo)" son ventas que en el Excel no tienen ninguna
-- columna de dinero: cortesias o canjes. Tiene que ser un numero chico.
SELECT COALESCE(metodo_pago, '(sin metodo)') AS metodo, count(*) AS ventas,
       to_char(sum(total), '999G999G999G999') AS monto
  FROM pronimerp.ventas
 WHERE numero_control LIKE 'H-%'
 GROUP BY 1 ORDER BY 2 DESC;

-- El caso que marco la clienta.
SELECT v.numero_control, v.fecha::date, v.total, v.metodo_pago
  FROM pronimerp.ventas v
  JOIN pronimerp.clientes c ON c.id = v.cliente_id
 WHERE c.nombre_contacto ILIKE '%Ariana Olmedo%'
 ORDER BY v.fecha;
