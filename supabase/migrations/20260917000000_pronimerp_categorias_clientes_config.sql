-- Fase 2 · Tanda 11: umbrales de categorías de clientes editables
--
-- Tabla `pronimerp.categorias_clientes_config` — una fila por empresa con
-- los umbrales usados en los segmentos rápidos de /clientes:
--   - Nuevos (últimos N días desde alta)
--   - Compró esta semana (últimos N días desde última compra)
--   - Sin volver +N días
--   - Dormidos +N días
--   - VIP: mínimo N compras O top pct% del total comprado
--
-- Defaults matchean los valores hardcoded actuales para no cambiar el
-- comportamiento al aplicar la migración.
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='pronimerp' AND table_name='categorias_clientes_config') THEN
    CREATE TABLE pronimerp.categorias_clientes_config (
      empresa_id uuid PRIMARY KEY REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
      dias_nuevo         int NOT NULL DEFAULT 30  CHECK (dias_nuevo > 0),
      dias_semana        int NOT NULL DEFAULT 7   CHECK (dias_semana > 0),
      dias_sin_volver    int NOT NULL DEFAULT 60  CHECK (dias_sin_volver > 0),
      dias_dormido       int NOT NULL DEFAULT 90  CHECK (dias_dormido > 0),
      vip_min_compras    int NOT NULL DEFAULT 5   CHECK (vip_min_compras > 0),
      vip_top_pct        int NOT NULL DEFAULT 15  CHECK (vip_top_pct BETWEEN 1 AND 100),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      updated_by         uuid,
      updated_by_nombre  text
    );
  END IF;

  -- Seed: una fila por cada empresa que ya exista.
  INSERT INTO pronimerp.categorias_clientes_config (empresa_id)
  SELECT id FROM pronimerp.empresas
   ON CONFLICT (empresa_id) DO NOTHING;

  -- RLS estándar
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='pronimerp' AND p.proname='puede_acceder_empresa'
  ) THEN
    EXECUTE 'ALTER TABLE pronimerp.categorias_clientes_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS p_cat_cli_cfg_all ON pronimerp.categorias_clientes_config';
    EXECUTE 'CREATE POLICY p_cat_cli_cfg_all ON pronimerp.categorias_clientes_config
             FOR ALL USING (pronimerp.puede_acceder_empresa(empresa_id))
             WITH CHECK (pronimerp.puede_acceder_empresa(empresa_id))';
  END IF;
END
$mig$;
