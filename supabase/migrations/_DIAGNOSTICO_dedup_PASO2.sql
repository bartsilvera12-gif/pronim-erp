-- ============================================================================
--  PASO 2 — REPORTE DE DEDUPLICACIÓN DE CLIENTES (solo lectura)
--
--  Detecta fichas candidatas a ser la misma persona agrupadas por teléfono
--  normalizado (sin "+595", sin "0" inicial, sin no-dígitos), y por cada
--  grupo propone una ficha canónica, informa cuánta actividad tiene cada
--  una y clasifica el grupo en una de cinco categorías:
--
--    AUTO_SEGURO          — mismos nombres (ignorando tildes/mayúsculas) y
--                           saldo en una sola ficha. Candidato fuerte a
--                           unificación automática.
--    REVISAR_NOMBRE       — mismo teléfono, nombres distintos. Puede ser un
--                           familiar que comparte número — NO unificar sin
--                           preguntar a Tassi.
--    REVISAR_CONTABLE     — ambas fichas tienen saldo o movimientos. La
--                           fusión mueve plata y puede dejar un saldo final
--                           inesperado; revisar números antes.
--    BLOQUEADO_SCOPE      — las fichas están en carteras (sucursales)
--                           distintas. No se puede unificar: rompe el
--                           aislamiento Lilo+Palmeras vs Betim vs resto.
--    BLOQUEADO_TRIBUTARIO — ambas fichas tienen perfil tributario activo.
--                           La UNIQUE(empresa_id, cliente_id) de
--                           cliente_perfil_tributario explotaría al
--                           reasignar FKs; hay que resolver a mano cuál
--                           perfil se conserva ANTES de usar _UNIFICAR_*.
--
--  No modifica nada. Correlo entero y pasame la salida de cada sección.
--  El entregable final (pares a unificar) se arma con la sección 5 copiada
--  dentro de _UNIFICAR_fichas_duplicadas.sql — NO ejecutar la unificación
--  sin revisión manual de Tassi y backup previo.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  0) Resumen: cuántos grupos con duplicados y cuántas fichas involucra
-- ─────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT c.id,
         c.empresa_id,
         c.scope_clientes,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g'),
             '^595', ''),
           '^0+', '') AS tel_n
    FROM pronimerp.clientes c
   WHERE c.deleted_at IS NULL
),
dup AS (
  SELECT empresa_id, tel_n, count(*) AS fichas
    FROM norm
   WHERE length(tel_n) >= 6
   GROUP BY 1, 2
  HAVING count(*) > 1
)
SELECT count(*)                          AS grupos_duplicados,
       SUM(fichas)                       AS fichas_involucradas,
       SUM(fichas - 1)                   AS fichas_que_sobran,
       SUM(CASE WHEN fichas = 2 THEN 1 ELSE 0 END) AS grupos_de_2,
       SUM(CASE WHEN fichas = 3 THEN 1 ELSE 0 END) AS grupos_de_3,
       SUM(CASE WHEN fichas >= 4 THEN 1 ELSE 0 END) AS grupos_de_4_o_mas
  FROM dup;


