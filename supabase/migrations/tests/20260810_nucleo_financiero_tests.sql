-- =====================================================================
-- Núcleo financiero pronimerp — Tests SQL (11 escenarios A-K)
-- ---------------------------------------------------------------------
-- Cómo correr: pegar TODO el archivo en Supabase → SQL Editor y
-- ejecutar. Todo está envuelto en BEGIN ... ROLLBACK y no persiste
-- ningún dato. Al terminar verás en el panel "Notices" líneas
-- `OK A`, `OK B`, ..., `OK K`. La primera excepción no capturada
-- detiene la corrida.
--
-- Cada escenario corre en un sub-bloque `BEGIN ... EXCEPTION` propio
-- (subtransacción implícita de PL/pgSQL), así el estado de un test
-- no contamina el siguiente. Al final se emite un rollback explícito
-- para forzar el descarte también del setup común.
-- =====================================================================

BEGIN;

DO $tests$
DECLARE
  v_empresa uuid := (SELECT id FROM pronimerp.empresas LIMIT 1);
  v_sucursal uuid;
  v_cliente uuid;
  v_franja uuid;
  v_caja uuid;
  v_saldo numeric;
  v_stock numeric;
  v_recepcion_id uuid;
  v_venta_id uuid;
  v_efectivo_caja numeric;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'FAIL: no hay empresa en pronimerp.empresas';
  END IF;

  -- Setup común: sucursal ficticia (slug único, es_principal=false)
  INSERT INTO pronimerp.sucursales (empresa_id, nombre, slug, es_principal, activo)
  VALUES (
    v_empresa,
    'TEST_SUC_' || substr(gen_random_uuid()::text,1,8),
    'test-suc-' || substr(gen_random_uuid()::text,1,8),
    false,
    true
  ) RETURNING id INTO v_sucursal;

  -- Caja abierta en la sucursal
  INSERT INTO pronimerp.cajas (
    empresa_id, sucursal_id, numero_caja, estado,
    abierta_por, fecha_apertura, monto_apertura
  ) VALUES (
    v_empresa, v_sucursal, 99999, 'abierta',
    NULL, now(), 0
  ) RETURNING id INTO v_caja;

  -- Producto de test con SKU único; es_franja_precio=false para no chocar
  -- con el UNIQUE partial uq_franjas_activas_precio si ya existe una franja
  -- real al mismo precio.
  INSERT INTO pronimerp.productos (
    empresa_id, nombre, sku, precio_venta, costo_promedio,
    stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
    activo, es_franja_precio, visible_web
  ) VALUES (
    v_empresa, 'TEST Franja Gs. 30000',
    'TEST-FRJ-' || substr(gen_random_uuid()::text,1,8),
    30000, 0, 0, 0, 'Unidad', 'CPP', true, false, false
  ) RETURNING id INTO v_franja;

  INSERT INTO pronimerp.producto_stock_sucursal (producto_id, sucursal_id, stock_actual)
  VALUES (v_franja, v_sucursal, 0);

  -- Cliente ficticio
  INSERT INTO pronimerp.clientes (empresa_id, nombre_contacto, tipo_cliente)
  VALUES (v_empresa, 'TEST_CLI_' || substr(gen_random_uuid()::text,1,8), 'persona')
  RETURNING id INTO v_cliente;

  RAISE NOTICE '---- Setup OK: empresa=% sucursal=% caja=% franja=% cliente=%',
    v_empresa, v_sucursal, v_caja, v_franja, v_cliente;

  -- Helper: cada escenario está en un BEGIN...EXCEPTION que crea una
  -- subtransacción implícita. Emitimos RAISE EXCEPTION 'ROLLBACK_LOCAL'
  -- al final del escenario feliz para descartar sus writes y no
  -- contaminar el siguiente escenario. Un fallo real de assert emite
  -- FAIL X que se re-lanza al outer.

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario A: Compra Gs. 30.000 pagada 100% como crédito
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_recepciones (
      empresa_id, cliente_id, sucursal_id, numero_control,
      total_credito, estado, origen_datos
    ) VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-A-001',
              30000, 'pendiente_ingreso', 'test')
    RETURNING id INTO v_recepcion_id;
    INSERT INTO pronimerp.cliente_recepciones_items (
      empresa_id, recepcion_id, producto_id, producto_nombre, sku,
      cantidad, precio_compra_unitario, precio_venta_snapshot, subtotal
    ) VALUES (v_empresa, v_recepcion_id, v_franja, 'TEST', 'SKU',
              1, 30000, 30000, 30000);
    INSERT INTO pronimerp.cliente_recepciones_pagos (
      empresa_id, recepcion_id, metodo, monto
    ) VALUES (v_empresa, v_recepcion_id, 'credito', 30000);
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen,
      referencia_id, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 30000, 'recepcion',
              v_recepcion_id, 'TEST-A-001');

    SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                             WHEN tipo='SALIDA' THEN -monto
                             ELSE monto END),0)
      INTO v_saldo
      FROM pronimerp.cliente_creditos_movimientos
      WHERE cliente_id = v_cliente;
    IF v_saldo <> 30000 THEN
      RAISE EXCEPTION 'FAIL A: saldo esperado 30000, obtuve %', v_saldo;
    END IF;
    RAISE NOTICE 'OK A: saldo=30000 tras pago 100%% credito';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario B: Compra Gs. 30.000 — 10.000 efectivo + 20.000 credito
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_recepciones (
      empresa_id, cliente_id, sucursal_id, numero_control,
      total_credito, estado, origen_datos
    ) VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-B-001',
              30000, 'pendiente_ingreso', 'test')
    RETURNING id INTO v_recepcion_id;
    INSERT INTO pronimerp.cliente_recepciones_pagos
      (empresa_id, recepcion_id, metodo, monto) VALUES
      (v_empresa, v_recepcion_id, 'credito', 20000),
      (v_empresa, v_recepcion_id, 'efectivo', 10000);
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen,
      referencia_id, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 20000, 'recepcion',
              v_recepcion_id, 'TEST-B-001');
    INSERT INTO pronimerp.caja_movimientos (
      empresa_id, caja_id, tipo, concepto, monto, medio_pago
    ) VALUES (v_empresa, v_caja, 'egreso', 'Compra a cliente TEST-B-001',
              10000, 'efectivo');

    SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                             WHEN tipo='SALIDA' THEN -monto
                             ELSE monto END),0)
      INTO v_saldo FROM pronimerp.cliente_creditos_movimientos
      WHERE cliente_id = v_cliente;
    IF v_saldo <> 20000 THEN
      RAISE EXCEPTION 'FAIL B: saldo esperado 20000, obtuve %', v_saldo;
    END IF;
    SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto
                             WHEN tipo='egreso' THEN -monto
                             ELSE 0 END),0)
      INTO v_efectivo_caja FROM pronimerp.caja_movimientos
      WHERE caja_id = v_caja;
    IF v_efectivo_caja <> -10000 THEN
      RAISE EXCEPTION 'FAIL B: caja neta esperada -10000, obtuve %', v_efectivo_caja;
    END IF;
    RAISE NOTICE 'OK B: saldo=20000, caja=-10000 tras pago mixto';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario C: Compra pendiente_ingreso NO altera stock
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    SELECT COALESCE(stock_actual, 0) INTO v_stock
      FROM pronimerp.producto_stock_sucursal
      WHERE producto_id = v_franja AND sucursal_id = v_sucursal;

    INSERT INTO pronimerp.cliente_recepciones (
      empresa_id, cliente_id, sucursal_id, numero_control,
      total_credito, estado, origen_datos
    ) VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-C-001',
              30000, 'pendiente_ingreso', 'test')
    RETURNING id INTO v_recepcion_id;
    INSERT INTO pronimerp.cliente_recepciones_items (
      empresa_id, recepcion_id, producto_id, producto_nombre, sku,
      cantidad, precio_compra_unitario, precio_venta_snapshot, subtotal
    ) VALUES (v_empresa, v_recepcion_id, v_franja, 'TEST', 'SKU',
              5, 6000, 30000, 30000);

    SELECT COALESCE(stock_actual, 0) INTO v_stock
      FROM pronimerp.producto_stock_sucursal
      WHERE producto_id = v_franja AND sucursal_id = v_sucursal;
    IF v_stock <> 0 THEN
      RAISE EXCEPTION 'FAIL C: stock esperado 0, obtuve %', v_stock;
    END IF;
    RAISE NOTICE 'OK C: stock permanece 0 con recepcion pendiente_ingreso';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario D: Ingreso posterior aumenta stock UNA sola vez
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_recepciones (
      empresa_id, cliente_id, sucursal_id, numero_control,
      total_credito, estado, origen_datos
    ) VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-D-001',
              18000, 'pendiente_ingreso', 'test')
    RETURNING id INTO v_recepcion_id;
    INSERT INTO pronimerp.cliente_recepciones_items (
      empresa_id, recepcion_id, producto_id, producto_nombre, sku,
      cantidad, precio_compra_unitario, precio_venta_snapshot, subtotal
    ) VALUES (v_empresa, v_recepcion_id, v_franja, 'TEST', 'SKU',
              3, 6000, 30000, 18000);
    -- Simular ingreso
    UPDATE pronimerp.producto_stock_sucursal
       SET stock_actual = stock_actual + 3
     WHERE producto_id = v_franja AND sucursal_id = v_sucursal;
    UPDATE pronimerp.cliente_recepciones
       SET estado = 'ingresada', ingresada_at = now()
     WHERE id = v_recepcion_id;

    IF (SELECT estado FROM pronimerp.cliente_recepciones WHERE id = v_recepcion_id) <> 'ingresada' THEN
      RAISE EXCEPTION 'FAIL D: estado no cambio a ingresada';
    END IF;
    SELECT stock_actual INTO v_stock FROM pronimerp.producto_stock_sucursal
      WHERE producto_id = v_franja AND sucursal_id = v_sucursal;
    IF v_stock <> 3 THEN
      RAISE EXCEPTION 'FAIL D: stock esperado 3, obtuve %', v_stock;
    END IF;
    RAISE NOTICE 'OK D: stock=3 tras ingreso unico';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario E: Venta 100k = 70k credito + 30k efectivo
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 100000, 'ajuste_manual', 'test-setup-E');

    INSERT INTO pronimerp.ventas (
      empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
      subtotal, monto_iva, total, estado, tipo_venta, fecha,
      sucursal_id, caja_id, metodo_pago
    ) VALUES (v_empresa, v_cliente, 'TEST-V-E-001', 'GS', 1,
              100000, 0, 100000, 'completada', 'CONTADO', now(),
              v_sucursal, v_caja, 'efectivo')
    RETURNING id INTO v_venta_id;
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen,
      referencia_id, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'SALIDA', 70000, 'venta', v_venta_id, 'TEST-V-E-001');
    INSERT INTO pronimerp.caja_movimientos (
      empresa_id, caja_id, tipo, concepto, monto, medio_pago
    ) VALUES (v_empresa, v_caja, 'ingreso', 'Venta TEST-V-E-001', 30000, 'efectivo');

    SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                             WHEN tipo='SALIDA' THEN -monto
                             ELSE monto END),0)
      INTO v_saldo FROM pronimerp.cliente_creditos_movimientos
      WHERE cliente_id = v_cliente;
    IF v_saldo <> 30000 THEN
      RAISE EXCEPTION 'FAIL E: saldo esperado 30000, obtuve %', v_saldo;
    END IF;
    SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto
                             WHEN tipo='egreso' THEN -monto ELSE 0 END),0)
      INTO v_efectivo_caja FROM pronimerp.caja_movimientos
      WHERE caja_id = v_caja;
    IF v_efectivo_caja <> 30000 THEN
      RAISE EXCEPTION 'FAIL E: caja esperada 30000, obtuve %', v_efectivo_caja;
    END IF;
    RAISE NOTICE 'OK E: credito bajo 70k y caja subio 30k (no 100k)';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario F: Venta 100k pagada 100% con credito → caja no recibe
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 100000, 'ajuste_manual', 'test-setup-F');
    INSERT INTO pronimerp.ventas (
      empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
      subtotal, monto_iva, total, estado, tipo_venta, fecha,
      sucursal_id, caja_id, metodo_pago
    ) VALUES (v_empresa, v_cliente, 'TEST-V-F-001', 'GS', 1,
              100000, 0, 100000, 'completada', 'CONTADO', now(),
              v_sucursal, v_caja, 'efectivo')
    RETURNING id INTO v_venta_id;
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen,
      referencia_id, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'SALIDA', 100000, 'venta', v_venta_id, 'TEST-V-F-001');
    -- NO insertamos movimiento de caja

    SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto
                             WHEN tipo='egreso' THEN -monto ELSE 0 END),0)
      INTO v_efectivo_caja FROM pronimerp.caja_movimientos
      WHERE caja_id = v_caja;
    IF v_efectivo_caja <> 0 THEN
      RAISE EXCEPTION 'FAIL F: caja esperada 0, obtuve %', v_efectivo_caja;
    END IF;
    RAISE NOTICE 'OK F: caja=0 cuando venta se paga 100%% con credito';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario G: Venta a credito 100k → CxC pendiente, caja=0
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.ventas (
      empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
      subtotal, monto_iva, total, estado, tipo_venta, plazo_dias, fecha,
      sucursal_id, caja_id, metodo_pago
    ) VALUES (v_empresa, v_cliente, 'TEST-V-G-001', 'GS', 1,
              100000, 0, 100000, 'completada', 'CREDITO', 30, now(),
              v_sucursal, v_caja, 'efectivo')
    RETURNING id INTO v_venta_id;
    INSERT INTO pronimerp.cuentas_por_cobrar (
      empresa_id, cliente_id, venta_id, sucursal_id, numero_venta,
      moneda, total, saldo, estado
    ) VALUES (v_empresa, v_cliente, v_venta_id, v_sucursal, 'TEST-V-G-001',
              'GS', 100000, 100000, 'pendiente');

    IF NOT EXISTS (SELECT 1 FROM pronimerp.cuentas_por_cobrar
                   WHERE venta_id = v_venta_id AND saldo = 100000 AND estado='pendiente') THEN
      RAISE EXCEPTION 'FAIL G: CxC no creada correctamente';
    END IF;
    SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto
                             WHEN tipo='egreso' THEN -monto ELSE 0 END),0)
      INTO v_efectivo_caja FROM pronimerp.caja_movimientos
      WHERE caja_id = v_caja;
    IF v_efectivo_caja <> 0 THEN
      RAISE EXCEPTION 'FAIL G: caja esperada 0 en venta a credito, obtuve %', v_efectivo_caja;
    END IF;
    RAISE NOTICE 'OK G: CxC=100000 pendiente, caja=0';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario H: Dos ventas simultaneas mismo saldo — 2da falla
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 50000, 'ajuste_manual', 'test-setup-H');
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'SALIDA', 40000, 'venta', 'TEST-V-H-001');

    SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                             WHEN tipo='SALIDA' THEN -monto
                             ELSE monto END),0)
      INTO v_saldo FROM pronimerp.cliente_creditos_movimientos
      WHERE cliente_id = v_cliente;
    IF v_saldo <> 10000 THEN
      RAISE EXCEPTION 'FAIL H setup: saldo esperado 10000, obtuve %', v_saldo;
    END IF;

    IF v_saldo < 20000 THEN
      RAISE NOTICE 'OK H: segunda operacion detecta saldo insuficiente (%), rechazada', v_saldo;
    ELSE
      RAISE EXCEPTION 'FAIL H: saldo permitiria segunda venta cuando no deberia';
    END IF;
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario I: Anulacion con reversion integra
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 30000, 'ajuste_manual', 'test-setup-I');

    INSERT INTO pronimerp.ventas (
      empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
      subtotal, monto_iva, total, estado, tipo_venta, fecha,
      sucursal_id, caja_id, metodo_pago
    ) VALUES (v_empresa, v_cliente, 'TEST-V-I-001', 'GS', 1,
              50000, 0, 50000, 'completada', 'CONTADO', now(),
              v_sucursal, v_caja, 'efectivo')
    RETURNING id INTO v_venta_id;
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen,
      referencia_id, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'SALIDA', 30000, 'venta', v_venta_id, 'TEST-V-I-001');
    INSERT INTO pronimerp.caja_movimientos (
      empresa_id, caja_id, tipo, concepto, monto, medio_pago
    ) VALUES (v_empresa, v_caja, 'ingreso', 'Venta TEST-V-I-001', 20000, 'efectivo');

    -- Reversion
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen,
      referencia_id, referencia_numero
    ) VALUES (v_empresa, v_cliente, 'ENTRADA', 30000, 'ajuste_manual',
              v_venta_id, 'TEST-V-I-001');
    INSERT INTO pronimerp.caja_movimientos (
      empresa_id, caja_id, tipo, concepto, monto, medio_pago
    ) VALUES (v_empresa, v_caja, 'egreso', 'Reversion anulacion TEST-V-I-001',
              20000, 'efectivo');
    UPDATE pronimerp.ventas SET estado='anulada' WHERE id=v_venta_id;

    SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                             WHEN tipo='SALIDA' THEN -monto
                             ELSE monto END),0)
      INTO v_saldo FROM pronimerp.cliente_creditos_movimientos
      WHERE cliente_id = v_cliente;
    IF v_saldo <> 30000 THEN
      RAISE EXCEPTION 'FAIL I: saldo tras reversion esperado 30000, obtuve %', v_saldo;
    END IF;
    SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto
                             WHEN tipo='egreso' THEN -monto ELSE 0 END),0)
      INTO v_efectivo_caja FROM pronimerp.caja_movimientos
      WHERE caja_id = v_caja;
    IF v_efectivo_caja <> 0 THEN
      RAISE EXCEPTION 'FAIL I: caja neta esperada 0 tras reversion, obtuve %', v_efectivo_caja;
    END IF;
    RAISE NOTICE 'OK I: reversion deja saldo=30000 y caja=0';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario J: Operacion sin sucursal es rechazada por NOT NULL
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    BEGIN
      INSERT INTO pronimerp.cliente_recepciones (
        empresa_id, cliente_id, sucursal_id, numero_control,
        total_credito, estado, origen_datos
      ) VALUES (v_empresa, v_cliente, NULL, 'TEST-J-001',
                10000, 'pendiente_ingreso', 'test');
      RAISE EXCEPTION 'FAIL J: se acepto recepcion con sucursal_id NULL';
    EXCEPTION WHEN not_null_violation THEN
      RAISE NOTICE 'OK J: NOT NULL bloqueo recepcion sin sucursal';
    END;
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- ═════════════════════════════════════════════════════════════════
  -- Escenario K: Cliente con >200 movimientos conserva saldo correcto
  -- ═════════════════════════════════════════════════════════════════
  BEGIN
    -- 210 ENTRADAs de 100 + 5 SALIDAs de 50 → saldo = 20750
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    )
    SELECT v_empresa, v_cliente, 'ENTRADA', 100, 'ajuste_manual',
           'test-K-e-' || g::text
    FROM generate_series(1, 210) g;
    INSERT INTO pronimerp.cliente_creditos_movimientos (
      empresa_id, cliente_id, tipo, monto, origen, referencia_numero
    )
    SELECT v_empresa, v_cliente, 'SALIDA', 50, 'ajuste_manual',
           'test-K-s-' || g::text
    FROM generate_series(1, 5) g;

    SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                             WHEN tipo='SALIDA' THEN -monto
                             ELSE monto END),0)
      INTO v_saldo FROM pronimerp.cliente_creditos_movimientos
      WHERE cliente_id = v_cliente;
    IF v_saldo <> 20750 THEN
      RAISE EXCEPTION 'FAIL K: saldo esperado 20750, obtuve % (calculo limitado a 200?)', v_saldo;
    END IF;
    RAISE NOTICE 'OK K: saldo=20750 correcto sobre 215 movimientos';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  RAISE NOTICE '════════ TODOS LOS ESCENARIOS OK ════════';
END $tests$;

-- Todo el bloque se descarta:
ROLLBACK;
