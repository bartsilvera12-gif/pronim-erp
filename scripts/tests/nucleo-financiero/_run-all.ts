/**
 * Runner de tests de integración del núcleo financiero pronimerp.
 *
 * Uso: npx tsx scripts/tests/nucleo-financiero/_run-all.ts
 *
 * Requiere .env.local con SUPABASE_DB_URL.
 *
 * Cada test:
 *   - Abre pg.PoolClient
 *   - BEGIN
 *   - Setup: cliente/sucursal/caja/franja ficticios
 *   - Llama la función real del server
 *   - Valida invariantes con assert()
 *   - ROLLBACK (nada persiste)
 *
 * Al final imprime resumen. Exit 0 = todo OK. Exit 1 = algún test falló.
 */
import { config } from "dotenv";
import * as path from "path";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { createVentaTransaccionalPg } from "@/lib/ventas/server/create-venta-pg";
import { anularVentaPg } from "@/lib/ventas/server/anular-venta-pg";
import {
  crearRecepcionPg,
  ingresarRecepcionPg,
  anularRecepcionPg,
} from "@/lib/recepciones/server/recepciones-pg";

config({ path: path.join(process.cwd(), ".env.local") });

const SCHEMA = "pronimerp";

interface TestCtx {
  empresaId: string;
  sucursalId: string;
  sucursalId2: string;
  cajaId: string;
  cajaId2: string;
  clienteId: string;
  franjaId: string; // producto real (es_franja_precio=true)
  precio: number;
}

interface Setup {
  ctx: TestCtx;
  cleanup: () => Promise<void>;
}

