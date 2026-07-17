import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { confirmarAtencionPg } from "@/lib/atencion/server/confirmar-atencion-pg";
import type {
  ConfirmarAtencionInput,
} from "@/lib/atencion/server/confirmar-atencion-pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

/**
 * POST /api/atencion/confirmar
 *
 * Orquestador transaccional único para el flujo "Cliente trae + Cliente lleva"
 * de /caja. Reemplaza la doble llamada (recepciones + venta) por una
 * transacción atómica con idempotencia.
 *
 * Body:
 * {
 *   idempotency_key: string,   // uuid v4 generado en el frontend por submit
 *   caja_id: string,           // OBLIGATORIA (no autoseleccionamos)
 *   cliente_id: string,
 *   sucursal_id?: string,      // opcional si el user tiene sucursal fija
 *   observaciones?: string,
 *   trae?: {
 *     items: [{ producto_id, cantidad, precio_compra_unitario }],
 *     total_final_evaluado: number,   // debe ser > 0
 *     ingresar_al_stock?: boolean
 *   },
 *   lleva?: {
 *     items: [{ producto_id, cantidad, tipo_iva? }],
 *     credito_usado?: number,
 *     pago_detalle?: [{ metodo_pago, monto, ... }]
 *   },
 *   promocion?: { promocion_id, descuento, cashback, cupon_codigo?, descuento_ya_aplicado_como_credito? }
 * }
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return NextResponse.json(errorResponse("idempotency_key requerido."), { status: 400 });
    }
    const cajaId = typeof body.caja_id === "string" ? body.caja_id : "";
    if (!cajaId) {
      return NextResponse.json(
        errorResponse("caja_id es obligatorio (el sistema nunca autoselecciona caja)."),
        { status: 400 },
      );
    }
    const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : "";
    if (!clienteId) {
      return NextResponse.json(errorResponse("cliente_id es obligatorio."), { status: 400 });
    }

    // sucursal_id: se deriva SIEMPRE de la caja server-side (más abajo).
    // Solo aceptamos body.sucursal_id como pista adicional; si no coincide
    // con la sucursal de la caja, se rechaza.
    const sucursalBody = typeof body.sucursal_id === "string" ? body.sucursal_id : null;

    // Parseo defensivo del bloque trae/lleva
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
      if (!(totalFinal > 0)) throw new Error("trae.total_final_evaluado debe ser > 0.");
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

    // Promo: aceptamos promocion_id o cupon_codigo (uno de los dos). El
    // server RE-EVALÚA descuento/cashback — cualquier monto enviado por
    // el frontend se descarta explícitamente.
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
      return NextResponse.json(
        errorResponse("promocion requiere promocion_id o cupon_codigo."),
        { status: 400 },
      );
    }

    // Beneficios que GENERAN crédito (procesados dentro de la tx).
    const beneficiosRaw = Array.isArray(body.beneficios_credito) ? body.beneficios_credito : [];
    const beneficiosCredito: NonNullable<ConfirmarAtencionInput["beneficiosCredito"]> = [];
    for (const raw of beneficiosRaw) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : null;
      const label = typeof r.label === "string" ? r.label : null;
      const tipo = typeof r.tipo_evento === "string" ? r.tipo_evento : null;
      const monto = Number(r.monto);
      if (!id || !label || !tipo) continue;
      if (!["cashback","descuento","beneficio","otro"].includes(tipo)) continue;
      if (!(monto > 0)) continue;
      beneficiosCredito.push({
        id, label,
        tipoEvento: tipo as "cashback" | "descuento" | "beneficio" | "otro",
        monto: Math.round(monto),
      });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const observaciones = typeof body.observaciones === "string"
      ? body.observaciones.slice(0, 4000)
      : null;

    // ── Derivación server-side de sucursal ─────────────────────────────
    // Regla:
    //   - Si el usuario tiene sucursal_id fija: es la única válida. Si el
    //     body pidió otra o si la caja está en otra ⇒ 400.
    //   - Si no tiene sucursal fija (admin sin scope): derivamos SIEMPRE
    //     desde la caja (caja_id es obligatoria). El body.sucursal_id se
    //     ignora si no coincide con la de la caja.
    const cajasT = quoteSchemaTable(schema, "cajas");
    // Necesitamos pool solo para pre-derivar la sucursal fuera de la tx
    // del orquestador — es una lectura simple, no muta nada.
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });
    const cajaLookupClient = await pool.connect();
    let sucursalId: string;
    try {
      const cq = await cajaLookupClient.query<{ sucursal_id: string | null; estado: string }>(
        `SELECT sucursal_id, estado FROM ${cajasT}
         WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
        [auth.empresa_id, cajaId],
      );
      const cajaRow = cq.rows[0];
      if (!cajaRow) {
        return NextResponse.json(errorResponse("La caja indicada no existe."), { status: 400 });
      }
      if (!cajaRow.sucursal_id) {
        return NextResponse.json(errorResponse("La caja no tiene sucursal asignada."), { status: 400 });
      }
      if (auth.sucursal_id) {
        if (cajaRow.sucursal_id !== auth.sucursal_id) {
          return NextResponse.json(
            errorResponse("Tu usuario está asignado a una sucursal distinta a la de la caja."),
            { status: 400 },
          );
        }
        sucursalId = auth.sucursal_id;
      } else {
        if (sucursalBody && sucursalBody !== cajaRow.sucursal_id) {
          return NextResponse.json(
            errorResponse("sucursal_id del body no coincide con la sucursal de la caja."),
            { status: 400 },
          );
        }
        sucursalId = cajaRow.sucursal_id;
      }
    } finally {
      cajaLookupClient.release();
    }

    const result = await confirmarAtencionPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      sucursalId,
      cajaId,
      createdBy: auth.user.id ?? null,
      usuarioNombre: auth.nombre ?? null,
      idempotencyKey,
      observaciones,
      trae,
      lleva,
      promocion,
      beneficiosCredito,
      // Hash del request — canonicalStringify normaliza el orden de claves
      // a cualquier profundidad. Incluye todos los datos que definen la
      // operación (cambiar cualquiera dispara 409 en el reintento).
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
        beneficios: beneficiosCredito.map(b => ({ id: b.id, t: b.tipoEvento, m: b.monto })),
      },
    });

    console.log(`[atencion/confirmar] ok reutilizado=${result.reutilizado} recep=${result.recepcion?.numero_control ?? "-"} venta=${result.venta?.numero_control ?? "-"} ms=${Date.now() - t0}`);
    return NextResponse.json(successResponse(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    console.error(`[atencion/confirmar] FAIL msg="${msg}" ms=${Date.now() - t0}`);
    // 409 para conflicto de idempotencia, 400 para validaciones, 500 el resto.
    const status =
      msg.startsWith("IDEMPOTENCY_CONFLICT")
        ? 409
        : msg.includes("obligatori") ||
          msg.includes("Stock insuficiente") ||
          msg.includes("no existen") ||
          msg.includes("Cliente no encontrado") ||
          msg.includes("caja") ||
          msg.includes("total_final") ||
          msg.includes("al menos una") ||
          msg.includes("no coincide")
          ? 400
          : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
