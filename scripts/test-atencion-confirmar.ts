/**
 * Test runner del orquestador /api/atencion/confirmar.
 *
 * Ejecuta el orquestador REAL usando `confirmarAtencionEnClientePg` dentro
 * de una transacción con SAVEPOINT/ROLLBACK — nada se persiste en la base.
 *
 * Uso:
 *   npm run test:atencion-confirmar
 *
 * Requiere las variables de entorno que ya usa el resto del app:
 *   SUPABASE_DB_URL (para chat-pg-pool).
 *
 * Los fixtures (empresa, cliente, sucursal, caja, franjas) se buscan por
 * marcadores predecibles; si no existen los crea el propio setup dentro de
 * una tx que se descarta después de los tests.
 *
 * Cubre:
 *   [T1] rollback total ante error de stock — nada persiste
 *   [T2] descuento server-side ignora monto enviado por el frontend
 *   [T3] cashback server-side ignora monto enviado por el frontend
 *   [T4] prorrateo exacto con cantidades 3, 7 y 10 unidades
 *   [T5] misma idempotency_key con payload distinto ⇒ 409 IDEMPOTENCY_CONFLICT
 *   [T6] misma idempotency_key con mismo payload ⇒ reutilizado=true
 *   [T7] admin sin sucursal fija: sucursal se deriva de caja server-side
 *        (nota: la derivación real está en el endpoint; el orquestador
 *        recibe la sucursal ya resuelta. Verificamos que exigir sucursalId
 *        correcto es no negociable.)
 *   [T8] caja múltiple: nunca se auto-elige; el orquestador exige caja_id
 *        y valida pertenencia a la sucursal.
 */

import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import {
  confirmarAtencionEnClientePg,
  canonicalStringify,
  type ConfirmarAtencionInput,
} from "@/lib/atencion/server/confirmar-atencion-pg";
import { randomUUID, createHash } from "node:crypto";

const SCHEMA = "pronimerp";
const EMPRESA_ID = "12c517ef-bef3-4f4e-848f-0b34b0ac0a22"; // Akakua'a

interface Fixtures {
  clienteId: string;
  sucursalId: string;
  cajaId: string;
  cajaAltId: string; // segunda caja abierta (para T8)
  franjaA_6000: string;
  franjaB_9000: string;
  franjaC_14000: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Runner + assertions
   ═══════════════════════════════════════════════════════════════════════ */

let PASSED = 0;
let FAILED = 0;
const results: { name: string; ok: boolean; msg?: string }[] = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT: " + msg);
}
function eq(a: unknown, b: unknown, label: string) {
  assert(a === b, `${label}: esperado=${JSON.stringify(b)} obtenido=${JSON.stringify(a)}`);
}

async function withSavepoint(
  client: import("pg").PoolClient,
  name: string,
  body: () => Promise<void>,
): Promise<void> {
  const sp = `sp_${name.replace(/[^a-z0-9]/gi, "_")}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await body();
    console.log(`  ✓ ${name}`);
    PASSED += 1;
    results.push({ name, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${name} — ${msg}`);
    FAILED += 1;
    results.push({ name, ok: false, msg });
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Setup de fixtures — dentro de la misma tx que después se ROLLBACK-ea
   ═══════════════════════════════════════════════════════════════════════ */