-- ─────────────────────────────────────────────────────────────────────────
--  1) Detalle completo por ficha, con conteos de actividad y propuesta
--     de ficha canónica (la que tiene más transacciones; en empate, la
--     más antigua). Las categorías marcan el próximo paso para cada grupo.
-- ─────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT c.id, c.empresa_id, c.scope_clientes,
         COALESCE(c.nombre_contacto, c.nombre, c.empresa, '?') AS nombre,
         c.telefono, c.ruc, c.email, c.created_at,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g'),
             '^595', ''),
           '^0+', '') AS tel_n,
         -- Nombre canónico para comparar: minúsculas, sin tildes, sin
         -- espacios extra. Alcanza para que "Natalia" matchee "NATALIA "
         -- y "Natália" sin pedir pg_trgm.
         lower(regexp_replace(
           translate(
             COALESCE(c.nombre_contacto, c.nombre, c.empresa, ''),
             'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛñÑ',
             'aeiouAEIOUaeiouAEIOUaeiouAEIOUaeiouAEIOUnN'
           ), '\s+', ' ', 'g')) AS nombre_norm
    FROM pronimerp.clientes c
   WHERE c.deleted_at IS NULL
),
grp AS (
  SELECT empresa_id, tel_n
    FROM norm
   WHERE length(tel_n) >= 6
   GROUP BY 1, 2
  HAVING count(*) > 1
),
-- Conteos de actividad por ficha. Se arma como UNION de cada tabla con
-- columna cliente_id para que agregar un módulo nuevo no requiera editar
-- este reporte.
act AS (
  SELECT cliente_id, count(*) AS cnt, 'ventas'::text AS tabla
    FROM pronimerp.ventas WHERE cliente_id IS NOT NULL GROUP BY 1
  UNION ALL
  SELECT cliente_id, count(*), 'recepciones' FROM pronimerp.cliente_recepciones
    WHERE cliente_id IS NOT NULL GROUP BY 1
  UNION ALL
  SELECT cliente_id, count(*), 'creditos_mov' FROM pronimerp.cliente_creditos_movimientos
    WHERE cliente_id IS NOT NULL GROUP BY 1
  UNION ALL
  SELECT cliente_id, count(*), 'cambios' FROM pronimerp.cambios
    WHERE cliente_id IS NOT NULL GROUP BY 1
  UNION ALL
  SELECT cliente_id, count(*), 'cxc' FROM pronimerp.cuentas_por_cobrar
    WHERE cliente_id IS NOT NULL GROUP BY 1
  UNION ALL
  SELECT cliente_id, count(*), 'cobros' FROM pronimerp.cobros_clientes
    WHERE cliente_id IS NOT NULL GROUP BY 1
),
act_piv AS (
  SELECT cliente_id,
         COALESCE(SUM(CASE WHEN tabla='ventas'       THEN cnt END), 0) AS cnt_ventas,
         COALESCE(SUM(CASE WHEN tabla='recepciones'  THEN cnt END), 0) AS cnt_recep,
         COALESCE(SUM(CASE WHEN tabla='creditos_mov' THEN cnt END), 0) AS cnt_cred_mov,
         COALESCE(SUM(CASE WHEN tabla='cambios'      THEN cnt END), 0) AS cnt_cambios,
         COALESCE(SUM(CASE WHEN tabla='cxc'          THEN cnt END), 0) AS cnt_cxc,
         COALESCE(SUM(CASE WHEN tabla='cobros'       THEN cnt END), 0) AS cnt_cobros
    FROM act GROUP BY 1
),
saldos AS (
  SELECT c.id AS cliente_id,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo_credito,
         COALESCE(SUM(CASE WHEN m.tipo='ENTRADA'  AND m.origen='cashback' THEN m.monto
                           WHEN m.tipo='SALIDA' AND m.origen='cashback' THEN -m.monto
                           ELSE 0 END), 0) AS saldo_cashback
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   GROUP BY c.id
),
-- ¿Existe la tabla cliente_perfil_tributario? (Puede no estar instalada en
-- schemas antiguos). Si existe, marca riesgo de UNIQUE al fusionar.
perfil AS (
  SELECT cliente_id, true AS tiene_perfil
    FROM pronimerp.cliente_perfil_tributario
   WHERE perfil_activo = true
),
-- Fila por ficha, con rank de canonicidad dentro del grupo.
filas AS (
  SELECT n.empresa_id, n.tel_n,
         n.id, n.nombre, n.nombre_norm,
         n.scope_clientes, n.telefono, n.ruc, n.email, n.created_at,
         COALESCE(a.cnt_ventas,0)   AS cnt_ventas,
         COALESCE(a.cnt_recep,0)    AS cnt_recep,
         COALESCE(a.cnt_cred_mov,0) AS cnt_cred_mov,
         COALESCE(a.cnt_cambios,0)  AS cnt_cambios,
         COALESCE(a.cnt_cxc,0)      AS cnt_cxc,
         COALESCE(a.cnt_cobros,0)   AS cnt_cobros,
         COALESCE(s.saldo_credito,0)   AS saldo_credito,
         COALESCE(s.saldo_cashback,0)  AS saldo_cashback,
         COALESCE(p.tiene_perfil,false) AS tiene_perfil_tributario,
         -- Canónico = más actividad; empate, la más antigua.
         row_number() OVER (
           PARTITION BY n.empresa_id, n.tel_n
           ORDER BY (COALESCE(a.cnt_ventas,0)
                   + COALESCE(a.cnt_recep,0)
                   + COALESCE(a.cnt_cred_mov,0)) DESC,
                    n.created_at ASC
         ) AS rk
    FROM norm n
    JOIN grp g ON g.empresa_id = n.empresa_id AND g.tel_n = n.tel_n
    LEFT JOIN act_piv a ON a.cliente_id = n.id
    LEFT JOIN saldos   s ON s.cliente_id = n.id
    LEFT JOIN perfil   p ON p.cliente_id = n.id
),
grp_stats AS (
  SELECT empresa_id, tel_n,
         count(*) AS fichas,
         count(DISTINCT scope_clientes) AS scopes_distintos,
         count(DISTINCT nombre_norm)    AS nombres_distintos,
         SUM(CASE WHEN saldo_credito  > 0 THEN 1 ELSE 0 END) AS fichas_con_saldo,
         SUM(CASE WHEN saldo_cashback > 0 THEN 1 ELSE 0 END) AS fichas_con_cashback,
         SUM(CASE WHEN tiene_perfil_tributario THEN 1 ELSE 0 END) AS fichas_con_perfil
    FROM filas
   GROUP BY 1, 2
)
SELECT g.tel_n                                   AS telefono_normalizado,
       f.empresa_id,
       f.id                                      AS cliente_id,
       (f.rk = 1)                                AS es_canonico_propuesto,
       f.nombre,
       f.scope_clientes                          AS cartera,
       f.telefono                                AS telefono_crudo,
       f.ruc, f.email,
       f.created_at::date                        AS alta,
       f.cnt_ventas, f.cnt_recep, f.cnt_cred_mov,
       f.cnt_cambios, f.cnt_cxc, f.cnt_cobros,
       f.saldo_credito, f.saldo_cashback,
       f.tiene_perfil_tributario                 AS perfil_trib,
       g.fichas                                  AS fichas_en_grupo,
       CASE
         WHEN g.scopes_distintos > 1         THEN 'BLOQUEADO_SCOPE'
         WHEN g.fichas_con_perfil > 1        THEN 'BLOQUEADO_TRIBUTARIO'
         WHEN g.nombres_distintos > 1
              AND g.fichas_con_saldo > 1     THEN 'REVISAR_CONTABLE'
         WHEN g.nombres_distintos > 1        THEN 'REVISAR_NOMBRE'
         WHEN g.fichas_con_saldo > 1
              OR g.fichas_con_cashback > 1   THEN 'REVISAR_CONTABLE'
         ELSE                                     'AUTO_SEGURO'
       END                                       AS categoria
  FROM filas f
  JOIN grp_stats g USING (empresa_id, tel_n)
 ORDER BY g.tel_n, f.rk;


