-- Fase 2 · Tanda 10 (bis): permisos granulares por acción — schema-agnostico
--
-- La migración original (20260916000000_usuario_modulos_acciones.sql) asumía
-- que `usuario_modulos` vivía en `public`. En instalaciones monocliente Pronim
-- la tabla puede estar en `pronimerp`. Esta variante agrega la columna
-- `acciones jsonb` en cualquier schema (`public` o `pronimerp`) donde exista
-- la tabla, con backfill = todo permitido.
--
-- Idempotente. Corré esta migración las veces que quieras — no rompe nada.

DO $mig$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'usuario_modulos'
        AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'usuario_modulos' AND column_name = 'acciones'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.usuario_modulos
           ADD COLUMN acciones jsonb NOT NULL DEFAULT ''{"ver":true,"crear":true,"editar":true,"eliminar":true}''::jsonb',
        s
      );
    END IF;

    EXECUTE format(
      'UPDATE %I.usuario_modulos
          SET acciones = ''{"ver":true,"crear":true,"editar":true,"eliminar":true}''::jsonb
        WHERE acciones IS NULL OR acciones = ''{}''::jsonb',
      s
    );
  END LOOP;
END
$mig$;
