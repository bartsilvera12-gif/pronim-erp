import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getCajaAbiertaPg, registrarMovimientoPg } from "@/lib/caja/server/caja-pg";
import { logAuditoria } from "@/lib/auditoria/log";

/**
 * POST /api/clientes/[id]/consignacion/pagar
 * Body: { monto: number, metodo: "caja" | "credito", observacion?: string }
 *
 * Liquida (paga) saldo de consignación del cliente:
 *   - metodo="caja"    → SALIDA de consignación + egreso de efectivo en la
 *                        caja abierta (se le paga en efectivo al cliente).
 *   - metodo="credito" → SALIDA de consignación + ENTRADA de crédito a favor
 *                        (se convierte en crédito usable en compras).
 *
 * Requiere que el schema tenga la columna `categoria` (cartera split).
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clienteId } = await ctxParams.params;
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    let body: { monto?: unknown; metodo?: unknown; observacion?: unknown } = {};
    try { body = (await request.json()) as typeof body; }
    catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

    const monto = Math.round(Number(body.monto) || 0);
    const metodo = String(body.metodo ?? "");
    const observacion = typeof body.observacion === "string" ? body.observacion.trim().slice(0, 300) : null;
    if (!(monto > 0)) return NextResponse.json(errorResponse("Monto inválido."), { status: 400 });
    if (metodo !== "caja" && metodo !== "credito" && metodo !== "transferencia") {
      return NextResponse.json(
        errorResponse("metodo debe ser 'caja', 'transferencia' o 'credito'."),
        { status: 400 },
      );
    }
    // Datos opcionales de la transferencia (banco + comprobante).
    const b2 = body as { entidad_nombre?: unknown; referencia?: unknown };
    const entidadNombre = typeof b2.entidad_nombre === "string" ? b2.entidad_nombre.trim().slice(0, 120) : null;
    const referencia = typeof b2.referencia === "string" ? b2.referencia.trim().slice(0, 80) : null;

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const credT = quoteSchemaTable(schema, "cliente_creditos_movimientos");
    const cliT = quoteSchemaTable(schema, "clientes");

    // La columna categoria es obligatoria para separar consignación.
    const colsQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cliente_creditos_movimientos'`,
      [schema],
    );
    const cols = new Set(colsQ.rows.map((r) => r.column_name));
    if (!cols.has("categoria")) {
      return NextResponse.json(errorResponse("El schema no soporta consignación (falta columna categoria)."), { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Cliente existe en la empresa.
      const cl = await client.query(
        `SELECT 1 FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
        [clienteId, auth.empresa_id],
      );
      if (!cl.rows.length) throw new Error("Cliente no encontrado en esta empresa.");

      // Saldo de consignación actual.
      const sQ = await client.query<{ saldo: string }>(
        `SELECT COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN monto ELSE -monto END),0)::text AS saldo
           FROM ${credT}
          WHERE empresa_id = $1 AND cliente_id = $2 AND COALESCE(categoria,'credito') = 'consignacion'`,
        [auth.empresa_id, clienteId],
      );
      const saldoConsig = Number(sQ.rows[0]?.saldo ?? 0);
      if (monto > saldoConsig) {
        throw new Error(`El monto (${monto}) supera el saldo de consignación disponible (${saldoConsig}).`);
      }

      // 1) SALIDA de consignación (baja el saldo consignado).
      await client.query(
        `INSERT INTO ${credT} (
           empresa_id, cliente_id, tipo, monto, origen, categoria,
           referencia_tipo, observaciones, created_by, usuario_nombre
         ) VALUES ($1,$2,'SALIDA',$3,'consignacion','consignacion',
                   $4, $5, $6, $7)`,
        [
          auth.empresa_id, clienteId, monto,
          metodo === "credito" ? "conversion_credito" : "pago_caja",
          observacion ?? (
            metodo === "caja"
              ? "Pago de consignación en efectivo"
              : metodo === "transferencia"
                ? "Pago de consignación por transferencia"
                  + (entidadNombre ? " — " + entidadNombre : "")
                  + (referencia ? " (ref " + referencia + ")" : "")
                : "Consignación convertida a crédito"
          ),
          auth.user.id ?? null, auth.nombre ?? null,
        ],
      );

      // 2) Si va a crédito, ENTRADA de crédito equivalente.
      if (metodo === "credito") {
        await client.query(
          `INSERT INTO ${credT} (
             empresa_id, cliente_id, tipo, monto, origen, categoria,
             referencia_tipo, observaciones, created_by, usuario_nombre
           ) VALUES ($1,$2,'ENTRADA',$3,'consignacion','credito',
                     'conversion_consignacion', $4, $5, $6)`,
          [
            auth.empresa_id, clienteId, monto,
            observacion ?? "Crédito por consignación liquidada",
            auth.user.id ?? null, auth.nombre ?? null,
          ],
        );
      }

      await client.query("COMMIT");

      // 3) Si es pago por caja, registrar egreso en la caja abierta (best-effort,
      //    fuera de la tx del ledger). Si no hay caja abierta, avisamos pero el
      //    pago de consignación ya quedó registrado.
      let cajaAviso: string | null = null;
      if (metodo === "caja" || metodo === "transferencia") {
        try {
          const caja = await getCajaAbiertaPg(schema, auth.empresa_id, auth.sucursal_id ?? null);
          if (!caja) {
            cajaAviso = metodo === "transferencia"
              ? null
              : "No hay caja abierta: registrá el egreso de efectivo manualmente al abrir caja.";
          } else {
            await registrarMovimientoPg({
              schema, empresaId: auth.empresa_id, cajaId: caja.id,
              tipo: "egreso", concepto: "Pago de consignación a cliente",
              // medioPago define si entra o no al arqueo de efectivo: una
              // transferencia sale del banco, no del cajón.
              monto, medioPago: metodo === "transferencia" ? "transferencia" : "efectivo",
              observacion: observacion ?? `Consignación pagada · cliente ${clienteId}`,
              usuarioId: auth.user.id ?? null,
            });
          }
        } catch (e) {
          cajaAviso = "El pago de consignación se registró, pero no se pudo asentar el egreso en caja: " +
            (e instanceof Error ? e.message : "error");
        }
      }

      await logAuditoria({
        empresaId: auth.empresa_id,
        usuarioId: auth.user.id ?? null,
        usuarioNombre: auth.nombre ?? null,
        sucursalId: auth.sucursal_id ?? null,
        tipo: "consignacion_pagada",
        entidad: "cliente",
        entidadId: clienteId,
        datoNuevo: { monto, metodo },
        motivo: observacion,
      });

      return NextResponse.json(successResponse({
        pagado: monto,
        metodo,
        saldo_consignacion_restante: saldoConsig - monto,
        caja_aviso: cajaAviso,
      }));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/clientes/[id]/consignacion/pagar]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
