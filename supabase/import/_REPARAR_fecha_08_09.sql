-- =============================================================================
-- CORRIGE EL AÑO DE UN BLOQUE DE FILAS MAL FECHADAS
--
-- QUE PASO
-- En la planilla, las filas 3361 a 3392 — 32 filas seguidas — tienen fecha
-- 08/09/2026, pero estan ubicadas entre la fila 3360 (06/09/2025) y la 3393
-- (09/09/2025). El diario esta en orden cronologico, asi que su fecha real
-- es 08/09/2025: se escribio 2026 donde iba 2025 y se arrastro el valor.
--
-- Por eso el ERP mostraba 71 operaciones el 08/09/2026 y la planilla del dia
-- solo 39. Las 39 son las correctas (filas 15000 en adelante, venta
-- 5.416.000). Las otras 32 son de un año antes (venta 4.485.000).
--
-- NO SE BORRA NADA. Se corrige la fecha en la mesa de trabajo y en todo lo
-- que se genero a partir de esas filas: ventas, recepciones, movimientos de
-- credito. Despues se reconstruyen las cajas de los dos dias y el FIFO.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee)
-- ─────────────────────────────────────────────────────────────────────────

-- Las 32 filas a corregir, y el corte limpio contra las que se quedan.
SELECT CASE WHEN fila_excel BETWEEN 3361 AND 3392 THEN 'se corrige a 2025-09-08'
            ELSE 'queda en 2026-09-08' END                      AS grupo,
       count(*)                                                 AS filas,
       min(fila_excel) || ' a ' || max(fila_excel)               AS rango_filas,
       to_char(sum(coalesce(venta,0)), '999G999G999')            AS venta,
       to_char(sum(coalesce(credito_generado,0)), '999G999G999') AS credito_generado
  FROM pronimerp.import_palmeras
 WHERE fecha = DATE '2026-09-08'
 GROUP BY 1;

-- Los vecinos, que son los que prueban cual es la fecha real.
SELECT fila_excel, fecha, cliente_nombre
  FROM pronimerp.import_palmeras
 WHERE fila_excel BETWEEN 3357 AND 3396
 ORDER BY fila_excel;

-- Que hay hoy en el 08/09/2025: tiene que estar vacio, porque ese dia
-- entero es justamente el bloque mal fechado.
SELECT count(*) AS filas_ya_en_2025_09_08
  FROM pronimerp.import_palmeras WHERE fecha = DATE '2025-09-08';


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

DO $fix$
DECLARE
  v_suc   uuid;
  v_emp   uuid;
  v_punto uuid;
  n       bigint;
  d       date;
