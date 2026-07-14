/**
 * Runner de tests de integración del núcleo financiero pronimerp.
 *
 * Uso:
 *   npx tsx scripts/tests/nucleo-financiero/_run-all.ts
 *
 * REQUISITOS
 *   .env.local con TEST_DB_URL apuntando a una base descartable (NO
 *   producción). Los tests corren físicamente contra la DB indicada.
 *   La base descartable debe tener el schema pronimerp reconstruido
 *   desde cero. El script bootstrap aplica todas las migraciones antes
 *   de correr los tests.
 *
 * IMPORTANTE
 *   - NO usar SUPABASE_DB_URL de producción acá.
 *   - Los tests crean sus propias entidades ficticias y limpian todo al
 *     terminar. NO se hacen commits de datos de prueba en la base.
 *   - Test K ejecuta `bootstrap.ts` que dropea el schema y aplica todas
 *     las migraciones en orden.
 */
import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { Pool, type PoolClient } from "pg";
import type { CajaResumen } from "@/lib/caja/types";

config({ path: path.join(process.cwd(), ".env.local") });

const SCHEMA = "pronimerp";
const TEST_DB_URL = process.env.TEST_DB_URL;

if (!TEST_DB_URL) {
  console.error("FATAL: TEST_DB_URL no está definida en .env.local.");
  console.error("Este runner NO acepta SUPABASE_DB_URL de producción.");
  console.error("Configurá TEST_DB_URL a una base descartable con schema pronimerp.");
  process.exit(2);
}

// Preparar pool que las funciones server-side puedan usar. Setear
// SUPABASE_DB_URL = TEST_DB_URL antes de importar las funciones asegura
// que getChatPostgresPool() apunte a la base descartable.
process.env.SUPABASE_DB_URL = TEST_DB_URL;

// Import DESPUÉS de setear la env var
type Import = typeof import("@/lib/ventas/server/create-venta-pg");
type ImportRec = typeof import("@/lib/recepciones/server/recepciones-pg");
type ImportAnulVenta = typeof import("@/lib/ventas/server/anular-venta-pg");
type ImportCaja = typeof import("@/lib/caja/server/caja-pg");

let createVentaTransaccionalPg: Import["createVentaTransaccionalPg"];
let anularVentaPg: ImportAnulVenta["anularVentaPg"];
let crearRecepcionPg: ImportRec["crearRecepcionPg"];
let ingresarRecepcionPg: ImportRec["ingresarRecepcionPg"];
let anularRecepcionPg: ImportRec["anularRecepcionPg"];
let getResumenCajaPg: ImportCaja["getResumenCajaPg"];

async function loadServerFns() {
  const cv = await import("@/lib/ventas/server/create-venta-pg");
  const rc = await import("@/lib/recepciones/server/recepciones-pg");
  const av = await import("@/lib/ventas/server/anular-venta-pg");
  const cj = await import("@/lib/caja/server/caja-pg");
  createVentaTransaccionalPg = cv.createVentaTransaccionalPg;
  anularVentaPg = av.anularVentaPg;
  crearRecepcionPg = rc.crearRecepcionPg;
  ingresarRecepcionPg = rc.ingresarRecepcionPg;
  anularRecepcionPg = rc.anularRecepcionPg;
  getResumenCajaPg = cj.getResumenCajaPg;
}

// Pool para queries directas (setup/cleanup)
const localPool = new Pool({ connectionString: TEST_DB_URL });

async function assertDisposableTestDatabase(): Promise<void> {
  if (process.env.ALLOW_DESTRUCTIVE_TEST_DB !== "true") {
    throw new Error(
      "Falta ALLOW_DESTRUCTIVE_TEST_DB=true. El runner elimina y reconstruye el schema pronimerp.",
    );
  }
  const c = await localPool.connect();
  try {
    const r = await c.query<{ db: string }>("SELECT current_database() AS db");
    const db = r.rows[0]?.db ?? "";
    if (!/test/i.test(db)) {
      throw new Error(
        `Base rechazada: "${db}". El nombre debe contener "test" para permitir el bootstrap destructivo.`,
      );
    }
  } finally {
    c.release();
  }
}

