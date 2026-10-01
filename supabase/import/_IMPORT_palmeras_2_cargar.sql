-- =============================================================================
-- IMPORTACION DEL DIARIO DE PALMERAS  ·  PASO 2 de 2: cargar de verdad
--
-- Requiere que el paso 1 este hecho y el CSV subido a `import_palmeras`.
--
-- TODO ESTO VA EN UNA SOLA TRANSACCION. Si cualquier linea falla, Postgres
-- revierte el archivo entero y la base queda como estaba. No existe el estado
-- "a medio importar".
--
-- SOLO PALMERAS. La sucursal se busca por nombre y todo cuelga de ese id:
-- ninguna fila puede terminar en Lillo ni en Brasil.
--
-- QUE CARGA
--   . 6.622 clientes (nombre y telefono) en la cartera de Palmeras
--   . 13.240 ventas historicas con su fecha, total y forma de pago
--   . Los movimientos de credito/cashback, con el saldo final de cada cliente
--   . 16.270 prendas de stock, como un unico ajuste de inventario
--
-- QUE NO PUEDE CARGAR
--   El detalle de prendas de cada venta: el Excel no lo tiene. Las ventas
--   historicas entran con su total pero sin lineas. Por eso el stock entra
--   como un ajuste global y no prenda por prenda.
-- =============================================================================

BEGIN;

-- Columnas de trabajo: los id se asignan ANTES de insertar, asi cada venta y
-- cada cliente se pueden referenciar sin tener que adivinar que fila es cual.
ALTER TABLE pronimerp.import_palmeras
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS venta_id   uuid;


DO $imp$
DECLARE
  v_suc    uuid;
  v_emp    uuid;
  v_scope  text;
  v_prod   uuid;
  v_punto  uuid;
  v_costo  numeric;
  v_prendas bigint;
  v_valor  bigint;
  n        bigint;
  cols     text;
  vals     text;
