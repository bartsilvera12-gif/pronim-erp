import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/inventario/movimientos
 *
 * Lista movimientos de inventario. La tabla movimientos_inventario NO
 * tiene sucursal_id (es global por empresa) — para filtrar por sucursal
 * del usuario derivamos la sucursal desde la fila referenciada:
 *   - origen='venta'     → ventas.sucursal_id vía movimientos_inventario.referencia (numero_control)
 *                           o via referencia_id si existe. Como el campo es text (numero_control),
 *                           JOINeamos por v.numero_control = mi.referencia.
 *   - origen='recepcion' → cliente_recepciones.sucursal_id vía r.numero_control = mi.referencia.
 *   - origen='compra' / 'ajuste_manual' / 'inventario_inicial' → sin sucursal derivable;
 *     se muestran a todos.
 *
 * Si el usuario NO tiene sucursal fija (admin), ve todos los movimientos.
 * Si tiene sucursal fija, ve los que caigan en su sucursal + los sin
 * sucursal derivable.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const esAdmin = esRolAdminEmpresaOGlobal(auth.rol ?? undefined);
    const sucScope = esAdmin ? null : (auth.sucursal_id ?? null);

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    assertAllowedChatDataSchema(schema);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const movT = quoteSchemaTable(schema, "movimientos_inventario");
    const ventasT = quoteSchemaTable(schema, "ventas");
    const recepT = quoteSchemaTable(schema, "cliente_recepciones");
    const comprasT = quoteSchemaTable(schema, "compras");

    const client = await pool.connect();
    try {
      const args: unknown[] = [auth.empresa_id];
      // Cuando el usuario tiene sucursal fija, filtramos:
      //   - origen='venta'     → v.sucursal_id = $2
      //   - origen='recepcion' → r.sucursal_id = $2
      //   - resto de orígenes  → siempre pasan (no tienen sucursal derivable)
      let sucCond = "";
      if (sucScope) {
        args.push(sucScope);
        sucCond = `AND (
          (mi.origen = 'venta'     AND v.sucursal_id = $2)
       OR (mi.origen = 'recepcion' AND r.sucursal_id = $2)
       OR (mi.origen = 'compra'    AND c.sucursal_id = $2)
       OR mi.origen NOT IN ('venta','recepcion','compra')
        )`;
      }

      const q = await client.query(
        `SELECT
           mi.id, mi.empresa_id, mi.producto_id, mi.producto_nombre,
           mi.producto_sku, mi.tipo, mi.cantidad, mi.costo_unitario,
           mi.origen, mi.referencia, mi.fecha, mi.created_at, mi.updated_at,
           mi.created_by, mi.usuario_nombre,
           COALESCE(v.sucursal_id, r.sucursal_id, c.sucursal_id) AS sucursal_derivada_id
         FROM ${movT} mi
         LEFT JOIN ${ventasT}  v ON mi.origen = 'venta'     AND v.numero_control = mi.referencia AND v.empresa_id = $1
         LEFT JOIN ${recepT}   r ON mi.origen = 'recepcion' AND r.numero_control = mi.referencia AND r.empresa_id = $1
         LEFT JOIN ${comprasT} c ON mi.origen = 'compra'    AND c.numero_control = mi.referencia AND c.empresa_id = $1
         WHERE mi.empresa_id = $1
         ${sucCond}
         ORDER BY mi.fecha DESC
         LIMIT 500`,
        args,
      );

      return NextResponse.json(successResponse({ movimientos: q.rows }));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[/api/inventario/movimientos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}
