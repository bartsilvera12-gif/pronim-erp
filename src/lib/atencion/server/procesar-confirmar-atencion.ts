/**
 * Handler puro (sin Next.js) del endpoint POST /api/atencion/confirmar.
 *
 * Encapsula todo el trabajo que hoy hacía el route.ts inline:
 *   - parseo defensivo del body
 *   - derivación server-side de sucursal desde caja_id
 *   - construcción del hash de idempotencia
 *   - invocación del orquestador
 *   - mapeo de errores tipados (ValidationError → 400, IdempotencyConflict → 409)
 *
 * Se expone como función testeable independiente del transporte HTTP.
 * El route.ts la invoca y serializa el resultado.
 */

import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import {
  confirmarAtencionPg,
  confirmarAtencionEnClientePg,
} from "@/lib/atencion/server/confirmar-atencion-pg";
import type { ConfirmarAtencionInput } from "@/lib/atencion/server/confirmar-atencion-pg";
import {
  ValidationError,
  isValidationError,
  isIdempotencyConflictError,
} from "@/lib/atencion/server/errors";

export interface HandlerAuth {
  empresa_id: string;
  sucursal_id: string | null;
  user_id: string | null;
  nombre: string | null;
}

export interface HandlerResponse {
  status: number;
  body: { success: boolean; data?: unknown; error?: string; code?: string };
}

/** Resultado ok — 200. */
function ok(data: unknown): HandlerResponse {
  return { status: 200, body: { success: true, data } };
}
/** Resultado error — status + code opcional. */
function err(status: number, message: string, code?: string): HandlerResponse {
  return { status, body: { success: false, error: message, ...(code ? { code } : {}) } };
}

/**
 * Overload testeable: si viene `externalClient`, se usa ese pg.Client para
 * TODAS las queries y se envuelve la ejecución en un SAVEPOINT propio.
 * En éxito ⇒ RELEASE SAVEPOINT. En error/validación ⇒ ROLLBACK TO SAVEPOINT
 * + RELEASE, y se devuelve la HandlerResponse igual que en producción.
 * Así los tests pueden ejecutar múltiples llamadas concatenadas sin dejar
 * la tx en estado "abortada" tras un 400/409.
 */
export async function procesarConfirmarAtencion(
  body: Record<string, unknown>,
  auth: HandlerAuth,
  externalClient?: import("pg").PoolClient,
): Promise<HandlerResponse> {
  // Modo tests: con client externo, envolvemos la ejecución en un
  // SAVEPOINT propio. Tras éxito ⇒ RELEASE. Tras 4xx/5xx ⇒ ROLLBACK TO
  // + RELEASE. Así los tests pueden concatenar llamadas sin dejar la tx
  // externa en estado aborted (y sin persistir writes de las que fallaron).
  const spName = externalClient ? `sp_ep_${Math.floor(Math.random() * 1e9)}` : null;
  if (externalClient && spName) {
    await externalClient.query(`SAVEPOINT ${spName}`);
  }
  const resp = await runProcesar(body, auth, externalClient);
  if (externalClient && spName) {
    if (resp.status >= 400) {
      await externalClient.query(`ROLLBACK TO SAVEPOINT ${spName}`).catch(() => null);
    }
    await externalClient.query(`RELEASE SAVEPOINT ${spName}`).catch(() => null);
  }
  return resp;
}

