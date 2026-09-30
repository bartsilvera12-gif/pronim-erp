-- =============================================================================
-- Autoimpresor POR SUCURSAL.
--
-- Akakua'a opera en Paraguay (Lillo, Palmeras) y en Brasil (Betim, BH,
-- Contagem, El Dorado). El timbrado de autoimpresor es paraguayo y vale UNO
-- solo para las dos sucursales de PY, pero cada establecimiento numera por su
-- cuenta:
--
--   Lillo    → establecimiento 001 → 001-XXX-0000001, 0000002, …
--   Palmeras → establecimiento 002 → 002-XXX-0000001, 0000002, …
--
-- `empresa_autoimpresor_config` ya existía pero es SINGLETON por empresa: un
-- solo establecimiento y un solo contador. No alcanza. Esta migración deja ahí
-- lo que sí es común (RUC, razón social, timbrado y su vigencia) y agrega una
-- fila por sucursal con lo que es propio de cada establecimiento.
--
-- Las sucursales de Brasil simplemente NO tienen fila acá: eso es lo que las
-- deja fuera de la facturación paraguaya, sin necesidad de preguntar el país
-- en ningún lado.
--
-- Idempotente. Aplica en el schema donde exista `sucursales`.
-- =============================================================================

DO $mig$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'sucursales' AND table_schema IN ('public','pronimerp')
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.sucursal_autoimpresor_config (
        sucursal_id              uuid PRIMARY KEY REFERENCES %I.sucursales(id) ON DELETE CASCADE,
        empresa_id               uuid NOT NULL,

        -- Habilita la facturación en esta sucursal. Si está en false (o no hay
        -- fila) la sucursal sigue emitiendo el comprobante NO fiscal de hoy.
        activo                   boolean NOT NULL DEFAULT false,

        -- Código de establecimiento del timbrado: 001 Lillo, 002 Palmeras.
        establecimiento_codigo   text NOT NULL,
        -- Punto de expedición dentro del establecimiento (normalmente 001).
        punto_expedicion_codigo  text NOT NULL DEFAULT '001',

        -- Rango autorizado por la SET para este establecimiento.
        numero_inicial           integer NOT NULL,
        numero_final             integer NOT NULL,
        -- Último número YA emitido. NULL = todavía no se emitió ninguno, así
        -- que el próximo es `numero_inicial`.
        numero_emitido           integer,

        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT sucursal_autoimpresor_rango_ok
          CHECK (numero_final >= numero_inicial),
        CONSTRAINT sucursal_autoimpresor_emitido_ok
          CHECK (numero_emitido IS NULL
                 OR (numero_emitido >= numero_inicial AND numero_emitido <= numero_final))
      )
    $f$, s, s);

    -- Un mismo establecimiento + punto de expedición no puede repetirse dentro
    -- de la empresa: serían dos sucursales peleándose la misma numeración.
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS sucursal_autoimpresor_punto_unico
         ON %I.sucursal_autoimpresor_config (empresa_id, establecimiento_codigo, punto_expedicion_codigo)', s
    );

    -- ── Número de factura ya asignado a cada venta ───────────────────────
    -- Se guarda en la venta para que reimprimir NO consuma otro número.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'ventas' AND column_name = 'factura_numero'
    ) THEN
      -- Formateado y listo para mostrar: "001-001-0000123".
      EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN factura_numero text', s);
      EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN factura_timbrado text', s);
      EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN factura_emitida_at timestamptz', s);
      -- Dos ventas no pueden compartir número de factura.
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS ventas_factura_numero_unico
           ON %I.ventas (empresa_id, factura_numero) WHERE factura_numero IS NOT NULL', s
      );
    END IF;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
