-- =====================================================================
-- Pronim ERP — Promociones (spec §8) — append-only, idempotente
-- ---------------------------------------------------------------------
-- Cubre los tipos:
--   descuento_pct       — porcentaje sobre subtotal
--   descuento_fijo      — monto fijo en Gs.
--   lleve_n_pague_m     — ej. 3x2
--   cashback            — % que se convierte en crédito del cliente
--
-- Ámbito (dónde aplica):
--   general             — a toda la venta
--   franja              — solo cuando la venta incluye una franja específica
--   sucursal            — solo si la venta se hizo en una sucursal
--   cliente             — solo si el cliente coincide
--
-- Vigencia por fecha_desde/fecha_hasta y activo=true. Cupones opcionales
-- con código único por empresa; sin código = promoción automática.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pronimerp.promociones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  tipo text NOT NULL CHECK (tipo IN ('descuento_pct','descuento_fijo','lleve_n_pague_m','cashback')),
  valor numeric(14,2) NOT NULL DEFAULT 0,    -- pct (0-100), monto fijo, o % cashback
  lleve_n int,                                -- para 3x2 estilo
  pague_m int,
  cupon_codigo text,                          -- si NO es null, requiere código
  ambito text NOT NULL DEFAULT 'general' CHECK (ambito IN ('general','franja','sucursal','cliente')),
  franja_id uuid,
  sucursal_id uuid REFERENCES pronimerp.sucursales(id) ON DELETE CASCADE,
  cliente_id uuid,
  fecha_desde date,
  fecha_hasta date,
  minimo_compra numeric(14,2) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT promo_valor_no_negativo CHECK (valor >= 0),
  CONSTRAINT promo_3x2_valores CHECK (
    tipo <> 'lleve_n_pague_m' OR (lleve_n IS NOT NULL AND pague_m IS NOT NULL AND lleve_n > pague_m)
  )
);

CREATE INDEX IF NOT EXISTS promociones_empresa_idx ON pronimerp.promociones (empresa_id);
CREATE INDEX IF NOT EXISTS promociones_activo_idx ON pronimerp.promociones (empresa_id, activo);
CREATE UNIQUE INDEX IF NOT EXISTS promociones_cupon_unico
  ON pronimerp.promociones (empresa_id, LOWER(cupon_codigo))
  WHERE cupon_codigo IS NOT NULL;

-- Auditoría de aplicaciones (opcional pero útil para reportes).
CREATE TABLE IF NOT EXISTS pronimerp.promocion_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES pronimerp.empresas(id) ON DELETE CASCADE,
  promocion_id uuid NOT NULL REFERENCES pronimerp.promociones(id) ON DELETE CASCADE,
  venta_id uuid,
  cliente_id uuid,
  sucursal_id uuid,
  descuento_aplicado numeric(14,2) NOT NULL DEFAULT 0,
  cashback_generado numeric(14,2) NOT NULL DEFAULT 0,
  cupon_codigo_usado text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_aplic_promo_idx ON pronimerp.promocion_aplicaciones (promocion_id);
CREATE INDEX IF NOT EXISTS promo_aplic_venta_idx ON pronimerp.promocion_aplicaciones (venta_id);
CREATE INDEX IF NOT EXISTS promo_aplic_fecha_idx ON pronimerp.promocion_aplicaciones (created_at DESC);

COMMIT;
