-- ============================================================================
--  PROPUESTA — NO ejecutar hasta terminar la unificación histórica
--
--  Índice único de teléfono normalizado sobre pronimerp.clientes
--  (PASO 2 Gap 4). Garantiza a nivel BD que no se pueden crear dos clientes
--  activos con el mismo teléfono normalizado dentro de la misma empresa y
--  cartera (scope_clientes).
--
--  ⚠️  SI SE APLICA ANTES DE LIMPIAR LOS DUPLICADOS HISTÓRICOS, LA
--      MIGRACIÓN FALLA. Correr primero:
--        1. _DIAGNOSTICO_dedup_PASO2.sql (reporte)
--        2. Revisión manual de Tassi sobre categorías != AUTO_SEGURO
--        3. Unificación con _UNIFICAR_fichas_duplicadas.sql actualizado
--        4. Re-correr el pre-check (paso 5 de este archivo) hasta que
--           devuelva 0 filas.
--
--  Normalización usada: la MISMA que usan el buscador (PASO 1), el POST
--  anti-duplicado y los sorteos. Cualquier cambio futuro de normalización
--  requiere rebuilder del índice.
--
--  Rollback:
--    DROP INDEX pronimerp.clientes_tel_normalizado_scope_uq;
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────
--  1) PRE-CHECK: tiene que devolver 0 filas. Si hay filas, NO continuar.
-- ────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT empresa_id, scope_clientes,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(telefono,''), '\D','','g'),
             '^595',''),
           '^0+','') AS tel_n
    FROM pronimerp.clientes
   WHERE deleted_at IS NULL
)
SELECT empresa_id, scope_clientes, tel_n, count(*) AS fichas
  FROM norm
 WHERE length(tel_n) >= 6
 GROUP BY 1, 2, 3
HAVING count(*) > 1
 ORDER BY fichas DESC
 LIMIT 100;


-- ────────────────────────────────────────────────────────────────────────
--  2) APLICACIÓN — comentar BEGIN/COMMIT si se quiere dry-run
-- ────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_tel_normalizado_scope_uq
  ON pronimerp.clientes (
    empresa_id,
    scope_clientes,
    (regexp_replace(
       regexp_replace(
         regexp_replace(COALESCE(telefono,''),'\D','','g'),
         '^595',''),
       '^0+',''))
  )
  WHERE deleted_at IS NULL
    AND length(
          regexp_replace(
            regexp_replace(
              regexp_replace(COALESCE(telefono,''),'\D','','g'),
              '^595',''),
            '^0+','')
        ) >= 6;

COMMIT;


-- ────────────────────────────────────────────────────────────────────────
--  3) VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'pronimerp'
   AND indexname = 'clientes_tel_normalizado_scope_uq';


-- ────────────────────────────────────────────────────────────────────────
--  4) NOTAS DE OPERACIÓN
-- ────────────────────────────────────────────────────────────────────────
-- · Una vez activo el índice, cualquier INSERT que duplique teléfono
--   normalizado dentro de la misma (empresa, cartera) falla con:
--     ERROR: duplicate key value violates unique constraint
--            "clientes_tel_normalizado_scope_uq"
--   El POST de /api/clientes y los vectores de sorteos ya mitigan esto
--   con SELECT previo normalizado (PASO 2 prevención). El índice es la
--   red de contención por si en el futuro aparece otro origen que no la
--   respete.
-- · `permitir_duplicado: true` del POST tendría que bypassear este índice.
--   Hoy no lo hace: habría que ajustar la ruta de alta cuando se habilite
--   la excepción legítima (PASO 2 Gap 3, pendiente de decisión de negocio).
-- · scope_clientes = NULL se trata como grupo propio por el índice, así
--   que una ficha con scope NULL y otra con scope 'lilo_palmeras' NO
--   colisionan aunque tengan el mismo teléfono normalizado. Verificar con
--   Tassi si eso es lo que se quiere.
