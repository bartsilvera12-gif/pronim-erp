# Dashboards operativos — Fórmulas y fuentes

> Documento canónico de cómo se calcula cada KPI de los dashboards
> **Sucursales** (`/api/dashboard/sucursales`) y **Clientes**
> (`/api/dashboard/clientes`). Cualquier discrepancia entre esta
> documentación y el código es un bug.

## Regla base de "operación válida"

- **Ventas**: `pronimerp.ventas.estado IN ('pendiente','completada')`. Excluye `'anulada'`.
- **Recepciones**: `pronimerp.cliente_recepciones.estado IN ('pendiente_ingreso','ingresada')`. Excluye `'anulada'`.
- **Cambios (trae+lleva)**: `pronimerp.cambios` con `estado='confirmado'`.

## Definición de "visita"

Una **visita** es una interacción del cliente en una sucursal en un momento dado. Se cuenta así:

- Si una recepción y una venta comparten `cambio_id` (mismo orquestador `POST /api/atencion/confirmar`) ⇒ **1 visita**.
- Recepción sin `cambio_id` ⇒ **1 visita**.
- Venta sin `cambio_id` ⇒ **1 visita**.
- Se excluyen operaciones anuladas.
- **No** se agrupan recepciones y ventas separadas del mismo cliente por proximidad temporal (evita falsos merges).

**SQL canónico** (`WITH visitas AS ...`):

```sql
WITH visitas AS (
  -- Cambios (trae+lleva): 1 visita
  SELECT c.id AS visita_id, c.cliente_id, c.sucursal_id,
         COALESCE(r.fecha, v.fecha) AS fecha,
         'trae_lleva' AS tipo
  FROM pronimerp.cambios c
  LEFT JOIN pronimerp.cliente_recepciones r ON r.id = c.recepcion_id
  LEFT JOIN pronimerp.ventas v ON v.id = c.venta_id
  WHERE c.empresa_id = $1 AND c.estado = 'confirmado'
    AND (r.id IS NULL OR r.estado <> 'anulada')
    AND (v.id IS NULL OR v.estado <> 'anulada')
  UNION ALL
  -- Recepciones sin cambio
  SELECT r.id, r.cliente_id, r.sucursal_id, r.fecha, 'solo_trae'
  FROM pronimerp.cliente_recepciones r
  WHERE r.empresa_id = $1 AND r.estado <> 'anulada' AND r.cambio_id IS NULL
  UNION ALL
  -- Ventas sin cambio
  SELECT v.id, v.cliente_id, v.sucursal_id, v.fecha, 'solo_lleva'
  FROM pronimerp.ventas v
  WHERE v.empresa_id = $1 AND v.estado IN ('pendiente','completada') AND v.cambio_id IS NULL
)
SELECT * FROM visitas
WHERE fecha::date BETWEEN $2 AND $3;
```

# Vista Sucursales — Fórmulas

### 1) Flujo de atención

| KPI | Fórmula | Fuente |
|---|---|---|
| **Visitas totales** | `COUNT(*)` de `visitas` (ver SQL arriba) | `cambios`, `cliente_recepciones`, `ventas` |
| **Clientes únicos** | `COUNT(DISTINCT cliente_id)` de `visitas` | idem |
| **Clientes nuevos** | Clientes cuya PRIMERA visita histórica cae en el período | `MIN(fecha)` por cliente |
| **Clientes recurrentes** | `COUNT(DISTINCT cliente_id)` con ≥ 2 visitas en el período | `visitas` GROUP BY cliente HAVING count>=2 |
| **Solo trae** | Visitas con `tipo='solo_trae'` | `visitas` |
| **Solo lleva** | Visitas con `tipo='solo_lleva'` | `visitas` |
| **Trae + lleva** | Visitas con `tipo='trae_lleva'` | `visitas` |
| **Prendas por visita (prom)** | `SUM(cantidad items recepción) / COUNT(visitas con recepción)` | `cliente_recepciones_items`, `visitas` |
| **Días entre visitas (prom)** | Por cliente, `AVG` de `fecha_visita_i - fecha_visita_{i-1}`; luego promedio simple entre clientes con ≥ 2 visitas | `visitas` window LAG |
| **Días de mayor atención** | `COUNT` de visitas agrupado por `EXTRACT(DOW FROM fecha)` (0=domingo … 6=sábado) | `visitas` |
| **Horas de mayor atención** | `COUNT` agrupado por `EXTRACT(HOUR FROM fecha)` | `visitas` |

### 2) Recepciones y evaluaciones