async function runProcesar(
  body: Record<string, unknown>,
  auth: HandlerAuth,
  externalClient?: import("pg").PoolClient,
): Promise<HandlerResponse> {
  try {
    // ── Validaciones básicas de body ───────────────────────────────────
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return err(400, "idempotency_key requerido.", "IDEMPOTENCY_KEY_REQUERIDA");
    }
    const cajaId = typeof body.caja_id === "string" ? body.caja_id : "";
    if (!cajaId) {
      return err(400, "caja_id es obligatorio (el sistema nunca autoselecciona caja).", "CAJA_REQUERIDA");
    }
    const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : "";
    if (!clienteId) {
      return err(400, "cliente_id es obligatorio.", "CLIENTE_REQUERIDO");
    }

    const sucursalBody = typeof body.sucursal_id === "string" ? body.sucursal_id : null;

    // ── Parseo defensivo trae/lleva/promo/beneficios ──────────────────
    const parseTrae = (): ConfirmarAtencionInput["trae"] | null => {
      const raw = body.trae as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object") return null;
      const items = Array.isArray(raw.items) ? raw.items : [];
      const out = items
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const r = x as Record<string, unknown>;
          const producto_id = String(r.producto_id ?? "");
          const cantidad = Number(r.cantidad);
          const precio = Number(r.precio_compra_unitario);
          if (!producto_id || !(cantidad > 0) || !(precio >= 0)) return null;
          return { producto_id, cantidad, precio_compra_unitario: precio };
        })
        .filter((x): x is { producto_id: string; cantidad: number; precio_compra_unitario: number } => !!x);
      if (out.length === 0) return null;
      const totalFinal = Number(raw.total_final_evaluado);
      if (!(totalFinal > 0)) {
        throw new ValidationError("TOTAL_FINAL_INVALIDO", "trae.total_final_evaluado debe ser > 0.");
      }
      return {
        items: out,
        totalFinalEvaluado: totalFinal,
        ingresarAlStock: raw.ingresar_al_stock !== false,
      };
    };

    const parseLleva = (): ConfirmarAtencionInput["lleva"] | null => {
      const raw = body.lleva as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object") return null;
      const items = Array.isArray(raw.items) ? raw.items : [];
      const out = items
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const r = x as Record<string, unknown>;
          const producto_id = String(r.producto_id ?? "");
          const cantidad = Number(r.cantidad);
          if (!producto_id || !(cantidad > 0)) return null;
          const tipoIva = r.tipo_iva;
          return {
            producto_id,
            cantidad,
            tipo_iva:
              tipoIva === "EXENTA" || tipoIva === "5%" || tipoIva === "10%"
                ? (tipoIva as "EXENTA" | "5%" | "10%")
                : "EXENTA",
          };
        })
        .filter((x): x is { producto_id: string; cantidad: number; tipo_iva: "EXENTA" | "5%" | "10%" } => !!x);
      if (out.length === 0) return null;
      const pagosRaw = Array.isArray(raw.pago_detalle) ? raw.pago_detalle : [];
      const pagos = pagosRaw
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const r = x as Record<string, unknown>;
          const metodo = String(r.metodo_pago ?? "");
          if (!["efectivo","transferencia","tarjeta","qr","billetera","otro"].includes(metodo)) return null;
          const monto = Number(r.monto);
          if (!Number.isFinite(monto) || monto <= 0) return null;
          return {
            metodo_pago: metodo as "efectivo"|"transferencia"|"tarjeta"|"qr"|"billetera"|"otro",
            monto,
            entidad_bancaria_id: typeof r.entidad_bancaria_id === "string" ? r.entidad_bancaria_id : null,
            entidad_nombre_snapshot: typeof r.entidad_nombre_snapshot === "string" ? r.entidad_nombre_snapshot : null,
            referencia: typeof r.referencia === "string" ? r.referencia : null,
            titular: typeof r.titular === "string" ? r.titular : null,
            fecha_acreditacion: typeof r.fecha_acreditacion === "string" ? r.fecha_acreditacion : null,
            observacion: typeof r.observacion === "string" ? r.observacion : null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      return {
        items: out,
        creditoUsado: Math.max(0, Number(raw.credito_usado ?? 0) || 0),
        pagosInmediatos: pagos,
        moneda: raw.moneda === "USD" ? "USD" : "GS",
        tipoCambio: Number(raw.tipo_cambio) || 1,
      };
    };

    const trae = parseTrae();
    const lleva = parseLleva();

    const promoRaw = body.promocion as Record<string, unknown> | undefined;
    const promocion: ConfirmarAtencionInput["promocion"] =
      promoRaw && typeof promoRaw === "object"
        ? {
            promocionId:
              typeof promoRaw.promocion_id === "string" && promoRaw.promocion_id
                ? promoRaw.promocion_id : null,
            cuponCodigo:
              typeof promoRaw.cupon_codigo === "string" && promoRaw.cupon_codigo
                ? promoRaw.cupon_codigo : null,
          }
        : null;
    if (promocion && !promocion.promocionId && !promocion.cuponCodigo) {
      return err(400, "promocion requiere promocion_id o cupon_codigo.", "PROMO_REF_REQUERIDA");
    }

    // Parseo ESTRICTO: si el body trae basura, rechazamos con 400 tipado.
    // No ignoramos silenciosamente elementos inválidos — el frontend nunca
    // debería enviarlos, y ocultarlos enmascara bugs y facilita manipulación.
    const beneficiosRaw = body.beneficios_credito;
    if (beneficiosRaw !== undefined && !Array.isArray(beneficiosRaw)) {
      return err(400, "beneficios_credito debe ser una lista.", "BENEFICIO_MONTO_INVALIDO");
    }
    const beneficiosCredito: NonNullable<ConfirmarAtencionInput["beneficiosCredito"]> = [];
    for (const raw of (beneficiosRaw as unknown[] | undefined) ?? []) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return err(400, "Beneficio inválido en beneficios_credito.", "BENEFICIO_MONTO_INVALIDO");
      }
      const r = raw as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id.trim() : "";
      if (!id) {
        return err(400, "Beneficio con id vacío en beneficios_credito.", "BENEFICIO_MONTO_INVALIDO");
      }
      const monto = Number(r.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return err(
          400,
          `Beneficio "${id}": monto inválido (debe ser numérico > 0).`,
          "BENEFICIO_MONTO_INVALIDO",
        );
      }
      beneficiosCredito.push({ id, monto: Math.round(monto) });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const observaciones = typeof body.observaciones === "string"
      ? body.observaciones.slice(0, 4000)
      : null;

    // ── Derivación server-side de sucursal desde caja_id ──────────────
    const cajasT = quoteSchemaTable(schema, "cajas");
    const pool = externalClient ? null : getChatPostgresPool();
    if (!externalClient && !pool) return err(500, "Sin conexión Postgres.");
    // Si viene client externo, lo reutilizamos (no release). Si no, tomamos
    // uno del pool y lo liberamos al terminar el lookup.
    const cajaLookupClient = externalClient ?? await pool!.connect();
    let sucursalId: string;
    try {
      const cq = await cajaLookupClient.query<{ sucursal_id: string | null; estado: string }>(
        `SELECT sucursal_id, estado FROM ${cajasT}
         WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
        [auth.empresa_id, cajaId],
      );
      const cajaRow = cq.rows[0];
      if (!cajaRow) return err(400, "La caja indicada no existe.", "CAJA_INEXISTENTE");
      if (!cajaRow.sucursal_id) return err(400, "La caja no tiene sucursal asignada.", "CAJA_SIN_SUCURSAL");
      if (auth.sucursal_id) {
        if (cajaRow.sucursal_id !== auth.sucursal_id) {
          return err(400, "Tu usuario está asignado a una sucursal distinta a la de la caja.", "CAJA_SUCURSAL_MISMATCH");
        }
        sucursalId = auth.sucursal_id;
      } else {
        if (sucursalBody && sucursalBody !== cajaRow.sucursal_id) {
          return err(400, "sucursal_id del body no coincide con la sucursal de la caja.", "SUCURSAL_BODY_MISMATCH");
        }
        sucursalId = cajaRow.sucursal_id;
      }
    } finally {
      // Solo liberamos el client si NO vino de afuera (lo tomamos del pool).
      if (!externalClient) cajaLookupClient.release();
    }

    const commonInput = {
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      sucursalId,
      cajaId,
      createdBy: auth.user_id,
      usuarioNombre: auth.nombre,
      idempotencyKey,
      observaciones,
      trae,
      lleva,
      promocion,
      beneficiosCredito,
      requestPayloadForHash: {
        caja_id: cajaId, cliente_id: clienteId, sucursal_id: sucursalId,
        observaciones,
        trae: trae ? {
          items: trae.items.map(i => ({ p: i.producto_id, c: i.cantidad, u: i.precio_compra_unitario })),
          total: trae.totalFinalEvaluado,
          ingresar: trae.ingresarAlStock !== false,
        } : null,
        lleva: lleva ? {
          items: lleva.items.map(i => ({ p: i.producto_id, c: i.cantidad, iva: i.tipo_iva })),
          credito: lleva.creditoUsado,
          pagos: lleva.pagosInmediatos.map(pg => ({
            m: pg.metodo_pago, v: pg.monto,
            e: pg.entidad_bancaria_id ?? "", r: pg.referencia ?? "",
            t: pg.titular ?? "", o: pg.observacion ?? "",
          })),
          moneda: lleva.moneda ?? "GS", tc: lleva.tipoCambio ?? 1,
        } : null,
        promo: promocion ? { id: promocion.promocionId ?? "", cupon: promocion.cuponCodigo ?? "" } : null,
        beneficios: beneficiosCredito.map(b => ({ id: b.id, m: b.monto })),
      },
    } satisfies ConfirmarAtencionInput;

    // Si viene client externo (tests con SAVEPOINT), ejecutamos la variante
    // que no abre/comitea tx propia. En producción usamos el wrapper que
    // maneja su propio BEGIN/COMMIT/ROLLBACK.
    const result = externalClient
      ? await confirmarAtencionEnClientePg(externalClient, commonInput)
      : await confirmarAtencionPg(commonInput);

    return ok(result);
  } catch (e) {
    if (isIdempotencyConflictError(e)) {
      return err(409, e.message, "IDEMPOTENCY_CONFLICT");
    }
    if (isValidationError(e)) {
      return err(400, e.message, e.code);
    }
    const msg = e instanceof Error ? e.message : "Error inesperado.";
    // Stock/existencia son errores de negocio → 400 (no rompen la app).
    if (
      msg.includes("Stock insuficiente") ||
      msg.includes("no existen") ||
      msg.includes("Cliente no encontrado") ||
      msg.includes("La suma de las formas de pago")
    ) {
      return err(400, msg, "NEGOCIO");
    }
    console.error(`[procesarConfirmarAtencion] fallo interno: ${msg}`);
    return err(500, msg);
  }
}