-- ─────────────────────────────────────────────────────────────────────────
--  2) Resumen por categoría — para dimensionar cada paso de la bandeja
-- ─────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT c.id, c.empresa_id, c.scope_clientes,
         lower(regexp_replace(translate(
             COALESCE(c.nombre_contacto, c.nombre, c.empresa, ''),
             'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛñÑ',
             'aeiouAEIOUaeiouAEIOUaeiouAEIOUaeiouAEIOUnN'
         ), '\s+', ' ', 'g')) AS nombre_norm,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(c.telefono,''), '\D', '', 'g'),
             '^595',''),
           '^0+','') AS tel_n
    FROM pronimerp.clientes c
   WHERE c.deleted_at IS NULL
),
saldos AS (
  SELECT c.id AS cliente_id,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo_credito,
         COALESCE(SUM(CASE WHEN m.tipo='ENTRADA' AND m.origen='cashback' THEN m.monto
                           WHEN m.tipo='SALIDA' AND m.origen='cashback' THEN -m.monto
                           ELSE 0 END), 0) AS saldo_cashback
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   GROUP BY c.id
),
perfil AS (
  SELECT cliente_id, true AS tiene_perfil
    FROM pronimerp.cliente_perfil_tributario WHERE perfil_activo = true
),
grp AS (
  SELECT n.empresa_id, n.tel_n,
         count(*)                           AS fichas,
         count(DISTINCT n.scope_clientes)   AS scopes_distintos,
         count(DISTINCT n.nombre_norm)      AS nombres_distintos,
         SUM(CASE WHEN COALESCE(s.saldo_credito,0)  > 0 THEN 1 ELSE 0 END) AS fichas_con_saldo,
         SUM(CASE WHEN COALESCE(s.saldo_cashback,0) > 0 THEN 1 ELSE 0 END) AS fichas_con_cashback,
         SUM(CASE WHEN COALESCE(p.tiene_perfil,false) THEN 1 ELSE 0 END)   AS fichas_con_perfil
    FROM norm n
    LEFT JOIN saldos s ON s.cliente_id = n.id
    LEFT JOIN perfil p ON p.cliente_id = n.id
   WHERE length(n.tel_n) >= 6
   GROUP BY 1, 2
  HAVING count(*) > 1
)
SELECT categoria, count(*) AS grupos, SUM(fichas) AS fichas_involucradas
  FROM (
    SELECT fichas, CASE
         WHEN scopes_distintos > 1   THEN 'BLOQUEADO_SCOPE'
         WHEN fichas_con_perfil > 1  THEN 'BLOQUEADO_TRIBUTARIO'
         WHEN nombres_distintos > 1
              AND fichas_con_saldo > 1 THEN 'REVISAR_CONTABLE'
         WHEN nombres_distintos > 1  THEN 'REVISAR_NOMBRE'
         WHEN fichas_con_saldo > 1
              OR fichas_con_cashback > 1 THEN 'REVISAR_CONTABLE'
         ELSE                             'AUTO_SEGURO'
       END AS categoria
      FROM grp
  ) x
 GROUP BY 1
 ORDER BY CASE categoria
            WHEN 'AUTO_SEGURO'          THEN 1
            WHEN 'REVISAR_NOMBRE'       THEN 2
            WHEN 'REVISAR_CONTABLE'     THEN 3
            WHEN 'BLOQUEADO_TRIBUTARIO' THEN 4
            WHEN 'BLOQUEADO_SCOPE'      THEN 5
          END;


