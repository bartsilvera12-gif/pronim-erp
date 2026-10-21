-- =============================================================================
-- RECARGAR UN DIA DEL DIARIO DE PALMERAS
--
-- Borra todo lo que la importacion creo para una fecha y lo vuelve a cargar
-- desde cero con los datos corregidos.
--
-- COMO SE USA
--   1. Correr el BLOQUE 1: crea `import_palmeras_fix`, la mesa de trabajo.
--   2. Cargar ahi las filas corregidas de ese dia (CSV por Table Editor, o
--      los INSERT que te paso aparte).
--   3. Correr el BLOQUE 2 de verificacion y mirar los numeros.
--   4. Correr el BLOQUE 3, que borra y recarga en una sola transaccion.
--
-- QUE SE BORRA de esa fecha, en este orden por las claves foraneas:
--   consumos FIFO → movimientos de credito → pagos → items → ventas
--   → items de recepcion → recepciones → la caja del dia
--
-- QUE NO SE TOCA
--   Las fichas de clientes. Si una clienta aparece solo ese dia, su ficha
--   queda igual; no se borra para no perder el resto de su historial.
--
-- POR QUE REHACE EL FIFO COMPLETO AL FINAL
--   Los lotes de credito de ese dia pueden haber sido consumidos por compras
--   de MESES posteriores. Al borrarlos, esas compras quedan sin lote. El
--   rearmado global los vuelve a enlazar con lo que corresponda.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  BLOQUE 1 · La mesa de trabajo
-- ─────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS pronimerp.import_palmeras_fix;

CREATE TABLE pronimerp.import_palmeras_fix (
  fila_excel        integer PRIMARY KEY,
  controle          integer,
  fecha             date,
  tipo              text,      -- venta | evaluacion | devolucion | ajuste_stock | otro
  cliente_nombre    text,
  cliente_clave     text,
  telefono          text,
  venta             bigint,
  evaluacion        bigint,
  devolucion        bigint,
  prendas           bigint,
  estoque           bigint,
  efectivo_in       bigint,
  efectivo_out      bigint,
  transf_in         bigint,
  transf_out        bigint,
  tarjeta_in        bigint,
  credito_generado  bigint,
  credito_utilizado bigint,
  descuento         bigint,
  cliente_id        uuid,
  venta_id          uuid
);


-- ─────────────────────────────────────────────────────────────────────────
--  BLOQUE 2 · Verificacion — correr DESPUES de cargar las filas
-- ─────────────────────────────────────────────────────────────────────────

-- Que trae la mesa de trabajo.
SELECT count(*) AS filas_nuevas,
       min(fecha) AS desde, max(fecha) AS hasta,
       to_char(sum(coalesce(venta,0)),            '999G999G999') AS venta,
       to_char(sum(coalesce(credito_generado,0)), '999G999G999') AS credito_generado,
       to_char(sum(coalesce(credito_utilizado,0)),'999G999G999') AS credito_usado
  FROM pronimerp.import_palmeras_fix;

-- Que hay hoy cargado de esa fecha, para comparar contra lo de arriba.
SELECT (SELECT count(*) FROM pronimerp.ventas v
         WHERE v.numero_control LIKE 'H-%'
           AND (v.fecha AT TIME ZONE 'UTC')::date = (SELECT min(fecha) FROM pronimerp.import_palmeras_fix)) AS ventas_hoy,
       (SELECT count(*) FROM pronimerp.cliente_recepciones r
         WHERE r.fecha::date = (SELECT min(fecha) FROM pronimerp.import_palmeras_fix)) AS recepciones_hoy,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos m
         WHERE m.fecha::date = (SELECT min(fecha) FROM pronimerp.import_palmeras_fix)) AS movimientos_hoy;

-- Todas las filas nuevas tienen que ser del MISMO dia. Si esto devuelve mas
-- de una fecha, frena: el script borra por fecha y borraria de mas.
SELECT fecha, count(*) FROM pronimerp.import_palmeras_fix GROUP BY fecha ORDER BY fecha;


-- ─────────────────────────────────────────────────────────────────────────
--  BLOQUE 3 · Borrar y recargar
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

DO $recarga$
DECLARE
  v_dia   date;
  v_suc   uuid;
  v_emp   uuid;
  v_scope text;
  v_punto uuid;
  v_caja  uuid;
  v_efec  bigint;
  n       bigint;
