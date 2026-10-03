-- =============================================================================
-- IMPORTACION DEL DIARIO DE PALMERAS  ·  PASO 4: enlazar credito con recepcion
--
-- POR QUE EL DASHBOARD DICE "CREDITO GENERADO Gs. 0"
--
-- El dashboard reparte el credito por sucursal siguiendo el enlace del
-- movimiento con el documento que lo origino:
--
--   SALIDA  → m.referencia_id = ventas.id             → sucursal de la venta
--   ENTRADA → m.referencia_id = cliente_recepciones.id → sucursal de la recepcion
--
-- La importacion si guardo el enlace de las SALIDAS (por eso "usado" muestra
-- 45,4M) pero en las ENTRADAS dejo `referencia_id` vacio: en ese momento las
-- recepciones todavia no existian, se crearon recien en el paso 3. Sin ese
-- enlace el movimiento no pertenece a ninguna sucursal y suma 0.
--
-- Este archivo completa el enlace usando el numero que ya comparten las dos
-- tablas: FILA-nnnn.
--
-- Ningun monto cambia. Solo se completa una referencia que quedo vacia.
--
-- ⚠️ MODIFICA DATOS. BACKUP ANTES.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACION (solo lee)
-- ─────────────────────────────────────────────────────────────────────────

-- Cuantas entradas de credito estan sin enlazar y cuanta plata representan.
SELECT count(*)                                   AS entradas_sin_enlace,
       to_char(sum(monto), '999G999G999G999')     AS plata
  FROM pronimerp.cliente_creditos_movimientos
 WHERE origen = 'recepcion' AND referencia_id IS NULL;

-- Cuantas de esas tienen una recepcion con el mismo numero esperandolas.
SELECT count(*) AS se_pueden_enlazar
  FROM pronimerp.cliente_creditos_movimientos m
  JOIN pronimerp.cliente_recepciones r
    ON r.empresa_id = m.empresa_id
   AND r.numero_control = m.referencia_numero
 WHERE m.origen = 'recepcion' AND m.referencia_id IS NULL;


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCION
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE pronimerp.cliente_creditos_movimientos m
   SET referencia_id   = r.id,
       referencia_tipo = 'recepcion'
  FROM pronimerp.cliente_recepciones r
 WHERE r.empresa_id     = m.empresa_id
   AND r.numero_control = m.referencia_numero
   AND m.origen         = 'recepcion'
   AND m.referencia_id IS NULL;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
--  CONTROLES
-- ─────────────────────────────────────────────────────────────────────────

-- Tiene que dar 0.
SELECT count(*) AS siguen_sin_enlace
  FROM pronimerp.cliente_creditos_movimientos
 WHERE origen = 'recepcion' AND referencia_id IS NULL;

-- Como lo va a ver el dashboard: credito generado y usado por sucursal.
-- Palmeras tiene que mostrar 588.148.300 generados, no 0.
SELECT COALESCE(s.nombre, '(sin sucursal)') AS sucursal,
       to_char(SUM(CASE WHEN m.tipo='ENTRADA' AND m.origen='recepcion' THEN m.monto ELSE 0 END),
               '999G999G999G999') AS generado,
       to_char(SUM(CASE WHEN m.tipo='SALIDA'  AND m.origen='venta'     THEN m.monto ELSE 0 END),
               '999G999G999G999') AS usado
  FROM pronimerp.cliente_creditos_movimientos m
  LEFT JOIN pronimerp.ventas v              ON m.origen='venta'     AND v.id = m.referencia_id
  LEFT JOIN pronimerp.cliente_recepciones r ON m.origen='recepcion' AND r.id = m.referencia_id
  LEFT JOIN pronimerp.sucursales s          ON s.id = COALESCE(v.sucursal_id, r.sucursal_id)
 GROUP BY 1
 ORDER BY 1;