| KPI | Fórmula | Fuente |
|---|---|---|
| **Prendas recibidas** | `SUM(cantidad)` de items no anulados en el período | `cliente_recepciones_items` JOIN `cliente_recepciones` |
| **Tipos de prenda** | `GROUP BY tipo_prenda_id` sobre items, ordenado por `SUM(cantidad) DESC` | `cliente_recepciones_items`, `tipos_prenda` |
| **Franjas de precio usadas** | `GROUP BY producto_id` sobre items, join con `productos.precio_venta` | `cliente_recepciones_items`, `productos` |
| **Subtotal evaluado** | `SUM(subtotal_evaluado)` de recepciones del período | `cliente_recepciones` |
| **Ajustes +** | `SUM(ajuste_evaluacion)` filtrado `> 0` | `cliente_recepciones` |
| **Ajustes −** | `SUM(ajuste_evaluacion)` filtrado `< 0` | `cliente_recepciones` |
| **Total final acreditado** | `SUM(total_final)` de recepciones del período | `cliente_recepciones` |
| **Ratio ajuste vs subtotal** | `100 * SUM(ajuste_evaluacion) / NULLIF(SUM(subtotal_evaluado), 0)` | `cliente_recepciones` |
| **Evaluación prom. por prenda** | `SUM(total_final) / NULLIF(SUM(cantidad items), 0)` | items + recepciones |
| **Operadores evaluadores** | `GROUP BY usuario_nombre` con `COUNT(*)` y `SUM(total_final)` | `cliente_recepciones` |

### 3) Crédito

| KPI | Fórmula | Fuente |
|---|---|---|
| **Crédito generado (período)** | `SUM(monto)` de `cliente_creditos_movimientos` con `tipo='ENTRADA' AND origen='recepcion'` en el período | `cliente_creditos_movimientos` |
| **Crédito usado (período)** | `SUM(monto)` de `cliente_creditos_movimientos` con `tipo='SALIDA' AND origen='venta'` en el período | idem |
| **Crédito disponible ahora** | Por cliente: `SUM(ENTRADA) - SUM(SALIDA) + SUM(AJUSTE)` sobre TODA la historia. Sucursal preferida vía visitas | `cliente_creditos_movimientos` |
| **Ventas 100 % crédito** | Ventas con `credito_usado >= total - 2` (tolerancia redondeo) | `ventas`, `cliente_creditos_consumos` |
| **Ventas crédito + efectivo** | Ventas con `credito_usado > 0 AND pagos_inmediatos > 0` | `ventas`, `ventas_pagos_detalle`, `cliente_creditos_consumos` |
| **Tiempo generación → uso** | `AVG(fecha_salida - fecha_entrada)` sobre `cliente_creditos_consumos` (join entrada_id → salida_id) | `cliente_creditos_consumos`, `cliente_creditos_movimientos` |
| **Clientes con crédito sin volver** | Clientes con `saldo_credito > 0 AND max(fecha_visita) < now() - 30d` | derivado |

### 4) Inventario

| KPI | Fórmula | Fuente |
|---|---|---|
| **Prendas ingresadas** | `SUM(cantidad)` de `movimientos_inventario` con `tipo='ENTRADA' AND origen='compra'` en el período | `movimientos_inventario` |
| **Prendas salidas** | `SUM(cantidad)` con `tipo='SALIDA' AND origen='venta'` | idem |
| **Diferencia neta** | ingresadas − salidas | derivado |
| **Stock actual por sucursal** | `SUM(stock_actual)` de `producto_stock_sucursal` | `producto_stock_sucursal` |
| **Stock por franja** | `GROUP BY producto_id` con `SUM(stock_actual)` | idem, `productos` |
| **Stock por tipo de prenda** | Vía la MAYOR recepción reciente por producto (proxy: el último `tipo_prenda_id` usado para el producto). *Nota: si el mismo producto se recibió con tipos distintos, se usa el más reciente.* | `cliente_recepciones_items` |
| **Rotación** | `SUM(salidas período) / promedio(stock período)`. Se aproxima con `stock_actual` como denominador. | `movimientos_inventario`, `producto_stock_sucursal` |
| **Antigüedad promedio del stock** | Para cada producto en stock, `now() - fecha_ultima_entrada`. Promedio ponderado por `stock_actual`. | `movimientos_inventario` |
| **Tipos y franjas con mayor/menor movimiento** | Ranking por `SUM(cantidad salidas período)` | items ventas + productos + tipos |
| **Transferencias entre sucursales** | Actualmente no implementado (no hay tabla dedicada). Placeholder = 0. | — |

### 5) Ventas

| KPI | Fórmula | Fuente |
|---|---|---|
| **Cantidad de ventas** | `COUNT(*)` de ventas no anuladas en el período | `ventas` |
| **Prendas vendidas** | `SUM(cantidad)` de `ventas_items` en el período | `ventas_items`, `ventas` |
| **Ticket promedio** | `SUM(total) / COUNT(ventas)` | `ventas` |
| **Prendas por venta (prom)** | `SUM(cantidad items) / COUNT(ventas)` | items + ventas |
| **Formas de pago** | `GROUP BY metodo_pago` con `SUM(monto)` | `ventas_pagos_detalle` |
| **Promociones aplicadas** | `COUNT(*)` de `promocion_aplicaciones` en el período | `promocion_aplicaciones` |
| **Cashback / descuento período** | `SUM(cashback_generado)`, `SUM(descuento_aplicado)` | `promocion_aplicaciones` |
| **Beneficios entregados** | `COUNT(*)` de `cliente_eventos` con `tipo IN ('cashback','beneficio','descuento','cambio')` | `cliente_eventos` |
| **Cambios (formales)** | `COUNT(*)` de `cambios` con `estado='confirmado'` en el período | `cambios` |
| **Anulaciones** | `COUNT(*)` de ventas + recepciones con `estado='anulada'` en el período | `ventas`, `cliente_recepciones` |
| **Evolución día/semana/mes** | `GROUP BY DATE_TRUNC('day'/'week'/'month', fecha)` con `SUM(total)` | `ventas` |
| **Comparación período anterior** | Mismo cálculo aplicado a `[desde - dias, desde - 1]` | `ventas` |

