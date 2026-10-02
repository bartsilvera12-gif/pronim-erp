-- =============================================================================
-- IMPORTACION DEL DIARIO DE PALMERAS  ·  PASO 3: las recepciones que faltaron
--
-- QUE PASO
-- El paso 2 cargó el CRÉDITO que generó cada evaluación, pero nunca creó la
-- RECEPCIÓN en sí. Son dos cosas distintas en el ERP:
--
--   cliente_creditos_movimientos → el saldo a favor de la clienta  ✔ cargado
--   cliente_recepciones          → la evaluación como tal          ✘ faltó
--
-- Por eso quedaron vacías tres pantallas que leen de las recepciones:
--   · Explorar → Compras / Evaluaciones
--   · Clientes → filtro "Última transacción: Compra"
--   · La bandeja de pendientes de ingreso
--
-- Ningún monto está mal: falta el registro de la evaluación, no la plata.
--
-- QUE HACE ESTE ARCHIVO
-- Reconstruye una recepción por cada evaluación del Excel, con el mismo
-- número (FILA-nnnn) que ya usan los movimientos de crédito, así quedan
-- enlazados. Las que en la planilla no tienen monto de ingreso a stock
-- quedan como PENDIENTES DE INGRESAR, que es lo que eran.
--
-- Requiere que `pronimerp.import_palmeras` siga existiendo (la mesa de
-- trabajo del paso 1). Si ya la borraste, avisame y lo rehago desde los
-- movimientos de crédito.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee) — correr esto primero
-- ─────────────────────────────────────────────────────────────────────────

-- ¿Sigue estando la mesa de trabajo?
SELECT to_regclass('pronimerp.import_palmeras') AS tabla_staging,
       to_regclass('pronimerp.import_palmeras_clientes') AS tabla_puente;

-- Cuántas recepciones hay hoy (esperado: 0 o muy pocas).
SELECT count(*) AS recepciones_actuales FROM pronimerp.cliente_recepciones;

-- Cuántas se van a crear, y cuántas van a quedar pendientes de ingresar.
-- `estoque` es el monto que entró a stock: si es 0, la evaluación se registró
-- pero las prendas todavía no se ingresaron.
-- `se_quedan_afuera` son evaluaciones de monto 0: la tabla no las admite
-- (el CHECK exige un total mayor a cero). Si ese numero es grande, avisame.
SELECT count(*) FILTER (WHERE monto > 0)                          AS se_crean,
       count(*) FILTER (WHERE monto > 0 AND coalesce(estoque,0) = 0) AS quedan_pendientes,
       count(*) FILTER (WHERE monto > 0 AND coalesce(estoque,0) > 0) AS ya_ingresadas,
       count(*) FILTER (WHERE monto = 0)                          AS se_quedan_afuera,
       to_char(sum(coalesce(credito_generado,0)) FILTER (WHERE monto > 0),
               '999G999G999G999')                                 AS credito_total
  FROM (
    SELECT *, greatest(coalesce(evaluacion,0), coalesce(credito_generado,0)) AS monto
      FROM pronimerp.import_palmeras
     WHERE cliente_id IS NOT NULL
       AND (tipo = 'evaluacion' OR coalesce(credito_generado,0) > 0)
  ) x;


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

DO $rec$
DECLARE
  v_suc  uuid;
  v_emp  uuid;
  n      bigint;
  tiene_compra  boolean;
  tiene_ingreso boolean;
  tiene_eval    boolean;
  cols   text;
  vals   text;
