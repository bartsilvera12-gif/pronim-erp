# Tests de integración — Núcleo financiero pronimerp

Estos tests ejecutan la **lógica real** del server (`createVentaTransaccionalPg`,
`crearRecepcionPg`, `anularVentaPg`, `getResumenCajaPg`, etc.) contra una base
de datos **descartable**. No tocan la base de producción.

## Requisitos

### 1. Base de datos descartable

Crear una base PostgreSQL vacía y aplicar todas las migraciones desde cero.
Opciones:

- **Supabase branch descartable** (recomendado): crear un branch en tu proyecto
  Supabase. Aplicar las migraciones al branch:
  ```bash
  supabase db push --db-url "<TEST_DB_URL>" --include-all
  ```

- **Docker local** (más rápido):
  ```bash
  docker run --name pronim-test -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres:15
  psql -h localhost -p 5433 -U postgres -c "CREATE DATABASE pronim_test"
  # Aplicar migraciones en orden
  for f in supabase/migrations/*.sql; do
    psql -h localhost -p 5433 -U postgres -d pronim_test -f "$f"
  done
  ```

  El schema `pronimerp` es un clone de `joyeriaartesanos`. Antes de las
  migraciones específicas de pronimerp hay que aplicar el schema base y
  después el clone. Ver `CLONE_SCHEMA_PRONIMERP.sql`.

### 2. Configurar `.env.local`

En la raíz del proyecto, `.env.local`:

```env
TEST_DB_URL=postgresql://postgres:test@localhost:5433/pronim_test
```

**NO usar `SUPABASE_DB_URL` de producción.** El runner rechaza correr si
`TEST_DB_URL` no está definida.

### 3. Correr

```bash
npx tsx scripts/tests/nucleo-financiero/_run-all.ts
```

## Salida esperada

```
[bootstrap] TEST_DB_URL=postgresql://...
OK K. reconstruccion schema
OK A. contado efectivo no duplica caja
OK B. credito sin entrega no genera efectivo
OK C. credito parcial CxC solo saldo
OK D. pago mixto
OK E. ingreso idempotente
OK F. dos consumos concurrentes
OK G. anular con credito consumido bloquea
OK H. anular venta con CxC cobrada bloquea
OK I. dos sucursales cajas simultaneas
OK J. precio manipulado rechazado
OK L. venta solo transferencia
OK M. venta solo tarjeta
OK N. WACP restore al anular recepcion
OK O. reversion en caja actual (append-only)

═══ RESUMEN ═══
15/15 OK, 0 FAIL
```

## Escenarios cubiertos

| # | Escenario | Verifica |
|---|---|---|
| K | Reconstrucción schema | Todas las estructuras existen tras aplicar migraciones |
| A | Contado efectivo | `total_vendido == efectivo`, sin duplicación en `caja_movimientos` |
| B | Crédito sin entrega | CxC == total, `total_efectivo == 0` |
| C | Crédito parcial | CxC == total − entrega inicial |
| D | Pago mixto | Efectivo + transferencia + crédito suman al total |
| E | Ingreso idempotente | Segunda llamada no duplica stock |
| F | Dos consumos concurrentes | Advisory lock serializa; una gana, otra falla |
| G | Anular con crédito consumido | Bloquea con mensaje claro; recepción sigue "pendiente" |
| H | Anular venta con CxC cobrada | Bloquea con mensaje claro |
| I | Dos sucursales con cajas abiertas | El nuevo UNIQUE `(empresa, sucursal)` permite |
| J | Precio manipulado | Server usa `productos.precio_venta`, ignora el del cliente |
| L | Venta solo transferencia | `total_transferencia == total`, `total_efectivo == 0` |
| M | Venta solo tarjeta | `total_tarjeta == total`, `total_efectivo == 0` |
| N | WACP restore | Al anular, `costo_promedio` se recalcula |
| O | Reversión en caja actual | Al anular, la reversa append-only va a caja actual |

## Cómo pegar el output cuando te lo pidan

```bash
npx tsx scripts/tests/nucleo-financiero/_run-all.ts 2>&1 | tee tests-output.log
```

Compartí `tests-output.log` completo (o al menos la sección `═══ RESUMEN ═══` y
las líneas `FAIL`).