// ═════════════════════════════════════════════════════════════════════
// Bootstrap: dropea schema + aplica todas las migraciones desde cero
// ═════════════════════════════════════════════════════════════════════

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function applyAllMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();
  const c = await localPool.connect();
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      try {
        await c.query(sql);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`FALLÓ migración ${f}: ${msg}`);
        throw e;
      }
    }
  } finally {
    c.release();
  }
}

async function dropSchemaAndReapply() {
  const c = await localPool.connect();
  try {
    await c.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    // Recrear schema base: en una DB completamente vacía primero necesitamos
    // el schema base joyeriaartesanos + el clone. En una DB test que ya tiene
    // la base seteada, solo dropear pronimerp y aplicar sus migraciones no
    // basta porque pronimerp se genera vía CLONE_SCHEMA_PRONIMERP.sql.
    // Alternativa: aplicar todas las migraciones que existan bajo migrations/.
  } finally {
    c.release();
  }
  await applyAllMigrations();
}

// ═════════════════════════════════════════════════════════════════════
// Setup: empresa descartable
// ═════════════════════════════════════════════════════════════════════

interface TestCtx {
  empresaId: string;
  sucursalId: string;
  sucursalId2: string;
  cajaId: string;
  cajaId2: string;
  clienteId: string;
  franjaId: string;
  precio: number;
}

async function setupTest(): Promise<{ ctx: TestCtx; cleanup: () => Promise<void> }> {
  const c = await localPool.connect();
  try {
    await c.query("BEGIN");

    // Empresa descartable (TEST_)
    const emp = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.empresas (nombre_empresa, ruc, plan, estado, data_schema)
       VALUES ('TEST_EMP_' || substr(md5(random()::text),1,8), 'TEST-'||floor(random()*1e6)::text, 'test', 'ACTIVA', $1)
       RETURNING id`, [SCHEMA],
    );
    const empresaId = emp.rows[0].id;

    // Sucursales
    const suc1 = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.sucursales (empresa_id, nombre, slug, es_principal, activo)
       VALUES ($1, 'TEST_SUC1', 'test-suc1-'||substr(md5(random()::text),1,6), true, true)
       RETURNING id`, [empresaId]);
    const sucursalId = suc1.rows[0].id;
    const suc2 = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.sucursales (empresa_id, nombre, slug, es_principal, activo)
       VALUES ($1, 'TEST_SUC2', 'test-suc2-'||substr(md5(random()::text),1,6), false, true)
       RETURNING id`, [empresaId]);
    const sucursalId2 = suc2.rows[0].id;

    // Cajas abiertas en cada sucursal (con el nuevo UNIQUE por sucursal, permitido)
    const caja1 = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.cajas (empresa_id, sucursal_id, numero_caja, estado, fecha_apertura, monto_apertura)
       VALUES ($1, $2, 1, 'abierta', now(), 0) RETURNING id`, [empresaId, sucursalId]);
    const cajaId = caja1.rows[0].id;
    const caja2 = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.cajas (empresa_id, sucursal_id, numero_caja, estado, fecha_apertura, monto_apertura)
       VALUES ($1, $2, 2, 'abierta', now(), 0) RETURNING id`, [empresaId, sucursalId2]);
    const cajaId2 = caja2.rows[0].id;

    // Cliente ficticio
    const cli = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.clientes (empresa_id, nombre_contacto, tipo_cliente)
       VALUES ($1, 'TEST_CLI_' || substr(md5(random()::text),1,8), 'persona')
       RETURNING id`, [empresaId]);
    const clienteId = cli.rows[0].id;

    // Franja de precio REAL (es_franja_precio=true) — se apoya en la
    // migración 20260805 que garantiza unicidad por (empresa_id, precio, activo).
    const precio = 100000;
    const fj = await c.query<{ id: string }>(
      `INSERT INTO ${SCHEMA}.productos (
         empresa_id, nombre, sku, precio_venta, costo_promedio,
         stock_actual, stock_minimo, unidad_medida, metodo_valuacion,
         activo, es_franja_precio, visible_web
       ) VALUES ($1, 'TEST Franja Gs. 100000', 'FRJ-'||floor(random()*1e6)::text,
                 $2, 0, 0, 0, 'Unidad', 'CPP', true, true, false)
       RETURNING id`, [empresaId, precio]);
    const franjaId = fj.rows[0].id;

    // Stock inicial: alto en ambas sucursales
    await c.query(
      `INSERT INTO ${SCHEMA}.producto_stock_sucursal (producto_id, sucursal_id, stock_actual)
       VALUES ($1, $2, 100)`, [franjaId, sucursalId]);
    await c.query(
      `INSERT INTO ${SCHEMA}.producto_stock_sucursal (producto_id, sucursal_id, stock_actual)
       VALUES ($1, $2, 100)`, [franjaId, sucursalId2]);

    await c.query("COMMIT");

    return {
      ctx: { empresaId, sucursalId, sucursalId2, cajaId, cajaId2, clienteId, franjaId, precio },
      cleanup: async () => {
        // Borrar todo lo creado (CASCADE limpia la mayoría vía empresas).
        const cc = await localPool.connect();
        try {
          await cc.query(`DELETE FROM ${SCHEMA}.empresas WHERE id = $1`, [empresaId]);
        } finally { cc.release(); }
      },
    };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    c.release();
  }
}