-- ─────────────────────────────────────────────────────────────────────────
--  3) Ranking de grupos con MÁS plata en juego — por si hay que arrancar
--     la revisión manual por los que más impactan caja.
-- ─────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT c.id, c.empresa_id,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(c.telefono,''), '\D','','g'),
             '^595',''),
           '^0+','') AS tel_n
    FROM pronimerp.clientes c WHERE c.deleted_at IS NULL
),
saldos AS (
  SELECT c.id AS cliente_id,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   GROUP BY c.id
)
SELECT n.tel_n                            AS telefono_normalizado,
       count(*)                           AS fichas,
       SUM(COALESCE(s.saldo,0))           AS saldo_total,
       SUM(ABS(COALESCE(s.saldo,0)))      AS plata_en_juego,
       MIN(COALESCE(s.saldo,0))           AS peor_saldo,
       string_agg(DISTINCT substr(n.id::text,1,8), ', ') AS fichas_cortas
  FROM norm n
  LEFT JOIN saldos s ON s.cliente_id = n.id
 WHERE length(n.tel_n) >= 6
 GROUP BY n.tel_n
HAVING count(*) > 1
 ORDER BY plata_en_juego DESC
 LIMIT 30;


-- ─────────────────────────────────────────────────────────────────────────
--  4) Teléfonos con muchas fichas (3+) — casos extremos
-- ─────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT c.id, c.empresa_id,
         COALESCE(c.nombre_contacto, c.nombre, '?') AS nombre,
         c.scope_clientes,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(c.telefono,''), '\D','','g'),
             '^595',''),
           '^0+','') AS tel_n
    FROM pronimerp.clientes c WHERE c.deleted_at IS NULL
)
SELECT tel_n                                              AS telefono_normalizado,
       count(*)                                           AS fichas,
       count(DISTINCT scope_clientes)                     AS carteras,
       string_agg(nombre, ' | ' ORDER BY nombre)          AS nombres
  FROM norm
 WHERE length(tel_n) >= 6
 GROUP BY tel_n
HAVING count(*) >= 3
 ORDER BY count(*) DESC, tel_n
 LIMIT 50;


