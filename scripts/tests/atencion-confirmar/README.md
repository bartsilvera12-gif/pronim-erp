# Tests E2E — POST /api/atencion/confirmar

Los 8 escenarios que exige la spec (`ATENCION_TEST_MATRIX`). Ejecutan el
orquestador REAL vía HTTP contra un entorno con dev server corriendo y
Supabase configurado. Cada bloque muestra el `curl` mínimo y la
aserción esperada.

## Setup previo (una vez)

1. Aplicar migraciones:
   ```sql
   \i supabase/migrations/20260822000000_pronimerp_atencion_eval_montos.sql
   \i supabase/migrations/20260822000001_pronimerp_atencion_idempotency.sql
   ```
2. Iniciar Next: `npm run dev`.
3. Exportar variables:
   ```bash
   export BASE_URL=http://localhost:3000
   export SB_TOKEN='<access_token del usuario admin>'
   export EMPRESA=12c517ef-bef3-4f4e-848f-0b34b0ac0a22
   export CAJA=<uuid de una caja abierta>
   export SUCURSAL=<uuid>
   export CLIENTE=<uuid>
   export FRANJA_A=<uuid producto franja de precio 6000>
   export FRANJA_B=<uuid producto franja de precio 40000>
   ```

## Utilidad para los tests

```bash
_call() {  # $1 = idempotency-key, $2 = body JSON
  curl -sS -X POST "$BASE_URL/api/atencion/confirmar" \
    -H "Authorization: Bearer $SB_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2" | jq
}
```

---

### 1) Monto evaluado distinto al subtotal

Subtotal crudo (1 × 6.000) = 6.000. La cajera fija total_final = 8.000
(ajuste +2.000). El crédito emitido debe ser 8.000.

```bash
_call k-eval-1 '{
  "idempotency_key": "k-eval-1-'$(date +%s)'",
  "caja_id": "'$CAJA'", "cliente_id": "'$CLIENTE'",
  "trae": { "items": [{"producto_id":"'$FRANJA_A'","cantidad":1,"precio_compra_unitario":6000}],
            "total_final_evaluado": 8000, "ingresar_al_stock": true }
}'
```

Esperado: `success=true`, `recepcion.total_final=8000`, y `SELECT total_final
FROM pronimerp.cliente_recepciones WHERE id='<recep>'` = 8000. En
`cliente_creditos_movimientos` la ENTRADA por esta recepción debe ser 8000.

### 2) Solo trae

```bash
_call k-t 'body con solo "trae"'
```
Esperado: `recepcion != null`, `venta == null`, `cambio == null`.

### 3) Solo lleva

```bash
_call k-l 'body con solo "lleva"'
```
Esperado: `venta != null`, `recepcion == null`, `cambio == null`.

### 4) Trae + Lleva con crédito total

Cliente trae 8.000 (crédito) y lleva 8.000. Todo se paga con el crédito nuevo.

Esperado: `recepcion != null`, `venta != null`, `cambio != null` con
`credito_generado=8000`, `credito_previo_usado=0` (o del saldo previo),
`diferencia_pagada=0`.

### 5) Trae + Lleva con crédito + diferencia en efectivo

Trae 5.000, lleva 8.000, `pago_detalle=[{efectivo, 3000}]`.
Esperado: caja recibe 3.000 (verificar en `ventas_pagos_detalle`).

### 6) Error de stock después de cargar la recepción → rollback total

Armar un `lleva` que exceda stock. Antes: `SELECT count(*) FROM
cliente_recepciones WHERE cliente_id='...'`. Después del call que retorna
400: el count NO cambia. Ninguna fila persiste.

### 7) Doble confirmación con MISMA idempotency_key

Ejecutar `_call` dos veces con la MISMA `idempotency_key` y payload idéntico.

Esperado:
- Primera: 200 con `data.reutilizado=false`.
- Segunda: 200 con `data.reutilizado=true`, MISMA recepcion.id y venta.id.
- `SELECT count(*) FROM cliente_recepciones WHERE ...` = 1 (no duplicado).

### 7b) Doble confirmación con MISMA idempotency_key pero payload distinto

Cambiar cualquier dato (ej. cantidad) manteniendo la key.
Esperado: 409 `IDEMPOTENCY_CONFLICT`.

### 8) Varias cajas abiertas → caja_id explícito obligatorio

Sin `caja_id`: 400 con mensaje "caja_id es obligatorio".
Con `caja_id` inválido para la sucursal: 400 "no pertenece a la sucursal".
Con `caja_id` de una caja cerrada: 400 "está cerrada".
Con `caja_id` correcto: 200.

### 9) Promoción con venta fallida no deja cashback

Simular: pasar `promocion` + `lleva` con items que revientan por stock.
Esperado: 400. Verificar que NO hay fila en `promocion_aplicaciones` ni
ENTRADA `origen='cashback'` en `cliente_creditos_movimientos` para esta venta.