BEGIN
  SELECT id, empresa_id INTO v_suc, v_emp
    FROM pronimerp.sucursales
   WHERE upper(nombre) LIKE '%PALMERA%'
   LIMIT 1;
  IF v_suc IS NULL THEN
    RAISE EXCEPTION 'No encontre la sucursal Palmeras. No se cargo nada.';
  END IF;

  IF to_regclass('pronimerp.import_palmeras') IS NULL THEN
    RAISE EXCEPTION 'Falta pronimerp.import_palmeras (la mesa de trabajo del paso 1).';
  END IF;

  -- Columnas que pueden no existir segun la version del schema.
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='cliente_recepciones'
                    AND column_name='total_compra')  INTO tiene_compra;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='cliente_recepciones'
                    AND column_name='ingresada_at') INTO tiene_ingreso;
  -- subtotal_evaluado / total_final son NOT NULL y el CHECK exige
  -- total_final = subtotal_evaluado + ajuste_evaluacion, con total_final > 0.
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='pronimerp' AND table_name='cliente_recepciones'
                    AND column_name='total_final')  INTO tiene_eval;

  cols := 'empresa_id, cliente_id, sucursal_id, numero_control, fecha, total_credito, estado, observaciones';
  vals := '$1, i.cliente_id, $2, ''FILA-'' || i.fila_excel, '
       || 'i.fecha::timestamptz + interval ''12 hours'', '
       || 'coalesce(i.credito_generado,0), ''registrada'', '
       || '''Evaluacion importada del diario de Palmeras (fila '' || i.fila_excel || '')''';

  -- El monto evaluado: lo que se le reconocio por las prendas. En el Excel
  -- casi siempre es la columna `evaluacion`; en las filas donde quedo en 0
  -- pero si hubo credito, el credito ES el monto reconocido.
  IF tiene_compra THEN
    cols := cols || ', total_compra';
    vals := vals || ', greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0))';
  END IF;

  IF tiene_eval THEN
    cols := cols || ', subtotal_evaluado, total_final, ajuste_evaluacion';
    vals := vals || ', greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0))'
                 || ', greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0))'
                 || ', 0';
  END IF;

  -- Pendiente de ingresar = la planilla no registro monto de ingreso a stock.
  IF tiene_ingreso THEN
    cols := cols || ', ingresada_at';
    vals := vals || ', CASE WHEN coalesce(i.estoque,0) > 0 '
                 || 'THEN i.fecha::timestamptz + interval ''12 hours'' ELSE NULL END';
  END IF;

  EXECUTE format($q$
    INSERT INTO pronimerp.cliente_recepciones (%s)
    SELECT %s
      FROM pronimerp.import_palmeras i
     WHERE i.cliente_id IS NOT NULL
       AND (i.tipo = 'evaluacion' OR coalesce(i.credito_generado,0) > 0)
       -- La tabla no admite una evaluacion de monto 0: el CHECK exige
       -- total_final > 0. Las filas en cero quedan afuera (ver control).
       AND greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0)) > 0
       AND NOT EXISTS (
         SELECT 1 FROM pronimerp.cliente_recepciones r
          WHERE r.empresa_id = $1 AND r.numero_control = 'FILA-' || i.fila_excel)
  $q$, cols, vals) USING v_emp, v_suc;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'recepciones creadas: %', n;
END
$rec$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
--  CONTROLES
-- ─────────────────────────────────────────────────────────────────────────

-- Total creado y cuántas quedaron pendientes de ingresar.
SELECT count(*)                                         AS recepciones,
       count(*) FILTER (WHERE ingresada_at IS NULL)     AS pendientes_de_ingreso,
       to_char(sum(total_credito), '999G999G999G999')   AS credito,
       min(fecha)::date AS desde, max(fecha)::date AS hasta
  FROM pronimerp.cliente_recepciones;

-- Cada recepción tiene que tener su movimiento de crédito, y al revés.
-- Las dos cifras tienen que dar 0.
SELECT (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos m
         WHERE m.origen = 'recepcion'
           AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_recepciones r
                            WHERE r.numero_control = m.referencia_numero)) AS creditos_sin_recepcion,
       (SELECT count(*) FROM pronimerp.cliente_recepciones r
         WHERE r.total_credito > 0
           AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
                            WHERE m.referencia_numero = r.numero_control
                              AND m.origen = 'recepcion'))                 AS recepciones_sin_credito;


-- =============================================================================
--  APARTE: por que hay ventas que figuran "Sin cliente"
--
--  En el Excel hay filas de venta sin nombre de clienta (venta de mostrador).
--  Esas entran sin ficha, y es correcto. Esto dice cuantas son, para saber si
--  es lo normal o si se perdio el nombre en la carga.
-- =============================================================================
SELECT count(*) FILTER (WHERE coalesce(cliente_clave,'') = '') AS ventas_sin_nombre_en_el_excel,
       count(*) FILTER (WHERE coalesce(cliente_clave,'') <> '') AS ventas_con_nombre,
       count(*)                                                 AS total_filas_venta
  FROM pronimerp.import_palmeras
 WHERE tipo = 'venta';

-- Y como quedo en el ERP. Los dos numeros de arriba y los de abajo tienen
-- que coincidir.
SELECT count(*) FILTER (WHERE cliente_id IS NULL)     AS ventas_sin_cliente,
       count(*) FILTER (WHERE cliente_id IS NOT NULL) AS ventas_con_cliente
  FROM pronimerp.ventas
 WHERE numero_control LIKE 'H-%';
