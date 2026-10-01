import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * Promoción EXCLUSIVA de un cliente.
 *
 *   GET    → la promo vigente del cliente (o null) + si ya la usó.
 *   POST   → le asigna una, copiando tipo y valor de una promo del catálogo.
 *   DELETE → se la quita (desactiva, no borra: la auditoría se conserva).
 *
 * Es UNA sola por cliente: asignar cuando ya hay una desactiva la anterior,
 * dentro de la misma transacción.
 *
 * Modelo: una fila en `promociones` con ambito='cliente' y cliente_id. Es el
 * mismo que lee el panel "Promos exclusivas por cliente" de Administración y
 * el que aplica el POS al cobrar, así que no hace falta tabla nueva.
 */

async function ctxDe(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return { error: NextResponse.json(errorResponse("No autenticado."), { status: 401 }) };
  const pool = getChatPostgresPool();
  if (!pool) return { error: NextResponse.json(errorResponse("Sin conexión a la base."), { status: 500 }) };
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
  return { auth, pool, schema };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctxDe(request);
  if (c.error) return c.error;
  const { auth, pool, schema } = c;
  const { id: clienteId } = await params;

  try {
    const tP = quoteSchemaTable(schema, "promociones");
    const tA = quoteSchemaTable(schema, "promocion_aplicaciones");
    const r = await pool.query<{
      id: string; nombre: string; tipo: string; valor: string;
      cupon_codigo: string | null; fecha_desde: string | null; fecha_hasta: string | null;
      created_at: string; usos: string; primera_uso_at: string | null;
    }>(
      `SELECT p.id, p.nombre, p.tipo, p.valor::text, p.cupon_codigo,
              p.fecha_desde::text, p.fecha_hasta::text, p.created_at::text,
              COALESCE(a.usos, 0)::text AS usos,
              a.primera_uso_at::text
         FROM ${tP} p
         LEFT JOIN LATERAL (
           SELECT count(*) AS usos, min(created_at) AS primera_uso_at
             FROM ${tA} x WHERE x.promocion_id = p.id
         ) a ON true
        WHERE p.empresa_id = $1::uuid
          AND p.ambito = 'cliente'
          AND p.cliente_id = $2::uuid
          AND p.activo = true
        ORDER BY p.created_at DESC
        LIMIT 1`,
      [auth.empresa_id, clienteId],
    );
    const row = r.rows[0] ?? null;
    return NextResponse.json(successResponse({
      promocion: row
        ? {
            id: row.id,
            nombre: row.nombre,
            tipo: row.tipo,
            valor: Number(row.valor) || 0,
            cupon_codigo: row.cupon_codigo,
            fecha_desde: row.fecha_desde,
            fecha_hasta: row.fecha_hasta,
            asignada_at: row.created_at,
            usos: Number(row.usos) || 0,
            primera_uso_at: row.primera_uso_at,
          }
        : null,
    }));
  } catch (e) {
    console.error("[clientes/promocion GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(successResponse({ promocion: null }));
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctxDe(request);
  if (c.error) return c.error;
  const { auth, pool, schema } = c;
  const { id: clienteId } = await params;

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }

  const base = typeof body.promocion_base_id === "string" ? body.promocion_base_id.trim() : "";
  if (!base) return NextResponse.json(errorResponse("Elegí la promoción a asignar."), { status: 400 });

  const fechaOk = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const desde = fechaOk(body.fecha_desde);
  const hasta = fechaOk(body.fecha_hasta);
  if (desde && hasta && desde > hasta) {
    return NextResponse.json(errorResponse("La fecha de inicio no puede ser posterior a la de fin."), { status: 400 });
  }

  const tP = quoteSchemaTable(schema, "promociones");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const bq = await client.query<{
      nombre: string; tipo: string; valor: string;
      lleve_n: number | null; pague_m: number | null; minimo_compra: string;
    }>(
      `SELECT nombre, tipo, valor::text, lleve_n, pague_m, minimo_compra::text
         FROM ${tP} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [base, auth.empresa_id],
    );
    const plantilla = bq.rows[0];
    if (!plantilla) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("No encontré esa promoción."), { status: 404 });
    }

    // Una sola promo exclusiva por cliente: la anterior se desactiva.
    await client.query(
      `UPDATE ${tP} SET activo = false
        WHERE empresa_id = $1::uuid AND ambito = 'cliente'
          AND cliente_id = $2::uuid AND activo = true`,
      [auth.empresa_id, clienteId],
    );

    const ins = await client.query<{ id: string }>(
      `INSERT INTO ${tP}
         (empresa_id, nombre, tipo, valor, lleve_n, pague_m, minimo_compra,
          ambito, cliente_id, fecha_desde, fecha_hasta, activo, created_by)
       VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6, $7::numeric,
               'cliente', $8::uuid, $9::date, $10::date, true, $11::uuid)
       RETURNING id`,
      [
        auth.empresa_id, plantilla.nombre, plantilla.tipo, plantilla.valor,
        plantilla.lleve_n, plantilla.pague_m, plantilla.minimo_compra,
        clienteId, desde, hasta, auth.user?.id ?? null,
      ],
    );

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ id: ins.rows[0]?.id ?? null }));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[clientes/promocion POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo asignar la promoción."), { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctxDe(request);
  if (c.error) return c.error;
  const { auth, pool, schema } = c;
  const { id: clienteId } = await params;
  try {
    const tP = quoteSchemaTable(schema, "promociones");
    // Desactivar y no borrar: si ya se usó, la auditoría tiene que seguir
    // apuntando a una promo existente.
    await pool.query(
      `UPDATE ${tP} SET activo = false
        WHERE empresa_id = $1::uuid AND ambito = 'cliente'
          AND cliente_id = $2::uuid AND activo = true`,
      [auth.empresa_id, clienteId],
    );
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    console.error("[clientes/promocion DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo quitar la promoción."), { status: 500 });
  }
}
