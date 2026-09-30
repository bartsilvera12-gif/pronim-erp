-- ============================================================================
--  Carga del timbrado de autoimpresor de Akakua'a.
--
--  Timbrado 19109847 · vigencia 08/09/2026 al 30/09/2027
--    Lillo    → 001-002-0000001 a 001-002-0005000
--    Palmeras → 002-002-0000001 a 002-002-0005000
--
--  ANTES de correr esto tiene que estar aplicada la migración
--  20260930000000_autoimpresor_por_sucursal.sql.
--
--  ⚠️ Completá el RUC y la razón social abajo antes de ejecutar.
-- ============================================================================

DO $carga$
DECLARE
  v_empresa uuid;
  v_lillo   uuid;
  v_palm    uuid;

  -- ▼▼▼ COMPLETAR ▼▼▼
  c_ruc          text := 'COMPLETAR-RUC';        -- ej: '80012345-6'
  c_razon_social text := 'COMPLETAR RAZON SOCIAL';
  c_fantasia     text := 'AKAKUAA';
  c_direccion    text := 'COMPLETAR DIRECCION';
  c_telefono     text := NULL;
  -- ▲▲▲ COMPLETAR ▲▲▲
BEGIN
  SELECT id INTO v_empresa FROM pronimerp.empresas LIMIT 1;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'No encontré la empresa en pronimerp.empresas';
  END IF;

  SELECT id INTO v_lillo FROM pronimerp.sucursales
   WHERE empresa_id = v_empresa AND upper(nombre) LIKE '%LILLO%' LIMIT 1;
  SELECT id INTO v_palm  FROM pronimerp.sucursales
   WHERE empresa_id = v_empresa AND upper(nombre) LIKE '%PALMERA%' LIMIT 1;

  IF v_lillo IS NULL THEN RAISE EXCEPTION 'No encontré la sucursal LILLO'; END IF;
  IF v_palm  IS NULL THEN RAISE EXCEPTION 'No encontré la sucursal PALMERAS'; END IF;

  -- ── Datos comunes del timbrado (nivel empresa) ────────────────────────
  INSERT INTO pronimerp.empresa_autoimpresor_config (
    empresa_id, activo, ruc_emisor, razon_social_emisor, nombre_fantasia,
    direccion_matriz, telefono,
    timbrado_numero, timbrado_inicio_vigencia, timbrado_fin_vigencia,
    tipo_documento_default, formato_impresion_default
  ) VALUES (
    v_empresa, true, c_ruc, c_razon_social, c_fantasia,
    c_direccion, c_telefono,
    '19109847', DATE '2026-09-08', DATE '2027-09-30',
    'factura', 'ticket_80mm'
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    activo                    = true,
    ruc_emisor                = EXCLUDED.ruc_emisor,
    razon_social_emisor       = EXCLUDED.razon_social_emisor,
    nombre_fantasia           = EXCLUDED.nombre_fantasia,
    direccion_matriz          = EXCLUDED.direccion_matriz,
    telefono                  = EXCLUDED.telefono,
    timbrado_numero           = EXCLUDED.timbrado_numero,
    timbrado_inicio_vigencia  = EXCLUDED.timbrado_inicio_vigencia,
    timbrado_fin_vigencia     = EXCLUDED.timbrado_fin_vigencia,
    formato_impresion_default = 'ticket_80mm',
    updated_at                = now();

  -- ── Modo de facturación: autoimpresor ─────────────────────────────────
  INSERT INTO pronimerp.empresa_facturacion_modo (empresa_id, modo, impresion_tipo_default)
  VALUES (v_empresa, 'autoimpresor', 'ticket_80mm')
  ON CONFLICT (empresa_id) DO UPDATE SET
    modo = 'autoimpresor',
    impresion_tipo_default = 'ticket_80mm',
    updated_at = now();

  -- ── Numeración por establecimiento ────────────────────────────────────
  -- OJO: `numero_emitido` queda en NULL a propósito = todavía no se emitió
  -- ninguna, así que la primera factura de cada local va a ser la 0000001.
  INSERT INTO pronimerp.sucursal_autoimpresor_config (
    sucursal_id, empresa_id, activo,
    establecimiento_codigo, punto_expedicion_codigo,
    numero_inicial, numero_final
  ) VALUES
    (v_lillo, v_empresa, true, '001', '002', 1, 5000),
    (v_palm,  v_empresa, true, '002', '002', 1, 5000)
  ON CONFLICT (sucursal_id) DO UPDATE SET
    activo                  = true,
    establecimiento_codigo  = EXCLUDED.establecimiento_codigo,
    punto_expedicion_codigo = EXCLUDED.punto_expedicion_codigo,
    numero_inicial          = EXCLUDED.numero_inicial,
    numero_final            = EXCLUDED.numero_final,
    updated_at              = now();

  RAISE NOTICE 'Listo. Lillo=% Palmeras=%', v_lillo, v_palm;
END
$carga$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
SELECT s.nombre AS sucursal,
       c.establecimiento_codigo || '-' || c.punto_expedicion_codigo
         || '-' || lpad((COALESCE(c.numero_emitido, c.numero_inicial - 1) + 1)::text, 7, '0')
         AS proxima_factura,
       c.numero_inicial, c.numero_final, c.activo
  FROM pronimerp.sucursal_autoimpresor_config c
  JOIN pronimerp.sucursales s ON s.id = c.sucursal_id
 ORDER BY c.establecimiento_codigo;