// ═════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function q<T>(sql: string, params: unknown[]): Promise<T[]> {
  const c = await localPool.connect();
  try { return (await c.query(sql, params)).rows as T[]; }
  finally { c.release(); }
}

async function saldoCliente(cliId: string): Promise<number> {
  const r = await q<{ s: string }>(
    `SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN monto WHEN tipo='SALIDA' THEN -monto ELSE monto END),0)::text AS s
     FROM ${SCHEMA}.cliente_creditos_movimientos WHERE cliente_id=$1`, [cliId]);
  return Number(r[0]?.s ?? 0);
}
async function cxc(vId: string) {
  const r = await q<{ saldo: string; estado: string }>(
    `SELECT saldo::text, estado FROM ${SCHEMA}.cuentas_por_cobrar WHERE venta_id=$1`, [vId]);
  return r[0] ? { saldo: Number(r[0].saldo), estado: r[0].estado } : null;
}
async function totalCajaMovs(cId: string) {
  const r = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${SCHEMA}.caja_movimientos WHERE caja_id=$1`, [cId]);
  return Number(r[0]?.n ?? 0);
}

// ═════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════

const results: Array<{ name: string; ok: boolean; msg?: string }> = [];

async function testA_contadoNoDuplicaCaja(ctx: TestCtx) {
  const antesMovs = await totalCajaMovs(ctx.cajaId);
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: ctx.precio }],
  });
  assert(r.total === ctx.precio, `total=${r.total}`);
  assert(r.montoFinanciado === 0, "CONTADO financiado != 0");
  const despuesMovs = await totalCajaMovs(ctx.cajaId);
  assert(despuesMovs === antesMovs, `caja_movimientos no debe cambiar (${antesMovs} → ${despuesMovs})`);

  // computeResumen: total_vendido + total_efectivo deben coincidir
  const resumen = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  assert(resumen.total_vendido === ctx.precio, `total_vendido=${resumen.total_vendido}`);
  assert(resumen.total_efectivo === ctx.precio, `total_efectivo=${resumen.total_efectivo}`);
  assert(resumen.total_tarjeta === 0 && resumen.total_transferencia === 0,
    `otros métodos deberían ser 0`);
}

async function testB_creditoSinEntrega(ctx: TestCtx) {
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CREDITO", plazoDias: 30,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [],
  });
  const c = await cxc(r.ventaId);
  assert(c?.saldo === ctx.precio, `CxC saldo=${c?.saldo}`);
  const resumen = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  // La venta a crédito debe aparecer en total_vendido pero no en efectivo
  assert(resumen.total_vendido === ctx.precio, `total_vendido=${resumen.total_vendido}`);
  assert(resumen.total_efectivo === 0, `total_efectivo debe ser 0, obtuve ${resumen.total_efectivo}`);
}

async function testC_creditoParcialCxCSoloSaldo(ctx: TestCtx) {
  const inicial = 30000;
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CREDITO", plazoDias: 30,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: inicial }],
  });
  const c = await cxc(r.ventaId);
  assert(c?.saldo === ctx.precio - inicial, `CxC saldo=${c?.saldo}, esperado ${ctx.precio - inicial}`);
}

async function testD_pagoMixto(ctx: TestCtx) {
  // Cargar 40k de crédito
  const cc = await localPool.connect();
  await cc.query(`INSERT INTO ${SCHEMA}.cliente_creditos_movimientos
    (empresa_id, cliente_id, tipo, monto, origen, referencia_numero)
    VALUES ($1,$2,'ENTRADA',40000,'ajuste_manual','setup-D')`, [ctx.empresaId, ctx.clienteId]);
  cc.release();
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 40000,
    pagosInmediatos: [
      { metodo_pago: "efectivo", monto: 40000 },
      { metodo_pago: "transferencia", monto: 20000 },
    ],
  });
  assert(r.creditoAplicado === 40000, `credito=${r.creditoAplicado}`);
  assert(r.pagosInmediatosTotal === 60000, `pagos=${r.pagosInmediatosTotal}`);
  const resumen = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  assert(resumen.total_efectivo === 40000, `efectivo=${resumen.total_efectivo}`);
  assert(resumen.total_transferencia === 20000, `transferencia=${resumen.total_transferencia}`);
}

async function testE_ingresoIdempotente(ctx: TestCtx) {
  const r = await crearRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    sucursalId: ctx.sucursalId,
    items: [{ producto_id: ctx.franjaId, cantidad: 2, precio_compra_unitario: 30000 }],
    pagos: [{ metodo: "credito", monto: 60000 }],
    observaciones: null, createdBy: null, usuarioNombre: null,
    ingresarAhora: false,
  });
  const stockAntes = Number((await q<{ s: string }>(
    `SELECT stock_actual::text AS s FROM ${SCHEMA}.producto_stock_sucursal WHERE producto_id=$1 AND sucursal_id=$2`,
    [ctx.franjaId, ctx.sucursalId]))[0].s);
  await ingresarRecepcionPg({ schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: r.id, actorId: null, actorNombre: null });
  const stock1 = Number((await q<{ s: string }>(
    `SELECT stock_actual::text AS s FROM ${SCHEMA}.producto_stock_sucursal WHERE producto_id=$1 AND sucursal_id=$2`,
    [ctx.franjaId, ctx.sucursalId]))[0].s);
  assert(stock1 === stockAntes + 2, `stock1=${stock1}, esperaba ${stockAntes + 2}`);
  await ingresarRecepcionPg({ schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: r.id, actorId: null, actorNombre: null });
  const stock2 = Number((await q<{ s: string }>(
    `SELECT stock_actual::text AS s FROM ${SCHEMA}.producto_stock_sucursal WHERE producto_id=$1 AND sucursal_id=$2`,
    [ctx.franjaId, ctx.sucursalId]))[0].s);
  assert(stock2 === stock1, `stock2=${stock2}, no debe haber cambiado`);
}

async function testF_dosConsumosConcurrentes(ctx: TestCtx) {
  const cc = await localPool.connect();
  await cc.query(`INSERT INTO ${SCHEMA}.cliente_creditos_movimientos
    (empresa_id, cliente_id, tipo, monto, origen, referencia_numero)
    VALUES ($1,$2,'ENTRADA',50000,'ajuste_manual','setup-F')`, [ctx.empresaId, ctx.clienteId]);
  cc.release();
  const venta = () => createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 40000,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: 60000 }],
  });
  const [r1, r2] = await Promise.allSettled([venta(), venta()]);
  const ok = [r1, r2].filter((x) => x.status === "fulfilled").length;
  const fail = [r1, r2].filter((x) => x.status === "rejected").length;
  assert(ok === 1 && fail === 1, `esperaba 1 OK + 1 FAIL, obtuve ${ok}/${fail}`);
}

async function testG_anularConCreditoConsumidoBloquea(ctx: TestCtx) {
  const rec = await crearRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    sucursalId: ctx.sucursalId,
    items: [{ producto_id: ctx.franjaId, cantidad: 2, precio_compra_unitario: 30000 }],
    pagos: [{ metodo: "credito", monto: 60000 }],
    observaciones: null, createdBy: null, usuarioNombre: null,
    ingresarAhora: false,
  });
  await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 40000,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: 60000 }],
  });
  let bloqueoOk = false;
  try {
    await anularRecepcionPg({ schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: rec.id, motivo: "test", actorId: null, actorNombre: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("crédito ya fue consumido")) bloqueoOk = true;
    else throw new Error("bloqueo por otro motivo: " + msg);
  }
  assert(bloqueoOk, "debía bloquear");
}

async function testH_anularVentaConCxCCobradaBloquea(ctx: TestCtx) {
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CREDITO", plazoDias: 30,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0, pagosInmediatos: [],
  });
  const cc = await localPool.connect();
  await cc.query(`INSERT INTO ${SCHEMA}.cobros_clientes
    (empresa_id, cliente_id, cuenta_por_cobrar_id, venta_id, sucursal_id, monto, metodo_pago)
    VALUES ($1,$2,$3,$4,$5,50000,'efectivo')`,
    [ctx.empresaId, ctx.clienteId, r.cxcId, r.ventaId, ctx.sucursalId]);
  cc.release();
  let bloqueoOk = false;
  try {
    await anularVentaPg({ schema: SCHEMA, empresaId: ctx.empresaId, ventaId: r.ventaId, motivo: "test", actorId: null, actorNombre: null });
  } catch (e) {
    if ((e instanceof Error ? e.message : "").includes("cobro")) bloqueoOk = true;
    else throw e;
  }
  assert(bloqueoOk, "debía bloquear");
}

async function testI_dosSucursalesCajas(ctx: TestCtx) {
  const q1 = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${SCHEMA}.cajas
     WHERE empresa_id=$1 AND estado='abierta' AND sucursal_id IN ($2,$3)`,
    [ctx.empresaId, ctx.sucursalId, ctx.sucursalId2]);
  assert(Number(q1[0].n) === 2, `esperaba 2 cajas abiertas, hay ${q1[0].n}`);
  // Venta en sucursal 2
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId2, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: ctx.precio }],
  });
  assert(r.total === ctx.precio);
  const r2 = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId2) as CajaResumen;
  assert(r2.total_efectivo === ctx.precio, `caja2 efectivo=${r2.total_efectivo}`);
}

