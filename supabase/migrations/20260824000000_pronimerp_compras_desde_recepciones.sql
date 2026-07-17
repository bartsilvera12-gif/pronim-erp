-- =====================================================================
-- Pronim — Registrar las recepciones de cliente como compras en el ERP
-- ---------------------------------------------------------------------
-- Objetivo: todo lo que un cliente TRAE queda registrado como una fila
-- en pronimerp.compras (una por cada item de recepción), sin romper el
-- shape existente de la tabla.
--
-- Estrategia:
--   1) Cada cliente que trae genera (idempotente) un proveedor "shadow"
--      en pronimerp.proveedores con `es_cliente_shadow=true` y FK
--      cliente_id. Un solo shadow por cliente aunque traiga N veces.
--   2) Cada item de recepción se refleja como 1 fila en
--      pronimerp.compras con recepcion_id + item_recepcion_id de link.
--   3) El proveedor_id apunta al shadow.
--   4) nro_timbrado = 'S/T' (sin timbrado — recepción de particular).
--   5) numero_control = el de la recepción.
--
-- Se agrega la función pronimerp.ensure_proveedor_from_cliente(emp, cli)
-- que devuelve el id del proveedor shadow (lo crea si no existe).
--
-- Backfill: al final de la migración se insertan las filas de compras
-- para todas las recepciones no anuladas que aún no tengan compra
-- linkeada (recepcion_id IS NOT NULL).
--
-- Idempotente: todos los ADD COLUMN son IF NOT EXISTS; el backfill
-- usa NOT EXISTS para no duplicar; la función es CREATE OR REPLACE.
--
-- Solo toca schema pronimerp.
-- =====================================================================

BEGIN;

-- ── 1) Extensión mínima de pronimerp.proveedores ───────────────────────
-- Diferenciamos los proveedores "shadow" para no ensuciar reportes de
-- proveedores reales.
ALTER TABLE pronimerp.proveedores
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS es_cliente_shadow boolean NOT NULL DEFAULT false;

-- Unicidad: 1 shadow por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_cliente_shadow
  ON pronimerp.proveedores (empresa_id, cliente_id)
  WHERE es_cliente_shadow = true AND cliente_id IS NOT NULL;

-- FK débil: no CASCADE porque la política actual de clientes deja soft-delete;
-- si el cliente se borra "de verdad", el shadow queda huérfano y se puede
-- limpiar en un cleanup posterior.
COMMENT ON COLUMN pronimerp.proveedores.cliente_id IS
  'Si es_cliente_shadow=true, apunta al cliente cuya recepción originó este proveedor sombra. Un cliente = un shadow por empresa.';

-- ── 2) Link de compras con recepciones ─────────────────────────────────
ALTER TABLE pronimerp.compras
  ADD COLUMN IF NOT EXISTS recepcion_id uuid,
  ADD COLUMN IF NOT EXISTS item_recepcion_id uuid;

CREATE INDEX IF NOT EXISTS idx_compras_recepcion
  ON pronimerp.compras (recepcion_id)
  WHERE recepcion_id IS NOT NULL;

-- Un item de recepción produce exactamente una fila de compra.
CREATE UNIQUE INDEX IF NOT EXISTS ux_compras_item_recepcion
  ON pronimerp.compras (item_recepcion_id)
  WHERE item_recepcion_id IS NOT NULL;

COMMENT ON COLUMN pronimerp.compras.recepcion_id IS
  'Si la compra proviene de una recepción de cliente (Pronim), link a pronimerp.cliente_recepciones.id. NULL si es compra a proveedor externo tradicional.';

-- ── 3) Helper: ensure_proveedor_from_cliente ───────────────────────────
CREATE OR REPLACE FUNCTION pronimerp.ensure_proveedor_from_cliente(
  p_empresa uuid,
  p_cliente uuid
) RETURNS uuid AS $fn$
DECLARE
  v_id uuid;
  v_nombre text;
  v_ruc text;