BEGIN
  SELECT min(fecha) INTO v_dia FROM pronimerp.import_palmeras_fix;
  IF v_dia IS NULL THEN
    RAISE EXCEPTION 'La mesa de trabajo esta vacia: cargá las filas corregidas primero.';
  END IF;
  IF (SELECT count(DISTINCT fecha) FROM pronimerp.import_palmeras_fix) > 1 THEN
    RAISE EXCEPTION 'Hay mas de una fecha en la mesa de trabajo. Este script recarga UN dia.';
  END IF;

  SELECT id, empresa_id, scope_clientes INTO v_suc, v_emp, v_scope
    FROM pronimerp.sucursales WHERE upper(nombre) LIKE '%PALMERA%' LIMIT 1;
  IF v_suc IS NULL THEN
    RAISE EXCEPTION 'No encontre la sucursal Palmeras.';
  END IF;

  RAISE NOTICE 'Recargando el dia %', v_dia;

  -- ── BORRAR ────────────────────────────────────────────────────────────
  -- Los consumos se van solos con los movimientos (clave foranea en
  -- cascada), pero se borran explicitos para que quede claro que pasa.
  DELETE FROM pronimerp.cliente_creditos_consumos c
   USING pronimerp.cliente_creditos_movimientos m
   WHERE (c.entrada_id = m.id OR c.salida_id = m.id)
     AND m.empresa_id = v_emp AND m.fecha::date = v_dia;

  DELETE FROM pronimerp.cliente_creditos_movimientos
   WHERE empresa_id = v_emp AND fecha::date = v_dia;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  movimientos de credito borrados: %', n;

  DELETE FROM pronimerp.ventas_pagos_detalle pd
   USING pronimerp.ventas v
   WHERE pd.venta_id = v.id AND v.empresa_id = v_emp
     AND v.numero_control LIKE 'H-%' AND (v.fecha AT TIME ZONE 'UTC')::date = v_dia;

  DELETE FROM pronimerp.ventas_items it
   USING pronimerp.ventas v
   WHERE it.venta_id = v.id AND v.empresa_id = v_emp
     AND v.numero_control LIKE 'H-%' AND (v.fecha AT TIME ZONE 'UTC')::date = v_dia;

  DELETE FROM pronimerp.ventas
   WHERE empresa_id = v_emp AND numero_control LIKE 'H-%'
     AND (fecha AT TIME ZONE 'UTC')::date = v_dia;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  ventas borradas: %', n;

  DELETE FROM pronimerp.cliente_recepciones_items ri
   USING pronimerp.cliente_recepciones r
   WHERE ri.recepcion_id = r.id AND r.empresa_id = v_emp AND r.fecha::date = v_dia;

  DELETE FROM pronimerp.cliente_recepciones
   WHERE empresa_id = v_emp AND fecha::date = v_dia;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  recepciones borradas: %', n;

  -- La caja reconstruida de ese dia. Solo la que creo la importacion.
  DELETE FROM pronimerp.cajas
   WHERE empresa_id = v_emp AND sucursal_id = v_suc
     AND (fecha_apertura AT TIME ZONE 'UTC')::date = v_dia
     AND observacion_apertura = 'Caja reconstruida del diario de Palmeras';

  -- Las filas viejas de ese dia en la mesa original, para que no queden dos
  -- versiones del mismo dia conviviendo.
  DELETE FROM pronimerp.import_palmeras WHERE fecha = v_dia;

  -- ── CLIENTES ──────────────────────────────────────────────────────────
  -- Se reutiliza la ficha si la clave ya existe; si es nueva, se crea.
  INSERT INTO pronimerp.import_palmeras_clientes (cliente_clave, cliente_id)
  SELECT DISTINCT cliente_clave, gen_random_uuid()
    FROM pronimerp.import_palmeras_fix
   WHERE coalesce(cliente_clave,'') <> '' AND tipo <> 'ajuste_stock'
  ON CONFLICT (cliente_clave) DO NOTHING;

  UPDATE pronimerp.import_palmeras_fix i
     SET cliente_id = m.cliente_id
    FROM pronimerp.import_palmeras_clientes m
   WHERE m.cliente_clave = i.cliente_clave;

  INSERT INTO pronimerp.clientes (empresa_id, id, nombre, nombre_contacto, telefono,
                                  tipo_cliente, origen, scope_clientes)
  SELECT v_emp, m.cliente_id, d.nombre, d.nombre, d.telefono,
         'persona', 'IMPORT PALMERAS', v_scope
    FROM pronimerp.import_palmeras_clientes m
    JOIN LATERAL (
      SELECT (array_agg(i.cliente_nombre ORDER BY length(i.cliente_nombre) DESC))[1] AS nombre,
             (array_agg(i.telefono ORDER BY (i.telefono <> '') DESC))[1]             AS telefono
        FROM pronimerp.import_palmeras_fix i
       WHERE i.cliente_clave = m.cliente_clave
    ) d ON true
   WHERE NOT EXISTS (SELECT 1 FROM pronimerp.clientes c WHERE c.id = m.cliente_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  clientes nuevos: %', n;

  -- ── VENTAS ────────────────────────────────────────────────────────────
  UPDATE pronimerp.import_palmeras_fix SET venta_id = gen_random_uuid() WHERE tipo = 'venta';

  -- Una caja por el dia, si hubo efectivo.
  SELECT id INTO v_punto FROM pronimerp.puntos_caja
   WHERE sucursal_id = v_suc ORDER BY orden NULLS LAST LIMIT 1;
  SELECT coalesce(sum(efectivo_in),0) INTO v_efec
    FROM pronimerp.import_palmeras_fix WHERE tipo = 'venta';

  IF v_efec > 0 THEN
    v_caja := gen_random_uuid();
    INSERT INTO pronimerp.cajas (
      id, empresa_id, sucursal_id, punto_caja_id, numero_caja, estado,
      fecha_apertura, fecha_cierre, monto_apertura,
      monto_cierre_contado, monto_esperado_efectivo, diferencia, observacion_apertura)
    VALUES (
      v_caja, v_emp, v_suc, v_punto,
      coalesce((SELECT max(numero_caja) FROM pronimerp.cajas WHERE sucursal_id = v_suc), 0) + 1,
      'cerrada', v_dia::timestamptz, (v_dia + 1)::timestamptz,
      0, v_efec, v_efec, 0, 'Caja reconstruida del diario de Palmeras');
  END IF;

  INSERT INTO pronimerp.ventas (
    id, empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
    subtotal, monto_iva, total, estado, tipo_venta, fecha,
    observaciones, sucursal_id, caja_id, metodo_pago)
  SELECT i.venta_id, v_emp, i.cliente_id,
         'H-' || lpad(i.fila_excel::text, 6, '0'),
         'GS', 1, i.venta, 0, i.venta,
         'completada', 'CONTADO',
         i.fecha::timestamptz + interval '12 hours',
         'Importado del diario de Palmeras (fila ' || i.fila_excel || ')',
         v_suc, v_caja,
         CASE
           WHEN (CASE WHEN coalesce(i.efectivo_in,0)>0 THEN 1 ELSE 0 END)
              + (CASE WHEN coalesce(i.transf_in,0)>0 THEN 1 ELSE 0 END)
              + (CASE WHEN coalesce(i.tarjeta_in,0)>0 THEN 1 ELSE 0 END)
              + (CASE WHEN coalesce(i.credito_utilizado,0)>0 THEN 1 ELSE 0 END) > 1 THEN 'mixto'
           WHEN coalesce(i.efectivo_in,0)       > 0 THEN 'efectivo'
           WHEN coalesce(i.transf_in,0)         > 0 THEN 'transferencia'
           WHEN coalesce(i.tarjeta_in,0)        > 0 THEN 'tarjeta'
           WHEN coalesce(i.credito_utilizado,0) > 0 THEN 'credito'
           ELSE NULL END
    FROM pronimerp.import_palmeras_fix i
   WHERE i.tipo = 'venta';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  ventas creadas: %', n;

  INSERT INTO pronimerp.ventas_pagos_detalle (
    empresa_id, venta_id, sucursal_id, caja_id, metodo_pago, monto, observacion, direccion)
  SELECT v_emp, i.venta_id, v_suc,
         CASE WHEN p.metodo = 'efectivo' THEN v_caja ELSE NULL END,
         p.metodo, p.monto, 'Importado del diario de Palmeras', 'ingreso'
    FROM pronimerp.import_palmeras_fix i
    CROSS JOIN LATERAL (VALUES
      ('efectivo', i.efectivo_in), ('transferencia', i.transf_in), ('tarjeta', i.tarjeta_in)
    ) AS p(metodo, monto)
   WHERE i.tipo = 'venta' AND p.monto > 0;

  -- ── RECEPCIONES ───────────────────────────────────────────────────────
  INSERT INTO pronimerp.cliente_recepciones (
    empresa_id, cliente_id, sucursal_id, numero_control, fecha,
    total_credito, total_compra, subtotal_evaluado, total_final, ajuste_evaluacion,
    valor_venta_estimado, estado, ingresada_at, observaciones)
  SELECT v_emp, i.cliente_id, v_suc, 'FILA-' || i.fila_excel,
         i.fecha::timestamptz + interval '12 hours',
         coalesce(i.credito_generado,0),
         greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0)),
         greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0)),
         greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0)),
         0,
         CASE WHEN coalesce(i.estoque,0) > 0 THEN i.estoque ELSE NULL END,
         CASE WHEN coalesce(i.prendas,0) = 0 AND coalesce(i.estoque,0) = 0
              THEN 'pendiente_ingreso' ELSE 'ingresada' END,
         CASE WHEN coalesce(i.prendas,0) = 0 AND coalesce(i.estoque,0) = 0
              THEN NULL ELSE i.fecha::timestamptz + interval '12 hours' END,
         'Evaluacion importada del diario de Palmeras (fila ' || i.fila_excel || ')'
    FROM pronimerp.import_palmeras_fix i
   WHERE i.cliente_id IS NOT NULL
     AND (i.tipo = 'evaluacion' OR coalesce(i.credito_generado,0) > 0)
     AND greatest(coalesce(i.evaluacion,0), coalesce(i.credito_generado,0)) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  recepciones creadas: %', n;

  -- ── CREDITO ───────────────────────────────────────────────────────────
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_id, referencia_tipo, referencia_numero, fecha, observaciones)
  SELECT v_emp, i.cliente_id, 'ENTRADA', i.credito_generado, 'recepcion',
         r.id, 'recepcion', 'FILA-' || i.fila_excel,
         i.fecha::timestamptz + interval '12 hours',
         'Prendas recibidas el ' || to_char(i.fecha, 'DD/MM/YYYY')
    FROM pronimerp.import_palmeras_fix i
    LEFT JOIN pronimerp.cliente_recepciones r
           ON r.empresa_id = v_emp AND r.numero_control = 'FILA-' || i.fila_excel
   WHERE i.cliente_id IS NOT NULL AND coalesce(i.credito_generado,0) > 0;

  -- La salida solo cuando hubo compra. En una devolucion pura la planilla
  -- repite el monto en las dos columnas y no corresponde descontarlo.
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_id, referencia_tipo, referencia_numero, fecha, observaciones)
  SELECT v_emp, i.cliente_id, 'SALIDA', i.credito_utilizado, 'venta',
         i.venta_id, 'venta', 'H-' || lpad(i.fila_excel::text, 6, '0'),
         i.fecha::timestamptz + interval '12 hours',
         'Credito usado el ' || to_char(i.fecha, 'DD/MM/YYYY')
    FROM pronimerp.import_palmeras_fix i
   WHERE i.cliente_id IS NOT NULL
     AND coalesce(i.credito_utilizado,0) > 0
     AND i.tipo = 'venta';

  -- ── La mesa original queda con el dia corregido ───────────────────────
  INSERT INTO pronimerp.import_palmeras (
    fila_excel, controle, fecha, tipo, cliente_nombre, cliente_clave, telefono,
    venta, evaluacion, devolucion, prendas, estoque,
    efectivo_in, efectivo_out, transf_in, transf_out, tarjeta_in,
    credito_generado, credito_utilizado, descuento, cliente_id, venta_id)
  SELECT fila_excel, controle, fecha, tipo, cliente_nombre, cliente_clave, telefono,
         venta, evaluacion, devolucion, prendas, estoque,
         efectivo_in, efectivo_out, transf_in, transf_out, tarjeta_in,
         credito_generado, credito_utilizado, descuento, cliente_id, venta_id
    FROM pronimerp.import_palmeras_fix;
