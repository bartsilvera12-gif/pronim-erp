# Tests de integración — Núcleo financiero pronimerp

Estos scripts ejecutan la **lógica real** del server (`createVentaTransaccionalPg`,
`crearRecepcionPg`, `anularVentaPg`, etc.), no simulan con `INSERT` manuales.

Cada test:

1. Abre un `pg.PoolClient`.
2. Envuelve en `BEGIN`.
3. Crea entidades ficticias (cliente, sucursal, caja, franja).
4. Llama a la función real del server.
5. Valida invariantes con `assert`.
6. `ROLLBACK` — no persiste nada.

## Requisitos

- `.env.local` en la raíz del proyecto con:
  - `SUPABASE_DB_URL` — string de conexión Postgres a Supabase.
  - (opcional) `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para tests
    que usen PostgREST.

## Cómo correr

```bash
# uno por uno
npx tsx scripts/tests/nucleo-financiero/A-venta-contado-efectivo.ts

# todos
npx tsx scripts/tests/nucleo-financiero/_run-all.ts
```

Cada script exit 0 = OK, exit 1 = FAIL con detalle en stderr.

## Escenarios cubiertos

- A. Venta contado en efectivo no duplica caja
- B. Venta crédito sin entrega inicial no genera pago efectivo
- C. Venta crédito con entrega parcial crea CxC solo por saldo
- D. Pago mixto
- E. Ingreso de recepción idempotente
- F. Dos consumos concurrentes del mismo crédito
- G. Anulación con crédito ya consumido → bloquea
- H. Anulación de venta con CxC cobrada → bloquea
- I. Dos sucursales con cajas abiertas simultáneamente
- J. Precio manipulado desde HTTP → rechazado/recalculado
- K. Reconstrucción completa del schema ejecutando migraciones desde cero
