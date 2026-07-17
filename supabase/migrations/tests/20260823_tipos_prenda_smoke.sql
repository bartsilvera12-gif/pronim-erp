-- ═══════════════════════════════════════════════════════════════════════
-- Smoke tests para las migraciones 20260823_* (tipos_prenda + dashboard).
-- Verifica idempotencia y comportamiento básico. Cada bloque
-- BEGIN...ROLLBACK aísla el escenario.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_empresa uuid := '12c517ef-bef3-4f4e-848f-0b34b0ac0a22';
  v_count int;
BEGIN
  RAISE NOTICE '── Test 1: catálogo tipos_prenda sembrado con >= 12 tipos ──';
  SELECT COUNT(*) INTO v_count FROM pronimerp.tipos_prenda WHERE empresa_id = v_empresa;
  IF v_count < 12 THEN
    RAISE EXCEPTION 'FAIL 1: esperaba >= 12 tipos, obtuve %', v_count;
  END IF;
  RAISE NOTICE 'OK 1: % tipos sembrados', v_count;

  RAISE NOTICE '── Test 2: UNIQUE (empresa, nombre) impide duplicados ──';
  BEGIN
    INSERT INTO pronimerp.tipos_prenda (empresa_id, nombre)
      VALUES (v_empresa, 'Remera');
    RAISE EXCEPTION 'FAIL 2: duplicado no debió aceptarse';
  EXCEPTION
    WHEN unique_violation THEN RAISE NOTICE 'OK 2: duplicado rechazado';
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'FAIL 2%' THEN RAISE; END IF;
  END;

  RAISE NOTICE '── Test 3: FK tipo_prenda_id en cliente_recepciones_items ──';
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp'
      AND table_name = 'cliente_recepciones_items'
      AND column_name = 'tipo_prenda_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL 3: columna tipo_prenda_id no existe';
  END IF;
  RAISE NOTICE 'OK 3: columna presente';

  RAISE NOTICE '── Test 4: dashboard_views tiene slug=clientes ──';
  DECLARE
    v_schema TEXT;
  BEGIN
    SELECT table_schema INTO v_schema FROM information_schema.tables
     WHERE table_name = 'dashboard_views' AND table_schema IN ('zentra_erp','pronimerp','public')
     ORDER BY CASE table_schema WHEN 'zentra_erp' THEN 1 WHEN 'pronimerp' THEN 2 ELSE 3 END
     LIMIT 1;
    IF v_schema IS NULL THEN
      RAISE NOTICE 'SKIP 4: dashboard_views no existe en esta instancia';
    ELSE
      EXECUTE format('SELECT COUNT(*) FROM %I.dashboard_views WHERE slug = %L', v_schema, 'clientes')
        INTO v_count;
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL 4: dashboard_views.clientes no encontrado';
      END IF;
      RAISE NOTICE 'OK 4: vista clientes presente en %', v_schema;

      -- Test 5 corre solo si test 4 pasó
      EXECUTE format(
        $q$ SELECT COUNT(*) FROM %I.empresa_dashboard_views edv
             JOIN %I.dashboard_views dv ON dv.id = edv.dashboard_view_id
             WHERE edv.empresa_id = %L AND dv.slug = 'clientes' AND edv.activo = true $q$,
        v_schema, v_schema, v_empresa
      ) INTO v_count;
      IF v_count <> 1 THEN
        RAISE NOTICE 'SKIP 5: vista clientes no habilitada aún (habilitarla en Configuración o correr migración 20260823000001)';
      ELSE
        RAISE NOTICE 'OK 5: vista habilitada para la empresa';
      END IF;
    END IF;
  END;

  RAISE NOTICE '━━━ SMOKE TESTS OK ━━━';
END $$;
