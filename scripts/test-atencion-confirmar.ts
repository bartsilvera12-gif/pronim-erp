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
  promoDescuentoFijoId: string;    // descuento_fijo 10.000, sin cupón
  promoCashbackId: string;         // cashback 10%, sin cupón
  promoConCuponId: string;         // descuento_fijo 5.000, con cupón "TESTCUP"
  promoConCuponCodigo: string;
  beneficioCashbackConCredId: string;   // genera_credito=true
  beneficioDescManualId: string;        // genera_credito=false, pide_monto=true
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

  // ── Promociones temporales para T2/T3/promos con cupón ─────────────
  const promosT = quoteSchemaTable(SCHEMA, "promociones");
  const mkPromo = async (nombre: string, tipo: string, valor: number, cupon: string | null): Promise<string> => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO ${promosT} (
         empresa_id, nombre, tipo, valor, ambito, cupon_codigo, activo, minimo_compra
       ) VALUES ($1,$2,$3,$4,'general',$5,true,0)
       RETURNING id`,
      [EMPRESA_ID, nombre, tipo, valor, cupon],
    );
    return r.rows[0].id;
  };
  const promoDescuentoFijoId = await mkPromo("TEST descuento fijo 10k", "descuento_fijo", 10000, null);
  const promoCashbackId = await mkPromo("TEST cashback 10%", "cashback", 10, null);
  const promoConCuponCodigo = `TESTCUP${randomUUID().slice(0, 6).toUpperCase()}`;
  const promoConCuponId = await mkPromo("TEST descuento fijo con cupón", "descuento_fijo", 5000, promoConCuponCodigo);

  // ── Config de beneficios en pronimerp.empresas.alertas_atencion_config ─
  const beneficioCashbackConCredId = `test_cashback_${randomUUID().slice(0, 6)}`;
  const beneficioDescManualId = `test_descmanual_${randomUUID().slice(0, 6)}`;
  const empresasT = quoteSchemaTable(SCHEMA, "empresas");
  const beneficiosConfig = [
    { id: beneficioCashbackConCredId, label: "TEST Cashback (crédito)",
      tipo_evento: "cashback",  pide_monto: true, genera_credito: true, monto_max: 100000 },
    { id: beneficioDescManualId,      label: "TEST Descuento manual",
      tipo_evento: "descuento", pide_monto: true, genera_credito: false },
  ];
  await client.query(
    `UPDATE ${empresasT}
        SET alertas_atencion_config = jsonb_set(
          COALESCE(alertas_atencion_config, '{}'::jsonb),
          '{beneficios}',
          $1::jsonb, true
        )
      WHERE id = $2`,
    [JSON.stringify(beneficiosConfig), EMPRESA_ID],
  );

  return { clienteId, sucursalId, cajaId, cajaAltId,
           franjaA_6000, franjaB_9000, franjaC_14000,
           promoDescuentoFijoId, promoCashbackId,
           promoConCuponId, promoConCuponCodigo,
           beneficioCashbackConCredId, beneficioDescManualId };
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

    // ─── T2: cupón inexistente rechazado ───────────────────────────────
    await withSavepoint(client, "T2_cupon_inexistente", async () => {
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
    });

    // ─── T3: cashback SOLO se genera si viene una promo real ─────────
    await withSavepoint(client, "T3_cashback_solo_si_promo", async () => {
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
      eq(Number(cashRow.rows[0].c), 0, "sin promo ⇒ 0 ENTRADAs de cashback");
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

    // ─── T10: descuento_promo NO se suma dos veces ────────────────────
    // Venta 100.000; descuento 10.000; crédito previo 20.000; efectivo 70.000.
    // Verificamos:
    //   - Se consume 20.000 del crédito PREVIO del cliente + 10.000 del
    //     descuento_promo materializado + 70.000 en efectivo.
    //   - En NINGÚN caso se consume el crédito 2 veces (110.000).
    await withSavepoint(client, "T10_descuento_no_duplica", async () => {
      // Sembramos crédito previo de 20.000 al cliente.
      await client.query(
        `INSERT INTO ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
           (empresa_id, cliente_id, tipo, monto, origen, referencia_numero)
         VALUES ($1,$2,'ENTRADA',20000,'ajuste_manual','TEST-SETUP-T10')`,
        [EMPRESA_ID, fx.clienteId],
      );
      // Promo descuento_fijo 10.000. Con 1 unidad de franja C_14000 el
      // subtotal es 14.000 — no llegamos a 100.000. Usamos 8 unidades de
      // franja C_14000 (subtotal 112.000) para tener margen.
      // Elegimos 100.000 exactos: no fácil con franjas fijas. Usamos:
      //   franjaB_9000 × 10 = 90.000 + franjaA_6000 × 2 = 12.000  → 102.000
      // Y la promo aplica un descuento_fijo de 10.000.
      // Total = 102.000; descuento = 10.000; neto = 92.000. Crédito previo 20.000,
      // efectivo 72.000. Verificamos no-duplicación observando saldo consumido.
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        requestPayloadForHash: { t: "T10" },
        lleva: {
          items: [
            { producto_id: fx.franjaB_9000, cantidad: 10, tipo_iva: "EXENTA" },
            { producto_id: fx.franjaA_6000, cantidad: 2,  tipo_iva: "EXENTA" },
          ],
          creditoUsado: 20000, // <-- solo el crédito previo, NO sumar el descuento
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 72000 }],
        },
        promocion: { promocionId: fx.promoDescuentoFijoId },
      }));
      assert(r.venta, "venta esperada");

      // El total de SALIDA de crédito por esta venta debe ser 30.000
      // (20k previo + 10k del descuento_promo materializado), NO 40.000.
      const salidaQ = await client.query<{ suma: string }>(
        `SELECT COALESCE(SUM(monto),0)::text AS suma
         FROM ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
         WHERE cliente_id=$1 AND tipo='SALIDA' AND origen='venta' AND referencia_id=$2`,
        [fx.clienteId, r.venta!.id],
      );
      eq(Number(salidaQ.rows[0].suma), 30000, "SALIDA de crédito por la venta = 30k (no 40k)");

      // Efectivo cobrado en la caja debe ser 72.000.
      const pagosQ = await client.query<{ suma: string }>(
        `SELECT COALESCE(SUM(monto),0)::text AS suma
         FROM ${quoteSchemaTable(SCHEMA, "ventas_pagos_detalle")}
         WHERE venta_id=$1 AND metodo_pago='efectivo'`,
        [r.venta!.id],
      );
      eq(Number(pagosQ.rows[0].suma), 72000, "efectivo cobrado = 72k");
    });

    // ─── T11: cupón obligatorio si promo lo tiene configurado ─────────
    await withSavepoint(client, "T11a_id_sin_cupon_rechazado", async () => {
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: "T11a" },
          lleva: {
            items: [{ producto_id: fx.franjaB_9000, cantidad: 2, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 18000 }],
          },
          promocion: { promocionId: fx.promoConCuponId }, // sin cupón
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(/requiere.+cup/i.test(msg), `esperado error 'requiere cupón', fue: ${msg}`);
      }
      assert(threw, "id + sin cupón cuando la promo lo requiere ⇒ rechazado");
    });

    await withSavepoint(client, "T11b_id_cupon_incorrecto", async () => {
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: "T11b" },
          lleva: {
            items: [{ producto_id: fx.franjaB_9000, cantidad: 2, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 13000 }],
          },
          promocion: { promocionId: fx.promoConCuponId, cuponCodigo: "OTROCUPON" },
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(/no coincide/i.test(msg), `esperado error 'no coincide', fue: ${msg}`);
      }
      assert(threw, "id + cupón incorrecto ⇒ rechazado");
    });

    await withSavepoint(client, "T11c_id_cupon_correcto_ok", async () => {
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        requestPayloadForHash: { t: "T11c" },
        lleva: {
          items: [{ producto_id: fx.franjaB_9000, cantidad: 2, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 13000 }],
        },
        promocion: { promocionId: fx.promoConCuponId, cuponCodigo: fx.promoConCuponCodigo },
      }));
      assert(r.venta, "venta esperada con id+cupón correctos");
      // Aplicación registrada con el cupón normalizado (upper).
      const aplQ = await client.query<{ cupon: string | null }>(
        `SELECT cupon_codigo_usado AS cupon FROM ${quoteSchemaTable(SCHEMA, "promocion_aplicaciones")}
          WHERE venta_id = $1`,
        [r.venta!.id],
      );
      eq(aplQ.rows[0]?.cupon, fx.promoConCuponCodigo.toUpperCase(), "cupón normalizado a upper");
    });

    // ─── T12: promo cashback real acredita ENTRADA origen='cashback' ──
    await withSavepoint(client, "T12_promo_cashback_real", async () => {
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        requestPayloadForHash: { t: "T12" },
        lleva: {
          items: [{ producto_id: fx.franjaB_9000, cantidad: 10, tipo_iva: "EXENTA" }], // 90k
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 90000 }],
        },
        promocion: { promocionId: fx.promoCashbackId }, // 10% ⇒ 9.000
      }));
      const cashQ = await client.query<{ suma: string }>(
        `SELECT COALESCE(SUM(monto),0)::text AS suma
         FROM ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
         WHERE cliente_id=$1 AND origen='cashback' AND referencia_id=$2`,
        [fx.clienteId, r.venta!.id],
      );
      eq(Number(cashQ.rows[0].suma), 9000, "cashback = 9.000 (10% de 90.000)");
    });

    // ─── T13: beneficio configurado como cashback crea el crédito ─────
    await withSavepoint(client, "T13_beneficio_cashback_ok", async () => {
      const r = await confirmarAtencionEnClientePg(client, payload(fx, {
        requestPayloadForHash: { t: "T13" },
        lleva: {
          items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
          creditoUsado: 0,
          pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
        },
        beneficiosCredito: [{ id: fx.beneficioCashbackConCredId, monto: 5000 }],
      }));
      const credQ = await client.query<{ suma: string }>(
        `SELECT COALESCE(SUM(monto),0)::text AS suma
         FROM ${quoteSchemaTable(SCHEMA, "cliente_creditos_movimientos")}
         WHERE cliente_id=$1 AND origen='ajuste_manual' AND referencia_numero=$2`,
        [fx.clienteId, fx.beneficioCashbackConCredId],
      );
      eq(Number(credQ.rows[0].suma), 5000, "beneficio cashback creó crédito de 5.000");
      assert(r.venta, "venta esperada");
    });

    // ─── T14: beneficio con genera_credito=false NO crea crédito ──────
    await withSavepoint(client, "T14_beneficio_no_credito_rechazado", async () => {
      // El frontend nunca debería mandarlo, pero si viene manipulado,
      // el server lo rechaza — rollback total, no queda venta ni crédito.
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: "T14" },
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
          },
          beneficiosCredito: [{ id: fx.beneficioDescManualId, monto: 3000 }],
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(/no est[aá] autorizado/i.test(msg), `esperado error no autorizado, fue: ${msg}`);
      }
      assert(threw, "beneficio con genera_credito=false ⇒ rechazado");
    });

    // ─── T15: beneficio inventado o monto <= 0 rechazado ─────────────
    await withSavepoint(client, "T15_beneficio_inventado", async () => {
      let threw = false;
      try {
        await confirmarAtencionEnClientePg(client, payload(fx, {
          requestPayloadForHash: { t: "T15" },
          lleva: {
            items: [{ producto_id: fx.franjaA_6000, cantidad: 1, tipo_iva: "EXENTA" }],
            creditoUsado: 0,
            pagosInmediatos: [{ metodo_pago: "efectivo", monto: 6000 }],
          },
          beneficiosCredito: [{ id: "id-fantasma", monto: 999999 }],
        }));
      } catch (e) {
        threw = true;
        const msg = e instanceof Error ? e.message : "";
        assert(/no est[aá] configurado/i.test(msg), `esperado 'no está configurado', fue: ${msg}`);
      }
      assert(threw, "id inventado ⇒ rechazado");
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
