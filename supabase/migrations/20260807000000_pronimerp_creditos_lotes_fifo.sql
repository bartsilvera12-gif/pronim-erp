-- =====================================================================
-- Pronim Consultoría — Créditos por LOTES con consumo FIFO
-- ---------------------------------------------------------------------
-- Extiende el modelo agregado de créditos a un ledger por asiento:
--   * Cada ENTRADA es un "lote" con vida propia.
--   * Cada SALIDA se distribuye FIFO entre las ENTRADAs vivas
--     (más viejas primero), y las asignaciones parciales quedan
--     registradas en cliente_creditos_consumos.
--   * Permite responder "cuánto queda de ESTE crédito específico" y
--     "cuándo/en qué venta se usó".
--
-- Además realiza un backfill de las SALIDAs históricas para
-- reconstruir la trazabilidad FIFO de lo ya cargado.
--
-- Aplica solo al schema `pronimerp`. Idempotente.
-- =====================================================================

BEGIN;

-- 1) Tabla que enlaza SALIDAs con ENTRADAs (consumos parciales)
CREATE TABLE IF NOT EXISTS pronimerp.cliente_creditos_consumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  entrada_id uuid NOT NULL
    REFERENCES pronimerp.cliente_creditos_movimientos(id) ON DELETE CASCADE,
  salida_id uuid NOT NULL
    REFERENCES pronimerp.cliente_creditos_movimientos(id) ON DELETE CASCADE,
  monto_aplicado numeric NOT NULL CHECK (monto_aplicado > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creditos_consumos_entrada
  ON pronimerp.cliente_creditos_consumos (entrada_id);
CREATE INDEX IF NOT EXISTS idx_creditos_consumos_salida
  ON pronimerp.cliente_creditos_consumos (salida_id);
CREATE INDEX IF NOT EXISTS idx_creditos_consumos_empresa
  ON pronimerp.cliente_creditos_consumos (empresa_id);

-- 2) View: por cada ENTRADA muestra monto_inicial, monto_consumido y saldo.
CREATE OR REPLACE VIEW pronimerp.v_cliente_creditos_lotes AS
SELECT
  e.id AS entrada_id,
  e.empresa_id,
  e.cliente_id,
  e.origen,
  e.referencia_tipo,
  e.referencia_numero,
  e.observaciones,
  e.fecha AS fecha_ingreso,
  e.monto AS monto_inicial,
  COALESCE(SUM(c.monto_aplicado), 0) AS monto_consumido,
  (e.monto - COALESCE(SUM(c.monto_aplicado), 0)) AS saldo_restante,
  e.created_by,
  e.usuario_nombre
FROM pronimerp.cliente_creditos_movimientos e
LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
WHERE e.tipo IN ('ENTRADA', 'AJUSTE')
GROUP BY e.id;

-- 3) RLS + grants
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pronimerp' AND p.proname = 'puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.cliente_creditos_consumos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_creditos_consumos_all ON pronimerp.cliente_creditos_consumos';
    EXECUTE 'CREATE POLICY p_creditos_consumos_all ON pronimerp.cliente_creditos_consumos
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  pronimerp.cliente_creditos_consumos
TO authenticated, service_role;
GRANT SELECT ON pronimerp.v_cliente_creditos_lotes TO authenticated, service_role;

-- 4) Backfill FIFO: recorre las SALIDAs históricas por cliente, en orden
--    ASC de fecha, y las asigna FIFO a las ENTRADAs vivas del cliente.
--    Solo procesa SALIDAs que no tengan asignaciones (idempotente).
DO $$
DECLARE
  r_salida RECORD;
  r_entrada RECORD;
  restante numeric;
  aplicar numeric;
  saldo_entrada numeric;
BEGIN
  FOR r_salida IN
    SELECT s.id, s.empresa_id, s.cliente_id, s.monto, s.fecha
    FROM pronimerp.cliente_creditos_movimientos s
    WHERE s.tipo = 'SALIDA'
      AND NOT EXISTS (
        SELECT 1 FROM pronimerp.cliente_creditos_consumos c
        WHERE c.salida_id = s.id
      )
    ORDER BY s.cliente_id, s.fecha ASC, s.created_at ASC
  LOOP
    restante := r_salida.monto;

    -- ENTRADAs vivas del cliente, más viejas primero, cuya fecha <= salida
    FOR r_entrada IN
      SELECT e.id, e.monto,
             (e.monto - COALESCE((
                SELECT SUM(c.monto_aplicado)
                FROM pronimerp.cliente_creditos_consumos c
                WHERE c.entrada_id = e.id
              ), 0)) AS saldo
      FROM pronimerp.cliente_creditos_movimientos e
      WHERE e.cliente_id = r_salida.cliente_id
        AND e.empresa_id = r_salida.empresa_id
        AND e.tipo IN ('ENTRADA', 'AJUSTE')
        AND e.fecha <= r_salida.fecha
      ORDER BY e.fecha ASC, e.created_at ASC
    LOOP
      EXIT WHEN restante <= 0;
      saldo_entrada := r_entrada.saldo;
      IF saldo_entrada <= 0 THEN
        CONTINUE;
      END IF;
      IF saldo_entrada >= restante THEN
        aplicar := restante;
      ELSE
        aplicar := saldo_entrada;
      END IF;
      INSERT INTO pronimerp.cliente_creditos_consumos
        (empresa_id, entrada_id, salida_id, monto_aplicado)
      VALUES
        (r_salida.empresa_id, r_entrada.id, r_salida.id, aplicar);
      restante := restante - aplicar;
    END LOOP;

    -- Si restante > 0, la SALIDA histórica excede lo disponible: dejamos
    -- log en observaciones (best-effort; no bloqueamos la migración).
    IF restante > 0 THEN
      UPDATE pronimerp.cliente_creditos_movimientos
         SET observaciones = COALESCE(observaciones, '') ||
             ' [backfill: ' || restante::text || ' Gs. sin lote asignado]'
       WHERE id = r_salida.id;
    END IF;
  END LOOP;
END $$;

COMMIT;