BEGIN
  -- ¿Ya tiene shadow?
  SELECT id INTO v_id
  FROM pronimerp.proveedores
  WHERE empresa_id = p_empresa
    AND cliente_id = p_cliente
    AND es_cliente_shadow = true
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Datos del cliente para poblar el shadow.
  SELECT
    COALESCE(NULLIF(TRIM(nombre_contacto), ''),
             NULLIF(TRIM(empresa), ''),
             NULLIF(TRIM(nombre), ''),
             'Cliente'),
    ruc
  INTO v_nombre, v_ruc
  FROM pronimerp.clientes
  WHERE id = p_cliente AND empresa_id = p_empresa;

  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'ensure_proveedor_from_cliente: cliente % no existe en empresa %', p_cliente, p_empresa;
  END IF;

  INSERT INTO pronimerp.proveedores (
    empresa_id, nombre, ruc, estado, cliente_id, es_cliente_shadow
  ) VALUES (
    p_empresa, v_nombre, v_ruc, 'activo', p_cliente, true
  )
  -- El predicado del ON CONFLICT debe matchear EXACTAMENTE al WHERE
  -- del indice parcial ux_proveedores_cliente_shadow (Postgres lo exige).
  ON CONFLICT (empresa_id, cliente_id) WHERE es_cliente_shadow = true AND cliente_id IS NOT NULL
  DO UPDATE SET nombre = EXCLUDED.nombre, ruc = EXCLUDED.ruc
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pronimerp.ensure_proveedor_from_cliente(uuid, uuid)
  TO authenticated, service_role;

-- ── 4) Backfill de recepciones no anuladas → compras ───────────────────
-- Idempotente: solo inserta si NO existe compra con ese item_recepcion_id.
-- Anula compras cuya recepción esté anulada (por si hubiera algún caso).
DO $backfill$
DECLARE
  r RECORD;
  v_prov uuid;
  v_prov_nombre text;
BEGIN
  FOR r IN
    SELECT cr.id AS recepcion_id, cr.empresa_id, cr.cliente_id,
           cr.sucursal_id, cr.numero_control, cr.fecha, cr.estado
    FROM pronimerp.cliente_recepciones cr
    WHERE cr.cliente_id IS NOT NULL
      AND cr.estado <> 'anulada'
      AND EXISTS (
        SELECT 1 FROM pronimerp.cliente_recepciones_items i
        WHERE i.recepcion_id = cr.id
          AND NOT EXISTS (
            SELECT 1 FROM pronimerp.compras c WHERE c.item_recepcion_id = i.id
          )
      )
  LOOP
    v_prov := pronimerp.ensure_proveedor_from_cliente(r.empresa_id, r.cliente_id);
    SELECT nombre INTO v_prov_nombre FROM pronimerp.proveedores WHERE id = v_prov;

    INSERT INTO pronimerp.compras (
      empresa_id, proveedor_id, proveedor_nombre,
      producto_id, producto_nombre, cantidad,
      moneda, tipo_cambio,
      costo_unitario_original, costo_unitario,
      iva_tipo, subtotal, monto_iva, total, precio_venta,
      tipo_pago, nro_timbrado, numero_control, estado, fecha,
      sucursal_id, recepcion_id, item_recepcion_id
    )
    SELECT
      r.empresa_id, v_prov, v_prov_nombre,
      i.producto_id, COALESCE(i.producto_nombre, 'Prenda'), i.cantidad,
      'PYG', 1,
      COALESCE(i.precio_compra_unitario, 0), COALESCE(i.precio_compra_unitario, 0),
      'exenta',
      i.cantidad * COALESCE(i.precio_compra_unitario, 0),
      0,
      i.cantidad * COALESCE(i.precio_compra_unitario, 0),
      COALESCE(i.precio_venta_snapshot, 0),
      'contado', 'S/T', r.numero_control, 'registrada', r.fecha,
      r.sucursal_id, r.recepcion_id, i.id
    FROM pronimerp.cliente_recepciones_items i
    WHERE i.recepcion_id = r.recepcion_id
      AND NOT EXISTS (SELECT 1 FROM pronimerp.compras c WHERE c.item_recepcion_id = i.id);
  END LOOP;
END
$backfill$;

-- ── 5) Cerrar consistencia: compras de recepciones anuladas → estado='anulada' ──
UPDATE pronimerp.compras c
SET estado = 'anulada', updated_at = now()
FROM pronimerp.cliente_recepciones cr
WHERE cr.id = c.recepcion_id
  AND cr.estado = 'anulada'
  AND c.estado <> 'anulada';

COMMIT;
