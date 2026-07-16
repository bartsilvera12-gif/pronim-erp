-- =====================================================================
-- Pronim — Overrides por segmento de cliente en alertas de atención.
-- ---------------------------------------------------------------------
-- Extiende `pronimerp.empresas.alertas_atencion_config` para que cada
-- alerta acepte un mapa `overrides` con títulos/mensajes distintos según
-- el segmento del cliente (vip, habitual, nuevo, dormido) o las flags
-- (con_reclamos, con_beneficios). Si el cliente no calza con ningún
-- override, se usa el mensaje default de la alerta.
--
-- Forma del override (parcial — solo las claves que se quieran redefinir):
--   { "titulo": "...", "mensaje": "..." }
--
-- Precedencia al elegir el mensaje a mostrar:
--   1) con_reclamos   (flag)
--   2) con_beneficios (flag)
--   3) categoria del cliente (vip | nuevo | dormido | habitual)
--   4) default de la alerta
-- =====================================================================

BEGIN;

-- Backfill: agrega `overrides: {}` a cada alerta existente si falta.
UPDATE pronimerp.empresas
SET alertas_atencion_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          alertas_atencion_config,
          '{prendas_caras,overrides}',
          COALESCE(alertas_atencion_config #> '{prendas_caras,overrides}', '{}'::jsonb),
          true
        ),
        '{prendas_baratas,overrides}',
        COALESCE(alertas_atencion_config #> '{prendas_baratas,overrides}', '{}'::jsonb),
        true
      ),
      '{pocas_prendas,overrides}',
      COALESCE(alertas_atencion_config #> '{pocas_prendas,overrides}', '{}'::jsonb),
      true
    )
WHERE alertas_atencion_config IS NOT NULL;

-- Cambia el DEFAULT de la columna para que empresas nuevas ya nazcan
-- con `overrides: {}` presente en cada alerta.
ALTER TABLE pronimerp.empresas
  ALTER COLUMN alertas_atencion_config
  SET DEFAULT jsonb_build_object(
    'prendas_caras', jsonb_build_object(
      'activa', true,
      'precio_min', 39000,
      'titulo', 'Invitá al cliente a traer prendas',
      'mensaje', 'Recordale que si estas prendas dejan de servirle, puede traerlas para evaluación y obtener crédito.',
      'overrides', '{}'::jsonb
    ),
    'prendas_baratas', jsonb_build_object(
      'activa', true,
      'precio_max', 14000,
      'titulo', 'Comentá la reposición de los lunes',
      'mensaje', 'Todos los lunes reponemos prendas de promoción — invitá al cliente a pasar.',
      'overrides', '{}'::jsonb
    ),
    'pocas_prendas', jsonb_build_object(
      'activa', true,
      'cantidad_max', 2,
      'titulo', '¿Mostraste todo?',
      'mensaje', 'Antes de cerrar, verificá que hayas mostrado todo lo que podría interesarle al cliente.',
      'overrides', '{}'::jsonb
    ),
    'beneficios', jsonb_build_array(
      jsonb_build_object('id','cashback',         'label','Cashback',         'tipo_evento','cashback',  'pide_monto', true,  'genera_credito', true),
      jsonb_build_object('id','ecobag',           'label','Ecobag',           'tipo_evento','beneficio', 'pide_monto', false, 'genera_credito', false),
      jsonb_build_object('id','regalo_dia',       'label','Regalito del día', 'tipo_evento','beneficio', 'pide_monto', false, 'genera_credito', false),
      jsonb_build_object('id','descuento_manual', 'label','Descuento manual', 'tipo_evento','descuento', 'pide_monto', true,  'genera_credito', false)
    )
  );

COMMIT;
