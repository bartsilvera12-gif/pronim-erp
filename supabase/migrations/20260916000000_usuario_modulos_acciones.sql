-- Fase 2 · Tanda 10: permisos granulares por acción
--
-- `public.usuario_modulos` obtiene una columna `acciones jsonb` con las 4
-- acciones estándar por módulo:
--   { "ver": true, "crear": true, "editar": true, "eliminar": true }
--
-- Filas existentes → all true (comportamiento actual preservado).
--
-- El nombre de las acciones es flexible: cualquier flag adicional que la
-- app quiera evaluar (ej: "anular", "descontar", "conciliar") se lee del
-- mismo jsonb con default = false si no está seteado.
--
-- Idempotente.

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='usuario_modulos') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='usuario_modulos'
                    AND column_name='acciones') THEN
    ALTER TABLE public.usuario_modulos
      ADD COLUMN acciones jsonb NOT NULL DEFAULT '{"ver":true,"crear":true,"editar":true,"eliminar":true}'::jsonb;
  END IF;

  -- Backfill: filas viejas quedan con todo permitido.
  UPDATE public.usuario_modulos
     SET acciones = '{"ver":true,"crear":true,"editar":true,"eliminar":true}'::jsonb
   WHERE acciones IS NULL OR acciones = '{}'::jsonb;
END
$mig$;
