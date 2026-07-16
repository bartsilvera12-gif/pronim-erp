-- =====================================================================
-- Pronim Consultoría — Config de alertas contextuales en caja/atención
-- ---------------------------------------------------------------------
-- Al confirmar una atención en /caja, salta un modal que:
--   1) muestra alertas condicionadas según el ticket (precios y cantidades)
--   2) presenta un checklist de beneficios entregables (cashback, ecobag,
--      regalito del día, descuento manual).
--
-- Los umbrales y los mensajes son configurables por empresa. Guardamos
-- todo en una sola columna JSONB para poder evolucionar el esquema sin
-- nuevas migraciones (basta con leer/escribir claves nuevas).
--
-- Forma esperada del JSON:
-- {
--   "prendas_caras": {
--     "activa": true,
--     "precio_min": 39000,
--     "titulo": "Invitá al cliente a traer prendas",
--     "mensaje": "Recordale que si estas prendas dejan de servirle, puede traerlas para evaluación y obtener crédito."
--   },
--   "prendas_baratas": {
--     "activa": true,
--     "precio_max": 14000,
--     "titulo": "Comentá la reposición de los lunes",
--     "mensaje": "Todos los lunes reponemos prendas de promoción — invitá al cliente a pasar."
--   },
--   "pocas_prendas": {
--     "activa": true,
--     "cantidad_max": 2,
--     "titulo": "¿Mostraste todo?",
--     "mensaje": "Antes de cerrar, verificá que hayas mostrado todo lo que podría interesarle al cliente."
--   },
--   "beneficios": [
--     { "id": "cashback",         "label": "Cashback",         "tipo_evento": "cashback",  "pide_monto": true,  "genera_credito": true },
--     { "id": "ecobag",           "label": "Ecobag",           "tipo_evento": "beneficio", "pide_monto": false, "genera_credito": false },
--     { "id": "regalo_dia",       "label": "Regalito del día", "tipo_evento": "beneficio", "pide_monto": false, "genera_credito": false },
--     { "id": "descuento_manual", "label": "Descuento manual", "tipo_evento": "descuento", "pide_monto": true,  "genera_credito": false }
--   ]
-- }
-- =====================================================================

BEGIN;

ALTER TABLE pronimerp.empresas
  ADD COLUMN IF NOT EXISTS alertas_atencion_config jsonb NOT NULL DEFAULT jsonb_build_object(
    'prendas_caras', jsonb_build_object(
      'activa', true,
      'precio_min', 39000,
      'titulo', 'Invitá al cliente a traer prendas',
      'mensaje', 'Recordale que si estas prendas dejan de servirle, puede traerlas para evaluación y obtener crédito.'
    ),
    'prendas_baratas', jsonb_build_object(
      'activa', true,
      'precio_max', 14000,
      'titulo', 'Comentá la reposición de los lunes',
      'mensaje', 'Todos los lunes reponemos prendas de promoción — invitá al cliente a pasar.'
    ),
    'pocas_prendas', jsonb_build_object(
      'activa', true,
      'cantidad_max', 2,
      'titulo', '¿Mostraste todo?',
      'mensaje', 'Antes de cerrar, verificá que hayas mostrado todo lo que podría interesarle al cliente.'
    ),
    'beneficios', jsonb_build_array(
      jsonb_build_object('id','cashback',         'label','Cashback',         'tipo_evento','cashback',  'pide_monto', true,  'genera_credito', true),
      jsonb_build_object('id','ecobag',           'label','Ecobag',           'tipo_evento','beneficio', 'pide_monto', false, 'genera_credito', false),
      jsonb_build_object('id','regalo_dia',       'label','Regalito del día', 'tipo_evento','beneficio', 'pide_monto', false, 'genera_credito', false),
      jsonb_build_object('id','descuento_manual', 'label','Descuento manual', 'tipo_evento','descuento', 'pide_monto', true,  'genera_credito', false)
    )
  );

COMMENT ON COLUMN pronimerp.empresas.alertas_atencion_config IS
  'Configuración por empresa del modal previo al cierre de atención en /caja: umbrales de las 3 alertas y opciones del checklist de beneficios.';

COMMIT;
