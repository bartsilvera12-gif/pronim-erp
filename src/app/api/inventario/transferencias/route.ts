import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { SIN_SUCURSAL_MENSAJE } from "@/lib/sucursales/enforce";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

type ItemIn = { producto_id: string; producto_nombre?: string | null; cantidad: number };

/**
 * GET /api/inventario/transferencias — historial (última 200) filtrado por
 * empresa y — si el usuario tiene sucursal fija — restringido a las
 * transferencias en las que participó (como origen o destino).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ transferencias: [], items: [] }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tT = quoteSchemaTable(schema, "transferencias_stock");
    const tI = quoteSchemaTable(schema, "transferencias_stock_items");
    const tS = quoteSchemaTable(schema, "sucursales");

    const params: unknown[] = [auth.empresa_id];
    let sucFilter = "";
    if (auth.sucursal_id) {
      params.push(auth.sucursal_id);
      sucFilter = ` AND (t.origen_sucursal_id = $2::uuid OR t.destino_sucursal_id = $2::uuid)`;
    }

    const rowsRes = await pool.query<{
      id: string; empresa_id: string; origen_sucursal_id: string; destino_sucursal_id: string;
      origen_nombre: string | null; destino_nombre: string | null;
      numero_control: string | null; observacion: string | null; estado: string;
      created_by: string | null; created_by_nombre: string | null; created_at: string;
    }>(
      `SELECT t.id, t.empresa_id, t.origen_sucursal_id, t.destino_sucursal_id,
              so.nombre AS origen_nombre, sd.nombre AS destino_nombre,
              t.numero_control, t.observacion, t.estado,
              t.created_by, t.created_by_nombre, t.created_at
         FROM ${tT} t
         LEFT JOIN ${tS} so ON so.id = t.origen_sucursal_id
         LEFT JOIN ${tS} sd ON sd.id = t.destino_sucursal_id
        WHERE t.empresa_id = $1::uuid${sucFilter}
        ORDER BY t.created_at DESC
        LIMIT 200`,
      params,
    );
    const transferencias = rowsRes.rows;
    const ids = transferencias.map((r) => r.id);

    let items: Array<{
      id: string; transferencia_id: string; producto_id: string;
      producto_nombre: string | null; cantidad: number | string;
    }> = [];
    if (ids.length > 0) {
      const it = await pool.query<{
        id: string; transferencia_id: string; producto_id: string;
        producto_nombre: string | null; cantidad: number | string;
      }>(
        `SELECT id, transferencia_id, producto_id, producto_nombre, cantidad::float8 AS cantidad
           FROM ${tI}
          WHERE transferencia_id = ANY($1::uuid[])
          ORDER BY created_at ASC`,
        [ids],
      );
      items = it.rows;
    }
    return NextResponse.json(successResponse({ transferencias, items }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[transferencias GET]", msg);
    // Si la tabla no existe (migración no aplicada), degradar suavemente
    // en vez de tirar 500: devolvemos array vacío + un warning entendible.
    if (/does not exist|no existe|42P01|relation .* does not exist/i.test(msg)) {
      return NextResponse.json(successResponse({
        transferencias: [],
        items: [],
        warning: "La tabla pronimerp.transferencias_stock no existe todavía. Aplicá la migración 20260814000000_pronimerp_transferencias_stock.sql en Supabase para habilitar el módulo.",
      }));
    }
    return NextResponse.json(errorResponse("No se pudieron cargar las transferencias."), { status: 500 });
  }
}

/**
 * POST /api/inventario/transferencias — crea transferencia + items y mueve
 * stock atómicamente (decrementa origen, upsert-incrementa destino) dentro
 * de una única transacción con locks pesimistas por (producto, sucursal).
 *
 * Reglas de sucursal:
 *   - Usuario con sucursal fija → origen DEBE ser esa sucursal. Cualquier
 *     otro origen es rechazado.
 *   - Admin global → puede elegir cualquier origen/destino de su empresa.
 *   - origen ≠ destino; ambas activas y de la misma empresa.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  if (!auth.sucursal_id && !esRolAdminEmpresaOGlobal(auth.rol ?? undefined)) {
    return NextResponse.json(errorResponse(SIN_SUCURSAL_MENSAJE), { status: 403 });
  }

  let body: {
    origen_sucursal_id?: string;
    destino_sucursal_id?: string;
    observacion?: string | null;
    items?: ItemIn[];
  };
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const origen = String(body.origen_sucursal_id ?? "").trim();
  const destino = String(body.destino_sucursal_id ?? "").trim();
  const observacion = body.observacion ? String(body.observacion).slice(0, 2000) : null;

  if (!origen || !destino) {
    return NextResponse.json(errorResponse("Elegí sucursal de origen y de destino."), { status: 400 });
  }
  if (origen === destino) {
    return NextResponse.json(errorResponse("El origen y el destino deben ser distintos."), { status: 400 });
  }

  // Enforce: si el usuario tiene sucursal fija, el origen debe coincidir.
  if (auth.sucursal_id && auth.sucursal_id !== origen) {
    return NextResponse.json(
      errorResponse("Tu usuario está asignado a una sucursal específica; solo podés transferir desde ella."),
      { status: 400 },
    );
  }

  const itemsIn = Array.isArray(body.items) ? body.items : [];
  if (itemsIn.length === 0) {
    return NextResponse.json(errorResponse("Agregá al menos un producto a la transferencia."), { status: 400 });
  }
  // Consolidar por producto por si vino repetido; validar cantidades.
  const consolidados = new Map<string, { producto_id: string; producto_nombre: string | null; cantidad: number }>();
  for (const raw of itemsIn) {
    if (!raw || typeof raw !== "object") continue;
    const pid = String(raw.producto_id ?? "").trim();
    const cant = Number(raw.cantidad);
    if (!pid || !Number.isFinite(cant) || cant <= 0) {
      return NextResponse.json(errorResponse("Cada ítem requiere producto_id y cantidad > 0."), { status: 400 });
    }
    const prev = consolidados.get(pid);
    const nombre = typeof raw.producto_nombre === "string" ? raw.producto_nombre : null;
    if (prev) prev.cantidad += cant;
    else consolidados.set(pid, { producto_id: pid, producto_nombre: nombre, cantidad: cant });
  }
  const items = Array.from(consolidados.values());

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Base de datos no disponible."), { status: 503 });

  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
  const tT = quoteSchemaTable(schema, "transferencias_stock");
  const tI = quoteSchemaTable(schema, "transferencias_stock_items");
  const tS = quoteSchemaTable(schema, "sucursales");
  const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
  const tP = quoteSchemaTable(schema, "productos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verificar que ambas sucursales pertenezcan a la empresa del usuario y estén activas.
    const sucRes = await client.query<{ id: string; activo: boolean }>(
      `SELECT id, activo FROM ${tS}
        WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
      [auth.empresa_id, [origen, destino]],
    );
    const activasById = new Map(sucRes.rows.map((r) => [r.id, r.activo]));
    if (!activasById.has(origen) || !activasById.has(destino)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Alguna sucursal no pertenece a tu empresa."),
        { status: 400 },
      );
    }
    if (activasById.get(origen) !== true || activasById.get(destino) !== true) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Alguna sucursal está inactiva."),
        { status: 400 },
      );
    }

    // Movimiento atómico por ítem. Lockeamos ambas filas de stock para evitar
    // race conditions con ventas / recepciones concurrentes.
    for (const it of items) {
      // Validar que el producto pertenezca a la empresa.
      const pRes = await client.query<{ empresa_id: string; nombre: string | null }>(
        `SELECT empresa_id::text AS empresa_id, nombre FROM ${tP} WHERE id = $1::uuid`,
        [it.producto_id],
      );
      const pRow = pRes.rows[0];
      if (!pRow || pRow.empresa_id !== auth.empresa_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse("Algún producto no pertenece a tu empresa."),
          { status: 400 },
        );
      }
      if (!it.producto_nombre) it.producto_nombre = pRow.nombre ?? null;

      // Lockear stock origen y verificar cantidad disponible.
      const stockOrigenRes = await client.query<{ stock: number | string }>(
        `SELECT stock_actual::float8 AS stock FROM ${tPSS}
          WHERE producto_id = $1::uuid AND sucursal_id = $2::uuid FOR UPDATE`,
        [it.producto_id, origen],
      );
      const stockOrigen = Number(stockOrigenRes.rows[0]?.stock ?? 0);
      if (stockOrigen < it.cantidad) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse(
            `Stock insuficiente en la sucursal origen para el producto ${it.producto_nombre ?? it.producto_id}: ` +
            `disponibles ${stockOrigen}, se piden ${it.cantidad}.`,
          ),
          { status: 400 },
        );
      }

      // Decrementar origen.
      await client.query(
        `UPDATE ${tPSS}
            SET stock_actual = stock_actual - $3::numeric, updated_at = now()
          WHERE producto_id = $1::uuid AND sucursal_id = $2::uuid`,
        [it.producto_id, origen, it.cantidad],
      );

      // Lockear destino (si existe fila) e incrementar. Upsert por si el
      // producto no estaba dado de alta en destino.
      await client.query(
        `SELECT stock_actual FROM ${tPSS}
          WHERE producto_id = $1::uuid AND sucursal_id = $2::uuid FOR UPDATE`,
        [it.producto_id, destino],
      );
      await client.query(
        `INSERT INTO ${tPSS} (producto_id, sucursal_id, stock_actual, stock_minimo, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::numeric, 0, now())
         ON CONFLICT (producto_id, sucursal_id)
           DO UPDATE SET stock_actual = ${tPSS}.stock_actual + $3::numeric, updated_at = now()`,
        [it.producto_id, destino, it.cantidad],
      );
    }

    // Insertar cabecera.
    const transferRes = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO ${tT}
         (empresa_id, origen_sucursal_id, destino_sucursal_id, observacion,
          estado, created_by, created_by_nombre)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'confirmada', $5, $6)
       RETURNING id, created_at`,
      [
        auth.empresa_id,
        origen,
        destino,
        observacion,
        auth.usuarioCatalogId ?? null,
        auth.nombre ?? auth.user.email ?? null,
      ],
    );
    const transferId = transferRes.rows[0].id;

    // Insertar líneas.
    for (const it of items) {
      await client.query(
        `INSERT INTO ${tI} (transferencia_id, producto_id, producto_nombre, cantidad)
         VALUES ($1::uuid, $2::uuid, $3, $4::numeric)`,
        [transferId, it.producto_id, it.producto_nombre, it.cantidad],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(successResponse({
      transferencia: {
        id: transferId,
        empresa_id: auth.empresa_id,
        origen_sucursal_id: origen,
        destino_sucursal_id: destino,
        observacion,
        estado: "confirmada",
        created_at: transferRes.rows[0].created_at,
      },
      items,
    }));
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* swallow */ }
    console.error("[transferencias POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      errorResponse(e instanceof Error ? e.message : "No se pudo registrar la transferencia."),
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