-- ─────────────────────────────────────────────────────────────────────────
--  5) Generador de pares AUTO_SEGURO — formato listo para pegar en el
--     VALUES del script _UNIFICAR_fichas_duplicadas.sql. Devuelve pares
--     (se_va, queda) solo para grupos AUTO_SEGURO y SOLO cuando el grupo
--     tiene exactamente 2 fichas (grupos de 3+ requieren revisión manual
--     para elegir en qué orden absorber).
--
--  IMPORTANTE: esto es un borrador. Tassi tiene que confirmar cada par
--  antes de pegarlo en la unificación. Un "AUTO_SEGURO" automático podría
--  ser un hermano con el mismo número — el algoritmo no lo sabe.
-- ─────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT c.id, c.empresa_id, c.scope_clientes, c.created_at,
         COALESCE(c.nombre_contacto, c.nombre, '?') AS nombre,
         lower(regexp_replace(translate(
             COALESCE(c.nombre_contacto, c.nombre, c.empresa, ''),
             'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛñÑ',
             'aeiouAEIOUaeiouAEIOUaeiouAEIOUaeiouAEIOUnN'
         ), '\s+', ' ', 'g')) AS nombre_norm,
         regexp_replace(
           regexp_replace(
             regexp_replace(COALESCE(c.telefono,''), '\D','','g'),
             '^595',''),
           '^0+','') AS tel_n
    FROM pronimerp.clientes c WHERE c.deleted_at IS NULL
),
saldos AS (
  SELECT c.id AS cliente_id,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo,
         count(m.id) AS cnt_mov
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   GROUP BY c.id
),
perfil AS (
  SELECT cliente_id, true AS tiene_perfil
    FROM pronimerp.cliente_perfil_tributario WHERE perfil_activo = true
),
act AS (
  SELECT cliente_id, count(*) AS cnt FROM pronimerp.ventas WHERE cliente_id IS NOT NULL GROUP BY 1
  UNION ALL SELECT cliente_id, count(*) FROM pronimerp.cliente_recepciones WHERE cliente_id IS NOT NULL GROUP BY 1
),
act_sum AS (
  SELECT cliente_id, SUM(cnt) AS cnt_tx FROM act GROUP BY 1
),
grupo AS (
  SELECT n.empresa_id, n.tel_n,
         count(*) AS fichas,
         count(DISTINCT n.scope_clientes) AS scopes,
         count(DISTINCT n.nombre_norm)    AS nombres,
         SUM(CASE WHEN COALESCE(s.saldo,0) > 0 THEN 1 ELSE 0 END) AS con_saldo,
         SUM(CASE WHEN COALESCE(p.tiene_perfil,false) THEN 1 ELSE 0 END) AS con_perfil
    FROM norm n
    LEFT JOIN saldos s ON s.cliente_id = n.id
    LEFT JOIN perfil p ON p.cliente_id = n.id
   WHERE length(n.tel_n) >= 6
   GROUP BY 1, 2
  HAVING count(*) = 2        -- solo pares
     AND count(DISTINCT n.scope_clientes) = 1
     AND count(DISTINCT n.nombre_norm) = 1
     AND SUM(CASE WHEN COALESCE(s.saldo,0) > 0 THEN 1 ELSE 0 END) <= 1
     AND SUM(CASE WHEN COALESCE(p.tiene_perfil,false) THEN 1 ELSE 0 END) <= 1
),
ranked AS (
  SELECT n.empresa_id, n.tel_n, n.id,
         COALESCE(a.cnt_tx, 0) AS cnt_tx,
         n.created_at,
         n.nombre,
         row_number() OVER (
           PARTITION BY n.empresa_id, n.tel_n
           ORDER BY COALESCE(a.cnt_tx,0) DESC, n.created_at ASC
         ) AS rk
    FROM norm n
    JOIN grupo g USING (empresa_id, tel_n)
    LEFT JOIN act_sum a ON a.cliente_id = n.id
)
SELECT '  (''' || v.id::text || ''', ''' || q.id::text || '''), -- '
       || v.nombre || ' → ' || q.nombre
       AS linea_para_pegar_en_UNIFICAR
  FROM ranked v
  JOIN ranked q
    ON q.empresa_id = v.empresa_id AND q.tel_n = v.tel_n
   AND q.rk = 1 AND v.rk = 2
 ORDER BY v.tel_n;


-- ─────────────────────────────────────────────────────────────────────────
--  6) Teléfonos "sueltos" (fichas únicas con teléfono normalizado válido).
--     Útil solo para conteo — el total menos duplicados = fichas sanas.
-- ─────────────────────────────────────────────────────────────────────────
SELECT count(*) AS fichas_activas,
       count(*) FILTER (WHERE length(tel_n) >= 6) AS con_telefono_normalizable,
       count(*) FILTER (WHERE length(tel_n) <  6) AS sin_telefono_util
  FROM (
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(COALESCE(telefono,''), '\D','','g'),
               '^595',''),
             '^0+','') AS tel_n
      FROM pronimerp.clientes WHERE deleted_at IS NULL
  ) x;
