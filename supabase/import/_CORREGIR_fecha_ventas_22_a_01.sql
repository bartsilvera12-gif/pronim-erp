-- ============================================================================
--  Corregir las ventas que se cargaron con fecha 22/10 y en realidad son 01/10.
--
--  Causa: el campo de carga retroactiva se borraba solo después de la primera
--  venta, así que el resto del lote se guardó con la fecha del día. Ya está
--  arreglado; esto repara lo que quedó mal cargado.
--
--  ⚠️ NO ejecutar entero de una. Correr el PASO 1, mirar la lista, y recién
--  ahí el PASO 2 con los números de control que correspondan.
-- ============================================================================

-- ── PASO 1 · Mirar qué hay cargado el 22/10 ────────────────────────────────
-- Revisá esta lista y anotá cuáles son realmente del 01/10.
SELECT v.numero_control,
       v.fecha,
       v.total,
       s.nombre AS sucursal,
       c.nombre_contacto AS cliente,
       v.created_at
  FROM pronimerp.ventas v
  LEFT JOIN pronimerp.sucursales s ON s.id = v.sucursal_id
  LEFT JOIN pronimerp.clientes  c ON c.id = v.cliente_id
 WHERE v.fecha::date = DATE '2026-10-22'
   AND v.estado <> 'anulada'
 ORDER BY v.created_at;


-- ── PASO 2 · Mover las elegidas al 01/10 ──────────────────────────────────
-- Poné en la lista los números de control que SÍ son del 01/10.
-- Mueve la venta y, con ella, el movimiento de stock, para que el historial
-- y el inventario sigan cuadrando.
/*
BEGIN;

WITH objetivo AS (
  SELECT id
    FROM pronimerp.ventas
   WHERE empresa_id = (SELECT id FROM pronimerp.empresas LIMIT 1)
     AND numero_control IN (
       -- ▼▼▼ COMPLETAR ▼▼▼
       'V-000123',
       'V-000124'
       -- ▲▲▲ COMPLETAR ▲▲▲
     )
)
, mov AS (
  UPDATE pronimerp.movimientos_inventario m
     SET fecha = DATE '2026-10-01' + interval '12 hours'
   WHERE m.venta_id IN (SELECT id FROM objetivo)
  RETURNING m.id
)
UPDATE pronimerp.ventas v
   SET fecha = DATE '2026-10-01' + interval '12 hours',
       updated_at = now()
 WHERE v.id IN (SELECT id FROM objetivo);

-- Verificación antes de confirmar: tiene que listar las movidas con 01/10.
SELECT numero_control, fecha
  FROM pronimerp.ventas
 WHERE fecha::date = DATE '2026-10-01'
 ORDER BY numero_control;

-- Si está bien:  COMMIT;
-- Si algo no cuadra:  ROLLBACK;
*/


-- ── Nota sobre la caja ─────────────────────────────────────────────────────
-- Esto mueve la VENTA y su movimiento de stock, pero NO reimputa el cobro a
-- la caja del 01/10: el cobro quedó en la caja del 22/10. Si el arqueo de
-- esos días tiene que cuadrar, avisame y lo resolvemos aparte — reimputar
-- cobros toca cierres de caja ya hechos y no conviene hacerlo a ciegas.
