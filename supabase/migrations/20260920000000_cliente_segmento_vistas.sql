-- Vistas guardadas de segmentos de clientes (por usuario).
--
-- Permite que la admin guarde una combinación de filtros con nombre
-- (ej. "VIP con crédito e inactivos") y la recupere con un click desde
-- /clientes/segmentos.
--
-- Idempotente. Aplica en el schema donde exista `clientes` (public o pronimerp).

DO $mig$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'clientes' AND table_schema IN ('public','pronimerp')
  LOOP
    EXECUTE format($sql$
      CREATE TABLE IF NOT EXISTS %I.cliente_segmento_vistas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        usuario_id uuid NOT NULL,
        nombre text NOT NULL,
        filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_cli_seg_vistas_user_nombre UNIQUE (usuario_id, nombre),
        CONSTRAINT chk_cli_seg_vistas_nombre_len CHECK (length(trim(nombre)) BETWEEN 1 AND 80)
      )
    $sql$, s);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_cli_seg_vistas_empresa_user ON %I.cliente_segmento_vistas (empresa_id, usuario_id)',
      s
    );
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