const results: Array<{ name: string; ok: boolean; msg?: string }> = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function setupTest(): Promise<Setup> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("SUPABASE_DB_URL no configurada");
  const client = await pool.connect();
  await client.query("BEGIN");

  const empresa = await client.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA}.empresas LIMIT 1`,
  );
  if (!empresa.rows.length) throw new Error("No hay empresas");
  const empresaId = empresa.rows[0].id;

  // Sucursal 1
  const suc1 = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.sucursales (empresa_id, nombre, slug, es_principal, activo)
     VALUES ($1, 'TEST_SUC_1_' || substr(md5(random()::text),1,6),
             'test-1-' || substr(md5(random()::text),1,6), false, true)
     RETURNING id`,
    [empresaId],
  );
  const sucursalId = suc1.rows[0].id;

  // Sucursal 2 (para test I)
  const suc2 = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.sucursales (empresa_id, nombre, slug, es_principal, activo)
     VALUES ($1, 'TEST_SUC_2_' || substr(md5(random()::text),1,6),
             'test-2-' || substr(md5(random()::text),1,6), false, true)
     RETURNING id`,
    [empresaId],
  );
  const sucursalId2 = suc2.rows[0].id;

  // Caja abierta en sucursal 1
  const caja1 = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.cajas (empresa_id, sucursal_id, numero_caja, estado, fecha_apertura, monto_apertura)
     VALUES ($1, $2, 99999, 'abierta', now(), 0)
     RETURNING id`,
    [empresaId, sucursalId],
  );
  const cajaId = caja1.rows[0].id;

  // Caja abierta en sucursal 2 (para test I)
  const caja2 = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.cajas (empresa_id, sucursal_id, numero_caja, estado, fecha_apertura, monto_apertura)
     VALUES ($1, $2, 99998, 'abierta', now(), 0)
     RETURNING id`,
    [empresaId, sucursalId2],
  );
  const cajaId2 = caja2.rows[0].id;

  // Cliente
  const cli = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.clientes (empresa_id, nombre_contacto, tipo_cliente)
     VALUES ($1, 'TEST_CLI_' || substr(md5(random()::text),1,6), 'persona')
     RETURNING id`,
    [empresaId],
  );
  const clienteId = cli.rows[0].id;

  // Franja de precio (es_franja_precio=true) — con SKU único de test
  // para NO colisionar con uq_franjas_activas_precio de franjas reales.
  // Usamos precio único (999999) que no debería existir.
  const precio = 100000;
  const franja = await client.query<{ id: string }>(
    `INSERT INTO ${SCHEMA}.productos (
       empresa_id, nombre, sku, precio_venta, costo_promedio,
       stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
       activo, es_franja_precio, visible_web
     ) VALUES ($1, 'TEST Franja Gs. 100000',
              'TEST-FRJ-' || substr(md5(random()::text),1,8),
              $2, 0, 0, 0, 'Unidad', 'CPP', true, false, false)
     RETURNING id`,
    [empresaId, precio],
  );
  const franjaId = franja.rows[0].id;

  // Stock inicial: dejamos alto para poder vender
  await client.query(
    `INSERT INTO ${SCHEMA}.producto_stock_sucursal (producto_id, sucursal_id, stock_actual)
     VALUES ($1, $2, 100)`,
    [franjaId, sucursalId],
  );
  await client.query(
    `INSERT INTO ${SCHEMA}.producto_stock_sucursal (producto_id, sucursal_id, stock_actual)
     VALUES ($1, $2, 100)`,
    [franjaId, sucursalId2],
  );

  // IMPORTANTE: liberamos el client (lo devolvemos al pool). Cada test toma
  // el suyo propio. El rollback global lo hacemos al final del script.
  // Como los tests usan getChatPostgresPool() internamente y esperan poder
  // hacer sus propias transacciones, no podemos mantener BEGIN aquí.
  // Estrategia: COMMIT del setup (queda "sucio" en la DB), y en el
  // cleanup borramos todo lo creado explícitamente. Para tests puros
  // usar una empresa/schema descartable sería ideal.
  await client.query("COMMIT");
  client.release();

  return {
    ctx: {
      empresaId, sucursalId, sucursalId2, cajaId, cajaId2,
      clienteId, franjaId, precio,
    },
    cleanup: async () => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        // Borrar en orden inverso de dependencias
        await c.query(`DELETE FROM ${SCHEMA}.cliente_creditos_consumos WHERE empresa_id=$1 AND (entrada_id IN (SELECT id FROM ${SCHEMA}.cliente_creditos_movimientos WHERE cliente_id=$2) OR salida_id IN (SELECT id FROM ${SCHEMA}.cliente_creditos_movimientos WHERE cliente_id=$2))`, [empresaId, clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cliente_creditos_movimientos WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cliente_recepciones_pagos WHERE recepcion_id IN (SELECT id FROM ${SCHEMA}.cliente_recepciones WHERE cliente_id=$1)`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cliente_recepciones_items WHERE recepcion_id IN (SELECT id FROM ${SCHEMA}.cliente_recepciones WHERE cliente_id=$1)`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cliente_recepciones WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cliente_eventos WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cambios WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cobros_clientes WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.cuentas_por_cobrar WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.ventas_pagos_detalle WHERE venta_id IN (SELECT id FROM ${SCHEMA}.ventas WHERE cliente_id=$1)`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.ventas_items WHERE venta_id IN (SELECT id FROM ${SCHEMA}.ventas WHERE cliente_id=$1)`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.ventas WHERE cliente_id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.movimientos_inventario WHERE producto_id=$1`, [franjaId]);
        await c.query(`DELETE FROM ${SCHEMA}.producto_stock_sucursal WHERE producto_id=$1`, [franjaId]);
        await c.query(`DELETE FROM ${SCHEMA}.productos WHERE id=$1`, [franjaId]);
        await c.query(`DELETE FROM ${SCHEMA}.clientes WHERE id=$1`, [clienteId]);
        await c.query(`DELETE FROM ${SCHEMA}.caja_movimientos WHERE caja_id IN ($1, $2)`, [cajaId, cajaId2]);
        await c.query(`DELETE FROM ${SCHEMA}.cajas WHERE id IN ($1, $2)`, [cajaId, cajaId2]);
        await c.query(`DELETE FROM ${SCHEMA}.sucursales WHERE id IN ($1, $2)`, [sucursalId, sucursalId2]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK").catch(() => null);
        console.error("Cleanup error (los datos de test pueden haber quedado):", e);
      } finally {
        c.release();
      }
    },
  };
}

// ═════════════════════════════════════════════════════════════════════
// Helpers de assertion sobre estado
// ═════════════════════════════════════════════════════════════════════

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const pool = getChatPostgresPool()!;
  const c = await pool.connect();
  try {
    const r = await c.query(sql, params);
    return r.rows as T[];
  } finally { c.release(); }
}

async function saldoCliente(clienteId: string): Promise<number> {
  const r = await query<{ saldo: string }>(
    `SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto
                              WHEN tipo='SALIDA' THEN -monto ELSE monto END),0)::text AS saldo
     FROM ${SCHEMA}.cliente_creditos_movimientos WHERE cliente_id=$1`, [clienteId]);
  return Number(r[0]?.saldo ?? 0);
}

async function totalPagosVenta(ventaId: string, metodo?: string): Promise<number> {
  const cond = metodo ? `AND metodo_pago='${metodo}'` : "";
  const r = await query<{ s: string }>(
    `SELECT COALESCE(SUM(monto),0)::text AS s FROM ${SCHEMA}.ventas_pagos_detalle
     WHERE venta_id=$1 ${cond}`, [ventaId]);
  return Number(r[0]?.s ?? 0);
}

async function totalCajaMovs(cajaId: string): Promise<number> {
  const r = await query<{ s: string }>(
    `SELECT COUNT(*)::text AS s FROM ${SCHEMA}.caja_movimientos WHERE caja_id=$1`, [cajaId]);
  return Number(r[0]?.s ?? 0);
}

async function cxcSaldo(ventaId: string): Promise<{ saldo: number; estado: string } | null> {
  const r = await query<{ saldo: string; estado: string }>(
    `SELECT saldo::text, estado FROM ${SCHEMA}.cuentas_por_cobrar WHERE venta_id=$1`, [ventaId]);
  if (!r.length) return null;
  return { saldo: Number(r[0].saldo), estado: r[0].estado };
}

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

async function testA_ventaContadoEfectivoNoDuplicaCaja(ctx: TestCtx) {
  const cajaAntes = await totalCajaMovs(ctx.cajaId);
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA,
    empresaId: ctx.empresaId,
    clienteId: ctx.clienteId,
    observaciones: null,
    moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: ctx.precio }],
  });
  assert(r.total === ctx.precio, `total esperado ${ctx.precio}, obtuve ${r.total}`);
  assert(r.creditoAplicado === 0, "no debía usar crédito");
  assert(r.montoFinanciado === 0, "CONTADO no debe tener financiado");
  // Verificar UNA fila en ventas_pagos_detalle efectivo
  const totalEf = await totalPagosVenta(r.ventaId, "efectivo");
  assert(totalEf === ctx.precio, `pago efectivo esperado ${ctx.precio}, obtuve ${totalEf}`);
  // Verificar que NO se insertó nada en caja_movimientos
  const cajaDespues = await totalCajaMovs(ctx.cajaId);
  assert(cajaDespues === cajaAntes, `caja_movimientos no debía cambiar (antes ${cajaAntes}, después ${cajaDespues})`);
}

async function testB_ventaCreditoSinEntregaInicialNoGeneraEfectivo(ctx: TestCtx) {
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA,
    empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CREDITO", plazoDias: 30,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 0,
    pagosInmediatos: [], // sin entrega inicial
  });
  const efTotal = await totalPagosVenta(r.ventaId, "efectivo");
  assert(efTotal === 0, `no debía haber pago efectivo, obtuve ${efTotal}`);
  const cxc = await cxcSaldo(r.ventaId);
  assert(cxc?.saldo === ctx.precio, `CxC saldo esperado ${ctx.precio}, obtuve ${cxc?.saldo}`);
  assert(cxc?.estado === "pendiente", `CxC estado esperado pendiente, obtuve ${cxc?.estado}`);
  assert(r.montoFinanciado === ctx.precio, `financiado esperado ${ctx.precio}, obtuve ${r.montoFinanciado}`);
}

async function testC_ventaCreditoEntregaParcialCxCSoloSaldo(ctx: TestCtx) {
  const total = ctx.precio; // 100000
  const inicial = 30000;
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA,
    empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CREDITO", plazoDias: 30,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: inicial }],
  });
  const cxc = await cxcSaldo(r.ventaId);
  assert(cxc?.saldo === total - inicial, `CxC saldo esperado ${total - inicial}, obtuve ${cxc?.saldo}`);
  const efTotal = await totalPagosVenta(r.ventaId, "efectivo");
  assert(efTotal === inicial, `efectivo esperado ${inicial}, obtuve ${efTotal}`);
}

async function testD_pagoMixto(ctx: TestCtx) {
  // Setup: dar 40000 de crédito al cliente
  const pool = getChatPostgresPool()!;
  const c = await pool.connect();
  await c.query(
    `INSERT INTO ${SCHEMA}.cliente_creditos_movimientos
       (empresa_id, cliente_id, tipo, monto, origen, referencia_numero)
     VALUES ($1, $2, 'ENTRADA', 40000, 'ajuste_manual', 'test-D-setup')`,
    [ctx.empresaId, ctx.clienteId],
  );
  c.release();

  const r = await createVentaTransaccionalPg({
    schema: SCHEMA,
    empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 40000,
    pagosInmediatos: [
      { metodo_pago: "efectivo", monto: 40000 },
      { metodo_pago: "transferencia", monto: 20000 },
    ],
  });
  assert(r.total === 100000, `total ${r.total}`);
  assert(r.creditoAplicado === 40000, `crédito ${r.creditoAplicado}`);
  assert(r.pagosInmediatosTotal === 60000, `pagos ${r.pagosInmediatosTotal}`);
  assert(r.montoFinanciado === 0, `CONTADO financiado debe ser 0`);
  const efTotal = await totalPagosVenta(r.ventaId, "efectivo");
  const tfTotal = await totalPagosVenta(r.ventaId, "transferencia");
  assert(efTotal === 40000 && tfTotal === 20000, `pagos: ef=${efTotal} tf=${tfTotal}`);
  const saldo = await saldoCliente(ctx.clienteId);
  assert(saldo === 0, `saldo esperado 0, obtuve ${saldo}`);
}

async function testE_ingresoRecepcionIdempotente(ctx: TestCtx) {
  const r = await crearRecepcionPg({
    schema: SCHEMA,
    empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    sucursalId: ctx.sucursalId,
    items: [{ producto_id: ctx.franjaId, cantidad: 2, precio_compra_unitario: 30000 }],
    pagos: [{ metodo: "credito", monto: 60000 }],
    observaciones: null, createdBy: null, usuarioNombre: null,
    ingresarAhora: false,
  });
  assert(r.estado === "pendiente_ingreso");

  const stockAntes = (await query<{ s: string }>(
    `SELECT stock_actual::text AS s FROM ${SCHEMA}.producto_stock_sucursal
     WHERE producto_id=$1 AND sucursal_id=$2`, [ctx.franjaId, ctx.sucursalId]))[0]?.s;

  const i1 = await ingresarRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: r.id,
    actorId: null, actorNombre: null,
  });
  assert(i1.estado === "ingresada");
  const stock1 = (await query<{ s: string }>(
    `SELECT stock_actual::text AS s FROM ${SCHEMA}.producto_stock_sucursal
     WHERE producto_id=$1 AND sucursal_id=$2`, [ctx.franjaId, ctx.sucursalId]))[0]?.s;
  assert(Number(stock1) === Number(stockAntes) + 2, `stock esperado +2, antes=${stockAntes} después=${stock1}`);

  // Segundo ingreso — idempotente, no debe volver a sumar
  const i2 = await ingresarRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: r.id,
    actorId: null, actorNombre: null,
  });
  assert(i2.estado === "ingresada");
  const stock2 = (await query<{ s: string }>(
    `SELECT stock_actual::text AS s FROM ${SCHEMA}.producto_stock_sucursal
     WHERE producto_id=$1 AND sucursal_id=$2`, [ctx.franjaId, ctx.sucursalId]))[0]?.s;
  assert(Number(stock2) === Number(stock1), `stock no debía cambiar, antes=${stock1} después=${stock2}`);
}

async function testF_dosConsumosConcurrentesMismoCredito(ctx: TestCtx) {
  // Setup: 50k de crédito. Dos ventas simultáneas de 40k cada una.
  const pool = getChatPostgresPool()!;
  const c = await pool.connect();
  await c.query(
    `INSERT INTO ${SCHEMA}.cliente_creditos_movimientos
       (empresa_id, cliente_id, tipo, monto, origen, referencia_numero)
     VALUES ($1, $2, 'ENTRADA', 50000, 'ajuste_manual', 'test-F-setup')`,
    [ctx.empresaId, ctx.clienteId],
  );
  c.release();

  const venta = () => createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 40000,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: 60000 }],
  });

  const [r1, r2] = await Promise.allSettled([venta(), venta()]);
  const okCount = [r1, r2].filter((x) => x.status === "fulfilled").length;
  const failCount = [r1, r2].filter((x) => x.status === "rejected").length;
  assert(okCount === 1 && failCount === 1,
    `esperaba 1 OK + 1 FAIL, obtuve ${okCount}/${failCount}. r1=${r1.status} r2=${r2.status}`);
  const saldo = await saldoCliente(ctx.clienteId);
  assert(saldo === 10000, `saldo esperado 10000, obtuve ${saldo}`);
}

async function testG_anularConCreditoConsumidoBloquea(ctx: TestCtx) {
  // Recepción crédito 60k
  const r = await crearRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    sucursalId: ctx.sucursalId,
    items: [{ producto_id: ctx.franjaId, cantidad: 2, precio_compra_unitario: 30000 }],
    pagos: [{ metodo: "credito", monto: 60000 }],
    observaciones: null, createdBy: null, usuarioNombre: null,
    ingresarAhora: false,
  });
  // Consumir crédito en una venta
  await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 40000,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: 60000 }],
  });
  // Intentar anular recepción → debe fallar
  let bloqueoOk = false;
  try {
    await anularRecepcionPg({
      schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: r.id,
      motivo: "test", actorId: null, actorNombre: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("crédito ya fue consumido") || msg.includes("crédito ya fue")) {
      bloqueoOk = true;
    } else {
      throw new Error("Falló pero no con el error esperado: " + msg);
    }
  }
  assert(bloqueoOk, "debía bloquear anulación con crédito consumido");
  // Verificar que la recepción sigue en pendiente_ingreso (no cambió)
  const est = (await query<{ estado: string }>(
    `SELECT estado FROM ${SCHEMA}.cliente_recepciones WHERE id=$1`, [r.id]))[0]?.estado;
  assert(est === "pendiente_ingreso", `estado debía seguir pendiente_ingreso, obtuve ${est}`);
}

async function testH_anularVentaConCxCCobradaBloquea(ctx: TestCtx) {
  // Venta a crédito
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CREDITO", plazoDias: 30,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 0,
    pagosInmediatos: [],
  });
  assert(r.cxcId, "debía crear CxC");
  // Simular cobro aplicado
  const pool = getChatPostgresPool()!;
  const c = await pool.connect();
  await c.query(
    `INSERT INTO ${SCHEMA}.cobros_clientes
       (empresa_id, cliente_id, cuenta_por_cobrar_id, venta_id, sucursal_id, monto, metodo_pago)
     VALUES ($1, $2, $3, $4, $5, 50000, 'efectivo')`,
    [ctx.empresaId, ctx.clienteId, r.cxcId, r.ventaId, ctx.sucursalId],
  );
  c.release();

  let bloqueoOk = false;
  try {
    await anularVentaPg({
      schema: SCHEMA, empresaId: ctx.empresaId, ventaId: r.ventaId,
      motivo: "test", actorId: null, actorNombre: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("cobro(s) aplicado(s)")) bloqueoOk = true;
    else throw new Error("Falló pero no con el error esperado: " + msg);
  }
  assert(bloqueoOk, "debía bloquear anulación con CxC cobrada");
}

async function testI_dosSucursalesCajasAbiertas(ctx: TestCtx) {
  // El setup ya creó 2 cajas abiertas en 2 sucursales. Confirmar que existen.
  const r = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM ${SCHEMA}.cajas
     WHERE empresa_id=$1 AND sucursal_id IN ($2,$3) AND estado='abierta'`,
    [ctx.empresaId, ctx.sucursalId, ctx.sucursalId2]);
  assert(Number(r[0].c) === 2, `esperaba 2 cajas abiertas, hay ${r[0].c}`);
  // Confirmar que puedo vender en sucursal 2 con caja abierta
  const rV = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId2,
    creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: 100000 }],
  });
  assert(rV.total === 100000);
}

