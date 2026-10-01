-- ============================================================================
--  Completar los datos del emisor que salen impresos en la factura.
--
--  La factura salió con "COMPLETAR RAZON SOCIAL" porque el script de carga se
--  ejecutó sin reemplazar los marcadores. Esto los arregla sin tocar la
--  numeración: las facturas ya emitidas conservan su número.
--
--  ⚠️ Reemplazá los tres valores de abajo por los reales (los del RUC).
--  Son los que la SET exige que figuren en el comprobante.
-- ============================================================================

UPDATE pronimerp.empresa_autoimpresor_config
   SET ruc_emisor          = 'COMPLETAR-RUC',          -- ej: '80012345-6'
       razon_social_emisor = 'COMPLETAR RAZON SOCIAL', -- como figura en el RUC
       direccion_matriz    = 'COMPLETAR DIRECCION',    -- dirección del local
       telefono            = NULL,                      -- opcional
       nombre_fantasia     = 'AKAKUAA',
       -- Logo impreso arriba del comprobante. Dejalo en NULL si no querés logo.
       logo_url            = '/akakuaa/brand/akakuaa.png',
       updated_at          = now()
 WHERE empresa_id = (SELECT id FROM pronimerp.empresas LIMIT 1);

NOTIFY pgrst, 'reload schema';

-- ── Verificación: no tiene que quedar ningún "COMPLETAR" ───────────────────
SELECT ruc_emisor, razon_social_emisor, nombre_fantasia,
       direccion_matriz, telefono, logo_url,
       timbrado_numero, timbrado_inicio_vigencia, timbrado_fin_vigencia
  FROM pronimerp.empresa_autoimpresor_config;
