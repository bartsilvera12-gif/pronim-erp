-- ============================================================================
-- Cambia el UNIQUE de numero_caja para que sea POR SUCURSAL, no por empresa.
--
-- Antes: uq_cajas_empresa_numero UNIQUE (empresa_id, numero_caja) — cross
-- sucursal. Al numerar cajas por sucursal (Sucursal 2 arranca en N° 1),
-- chocaba con las N° 1..N de Principal. Error superficial: "Ya hay una
-- caja abierta" (mensaje generico del branch 23505 de abrirCajaPg).
--
-- Ahora: UNIQUE (empresa_id, sucursal_id, numero_caja) — cada sucursal
-- tiene su propio secuencial sin colisionar con las demas.
-- ============================================================================

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pronimerp' AND table_name = 'cajas'
  ) THEN
    ALTER TABLE pronimerp.cajas
      DROP CONSTRAINT IF EXISTS uq_cajas_empresa_numero;

    -- COALESCE para tolerar cajas legacy sin sucursal_id (raro pero
    -- posible en instancias viejas).
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_empresa_sucursal_numero
      ON pronimerp.cajas (
        empresa_id,
        COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid),
        numero_caja
      );
  END IF;
END
$do$ LANGUAGE plpgsql;
