-- Vistas guardadas genéricas de cualquier reporte (por usuario + reporte_key).
--
-- Reemplaza el patrón per-tabla del segmento de clientes. La clave `reporte_key`
-- identifica el reporte (ventas / descuentos / creditos / evaluaciones /
-- inventario / metas / cajas / conciliacion / segmentos_clientes).
--
-- Idempotente.

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'clientes' AND table_schema IN ('public','pronimerp')
  LOOP
    EXECUTE format($sql$
      CREATE TABLE IF NOT EXISTS %I.reporte_vistas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        usuario_id uuid NOT NULL,
        reporte_key text NOT NULL,
        nombre text NOT NULL,
        filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_reporte_vistas_user_key_nombre UNIQUE (usuario_id, reporte_key, nombre),
        CONSTRAINT chk_reporte_vistas_nombre_len CHECK (length(trim(nombre)) BETWEEN 1 AND 80),
        CONSTRAINT chk_reporte_vistas_key_len CHECK (length(trim(reporte_key)) BETWEEN 1 AND 40)
      )
    $sql$, s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_reporte_vistas_user_key ON %I.reporte_vistas (empresa_id, usuario_id, reporte_key)',
      s
    );
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
