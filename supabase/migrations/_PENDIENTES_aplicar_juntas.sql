-- ============================================================================
--  PRONIM ERP — 5 migraciones pendientes, en un solo bloque.
--  Pegar entero en el SQL Editor de Supabase y ejecutar. Es idempotente:
--  si algo ya está aplicado, esa parte no hace nada. Se puede correr 2 veces.
--
--  1) gastos.sucursal_id            → columna + filtro de sucursal en Gastos
--  2) clientes.telefono/email_secundario → guardar los datos secundarios
--  3) clientes.usa_nota_remision    → arregla el error al editar un cliente
--  4) productos.costo_promedio < 0  → arregla el error al cerrar una venta
--  5) sucursales.dias_cerrados      → días hábiles configurables por sucursal
-- ============================================================================

DO $mig$
DECLARE s text; n integer;
BEGIN

  -- ── 1) GASTOS POR SUCURSAL ───────────────────────────────────────────────
  -- Nullable a propósito: los gastos viejos y los "generales de la empresa"
  -- quedan sin sucursal.
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'gastos' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'gastos' AND column_name = 'sucursal_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN sucursal_id uuid', s);
      IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = s AND table_name = 'sucursales') THEN
        BEGIN
          EXECUTE format('ALTER TABLE %I.gastos ADD CONSTRAINT gastos_sucursal_fk '
                      || 'FOREIGN KEY (sucursal_id) REFERENCES %I.sucursales(id) ON DELETE SET NULL', s, s);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END IF;
      EXECUTE format('CREATE INDEX IF NOT EXISTS gastos_sucursal_idx ON %I.gastos (empresa_id, sucursal_id)', s);
      RAISE NOTICE '[1] %.gastos: sucursal_id agregada', s;
    END IF;
  END LOOP;

  -- ── 2, 3) COLUMNAS DE CLIENTES ───────────────────────────────────────────
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'clientes' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = s AND table_name = 'clientes'
                       AND column_name = 'telefono_secundario') THEN
      EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN telefono_secundario text', s);
      RAISE NOTICE '[2] %.clientes: telefono_secundario agregada', s;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = s AND table_name = 'clientes'
                       AND column_name = 'email_secundario') THEN
      EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN email_secundario text', s);
      RAISE NOTICE '[2] %.clientes: email_secundario agregada', s;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = s AND table_name = 'clientes'
                       AND column_name = 'usa_nota_remision') THEN
      EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN usa_nota_remision boolean NOT NULL DEFAULT false', s);
      RAISE NOTICE '[3] %.clientes: usa_nota_remision agregada', s;
    END IF;
  END LOOP;

  -- ── 4) COSTO PROMEDIO NEGATIVO ───────────────────────────────────────────
  -- Un costo negativo no tiene sentido contable y rompía el check
  -- `ventas_items_costo_snapshot_nonneg` al cerrar la venta. El cálculo ya
  -- está corregido en el código; esto limpia lo que quedó guardado.
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'productos' AND table_schema IN ('public','pronimerp')
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = s AND table_name = 'productos'
                   AND column_name = 'costo_promedio') THEN
      EXECUTE format('UPDATE %I.productos SET costo_promedio = 0, updated_at = now() '
                  || 'WHERE costo_promedio < 0', s);
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE '[4] %.productos: % con costo_promedio negativo corregido(s) a 0', s, n;
    END IF;
  END LOOP;

  -- ── 5) DÍAS CERRADOS POR SUCURSAL ────────────────────────────────────────
  -- Convención EXTRACT(DOW): 0=domingo … 6=sábado.
  --   '{0}'   → cierra domingos (default, igual que hoy)
  --   '{0,1}' → cierra domingos y lunes
  --   '{}'    → abre los 7 días
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'sucursales' AND table_schema IN ('public','pronimerp')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = s AND table_name = 'sucursales'
                       AND column_name = 'dias_cerrados') THEN
      EXECUTE format('ALTER TABLE %I.sucursales ADD COLUMN dias_cerrados smallint[] '
                  || 'NOT NULL DEFAULT ''{0}''::smallint[]', s);
      RAISE NOTICE '[5] %.sucursales: dias_cerrados agregada', s;
    END IF;
  END LOOP;

END
$mig$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación: las 4 columnas nuevas tienen que aparecer acá ────────────
SELECT table_schema, table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'pronimerp'
   AND (   (table_name = 'gastos'      AND column_name = 'sucursal_id')
        OR (table_name = 'clientes'    AND column_name IN ('telefono_secundario','email_secundario','usa_nota_remision'))
        OR (table_name = 'sucursales'  AND column_name = 'dias_cerrados'))
 ORDER BY table_name, column_name;

-- ── Y esto tiene que dar 0 filas ───────────────────────────────────────────
SELECT count(*) AS productos_con_costo_negativo
  FROM pronimerp.productos
 WHERE costo_promedio < 0;