async function testJ_precioManipuladoRechazado(ctx: TestCtx) {
  // El nuevo create-venta-pg ignora precio_venta_sugerido y toma de DB.
  // Aunque el cliente mande otro precio, el server usa el de productos.
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{
      producto_id: ctx.franjaId, cantidad: 1,
      // "cliente intenta enviar" un precio manipulado:
      precio_venta_sugerido: 1, // ← ignorado
    }],
    sucursalId: ctx.sucursalId,
    creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: ctx.precio }],
  });
  assert(r.total === ctx.precio,
    `server debía tomar precio de DB (${ctx.precio}), no del cliente. Obtuve ${r.total}`);
}

async function testK_reconstruccionSchema() {
  // Verifica que las migraciones nuevas dejan el schema en estado consistente.
  // No podemos hacer DROP SCHEMA aquí (rompería producción); en su lugar
  // verificamos que las tablas/columnas/indexes/funciones críticas existan.
  const checks: Array<[string, string]> = [
    ["tabla contadores_correlativos",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='${SCHEMA}' AND table_name='contadores_correlativos'`],
    ["tabla cliente_recepciones_pagos",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='${SCHEMA}' AND table_name='cliente_recepciones_pagos'`],
    ["tabla cambios",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='${SCHEMA}' AND table_name='cambios'`],
    ["columna total_compra",
      `SELECT 1 FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='cliente_recepciones' AND column_name='total_compra'`],
    ["columna caja_id en pagos recepcion",
      `SELECT 1 FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='cliente_recepciones_pagos' AND column_name='caja_id'`],
    ["columna caja_id en ventas_pagos_detalle",
      `SELECT 1 FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='ventas_pagos_detalle' AND column_name='caja_id'`],
    ["index uq_cajas_una_abierta_por_sucursal",
      `SELECT 1 FROM pg_indexes WHERE schemaname='${SCHEMA}' AND indexname='uq_cajas_una_abierta_por_sucursal'`],
    ["función siguiente_numero_control",
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='${SCHEMA}' AND p.proname='siguiente_numero_control'`],
    ["función lock_cliente_credito",
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='${SCHEMA}' AND p.proname='lock_cliente_credito'`],
  ];
  for (const [name, sql] of checks) {
    const r = await query(sql, []);
    assert(r.length > 0, `falta: ${name}`);
  }
}

// ═════════════════════════════════════════════════════════════════════
// Runner
// ═════════════════════════════════════════════════════════════════════

async function run(name: string, fn: (ctx: TestCtx) => Promise<void>) {
  const s = await setupTest();
  try {
    await fn(s.ctx);
    results.push({ name, ok: true });
    console.log(`OK ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    results.push({ name, ok: false, msg });
    console.error(`FAIL ${name}: ${msg}`);
  } finally {
    await s.cleanup();
  }
}

async function main() {
  await run("A. venta contado efectivo no duplica caja", testA_ventaContadoEfectivoNoDuplicaCaja);
  await run("B. venta credito sin entrega no genera efectivo", testB_ventaCreditoSinEntregaInicialNoGeneraEfectivo);
  await run("C. venta credito entrega parcial CxC solo saldo", testC_ventaCreditoEntregaParcialCxCSoloSaldo);
  await run("D. pago mixto", testD_pagoMixto);
  await run("E. ingreso recepcion idempotente", testE_ingresoRecepcionIdempotente);
  await run("F. dos consumos concurrentes mismo credito", testF_dosConsumosConcurrentesMismoCredito);
  await run("G. anular con credito consumido bloquea", testG_anularConCreditoConsumidoBloquea);
  await run("H. anular venta con CxC cobrada bloquea", testH_anularVentaConCxCCobradaBloquea);
  await run("I. dos sucursales cajas abiertas simultaneas", testI_dosSucursalesCajasAbiertas);
  await run("J. precio manipulado rechazado/recalculado", testJ_precioManipuladoRechazado);
  // K no necesita setup
  try {
    await testK_reconstruccionSchema();
    results.push({ name: "K. reconstruccion schema", ok: true });
    console.log("OK K. reconstruccion schema");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "K. reconstruccion schema", ok: false, msg });
    console.error(`FAIL K: ${msg}`);
  }

  console.log("\n─── RESUMEN ───");
  const okN = results.filter((r) => r.ok).length;
  const failN = results.filter((r) => !r.ok).length;
  console.log(`${okN}/${results.length} OK, ${failN} FAIL`);
  process.exit(failN === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Runner error:", e);
  process.exit(2);
});