BEGIN
  SELECT id, empresa_id INTO v_suc, v_emp
    FROM pronimerp.sucursales WHERE upper(nombre) LIKE '%PALMERA%' LIMIT 1;
  IF v_suc IS NULL THEN RAISE EXCEPTION 'No encontre la sucursal Palmeras.'; END IF;

  -- Las filas afectadas, para no repetir el rango en cada UPDATE.
  CREATE TEMP TABLE _mal ON COMMIT DROP AS
  SELECT fila_excel,
         'H-' || lpad(fila_excel::text, 6, '0') AS num_venta,
         'FILA-' || fila_excel                  AS num_recep
    FROM pronimerp.import_palmeras
   WHERE fecha = DATE '2026-09-08' AND fila_excel BETWEEN 3361 AND 3392;

  SELECT count(*) INTO n FROM _mal;
  RAISE NOTICE 'filas a corregir: %', n;
  IF n = 0 THEN RAISE EXCEPTION 'No hay filas para corregir. ¿Ya se corrigio?'; END IF;

  -- 1) La mesa de trabajo.
  UPDATE pronimerp.import_palmeras
     SET fecha = DATE '2025-09-08'
   WHERE fila_excel IN (SELECT fila_excel FROM _mal);

  -- 2) Ventas. Mediodia, para que el dia no se corra en ningun huso.
  UPDATE pronimerp.ventas v
     SET fecha = DATE '2025-09-08' + interval '12 hours'
    FROM _mal m
   WHERE v.empresa_id = v_emp AND v.numero_control = m.num_venta;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  ventas: %', n;

  -- 3) Recepciones.
  UPDATE pronimerp.cliente_recepciones r
     SET fecha = DATE '2025-09-08' + interval '12 hours',
         ingresada_at = CASE WHEN r.ingresada_at IS NULL THEN NULL
                             ELSE DATE '2025-09-08' + interval '12 hours' END
    FROM _mal m
   WHERE r.empresa_id = v_emp AND r.numero_control = m.num_recep;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  recepciones: %', n;

  -- 4) Movimientos de credito, los dos sentidos. La observacion lleva la
  --    fecha escrita, asi que tambien se corrige el texto.
  UPDATE pronimerp.cliente_creditos_movimientos cm
     SET fecha = DATE '2025-09-08' + interval '12 hours',
         observaciones = replace(coalesce(cm.observaciones,''), '08/09/2026', '08/09/2025')
    FROM _mal m
   WHERE cm.empresa_id = v_emp
     AND (cm.referencia_numero = m.num_venta OR cm.referencia_numero = m.num_recep);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  movimientos de credito: %', n;

  -- 5) Cajas de los dos dias. Se rehacen desde los pagos, que es la fuente.
  FOREACH d IN ARRAY ARRAY[DATE '2026-09-08', DATE '2025-09-08'] LOOP
    -- La caja del dia, creada por la importacion. Si no existe y hubo
    -- efectivo, se crea.
    IF NOT EXISTS (
      SELECT 1 FROM pronimerp.cajas c
       WHERE c.empresa_id = v_emp AND c.sucursal_id = v_suc
         AND (c.fecha_apertura AT TIME ZONE 'UTC')::date = d
         AND c.observacion_apertura = 'Caja reconstruida del diario de Palmeras'
    ) THEN
      SELECT id INTO v_punto FROM pronimerp.puntos_caja
       WHERE sucursal_id = v_suc ORDER BY orden NULLS LAST LIMIT 1;
      INSERT INTO pronimerp.cajas (
        empresa_id, sucursal_id, punto_caja_id, numero_caja, estado,
        fecha_apertura, fecha_cierre, monto_apertura,
        monto_cierre_contado, monto_esperado_efectivo, diferencia, observacion_apertura)
      VALUES (
        v_emp, v_suc, v_punto,
        coalesce((SELECT max(numero_caja) FROM pronimerp.cajas WHERE sucursal_id = v_suc), 0) + 1,
        'cerrada', d::timestamptz, (d + 1)::timestamptz,
        0, 0, 0, 0, 'Caja reconstruida del diario de Palmeras');
    END IF;

    -- Los pagos en efectivo de ese dia pasan a la caja de ese dia.
    UPDATE pronimerp.ventas_pagos_detalle pd
       SET caja_id = (SELECT c.id FROM pronimerp.cajas c
                       WHERE c.empresa_id = v_emp AND c.sucursal_id = v_suc
                         AND (c.fecha_apertura AT TIME ZONE 'UTC')::date = d
                         AND c.observacion_apertura = 'Caja reconstruida del diario de Palmeras'
                       LIMIT 1)
      FROM pronimerp.ventas v
     WHERE pd.venta_id = v.id AND pd.metodo_pago = 'efectivo'
       AND v.empresa_id = v_emp AND v.numero_control LIKE 'H-%'
       AND (v.fecha AT TIME ZONE 'UTC')::date = d;

    -- Y la venta apunta a esa misma caja.
    UPDATE pronimerp.ventas v
       SET caja_id = (SELECT c.id FROM pronimerp.cajas c
                       WHERE c.empresa_id = v_emp AND c.sucursal_id = v_suc
                         AND (c.fecha_apertura AT TIME ZONE 'UTC')::date = d
                         AND c.observacion_apertura = 'Caja reconstruida del diario de Palmeras'
                       LIMIT 1)
     WHERE v.empresa_id = v_emp AND v.numero_control LIKE 'H-%'
       AND (v.fecha AT TIME ZONE 'UTC')::date = d;
  END LOOP;

  -- El arqueo de las dos cajas, recalculado desde los pagos.
  UPDATE pronimerp.cajas c
     SET monto_esperado_efectivo = e.efectivo,
         monto_cierre_contado    = e.efectivo,
         diferencia              = 0
    FROM (
      SELECT pd.caja_id, COALESCE(SUM(pd.monto), 0) AS efectivo
        FROM pronimerp.ventas_pagos_detalle pd
       WHERE pd.metodo_pago = 'efectivo' AND pd.caja_id IS NOT NULL
       GROUP BY pd.caja_id
    ) e
   WHERE c.id = e.caja_id
     AND (c.fecha_apertura AT TIME ZONE 'UTC')::date IN (DATE '2026-09-08', DATE '2025-09-08');