### 6) Comparación entre sucursales

Se calculan las secciones 1-5 particionadas por `sucursal_id`. La comparación no es sólo por ventas — muestra columnas: visitas, recurrentes, prendas recibidas, prendas vendidas, rotación (aprox), crédito generado/usado, conversión (visitas ⇒ ventas), % meta, Δ vs período anterior.

# Vista Clientes — Recorrido del cliente

Cada cliente expone:

| Dato | Fórmula | Fuente |
|---|---|---|
| **Registro** | `clientes.created_at` | `clientes` |
| **Cómo conoció** | `clientes.como_conocio` | `clientes` |
| **Primera visita** | `MIN(fecha)` sobre `visitas` all-time | `visitas` |
| **Última visita** | `MAX(fecha)` sobre `visitas` | `visitas` |
| **Total visitas** | `COUNT(*)` de `visitas` all-time | `visitas` |
| **Frecuencia (días)** | Ver "Días entre visitas" arriba | window LAG |
| **Sucursales visitadas** | `DISTINCT sucursal_id` con `COUNT` | `visitas` |
| **Sucursal preferida** | La de mayor `COUNT(*)` | `visitas` |
| **Solo trae / Solo lleva / Ambos (histórico)** | Buckets sobre `visitas.tipo` | `visitas` |
| **Tipos de prenda entregados** | `GROUP BY tipo_prenda_id` con `SUM(cantidad)` | `cliente_recepciones_items` |
| **Franjas más usadas** | `GROUP BY producto_id` con `SUM(cantidad)` | items + productos |
| **Valor total evaluado** | `SUM(total_final)` all-time | `cliente_recepciones` |
| **Ajustes aplicados** | `SUM(ajuste_evaluacion)` all-time | `cliente_recepciones` |
| **Crédito generado / usado / disponible** | Suma sobre `cliente_creditos_movimientos` | idem |
| **Total comprado** | `SUM(total)` de ventas no anuladas | `ventas` |
| **Ticket promedio** | `SUM(total) / COUNT(*)` de ventas | `ventas` |
| **Promociones / beneficios recibidos** | `COUNT` en `promocion_aplicaciones` + `cliente_eventos` | idem |
| **Reclamos / cambios / eventos** | `cliente_eventos` filtrado por tipo | `cliente_eventos` |
| **Segmento actual** | Ver umbrales en `/api/clientes/[id]/segmento` (mismos umbrales replicados server-side): VIP: total_historico ≥ 5.000.000 o compras_90d ≥ 6; Dormido: > 120 días sin visita con compras previas; Nuevo: sin compras; Frecuente: resto | derivado |
| **Próxima visita estimada** | `ultima_visita + frecuencia_promedio_dias`; `null` si el cliente tiene < 2 visitas | derivado |

# Trazabilidad (drill-down)

Endpoint genérico `GET /api/dashboard/drill?metric=<slug>&desde=&hasta=&sucursal_id=&cliente_id=` devuelve la lista subyacente que compone la métrica.

Métricas cubiertas por drill-down en fase actual:
- `visitas`, `visitas_solo_trae`, `visitas_solo_lleva`, `visitas_trae_lleva`
- `prendas_recibidas` (items)
- `prendas_vendidas` (items de venta)
- `credito_generado`, `credito_usado`
- `clientes_recurrentes`, `clientes_con_credito_sin_volver`
- `tipos_prenda_top` (por sucursal + período)
- `anulaciones`

Métricas sin drill-down aún (pendientes): rotación de inventario, transferencias entre sucursales, evolución día/semana/mes (mostrado directamente como gráfico).

# Rendimiento

- Cada endpoint dispara **N pasadas SQL con GROUP BY**, nunca N+1 correlacionadas.
- Ningún endpoint devuelve más de ~1.000 filas al frontend (rankings top-10 acotados en SQL, tabla principal `LIMIT`).
- Los cálculos de rotación / antigüedad se aproximan cuando el cálculo exacto exigiría scan histórico completo.
- Índices ya existentes que se aprovechan:
  - `ventas (empresa_id, fecha DESC)`, `ventas (cliente_id, fecha DESC)` (migración erp_schema).
  - `cliente_recepciones (empresa_id, fecha DESC)`, `cliente_recepciones (cliente_id, fecha DESC)` (migración recepciones).
  - `cliente_creditos_movimientos (cliente_id, fecha DESC)`.
- Índices nuevos NO agregados en esta fase. Si el análisis (`EXPLAIN`) muestra scans lentos en producción, agregamos entonces.