END
$recarga$;

-- ── Rehacer el FIFO de toda la base ──────────────────────────────────────
-- Los lotes del dia borrado podian estar consumidos por compras posteriores.
DELETE FROM pronimerp.cliente_creditos_consumos;

DO $fifo$
DECLARE
  r_s RECORD; r_e RECORD; resto numeric; aplica numeric;
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

-- El dia recargado.
SELECT (SELECT count(*) FROM pronimerp.ventas v
         WHERE v.numero_control LIKE 'H-%'
           AND (v.fecha AT TIME ZONE 'UTC')::date = (SELECT min(fecha) FROM pronimerp.import_palmeras_fix)) AS ventas,
       (SELECT count(*) FROM pronimerp.cliente_recepciones r
         WHERE r.fecha::date = (SELECT min(fecha) FROM pronimerp.import_palmeras_fix)) AS recepciones,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos m
         WHERE m.fecha::date = (SELECT min(fecha) FROM pronimerp.import_palmeras_fix)) AS movimientos;

-- Ningun lote consumido de mas. Tiene que dar 0.
SELECT count(*) AS lotes_sobreconsumidos
  FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
          FROM pronimerp.cliente_creditos_movimientos e
          LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
         WHERE e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id, e.monto) z
 WHERE saldo < 0;

-- Como quedo el agujero global, para comparar contra antes.
SELECT count(*) AS fichas_en_rojo, to_char(SUM(s), '999G999G999G999') AS suma
  FROM (SELECT c.id, SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS s
          FROM pronimerp.clientes c
          JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
         WHERE c.deleted_at IS NULL GROUP BY c.id) z
 WHERE s < 0;
