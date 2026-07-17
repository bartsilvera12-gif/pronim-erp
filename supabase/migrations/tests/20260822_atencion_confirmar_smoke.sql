-- ═══════════════════════════════════════════════════════════════════════
-- Smoke tests para las migraciones 20260822_* (evaluación + idempotencia).
-- Ejecutables directamente en el SQL editor de Supabase o en psql.
-- Cada bloque BEGIN...ROLLBACK aísla el escenario; nada persiste.
--
-- No cubre el orquestador end-to-end (eso requiere Node + fixtures) —
-- verifica que las invariantes de esquema estén bien definidas.
-- Los 8 escenarios funcionales están documentados en
-- scripts/tests/atencion-confirmar/README.md como llamadas HTTP.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_empresa uuid := '12c517ef-bef3-4f4e-848f-0b34b0ac0a22';
  v_cliente uuid;
  v_sucursal uuid;
  v_recep_id uuid;
BEGIN
  RAISE NOTICE '── Test 1: subtotal_evaluado + ajuste_evaluacion = total_final (OK) ──';
  SELECT id INTO v_sucursal FROM pronimerp.sucursales
   WHERE empresa_id = v_empresa LIMIT 1;
  INSERT INTO pronimerp.clientes (empresa_id, nombre)
    VALUES (v_empresa, 'TEST_EVAL_' || substr(gen_random_uuid()::text,1,8))
    RETURNING id INTO v_cliente;

  BEGIN
    INSERT INTO pronimerp.cliente_recepciones
      (empresa_id, cliente_id, sucursal_id, numero_control,
       total_compra, total_credito, estado, origen_datos,
       subtotal_evaluado, ajuste_evaluacion, total_final)
    VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-EVAL-001',
            50000, 50000, 'pendiente_ingreso', 'test',
            40000, 10000, 50000)
    RETURNING id INTO v_recep_id;
    RAISE NOTICE 'OK — ajuste positivo (40000 + 10000 = 50000)';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  RAISE NOTICE '── Test 2: ajuste negativo permitido ──';
  BEGIN
    INSERT INTO pronimerp.cliente_recepciones
      (empresa_id, cliente_id, sucursal_id, numero_control,
       total_compra, total_credito, estado, origen_datos,
       subtotal_evaluado, ajuste_evaluacion, total_final)
    VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-EVAL-002',
            30000, 30000, 'pendiente_ingreso', 'test',
            50000, -20000, 30000);
    RAISE NOTICE 'OK — ajuste negativo (50000 + (-20000) = 30000)';
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  RAISE NOTICE '── Test 3: total_final debe ser > 0 (debe FALLAR) ──';
  BEGIN
    INSERT INTO pronimerp.cliente_recepciones
      (empresa_id, cliente_id, sucursal_id, numero_control,
       total_compra, total_credito, estado, origen_datos,
       subtotal_evaluado, ajuste_evaluacion, total_final)
    VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-EVAL-003',
            0, 0, 'pendiente_ingreso', 'test',
            10000, -10000, 0);
    RAISE EXCEPTION 'FAIL 3 — total_final=0 no debió aceptarse';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'OK — total_final=0 rechazado por constraint';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'FAIL 3%' THEN RAISE; END IF;
  END;

  RAISE NOTICE '── Test 4: ecuación rota (subtotal + ajuste ≠ total_final) FALLA ──';
  BEGIN
    INSERT INTO pronimerp.cliente_recepciones
      (empresa_id, cliente_id, sucursal_id, numero_control,
       total_compra, total_credito, estado, origen_datos,
       subtotal_evaluado, ajuste_evaluacion, total_final)
    VALUES (v_empresa, v_cliente, v_sucursal, 'TEST-EVAL-004',
            99999, 99999, 'pendiente_ingreso', 'test',
            10000, 5000, 99999);  -- 10000+5000 ≠ 99999
    RAISE EXCEPTION 'FAIL 4 — ecuación rota no debió aceptarse';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'OK — ecuación rota rechazada por constraint';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'FAIL 4%' THEN RAISE; END IF;
  END;

  RAISE NOTICE '── Test 5: idempotency_key UNIQUE (empresa_id, idempotency_key) ──';
  BEGIN
    INSERT INTO pronimerp.atencion_operaciones
      (empresa_id, idempotency_key, request_hash)
      VALUES (v_empresa, 'test-idem-key-001', 'hash-a');
    BEGIN
      INSERT INTO pronimerp.atencion_operaciones
        (empresa_id, idempotency_key, request_hash)
        VALUES (v_empresa, 'test-idem-key-001', 'hash-b');
      RAISE EXCEPTION 'FAIL 5 — duplicado no debió aceptarse';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'OK — segundo INSERT con misma key rechazado';
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAIL 5%' THEN RAISE; END IF;
    END;
    RAISE EXCEPTION 'ROLLBACK_LOCAL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_LOCAL' THEN RAISE; END IF;
  END;

  -- Limpio el cliente de prueba
  DELETE FROM pronimerp.clientes WHERE id = v_cliente;
  RAISE NOTICE '━━━ SMOKE TESTS OK ━━━';
END $$;
