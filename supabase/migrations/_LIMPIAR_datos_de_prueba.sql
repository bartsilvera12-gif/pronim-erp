-- =============================================================================
-- LIMPIEZA DE DATOS DE PRUEBA  ·  Akakua'a / Novo Outra Vez
--
-- ESTO BORRA DATOS Y NO SE PUEDE DESHACER.
-- Antes de correrlo: Supabase -> Database -> Backups -> sacar un backup manual.
--
-- No es una migracion: el nombre empieza con "_" justo para que no se aplique
-- sola nunca. Se corre a mano, una sola vez, cuando la tienda arranca en serio.
--
-- QUE BORRA
--   . Ventas, facturas, notas de credito, pagos y cobros
--   . Compras, recepciones de prendas, creditos y cartera de clientes
--   . Caja: aperturas, cierres y movimientos
--   . Movimientos de inventario y transferencias entre sucursales
--   . Gastos, otros ingresos, presupuestos, producciones
--   . TODOS los clientes y su historial
--   . Pedidos web
--   . Los contadores (la proxima venta vuelve a ser la numero 1)
--
-- QUE NO TOCA
--   . Sucursales, usuarios, empresa y su configuracion
--   . El catalogo de PRODUCTOS (queda, pero con stock 0)
--   . Las categorias de inventario (quedan, en 0)
--   . Proveedores reales, formas de pago, promociones, metas
--   . Chat de WhatsApp, sorteos y marketing (son otros modulos; si tambien
--     los queres vaciar, se agregan a la lista)
-- =============================================================================


-- -- PASO 1 - Foto de lo que hay ahora --------------------------------------
-- Corre esto solo y guarda el resultado: es con lo que despues comparas.
SELECT 'clientes' AS tabla, count(*) FROM pronimerp.clientes
UNION ALL SELECT 'ventas',                count(*) FROM pronimerp.ventas
UNION ALL SELECT 'compras',               count(*) FROM pronimerp.compras
UNION ALL SELECT 'cajas',                 count(*) FROM pronimerp.cajas
UNION ALL SELECT 'mov. inventario',       count(*) FROM pronimerp.movimientos_inventario
UNION ALL SELECT 'productos (se quedan)', count(*) FROM pronimerp.productos
UNION ALL SELECT 'categorias (se quedan)', count(*) FROM pronimerp.categorias_productos
ORDER BY 1;


-- -- PASO 2 - El borrado ------------------------------------------------------
--
-- Dos cosas que lo hacen seguro:
--
-- 1) Solo se vacian las tablas de la lista. Lo que no esta nombrado aca no se
--    toca, por mas que dependa de algo que si se borra.
--
-- 2) El orden no esta escrito a mano. Son 256 migraciones y acertar de memoria
--    el orden de las claves foraneas es pedir que salga mal. En vez de eso se
--    intenta borrar todo; lo que falla por estar referenciado se reintenta en
--    la pasada siguiente, y asi hasta que no quede nada. Si despues de 15
--    pasadas algo no se pudo vaciar, el bloque entero revienta y Postgres
--    revierte TODO: la base queda como estaba, no a medio borrar.

DO $limpieza$
DECLARE
  -- Lista unica de lo que se vacia. Agregar o sacar lineas de aca es la unica
  -- forma de cambiar el alcance.
  objetivo text[] := ARRAY[
    -- Ventas y cobranza
    'factura_electronica_evento', 'factura_electronica',
    'nota_credito_evento', 'nota_credito_electronica', 'nota_credito',
    'factura_items', 'facturas',
    'conciliacion_pagos', 'pagos', 'cobros_clientes', 'recibos_dinero',
    'cuentas_por_cobrar', 'otros_ingresos', 'gastos',
    'promocion_aplicaciones', 'ventas_pagos_detalle', 'ventas_items',
    'atencion_operaciones', 'cambios', 'ventas',
    -- Compras, produccion y presupuestos
    'compras', 'produccion_items', 'producciones',
    'presupuesto_items', 'presupuestos',
    -- Inventario
    'transferencias_stock_items', 'transferencias_stock',
    'movimientos_inventario',
    -- Recepcion de prendas y cartera
    'cliente_recepciones_pagos', 'cliente_recepciones_items',
    'cliente_recepciones',
    'cliente_creditos_consumos', 'cliente_creditos_movimientos',
    -- Caja
    'caja_movimientos', 'pedidos_caja', 'cajas',
    -- Tienda web
    'pedidos_web_items', 'pedidos_web', 'pedidos_web_secuencia',
    -- Clientes y todo su rastro
    'cliente_eventos', 'cliente_historial', 'cliente_notas',
    'cliente_obligaciones_tributarias', 'cliente_perfil_tributario',
    'clientes',
    -- Rastros varios
    'metas_celebradas', 'comision_periodos', 'auditoria_eventos',
    'contadores_correlativos'
  ];
  pendientes text[] := '{}';
  siguiente  text[];
  t          text;
  pasada     int := 0;
  n          bigint;
  total      bigint := 0;