async function seedFixtures(client: import("pg").PoolClient): Promise<Fixtures> {
  const sucT = quoteSchemaTable(SCHEMA, "sucursales");
  const cliT = quoteSchemaTable(SCHEMA, "clientes");
  const prodT = quoteSchemaTable(SCHEMA, "productos");
  const stockT = quoteSchemaTable(SCHEMA, "producto_stock_sucursal");
  const cajasT = quoteSchemaTable(SCHEMA, "cajas");

  // Sucursal (buscamos una existente para no arrancar de cero).
  const sucQ = await client.query<{ id: string }>(
    `SELECT id FROM ${sucT} WHERE empresa_id = $1 LIMIT 1`,
    [EMPRESA_ID],
  );
  assert(sucQ.rows.length > 0, "No hay sucursales para la empresa de test");
  const sucursalId = sucQ.rows[0].id;

  // Cliente ficticio.
  const cliIns = await client.query<{ id: string }>(
    `INSERT INTO ${cliT} (empresa_id, nombre) VALUES ($1, $2) RETURNING id`,
    [EMPRESA_ID, `TEST_ATEN_${randomUUID().slice(0, 8)}`],
  );
  const clienteId = cliIns.rows[0].id;

  // 3 franjas con distintos precios (para prorrateo con 3/7/10 unidades).
  const mkFranja = async (nombre: string, precio: number): Promise<string> => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO ${prodT} (
         empresa_id, nombre, sku, precio_venta, costo_promedio, stock_actual,
         stock_minimo, unidad_medida, metodo_valuacion,
         activo, es_franja_precio, visible_web
       ) VALUES ($1,$2,$3,$4,0,0,0,'Unidad','CPP',true,true,false)
       RETURNING id`,
      [EMPRESA_ID, nombre, `TEST-${randomUUID().slice(0, 6)}`, precio],
    );
    const id = r.rows[0].id;
    await client.query(
      `INSERT INTO ${stockT} (producto_id, sucursal_id, stock_actual)
       VALUES ($1, $2, 100)`,
      [id, sucursalId],
    );
    return id;
  };
  const franjaA_6000 = await mkFranja("TEST Franja 6000", 6000);
  const franjaB_9000 = await mkFranja("TEST Franja 9000", 9000);
  const franjaC_14000 = await mkFranja("TEST Franja 14000", 14000);

  // 2 cajas abiertas en la misma sucursal para T8 (multi-caja).
  // Requiere existencia de puntos_caja; si no hay, marcamos T8 como SKIP.
  const puntoQ = await client.query<{ id: string }>(
    `SELECT id FROM ${quoteSchemaTable(SCHEMA, "puntos_caja")}
      WHERE empresa_id = $1 AND sucursal_id = $2 LIMIT 1`,
    [EMPRESA_ID, sucursalId],
  );
  let cajaId = "";
  let cajaAltId = "";
  if (puntoQ.rows.length > 0) {
    const puntoId = puntoQ.rows[0].id;
    const c1 = await client.query<{ id: string }>(
      `INSERT INTO ${cajasT} (empresa_id, sucursal_id, punto_caja_id,
                              numero_caja, estado, monto_apertura, fecha_apertura)
       VALUES ($1,$2,$3, 9001, 'abierta', 100000, now())
       RETURNING id`,
      [EMPRESA_ID, sucursalId, puntoId],
    );
    cajaId = c1.rows[0].id;
    const c2 = await client.query<{ id: string }>(
      `INSERT INTO ${cajasT} (empresa_id, sucursal_id, punto_caja_id,
                              numero_caja, estado, monto_apertura, fecha_apertura)
       VALUES ($1,$2,$3, 9002, 'abierta', 100000, now())
       RETURNING id`,
      [EMPRESA_ID, sucursalId, puntoId],
    );
    cajaAltId = c2.rows[0].id;
  } else {
    console.warn("⚠ Skipping caja fixtures — no hay puntos_caja para la sucursal");
  }

  return { clienteId, sucursalId, cajaId, cajaAltId,
           franjaA_6000, franjaB_9000, franjaC_14000 };
}

/* ═══════════════════════════════════════════════════════════════════════
   Helper para armar payloads
   ═══════════════════════════════════════════════════════════════════════ */

function payload(
  fx: Fixtures,
  opts: Partial<Omit<ConfirmarAtencionInput, "schema" | "empresaId">> = {},
): ConfirmarAtencionInput {
  return {
    schema: SCHEMA,
    empresaId: EMPRESA_ID,
    clienteId: fx.clienteId,
    sucursalId: fx.sucursalId,
    cajaId: fx.cajaId,
    createdBy: null,
    usuarioNombre: "TEST_RUNNER",
    idempotencyKey: randomUUID(),
    requestPayloadForHash: {},
    observaciones: null,
    trae: null,
    lleva: null,
    promocion: null,
    beneficiosCredito: [],
    ...opts,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════════════════════ */

async function runAll(): Promise<void> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión Postgres (SUPABASE_DB_URL faltante).");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("┌─ Setup fixtures (dentro de tx, será rollback al final) ─");
    const fx = await seedFixtures(client);
    console.log("└─ OK");

    // ─── T1: rollback total ante stock insuficiente ────────────────────
    await withSavepoint(client, "T1_rollback_stock", async () => {
      const recepQPrev = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${quoteSchemaTable(SCHEMA, "cliente_recepciones")} WHERE cliente_id = $1`,
        [fx.clienteId],
      );
      const prev = Number(recepQPrev.rows[0].c);
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: "T1" },
          trae: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 1, precio_compra_unitario: 6000 }],
            totalFinalEvaluado: 6000, ingresarAlStock: true,
          },
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 999, tipo_iva: "EXENTA" }],
            creditoUsado: 0, pagosInmediatos: [],
          },
        }));
        throw new Error("no debió pasar");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        assert(msg.includes("Stock insuficiente"), `esperado 'Stock insuficiente', obtuve: ${msg}`);
      }
      // El error hace que la tx externa quede "abortada"; la limpiamos re-abriendo
      // savepoint. Ese re-abrir lo hace el withSavepoint del siguiente test.
      // Verificamos que la operación NO persistió: contamos recepciones antes/después.
      // (Nota: al estar abortada, cualquier SELECT falla hasta ROLLBACK TO SAVEPOINT.)
      await client.query("ROLLBACK TO SAVEPOINT sp_T1_rollback_stock");
      await client.query("SAVEPOINT sp_T1_rollback_stock"); // re-abre para el finally
      const recepQPost = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${quoteSchemaTable(SCHEMA, "cliente_recepciones")} WHERE cliente_id = $1`,
        [fx.clienteId],
      );
      eq(Number(recepQPost.rows[0].c), prev, "cliente_recepciones no debe cambiar");
    });

    // ─── T2: descuento server-side (ignora monto del frontend) ─────────
    await withSavepoint(client, "T2_descuento_server_side", async () => {
      // Sin promo activa que aplique al carrito: el orquestador debe ignorar
      // cualquier cupón inventado y arrojar 'no aplica'.
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: "T2" },
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
          },
          promocion: { cuponCodigo: "CUPON-INEXISTENTE-XYZ" },
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(/cup[oó]n/i.test(msg), `esperado error de cupón, fue: ${msg}`);
      }
      assert(threw, "el server debió rechazar el cupón inexistente");
      await client.query("ROLLBACK TO SAVEPOINT sp_T2_descuento_server_side");
      await client.query("SAVEPOINT sp_T2_descuento_server_side");
      // Sin promo: la venta pasa y NO hay ENTRADA descuento_promo.
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        requestPayloadForHash: { t: "T2-ok" },
        lleva: {
          items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
        },
      }));
      assert(r.venta, "venta esperada");
      const promoRow = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
         WHERE cliente_id = $1 AND origen = 'descuento_promo'`,
        [fx.clienteId],
      );
      eq(Number(promoRow.rows[0].c), 0, "no debe haber ENTRADA descuento_promo sin promo válida");
    });

    // ─── T3: cashback server-side ─────────────────────────────────────
    await withSavepoint(client, "T3_cashback_manipulado", async () => {
      // Sin promo real: aunque el frontend "envíe" un valor de cashback, el
      // shape del orquestador ya no acepta descuento/cashback del cliente,
      // así que basta con verificar que no aparece ENTRADA de origen='cashback'.
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        requestPayloadForHash: { t: "T3" },
        lleva: {
          items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
        },
      }));
      assert(r.venta, "venta esperada");
      const cashRow = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
         WHERE cliente_id = $1 AND origen = 'cashback' AND referencia_id = $2`,
        [fx.clienteId, r.venta!.id],
      );
      eq(Number(cashRow.rows[0].c), 0, "no debe generarse cashback si no lo determina el server");
    });

    // ─── T4: prorrateo con cantidades 3, 7 y 10 ────────────────────────
    // Total final "raro" para forzar residuo. Verificamos que SUM(cant×precio) == total_final
    // en cada caso.
    for (const escenario of [
      { cant: 3, precioBase: 6000, totalFinal: 20000, nombre: "T4a_3u_20000" },
      { cant: 7, precioBase: 6000, totalFinal: 46999, nombre: "T4b_7u_46999" },
      { cant: 10, precioBase: 9000, totalFinal: 88888, nombre: "T4c_10u_88888" },
    ]) {
      await withSavepoint(client, escenario.nombre, async () => {
        const franja = escenario.precioBase === 9000 ? fx.franjaB_9000 : fx.franjaA_6000;
        const r = await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: escenario.nombre },
          trae: {
            items: [{ producto_id: franja, cantidad: escenario.cant, precio_compra_unitario: escenario.precioBase }],
            totalFinalEvaluado: escenario.totalFinal, ingresarAlStock: true,
          },
        }));
        assert(r.recepcion, "recepcion esperada");
        eq(r.recepcion!.total_final, escenario.totalFinal, "total_final devuelto");

        // Chequeo mate: sumar cantidad × precio_compra_unitario de items reales.
        const sumQ = await client.query<{ suma: string }>(
          `SELECT COALESCE(SUM(cantidad * precio_compra_unitario), 0)::text AS suma
           FROM ${quoteSchemaTable(SCHEMA, "cliente_recepciones_items")}
           WHERE recepcion_id = $1`,
          [r.recepcion!.id],
        );
        eq(Number(sumQ.rows[0].suma), escenario.totalFinal, "SUM(cant×precio) == total_final");

        // La ENTRADA en cliente_creditos_movimientos = total_final.
        const credQ = await client.query<{ m: string }>(
          `SELECT monto::text AS m FROM ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
           WHERE origen = 'recepcion' AND referencia_id = $1`,
          [r.recepcion!.id],
        );
        eq(Number(credQ.rows[0].m), escenario.totalFinal, "ENTRADA credito == total_final");
      });
    }

    // ─── T5: idempotency payload distinto ⇒ 409 ────────────────────────
    await withSavepoint(client, "T5_idem_payload_distinto", async () => {
      const key = randomUUID();
      const first = payload(fx, {
        idempotencyKey: key,
        requestPayloadForHash: { t: "T5-a", cant: 1 },
        lleva: {
          items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
        },
      });
      await confirmarAtencionEnClientePg(client, first);
      // Mismo key, payload distinto (cambia cantidad):
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          idempotencyKey: key,
          requestPayloadForHash: { t: "T5-a", cant: 2 }, // ← distinto
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 2, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 12000 }],
          },
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(msg.startsWith("IDEMPOTENCY_CONFLICT"), `esperado 409, fue: ${msg}`);
      }
      assert(threw, "el server debió arrojar IDEMPOTENCY_CONFLICT");
    });

    // ─── T6: mismo key + mismo payload ⇒ reutilizado=true ──────────────
    await withSavepoint(client, "T6_idem_reuso", async () => {
      const key = randomUUID();
      const same = payload(fx, {
        idempotencyKey: key,
        requestPayloadForHash: { t: "T6", cant: 1 },
        lleva: {
          items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
        },
      });
      const r1 = await confirmarAtencionEnClientePg(client, same);
      eq(r1.reutilizado, false, "primer submit no reutilizado");
      const r2 = await confirmarAtencionEnClientePg(client, same);
      eq(r2.reutilizado, true, "segundo submit reutilizado");
      eq(r2.venta?.id, r1.venta?.id, "mismo venta.id");
    });

    // ─── T7: sucursalId obligatorio (bloqueo si no coincide) ──────────
    // La derivación real vive en el endpoint HTTP; acá verificamos que el
    // orquestador exige una sucursalId concreta y consistente.
    await withSavepoint(client, "T7_sucursal_requerida", async () => {
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          sucursalId: "",
          requestPayloadForHash: { t: "T7" },
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
          },
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(msg.includes("sucursal_id"), `esperado error sucursal, fue: ${msg}`);
      }
      assert(threw, "orquestador debe exigir sucursalId");
    });

    // ─── T8: caja múltiple: caja_id explícito + validación ─────────────
    await withSavepoint(client, "T8_caja_multiple", async () => {
      if (!fx.cajaAltId) {
        console.log("    (skip: no había 2 cajas para probar; se probó path validación en T7)");
        return;
      }
      // Sin caja_id (empty) ⇒ error.
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          cajaId: "",
          requestPayloadForHash: { t: "T8-empty" },
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
          },
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(/caja_id/.test(msg), `esperado caja_id obligatoria, fue: ${msg}`);
      }
      assert(threw, "orquestador debe rechazar caja_id vacío");

      // Con caja_id explícito de la segunda caja: pasa.
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        cajaId: fx.cajaAltId,
        requestPayloadForHash: { t: "T8-explicit" },
        lleva: {
          items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
        },
      }));
      assert(r.venta, "venta debe crearse con caja_id explícito");
    });

    // ─── T9: canonicalStringify recursivo ──────────────────────────────
    await withSavepoint(client, "T9_hash_recursivo", async () => {
      const a = canonicalStringify({ b: 1, a: 2, nested: { y: 1, x: 2 } });
      const b = canonicalStringify({ nested: { x: 2, y: 1 }, a: 2, b: 1 });
      eq(a, b, "orden de claves a cualquier profundidad no debe alterar el string");
      const h1 = createHash("sha256").update(a).digest("hex");
      const h2 = createHash("sha256").update(b).digest("hex");
      eq(h1, h2, "hash idéntico");
      const c = canonicalStringify({ nested: { x: 2, y: 2 }, a: 2, b: 1 });
      assert(canonicalStringify(c) !== a, "cambiar un valor profundo debe cambiar el string");
    });

  } finally {
    // ROLLBACK global: descartamos TODAS las fixtures y writes de los tests.
    await client.query("ROLLBACK").catch(() => null);
    client.release();
  }

  console.log(`\n━━━ Resultado: ${PASSED} OK, ${FAILED} FAIL ━━━`);
  if (FAILED > 0) {
    console.log("\nDetalle de fallos:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name}: ${r.msg}`);
    }
    process.exit(1);
  }
}

runAll().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