async function testJ_precioManipulado(ctx: TestCtx) {
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1, precio_venta_sugerido: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: ctx.precio }],
  });
  assert(r.total === ctx.precio, `server debía usar precio de DB (${ctx.precio}), obtuve ${r.total}`);
}

async function testL_soloTransferencia(ctx: TestCtx) {
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "transferencia", monto: ctx.precio }],
  });
  const resumen = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  assert(resumen.total_vendido === ctx.precio, `total_vendido=${resumen.total_vendido}`);
  assert(resumen.total_efectivo === 0, `efectivo debe ser 0`);
  assert(resumen.total_transferencia === ctx.precio, `transferencia=${resumen.total_transferencia}`);
  void r;
}

async function testM_soloTarjeta(ctx: TestCtx) {
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "tarjeta", monto: ctx.precio }],
  });
  const resumen = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  assert(resumen.total_tarjeta === ctx.precio, `tarjeta=${resumen.total_tarjeta}`);
  assert(resumen.total_efectivo === 0, `efectivo debe ser 0`);
  void r;
}

async function testN_wacpRestoreAtAnular(ctx: TestCtx) {
  // Recepción de 5 unidades a 20000 cada una → ingresar
  const rec = await crearRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    sucursalId: ctx.sucursalId,
    items: [{ producto_id: ctx.franjaId, cantidad: 5, precio_compra_unitario: 20000 }],
    pagos: [{ metodo: "credito", monto: 100000 }],
    observaciones: null, createdBy: null, usuarioNombre: null,
    ingresarAhora: true,
  });
  // Después de ingresar, costo_promedio del producto debe reflejar WACP
  const p1 = await q<{ cp: string; sa: string }>(
    `SELECT costo_promedio::text AS cp, stock_actual::text AS sa FROM ${SCHEMA}.productos WHERE id=$1`,
    [ctx.franjaId]);
  // stock antes de la recepción era 200 (100 en cada sucursal, se sincroniza)
  // NOTA: trigger sync_producto_stock_total normaliza stock_actual = SUM(pss).
  // Si stock era 200 con costo 0 y entraron 5 a 20000:
  //   nuevo = (200*0 + 5*20000) / 205 ≈ 487
  const costoDespuesIngreso = Number(p1[0].cp);
  const stockDespuesIngreso = Number(p1[0].sa);
  assert(costoDespuesIngreso > 0, `WACP debe subir de 0, obtuve ${costoDespuesIngreso}`);

  // Anular: costo debe recalcularse
  await anularRecepcionPg({
    schema: SCHEMA, empresaId: ctx.empresaId, recepcionId: rec.id,
    motivo: "test WACP restore", actorId: null, actorNombre: null,
  });
  const p2 = await q<{ cp: string; sa: string }>(
    `SELECT costo_promedio::text AS cp, stock_actual::text AS sa FROM ${SCHEMA}.productos WHERE id=$1`,
    [ctx.franjaId]);
  const costoDespuesAnular = Number(p2[0].cp);
  const stockDespuesAnular = Number(p2[0].sa);
  assert(stockDespuesAnular === stockDespuesIngreso - 5,
    `stock post-anular=${stockDespuesAnular}, esperaba ${stockDespuesIngreso - 5}`);
  // Con stock original = 200 y costo 0, al retirar la recepción el costo
  // debe volver a 0 (o cerca).
  assert(costoDespuesAnular <= costoDespuesIngreso,
    `costo tras anular (${costoDespuesAnular}) debe ser <= al post-ingreso (${costoDespuesIngreso})`);
}