BEGIN
  -- ── La sucursal ────────────────────────────────────────────────────────
  SELECT id, empresa_id INTO v_suc, v_emp
    FROM pronimerp.sucursales
   WHERE upper(nombre) LIKE '%PALMERA%'
   LIMIT 1;

  IF v_suc IS NULL THEN
    RAISE EXCEPTION 'No encontre la sucursal Palmeras. No se cargo nada.';
  END IF;

  SELECT scope_clientes INTO v_scope FROM pronimerp.sucursales WHERE id = v_suc;
  RAISE NOTICE 'Sucursal Palmeras: % (empresa %, cartera %)', v_suc, v_emp, coalesce(v_scope, '-');

  IF NOT EXISTS (SELECT 1 FROM pronimerp.import_palmeras) THEN
    RAISE EXCEPTION 'La tabla import_palmeras esta vacia: falta subir el CSV.';
  END IF;


  -- ── 1) Clientes ────────────────────────────────────────────────────────
  -- Los id se generan primero y se guardan en la tabla puente. Asi el resto
  -- del script sabe a que ficha pertenece cada fila del Excel sin tener que
  -- volver a buscarla por nombre.
  INSERT INTO pronimerp.import_palmeras_clientes (cliente_clave, cliente_id)
  SELECT DISTINCT cliente_clave, gen_random_uuid()
    FROM pronimerp.import_palmeras
   WHERE coalesce(cliente_clave, '') <> ''
     AND tipo <> 'ajuste_stock'
  ON CONFLICT (cliente_clave) DO NOTHING;

  UPDATE pronimerp.import_palmeras i
     SET cliente_id = m.cliente_id
    FROM pronimerp.import_palmeras_clientes m
   WHERE m.cliente_clave = i.cliente_clave;

  -- El nombre que se guarda es el MAS LARGO de los que uso para esa persona:
  -- entre "Ana" y "Ana Knust" sirve mas el segundo.
  -- El telefono, el primero valido que aparezca.
  cols := 'empresa_id, id, nombre, telefono';
  vals := '$1, m.cliente_id, d.nombre, d.telefono';
  -- Columnas que pueden existir o no segun la version del schema.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pronimerp' AND table_name='clientes' AND column_name='tipo_cliente') THEN
    cols := cols || ', tipo_cliente';  vals := vals || ', ''persona''';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pronimerp' AND table_name='clientes' AND column_name='nombre_contacto') THEN
    cols := cols || ', nombre_contacto'; vals := vals || ', d.nombre';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pronimerp' AND table_name='clientes' AND column_name='origen') THEN
    cols := cols || ', origen'; vals := vals || ', ''IMPORT PALMERAS''';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pronimerp' AND table_name='clientes' AND column_name='scope_clientes') THEN
    cols := cols || ', scope_clientes'; vals := vals || ', $2';
  END IF;

  EXECUTE format($q$
    INSERT INTO pronimerp.clientes (%s)
    SELECT %s
      FROM pronimerp.import_palmeras_clientes m
      JOIN LATERAL (
        SELECT (array_agg(i.cliente_nombre ORDER BY length(i.cliente_nombre) DESC))[1] AS nombre,
               (array_agg(i.telefono ORDER BY (i.telefono <> '') DESC, i.fecha))[1]    AS telefono
          FROM pronimerp.import_palmeras i
         WHERE i.cliente_clave = m.cliente_clave
      ) d ON true
  $q$, cols, vals) USING v_emp, v_scope;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '1) clientes creados: %', n;


  -- ── 2) Ventas ──────────────────────────────────────────────────────────
  UPDATE pronimerp.import_palmeras
     SET venta_id = gen_random_uuid()
   WHERE tipo = 'venta';

  -- `numero_control` arranca con H- (historico) para que no choque nunca con
  -- la numeracion que use la caja de ahora en adelante.
  INSERT INTO pronimerp.ventas (
    id, empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
    subtotal, monto_iva, total, estado, tipo_venta, fecha,
    observaciones, sucursal_id, metodo_pago
  )
  SELECT
    i.venta_id, v_emp, i.cliente_id,
    -- fila_excel es la clave primaria del staging: unico garantizado.
    -- `controle` tiene huecos y podria chocar contra un fila_excel de otra fila.
    'H-' || lpad(i.fila_excel::text, 6, '0'),
    -- 'GS', no 'PYG': `ventas.moneda` solo acepta GS o USD. El codigo PYG se
    -- usa en otras tablas (compras, sorteos) y ahi si es el valido.
    'GS', 1,
    -- El total es lo que figura como VENTA en el Excel. El descuento no se
    -- resta del total: es una de las formas en que se cubrio esa venta, y
    -- restarlo haria que el total importado no cuadre contra la planilla.
    i.venta, 0, i.venta,
    -- 'CONTADO' en mayusculas: asi lo pide el CHECK de la tabla.
    'completada', 'CONTADO', i.fecha::timestamptz,
    'Importado del diario de Palmeras (fila ' || i.fila_excel || ')',
    v_suc,
    CASE
      WHEN i.tarjeta_in   > 0 THEN 'tarjeta'
      WHEN i.transf_in    > 0 THEN 'transferencia'
      WHEN i.efectivo_in  > 0 THEN 'efectivo'
      ELSE NULL
    END
  FROM pronimerp.import_palmeras i
  WHERE i.tipo = 'venta';

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '2) ventas historicas: %', n;

  -- El descuento se guarda aparte, no restado del total: asi el reporte puede
  -- mostrar cuanto se resigno sin ensuciar cuanto se vendio.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='pronimerp' AND table_name='ventas'
                AND column_name='descuento_general') THEN
    EXECUTE $q$
      UPDATE pronimerp.ventas v
         SET descuento_general = i.descuento
        FROM pronimerp.import_palmeras i
       WHERE i.venta_id = v.id AND i.descuento > 0
    $q$;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '2b) ventas con descuento: %', n;
  END IF;


  -- ── 2c) Una caja por dia ───────────────────────────────────────────────
  -- El efectivo no puede quedar colgado: la tabla exige que todo pago en
  -- efectivo pertenezca a una caja. Y no sirve una sola caja gigante para los
  -- 17 meses, porque entonces el cierre de caja por dia no diria nada. Se crea
  -- una caja cerrada por cada dia que hubo efectivo, con lo que entro ese dia.
  SELECT id INTO v_punto FROM pronimerp.puntos_caja
   WHERE sucursal_id = v_suc ORDER BY orden NULLS LAST LIMIT 1;

  CREATE TEMP TABLE _cajas_dia ON COMMIT DROP AS
  SELECT i.fecha,
         gen_random_uuid()  AS caja_id,
         sum(i.efectivo_in) AS efectivo
    FROM pronimerp.import_palmeras i
   WHERE i.tipo = 'venta' AND i.efectivo_in > 0
   GROUP BY i.fecha;

  INSERT INTO pronimerp.cajas (
    id, empresa_id, sucursal_id, punto_caja_id, numero_caja, estado,
    fecha_apertura, fecha_cierre, monto_apertura,
    monto_cierre_contado, monto_esperado_efectivo, diferencia,
    observacion_apertura
  )
  SELECT c.caja_id, v_emp, v_suc, v_punto,
         coalesce((SELECT max(numero_caja) FROM pronimerp.cajas WHERE sucursal_id = v_suc), 0)
           + row_number() OVER (ORDER BY c.fecha),
         'cerrada',
         c.fecha::timestamptz,
         (c.fecha + 1)::timestamptz,
         0, c.efectivo, c.efectivo, 0,
         'Caja reconstruida del diario de Palmeras'
    FROM _cajas_dia c;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '2c) cajas diarias reconstruidas: %', n;


  -- ── 3) Como se pago cada venta ─────────────────────────────────────────
  -- Una fila por medio de pago usado. El credito NO va aca: no es plata que
  -- entro a la caja, y queda registrado como consumo de saldo en el paso 4.
  INSERT INTO pronimerp.ventas_pagos_detalle (
    empresa_id, venta_id, sucursal_id, caja_id, metodo_pago, monto, observacion, direccion
  )
  SELECT v_emp, i.venta_id, v_suc,
         -- Solo el efectivo necesita caja; tarjeta y transferencia no pasan
         -- por el cajon, van directo al banco.
         CASE WHEN p.metodo = 'efectivo' THEN c.caja_id ELSE NULL END,
         p.metodo, p.monto,
         'Importado del diario de Palmeras', 'ingreso'
    FROM pronimerp.import_palmeras i
    LEFT JOIN _cajas_dia c ON c.fecha = i.fecha
    CROSS JOIN LATERAL (VALUES
      ('efectivo',      i.efectivo_in),
      ('transferencia', i.transf_in),
      ('tarjeta',       i.tarjeta_in)
    ) AS p(metodo, monto)
   WHERE i.tipo = 'venta' AND p.monto > 0;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '3) pagos: %', n;


  -- ── 4) Credito / cashback ──────────────────────────────────────────────
  -- ENTRADA: lo que se le reconocio por las prendas que trajo.
  -- SALIDA : lo que fue usando en sus compras.
  -- El saldo de cada cliente sale de la resta, igual que en el Excel.
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_tipo, referencia_numero, observaciones
  )
  SELECT v_emp, i.cliente_id, 'ENTRADA', i.credito_generado, 'recepcion',
         'import', 'FILA-' || i.fila_excel,
         'Prendas recibidas el ' || to_char(i.fecha, 'DD/MM/YYYY')
    FROM pronimerp.import_palmeras i
   WHERE i.cliente_id IS NOT NULL AND i.credito_generado > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '4a) creditos otorgados: %', n;

  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_id, referencia_tipo, referencia_numero, observaciones
  )
  SELECT v_emp, i.cliente_id, 'SALIDA', i.credito_utilizado, 'venta',
         i.venta_id, 'venta', 'H-' || lpad(i.fila_excel::text, 6, '0'),
         'Credito usado el ' || to_char(i.fecha, 'DD/MM/YYYY')
    FROM pronimerp.import_palmeras i
   WHERE i.cliente_id IS NOT NULL AND i.credito_utilizado > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '4b) creditos usados: %', n;


  -- ── 5) Stock ───────────────────────────────────────────────────────────
  -- El Excel no dice QUE prendas quedaron, solo cuantas y por cuanto. Entonces
  -- entra como un unico producto de ajuste, con el costo promedio real. Es
  -- deliberadamente feo de ver: la idea es que cuando hagas el inventario
  -- fisico por franja, este producto baje a 0 y desaparezca.
  SELECT sum(prendas), sum(estoque) INTO v_prendas, v_valor
    FROM pronimerp.import_palmeras;

  IF v_prendas > 0 THEN
    v_costo := round(v_valor::numeric / v_prendas::numeric);

    INSERT INTO pronimerp.productos (
      empresa_id, nombre, sku, precio_venta, costo_promedio,
      stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
      activo, es_franja_precio, visible_web, sucursal_id
    ) VALUES (
      v_emp, 'Stock historico Palmeras (a inventariar)', 'HIST-PALMERAS',
      0, v_costo, 0, 0, 'Unidad', 'CPP', true, false, false, v_suc
    )
    ON CONFLICT (empresa_id, sku) DO UPDATE SET activo = true
    RETURNING id INTO v_prod;

    INSERT INTO pronimerp.producto_stock_sucursal (producto_id, sucursal_id, stock_actual, stock_minimo)
    VALUES (v_prod, v_suc, v_prendas, 0)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET stock_actual = EXCLUDED.stock_actual;

    INSERT INTO pronimerp.movimientos_inventario (
      empresa_id, producto_id, producto_nombre, producto_sku,
      tipo, cantidad, costo_unitario, origen, referencia, fecha
    ) VALUES (
      v_emp, v_prod, 'Stock historico Palmeras (a inventariar)', 'HIST-PALMERAS',
      'ENTRADA', v_prendas, v_costo, 'inventario_inicial', 'IMPORT-PALMERAS', now()
    );

    RAISE NOTICE '5) stock: % prendas a un costo promedio de % Gs', v_prendas, v_costo;
  END IF;

  RAISE NOTICE '-- Importacion terminada --';
