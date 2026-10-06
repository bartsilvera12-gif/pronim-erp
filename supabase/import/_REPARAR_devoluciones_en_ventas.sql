-- =============================================================================
-- IMPORTACION DE PALMERAS · LAS DEVOLUCIONES DENTRO DE UNA VENTA
--
-- QUE PASA
-- Hay 137 filas de venta que ademas traen monto en la columna `devolucion`:
-- la clienta trajo ropa y la uso para pagar, total o parcialmente, esa misma
-- compra. Suman 9.542.007.
--
-- El importador solo miro `credito_utilizado`, asi que cargo el GASTO pero
-- nunca la ENTRADA que lo respaldaba. De ahi salen muchos de los saldos en
-- rojo. Cuatro casos donde el agujero es exactamente la devolucion:
--
--     Soledad Telles    devolvio 244.000   saldo −244.000
--     Nilda Ramos       devolvio 146.000   saldo −146.000
--     Melisa Chamorro   devolvio 137.000   saldo −137.000
--     Diego Mechetti    devolvio 126.000   saldo −126.000
--
-- Esos cuatro quedan en 0 al cargar la entrada que faltaba.
--
-- LA REGLA
-- Por cada fila de venta con devolucion > 0:
--
--   ENTRADA = devolucion
--       La ropa que trajo, tasada. Igual que una evaluacion.
--
--   SALIDA extra = lo que quedo sin cubrir de esa venta, hasta el tope de la
--       devolucion. `sin_cubrir` = venta − (efectivo + transferencia +
--       tarjeta + credito_utilizado). Cuando da 0, la venta ya estaba pagada
--       y no se agrega nada: alcanza con la entrada.
--
-- La regla sale de los datos: en casi todas las filas donde quedaba plata sin
-- cubrir, el faltante es EXACTAMENTE el monto devuelto — Sebastian Acosta
-- 280.000, Johana Bogado 200.000, Thayna Paulin 179.000, Monica Abente
-- 137.000, Maria Da Silva 117.000, Kiara Portillo 102.000.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- ⚠️ Correr DESPUES de _REPARAR_devoluciones.sql.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee) — mirá esto antes de ejecutar
-- ─────────────────────────────────────────────────────────────────────────

-- Resumen de lo que se va a crear.
WITH d AS (
  SELECT i.*,
         greatest(0, coalesce(i.venta,0)
                     - (coalesce(i.efectivo_in,0) + coalesce(i.transf_in,0)
                        + coalesce(i.tarjeta_in,0) + coalesce(i.credito_utilizado,0))) AS sin_cubrir
    FROM pronimerp.import_palmeras i
   WHERE i.tipo = 'venta' AND coalesce(i.devolucion,0) > 0 AND i.cliente_id IS NOT NULL
)
SELECT count(*)                                                   AS filas,
       to_char(sum(devolucion), '999G999G999G999')                AS entradas_a_crear,
       count(*) FILTER (WHERE sin_cubrir > 0)                     AS con_salida_extra,
       to_char(sum(least(devolucion, sin_cubrir)), '999G999G999G999') AS salidas_a_crear,
       to_char(sum(devolucion) - sum(least(devolucion, sin_cubrir)), '999G999G999G999') AS mejora_neta
  FROM d;

-- Cómo queda cada clienta hoy en rojo que esté afectada. `queda_en` tiene que
-- dar >= 0 en la mayoría; si alguna se va muy a positivo, avisame.
WITH d AS (
  SELECT i.cliente_id, i.devolucion,
         greatest(0, coalesce(i.venta,0)
                     - (coalesce(i.efectivo_in,0) + coalesce(i.transf_in,0)
                        + coalesce(i.tarjeta_in,0) + coalesce(i.credito_utilizado,0))) AS sin_cubrir
    FROM pronimerp.import_palmeras i
   WHERE i.tipo = 'venta' AND coalesce(i.devolucion,0) > 0 AND i.cliente_id IS NOT NULL
), ajuste AS (
  SELECT cliente_id, sum(devolucion - least(devolucion, sin_cubrir)) AS delta
    FROM d GROUP BY cliente_id
), saldo AS (
  SELECT c.id, COALESCE(c.nombre_contacto, c.nombre) AS nombre,
         SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS s
    FROM pronimerp.clientes c
    JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id, c.nombre_contacto, c.nombre
)
SELECT s.nombre, s.s AS saldo_hoy, a.delta, s.s + a.delta AS queda_en
  FROM saldo s JOIN ajuste a ON a.cliente_id = s.id
 WHERE s.s < 0
 ORDER BY s.s
 LIMIT 40;


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _dev ON COMMIT DROP AS
SELECT i.fila_excel, i.cliente_id, i.venta_id, i.fecha, i.devolucion,
       greatest(0, coalesce(i.venta,0)
                   - (coalesce(i.efectivo_in,0) + coalesce(i.transf_in,0)
                      + coalesce(i.tarjeta_in,0) + coalesce(i.credito_utilizado,0))) AS sin_cubrir
  FROM pronimerp.import_palmeras i
 WHERE i.tipo = 'venta'
   AND coalesce(i.devolucion,0) > 0
   AND i.cliente_id IS NOT NULL;