async function testO_reversionEnCajaActual(ctx: TestCtx) {
  // Venta efectivo en caja1
  const r = await createVentaTransaccionalPg({
    schema: SCHEMA, empresaId: ctx.empresaId, clienteId: ctx.clienteId,
    observaciones: null, moneda: "GS", tipoCambio: 1,
    tipoVenta: "CONTADO", plazoDias: null,
    items: [{ producto_id: ctx.franjaId, cantidad: 1 }],
    sucursalId: ctx.sucursalId, creditoClienteUsado: 0,
    pagosInmediatos: [{ metodo_pago: "efectivo", monto: ctx.precio }],
  });
  const resumenCaja1 = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  const efectivoAntes = resumenCaja1.total_efectivo;
  // Anular la venta (misma caja abierta)
  await anularVentaPg({
    schema: SCHEMA, empresaId: ctx.empresaId, ventaId: r.ventaId,
    motivo: "test", actorId: null, actorNombre: null,
  });
  // Resumen post-anulación: la reversa 'egreso' se registró en la caja
  // actual (la misma caja1). Total_vendido debe caer (venta ahora es anulada).
  const resumenDespues = await getResumenCajaPg(SCHEMA, ctx.empresaId, ctx.cajaId) as CajaResumen;
  assert(resumenDespues.total_vendido === 0,
    `total_vendido debe caer a 0 al anular, obtuve ${resumenDespues.total_vendido}`);
  assert(resumenDespues.total_efectivo === 0,
    `total_efectivo post-anulación en misma caja: original 'ingreso' se ignora (venta anulada) y no hay reversa nueva. obtuve ${resumenDespues.total_efectivo}`);
  void efectivoAntes;
}