END
$fix$;

-- 6) FIFO de toda la base: mover 32 operaciones un año atras cambia el orden
--    en que se consumieron los lotes de esas clientas.
DELETE FROM pronimerp.cliente_creditos_consumos;

DO $fifo$
DECLARE r_s RECORD; r_e RECORD; resto numeric; aplica numeric;
BEGIN
  FOR r_s IN
    SELECT s.id, s.empresa_id, s.cliente_id, s.monto, s.fecha
      FROM pronimerp.cliente_creditos_movimientos s
     WHERE s.tipo = 'SALIDA'
     ORDER BY s.cliente_id, s.fecha, s.created_at
  LOOP
    resto := r_s.monto;
    FOR r_e IN
      SELECT e.id, e.monto - COALESCE((SELECT SUM(c.monto_aplicado)
               FROM pronimerp.cliente_creditos_consumos c WHERE c.entrada_id = e.id),0) AS saldo
        FROM pronimerp.cliente_creditos_movimientos e
       WHERE e.cliente_id = r_s.cliente_id AND e.empresa_id = r_s.empresa_id
         AND e.tipo IN ('ENTRADA','AJUSTE') AND e.fecha <= r_s.fecha
       ORDER BY e.fecha, e.created_at
    LOOP
      EXIT WHEN resto <= 0;
      CONTINUE WHEN r_e.saldo <= 0;
      aplica := LEAST(r_e.saldo, resto);
      INSERT INTO pronimerp.cliente_creditos_consumos (empresa_id, entrada_id, salida_id, monto_aplicado)
      VALUES (r_s.empresa_id, r_e.id, r_s.id, aplica);
      resto := resto - aplica;
    END LOOP;
  END LOOP;
END
$fifo$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
--  CONTROLES
-- ─────────────────────────────────────────────────────────────────────────

-- Los dos dias. El 08/09/2026 tiene que quedar en 39 operaciones y
-- 5.416.000 de venta, que es lo que muestra la planilla.
SELECT (v.fecha AT TIME ZONE 'UTC')::date AS dia,
       count(*) AS ventas,
       to_char(sum(v.total), '999G999G999') AS total
  FROM pronimerp.ventas v
 WHERE v.numero_control LIKE 'H-%'
   AND (v.fecha AT TIME ZONE 'UTC')::date IN (DATE '2025-09-08', DATE '2026-09-08')
 GROUP BY 1 ORDER BY 1;

-- Recepciones y movimientos de credito de los dos dias.
SELECT fecha::date AS dia, count(*) AS recepciones
  FROM pronimerp.cliente_recepciones
 WHERE fecha::date IN (DATE '2025-09-08', DATE '2026-09-08')
 GROUP BY 1 ORDER BY 1;

SELECT fecha::date AS dia, tipo, count(*), to_char(sum(monto), '999G999G999') AS monto
  FROM pronimerp.cliente_creditos_movimientos
 WHERE fecha::date IN (DATE '2025-09-08', DATE '2026-09-08')
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Ningun lote consumido de mas. Tiene que dar 0.
SELECT count(*) AS lotes_sobreconsumidos
  FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
          FROM pronimerp.cliente_creditos_movimientos e
          LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
         WHERE e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id, e.monto) z
 WHERE saldo < 0;

-- El agujero global, para comparar contra el valor conocido.
SELECT count(*) AS fichas_en_rojo, to_char(SUM(s), '999G999G999G999') AS suma
  FROM (SELECT c.id, SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS s
          FROM pronimerp.clientes c
          JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
         WHERE c.deleted_at IS NULL GROUP BY c.id) z
 WHERE s < 0;
