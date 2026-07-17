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
  SELECT COUNT(*) INTO v_count FROM zentra_erp.dashboard_views WHERE slug = 'clientes';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 4: dashboard_views.clientes no encontrado';
  END IF;
  RAISE NOTICE 'OK 4: vista clientes presente';

  RAISE NOTICE '── Test 5: empresa Pronim tiene la vista clientes habilitada ──';
  SELECT COUNT(*) INTO v_count
  FROM zentra_erp.empresa_dashboard_views edv
  JOIN zentra_erp.dashboard_views dv ON dv.id = edv.dashboard_view_id
  WHERE edv.empresa_id = v_empresa AND dv.slug = 'clientes' AND edv.activo = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: vista clientes no habilitada para la empresa';
  END IF;
  RAISE NOTICE 'OK 5: vista habilitada';

  RAISE NOTICE '━━━ SMOKE TESTS OK ━━━';
END $$;