async function testK_reconstruccionSchema() {
  // Verificar que todas las estructuras críticas existan tras aplicar migraciones
  const checks: Array<[string, string]> = [
    ["contadores_correlativos",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='${SCHEMA}' AND table_name='contadores_correlativos'`],
    ["cliente_recepciones_pagos",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='${SCHEMA}' AND table_name='cliente_recepciones_pagos'`],
    ["cambios",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='${SCHEMA}' AND table_name='cambios'`],
    ["total_compra",
      `SELECT 1 FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='cliente_recepciones' AND column_name='total_compra'`],
    ["direccion en pagos venta",
      `SELECT 1 FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='ventas_pagos_detalle' AND column_name='direccion'`],
    ["direccion en pagos recepcion",
      `SELECT 1 FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='cliente_recepciones_pagos' AND column_name='direccion'`],
    ["uq_cajas_una_abierta_por_sucursal",
      `SELECT 1 FROM pg_indexes WHERE schemaname='${SCHEMA}' AND indexname='uq_cajas_una_abierta_por_sucursal'`],
    ["función siguiente_numero_control",
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='${SCHEMA}' AND p.proname='siguiente_numero_control'`],
  ];
  for (const [name, sql] of checks) {
    const rows = await q(sql, []);
    assert(rows.length > 0, `falta: ${name}`);
  }
}