BEGIN
  -- Solo las que existen de verdad en esta base.
  FOREACH t IN ARRAY objetivo LOOP
    IF to_regclass('pronimerp.' || quote_ident(t)) IS NOT NULL THEN
      pendientes := pendientes || t;
    END IF;
  END LOOP;

  WHILE coalesce(array_length(pendientes, 1), 0) > 0 AND pasada < 15 LOOP
    pasada    := pasada + 1;
    siguiente := '{}';

    FOREACH t IN ARRAY pendientes LOOP
      BEGIN
        EXECUTE format('DELETE FROM pronimerp.%I', t);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
        IF n > 0 THEN
          RAISE NOTICE 'pasada % - %: % filas', pasada, t, n;
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        -- Todavia hay algo apuntandola. Va a la pasada siguiente.
        siguiente := siguiente || t;
      END;
    END LOOP;

    -- Si una pasada entera no logro borrar nada nuevo, seguir no sirve.
    EXIT WHEN siguiente = pendientes;
    pendientes := siguiente;
  END LOOP;

  IF coalesce(array_length(pendientes, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'No se pudo vaciar: %. NO SE BORRO NADA (se revirtio todo).',
      array_to_string(pendientes, ', ');
  END IF;

  RAISE NOTICE '-- Listo: % filas borradas en % pasadas --', total, pasada;
END
$limpieza$;


-- -- PASO 3 - Stock a 0, sin perder el catalogo -------------------------------
-- Los productos y las categorias se quedan; lo que vuelve a cero es el stock.
-- `productos.stock_actual` no se toca a mano: hay un trigger que lo recalcula
-- solo desde esta tabla, asi que escribirlo a mano seria pelearle.
UPDATE pronimerp.producto_stock_sucursal
   SET stock_actual = 0, updated_at = now()
 WHERE stock_actual <> 0;

-- Proveedores "sombra": los que el sistema creo solo porque un cliente trajo
-- prendas. Sin clientes no significan nada. Los proveedores de verdad quedan.
DELETE FROM pronimerp.proveedores
 WHERE es_cliente_shadow = true;


-- -- PASO 4 - Numeracion de factura de vuelta a 0000001 ----------------------
-- Dejar `numero_emitido` en NULL hace que la proxima factura sea la primera
-- del rango autorizado (0000001) en cada establecimiento.
--
-- OJO: esto solo es correcto si NINGUNA factura de prueba salio impresa y
-- quedo en manos de un cliente. Si alguna se entrego, saltate este paso.
UPDATE pronimerp.sucursal_autoimpresor_config
   SET numero_emitido = NULL, updated_at = now();


NOTIFY pgrst, 'reload schema';


-- -- PASO 5 - Verificacion ---------------------------------------------------
-- Todo en 0 menos productos y categorias.
SELECT 'clientes' AS tabla, count(*) FROM pronimerp.clientes
UNION ALL SELECT 'ventas',                count(*) FROM pronimerp.ventas
UNION ALL SELECT 'compras',               count(*) FROM pronimerp.compras
UNION ALL SELECT 'cajas',                 count(*) FROM pronimerp.cajas
UNION ALL SELECT 'mov. inventario',       count(*) FROM pronimerp.movimientos_inventario
UNION ALL SELECT 'productos (se quedan)', count(*) FROM pronimerp.productos
UNION ALL SELECT 'categorias (se quedan)', count(*) FROM pronimerp.categorias_productos
ORDER BY 1;

-- Cada categoria con su stock: tiene que dar 0 en todas.
SELECT c.nombre                               AS categoria,
       count(DISTINCT p.id)                   AS productos,
       COALESCE(SUM(pss.stock_actual), 0)     AS stock
  FROM pronimerp.categorias_productos c
  LEFT JOIN pronimerp.producto_categorias pc      ON pc.categoria_id = c.id
  LEFT JOIN pronimerp.productos p                 ON p.id = pc.producto_id
  LEFT JOIN pronimerp.producto_stock_sucursal pss ON pss.producto_id = p.id
 GROUP BY c.nombre
 ORDER BY c.nombre;