END
$imp$;

COMMIT;


-- ── Control: tiene que coincidir con el Excel ────────────────────────────
SELECT 'clientes'            AS que, count(*)::text AS valor FROM pronimerp.import_palmeras_clientes
UNION ALL
SELECT 'ventas',               count(*)::text FROM pronimerp.ventas WHERE numero_control LIKE 'H-%'
UNION ALL
SELECT 'total vendido',        to_char(sum(total), '999G999G999G999') FROM pronimerp.ventas WHERE numero_control LIKE 'H-%'
UNION ALL
SELECT 'cobrado (sin credito)', to_char(sum(pd.monto), '999G999G999G999')
  FROM pronimerp.ventas_pagos_detalle pd
  JOIN pronimerp.ventas v ON v.id = pd.venta_id
 WHERE v.numero_control LIKE 'H-%';

-- Saldo de credito de cada cliente. La suma a favor tiene que dar 51.524.200
-- y los negativos -29.579.200.
WITH saldo AS (
  SELECT cliente_id,
         sum(CASE WHEN tipo = 'ENTRADA' THEN monto ELSE -monto END) AS s
    FROM pronimerp.cliente_creditos_movimientos
   WHERE cliente_id IN (SELECT cliente_id FROM pronimerp.import_palmeras_clientes)
   GROUP BY cliente_id
)
SELECT count(*) FILTER (WHERE s > 0)                       AS con_saldo_a_favor,
       to_char(sum(s) FILTER (WHERE s > 0), '999G999G999') AS total_a_favor,
       count(*) FILTER (WHERE s < 0)                       AS con_saldo_negativo,
       to_char(sum(s) FILTER (WHERE s < 0), '999G999G999') AS total_negativo
  FROM saldo;