// ═════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════

async function run(name: string, fn: (ctx: TestCtx) => Promise<void>) {
  let s: Awaited<ReturnType<typeof setupTest>> | null = null;
  try {
    s = await setupTest();
    await fn(s.ctx);
    results.push({ name, ok: true });
    console.log(`OK ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, msg });
    console.error(`FAIL ${name}: ${msg}`);
  } finally {
    if (s) await s.cleanup().catch(() => null);
  }
}

async function main() {
  console.log("[bootstrap] validando base descartable y reconstruyendo pronimerp...");
  await assertDisposableTestDatabase();
  await dropSchemaAndReapply();

  // Test K primero: verifica la estructura obtenida de migraciones reales.
  await loadServerFns();
  try {
    await testK_reconstruccionSchema();
    results.push({ name: "K. reconstruccion schema", ok: true });
    console.log("OK K. reconstruccion schema");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "K. reconstruccion schema", ok: false, msg });
    console.error(`FAIL K: ${msg}`);
  }

  await run("A. contado efectivo no duplica caja", testA_contadoNoDuplicaCaja);
  await run("B. credito sin entrega no genera efectivo", testB_creditoSinEntrega);
  await run("C. credito parcial CxC solo saldo", testC_creditoParcialCxCSoloSaldo);
  await run("D. pago mixto", testD_pagoMixto);
  await run("E. ingreso idempotente", testE_ingresoIdempotente);
  await run("F. dos consumos concurrentes", testF_dosConsumosConcurrentes);
  await run("G. anular con credito consumido bloquea", testG_anularConCreditoConsumidoBloquea);
  await run("H. anular venta con CxC cobrada bloquea", testH_anularVentaConCxCCobradaBloquea);
  await run("I. dos sucursales cajas simultaneas", testI_dosSucursalesCajas);
  await run("J. precio manipulado rechazado", testJ_precioManipulado);
  await run("L. venta solo transferencia", testL_soloTransferencia);
  await run("M. venta solo tarjeta", testM_soloTarjeta);
  await run("N. WACP restore al anular recepcion", testN_wacpRestoreAtAnular);
  await run("O. reversion en caja actual (append-only)", testO_reversionEnCajaActual);

  console.log("\n═══ RESUMEN ═══");
  const okN = results.filter((r) => r.ok).length;
  const failN = results.filter((r) => !r.ok).length;
  console.log(`${okN}/${results.length} OK, ${failN} FAIL`);
  if (failN > 0) {
    console.log("\n─── FAILURES ───");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`- ${r.name}: ${r.msg}`);
    }
  }
  await localPool.end();
  process.exit(failN === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Runner fatal:", e);
  process.exit(2);
});
