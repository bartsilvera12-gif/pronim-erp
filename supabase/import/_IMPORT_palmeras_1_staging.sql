-- =============================================================================
-- IMPORTACION DEL DIARIO DE PALMERAS  ·  PASO 1 de 2: la mesa de trabajo
--
-- Crea una tabla temporal donde entra el Excel tal cual, sin tocar todavia
-- ninguna tabla real. Asi se puede mirar, contar y comparar contra la planilla
-- ANTES de que nada se escriba en clientes, ventas o stock.
--
-- COMO SE USA
--   1. Corre este archivo entero.
--   2. Supabase -> Table Editor -> buscar `import_palmeras` -> Insert ->
--      Import data from CSV -> subir `palmeras_movimientos.csv`.
--   3. Correr las consultas de control del final.
--   4. Recien ahi, el paso 2.
--
-- Si algo sale mal en cualquier momento: `DROP TABLE pronimerp.import_palmeras;`
-- y volver a empezar. Nada de esto toca datos reales.
-- =============================================================================

DROP TABLE IF EXISTS pronimerp.import_palmeras;

CREATE TABLE pronimerp.import_palmeras (
  fila_excel        integer,   -- fila real en la planilla, para poder volver a buscarla
  controle          integer,
  fecha             date,
  tipo              text,      -- venta | evaluacion | devolucion | ajuste_stock | otro
  cliente_nombre    text,
  cliente_clave     text,      -- nombre normalizado, solo para agrupar
  telefono          text,
  venta             bigint,
  evaluacion        bigint,
  devolucion        bigint,
  prendas           bigint,
  estoque           bigint,
  -- El Excel usa un solo campo por medio de pago con signo: positivo entra,
  -- negativo sale (le pagamos a la clienta las prendas que trajo). Aca viene
  -- ya separado en dos columnas, las dos en positivo.
  efectivo_in       bigint,
  efectivo_out      bigint,
  transf_in         bigint,
  transf_out        bigint,
  tarjeta_in        bigint,
  credito_generado  bigint,
  credito_utilizado bigint,
  descuento         bigint
);

-- Tabla puente: que cliente del Excel quedo con que id. Se llena en el paso 2
-- y queda despues, para poder rastrear de donde salio cada ficha.
DROP TABLE IF EXISTS pronimerp.import_palmeras_clientes;
CREATE TABLE pronimerp.import_palmeras_clientes (
  cliente_clave text PRIMARY KEY,
  cliente_id    uuid NOT NULL
);

CREATE INDEX ON pronimerp.import_palmeras (cliente_clave);
CREATE INDEX ON pronimerp.import_palmeras (tipo);


-- ── Control: correr DESPUES de subir el CSV ──────────────────────────────
-- Tiene que dar 16.984 filas.
SELECT count(*) AS filas FROM pronimerp.import_palmeras;

-- Y esto tiene que coincidir con lo que te pase por chat.
SELECT tipo, count(*) AS filas
  FROM pronimerp.import_palmeras
 GROUP BY tipo ORDER BY 2 DESC;

SELECT
  to_char(sum(venta),             '999G999G999G999') AS vendido,
  to_char(sum(efectivo_in),       '999G999G999G999') AS efectivo,
  to_char(sum(transf_in),         '999G999G999G999') AS transferencia,
  to_char(sum(tarjeta_in),        '999G999G999G999') AS tarjeta,
  to_char(sum(credito_utilizado), '999G999G999G999') AS credito_usado,
  to_char(sum(credito_generado),  '999G999G999G999') AS credito_generado,
  to_char(sum(prendas),           '999G999G999')     AS prendas_en_stock,
  count(DISTINCT cliente_clave) FILTER (WHERE cliente_clave <> '') AS clientes
FROM pronimerp.import_palmeras;

-- Rango de fechas: abril 2025 a septiembre 2026.
SELECT min(fecha) AS desde, max(fecha) AS hasta FROM pronimerp.import_palmeras;