DO $dev$
DECLARE
  v_suc uuid;
  v_emp uuid;
  n     bigint;
BEGIN
  SELECT id, empresa_id INTO v_suc, v_emp
    FROM pronimerp.sucursales WHERE upper(nombre) LIKE '%PALMERA%' LIMIT 1;
  IF v_suc IS NULL THEN
    RAISE EXCEPTION 'No encontre la sucursal Palmeras. No se cargo nada.';
  END IF;

  -- 1) La entrada de crédito por la ropa devuelta.
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_tipo, referencia_numero, fecha, observaciones)
  SELECT v_emp, d.cliente_id, 'ENTRADA', d.devolucion, 'recepcion',
         'import', 'DEV-' || d.fila_excel,
         d.fecha::timestamptz + interval '12 hours',
         'Ropa devuelta el ' || to_char(d.fecha, 'DD/MM/YYYY')
    FROM _dev d
   WHERE NOT EXISTS (
     SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
      WHERE m.empresa_id = v_emp AND m.referencia_numero = 'DEV-' || d.fila_excel);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'entradas por devolucion: %', n;

  -- 2) La recepción, para que la devolución se vea en la ficha y en Explorar.
  INSERT INTO pronimerp.cliente_recepciones (
    empresa_id, cliente_id, sucursal_id, numero_control, fecha,
    total_credito, total_compra, subtotal_evaluado, total_final,
    ajuste_evaluacion, estado, ingresada_at, observaciones)
  SELECT v_emp, d.cliente_id, v_suc, 'DEV-' || d.fila_excel,
         d.fecha::timestamptz + interval '12 hours',
         d.devolucion, d.devolucion, d.devolucion, d.devolucion,
         0, 'ingresada', d.fecha::timestamptz + interval '12 hours',
         'Devolucion dentro de la venta (fila ' || d.fila_excel || ')'
    FROM _dev d
   WHERE NOT EXISTS (
     SELECT 1 FROM pronimerp.cliente_recepciones r
      WHERE r.empresa_id = v_emp AND r.numero_control = 'DEV-' || d.fila_excel);

  -- 3) Enlaza cada entrada con su recepción.
  UPDATE pronimerp.cliente_creditos_movimientos m
     SET referencia_id = r.id, referencia_tipo = 'recepcion'
    FROM pronimerp.cliente_recepciones r
   WHERE r.empresa_id = m.empresa_id
     AND r.numero_control = m.referencia_numero
     AND m.referencia_numero LIKE 'DEV-%'
     AND m.referencia_id IS NULL;

  -- 4) La parte de la venta que se pagó con la ropa devuelta y no figuraba
  --    en ninguna columna de pago.
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_id, referencia_tipo, referencia_numero, fecha, observaciones)
  SELECT v_emp, d.cliente_id, 'SALIDA', least(d.devolucion, d.sin_cubrir), 'venta',
         d.venta_id, 'venta', 'H-' || lpad(d.fila_excel::text, 6, '0'),
         d.fecha::timestamptz + interval '12 hours',
         'Pago con la ropa devuelta el ' || to_char(d.fecha, 'DD/MM/YYYY')
    FROM _dev d
   WHERE d.sin_cubrir > 0
     AND NOT EXISTS (
       SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
        WHERE m.empresa_id = v_emp
          AND m.referencia_numero = 'H-' || lpad(d.fila_excel::text, 6, '0')
          AND m.observaciones LIKE 'Pago con la ropa devuelta%');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'salidas por pago con devolucion: %', n;
END
$dev$;

-- 5) Rehace el FIFO con los lotes nuevos.
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

-- Los cuatro casos que tenían que quedar en 0.
SELECT COALESCE(c.nombre_contacto, c.nombre) AS cliente,
       SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo
  FROM pronimerp.clientes c
  JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
 WHERE c.deleted_at IS NULL
   AND (c.nombre_contacto ILIKE '%Soledad Telles%' OR c.nombre_contacto ILIKE '%Nilda Ramos%'
     OR c.nombre_contacto ILIKE '%Melisa Chamorro%' OR c.nombre_contacto ILIKE '%Diego Mechetti%')
 GROUP BY c.id, c.nombre_contacto, c.nombre
 ORDER BY 1;

-- Cuánto bajó el agujero.
SELECT count(*) AS fichas_en_rojo, to_char(SUM(s), '999G999G999G999') AS suma
  FROM (SELECT c.id, SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS s
          FROM pronimerp.clientes c
          JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
         WHERE c.deleted_at IS NULL GROUP BY c.id) z
 WHERE s < 0;

-- Ningún lote consumido de más. Tiene que dar 0.
SELECT count(*) AS lotes_sobreconsumidos
  FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
          FROM pronimerp.cliente_creditos_movimientos e
          LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
         WHERE e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id, e.monto) z
 WHERE saldo < 0;
