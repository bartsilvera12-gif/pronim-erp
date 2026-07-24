import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isSuperAdmin } from "@/lib/middleware/auth";
import {
  fetchDataSchemaForEmpresaId,
  createServiceRoleClientWithDbSchema,
} from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const METODOS_VALIDOS = [
  "efectivo",
  "transferencia",
  "tarjeta",
  "qr",
  "billetera",
  "credito_cliente",
  "otro",
] as const;
const ESTADOS_VALIDOS = ["activos", "anulados", "todos"] as const;

const COLS =
  "id, empresa_id, sucursal_id, caja_id, fecha, concepto, monto, metodo_pago, entidad_bancaria_id, referencia, observaciones, creado_por, creado_por_email, anulado_at, anulado_by, anulacion_motivo, created_at";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

/** Detecta si la sucursal del usuario es la principal (ve TODAS las sucursales). */
async function esSucursalPrincipal(
  empresaId: string,
  sucursalId: string | null | undefined
): Promise<boolean> {
  if (!sucursalId) return false;
  const schema = await fetchDataSchemaForEmpresaId(empresaId);
  const sb = createServiceRoleClientWithDbSchema(schema);
  const { data } = await sb
    .from("sucursales")
    .select("es_principal")
    .eq("id", sucursalId)
    .maybeSingle();
  return (data as { es_principal?: boolean } | null)?.es_principal === true;
}

/** GET /api/otros-ingresos — lista con filtros. */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "otros_ingresos");

    const url = request.nextUrl;
    const estadoRaw = url.searchParams.get("estado") ?? "activos";
    const estado = (ESTADOS_VALIDOS as readonly string[]).includes(estadoRaw)
      ? (estadoRaw as (typeof ESTADOS_VALIDOS)[number])
      : "activos";
    const fechaDesde = url.searchParams.get("fecha_desde");
    const fechaHasta = url.searchParams.get("fecha_hasta");
    const metodoPago = url.searchParams.get("metodo_pago");
    const q = url.searchParams.get("q");
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

    const wheres: string[] = ["empresa_id = $1::uuid"];
    const params: unknown[] = [auth.empresa_id];
    let i = 2;

    // Scope por sucursal (super_admin y sucursal principal ven todo)
    const superAdmin = isSuperAdmin(auth);
    const principal = await esSucursalPrincipal(auth.empresa_id, auth.sucursal_id);
    if (!superAdmin && !principal && auth.sucursal_id) {
      wheres.push(`sucursal_id = $${i}::uuid`);
      params.push(auth.sucursal_id);
      i++;
    }

    if (estado === "activos") wheres.push("anulado_at IS NULL");
    else if (estado === "anulados") wheres.push("anulado_at IS NOT NULL");

    if (fechaDesde) {
      wheres.push(`fecha >= $${i}::date`);
      params.push(fechaDesde);
      i++;
    }
    if (fechaHasta) {
      wheres.push(`fecha <= $${i}::date`);
      params.push(fechaHasta);
      i++;
    }
    if (metodoPago && (METODOS_VALIDOS as readonly string[]).includes(metodoPago)) {
      wheres.push(`metodo_pago = $${i}`);
      params.push(metodoPago);
      i++;
    }
    if (q && q.trim()) {
      wheres.push(`(concepto ILIKE $${i} OR observaciones ILIKE $${i})`);
      params.push(`%${q.trim()}%`);
      i++;
    }

    const sql =
      `SELECT ${COLS} FROM ${t} WHERE ${wheres.join(" AND ")} ` +
      `ORDER BY fecha DESC, created_at DESC LIMIT ${limit}`;
    const { rows } = await pool().query(sql, params);
    return NextResponse.json(successResponse({ ingresos: rows }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar.";
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json(successResponse({ ingresos: [] }));
    }
    console.error("[/api/otros-ingresos GET]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/otros-ingresos — crea un ingreso. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schemaRaw = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const t = quoteSchemaTable(schema, "otros_ingresos");

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const concepto = typeof b.concepto === "string" ? b.concepto.trim() : "";
    if (!concepto) {
      return NextResponse.json(errorResponse("El concepto es obligatorio."), { status: 400 });
    }
    if (concepto.length > 200) {
      return NextResponse.json(errorResponse("El concepto es demasiado largo (máx. 200)."), { status: 400 });
    }
    const monto = Number(b.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
    }
    const metodoPagoRaw = String(b.metodo_pago ?? "");
    if (!(METODOS_VALIDOS as readonly string[]).includes(metodoPagoRaw)) {
      return NextResponse.json(errorResponse("Método de pago inválido."), { status: 400 });
    }
    const fecha = typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha)
      ? b.fecha
      : new Date().toISOString().slice(0, 10);

    // sucursal: si no super_admin ni principal, forzar la propia
    const superAdmin = isSuperAdmin(auth);
    const principal = await esSucursalPrincipal(auth.empresa_id, auth.sucursal_id);
    let sucursalId: string | null = null;
    if (typeof b.sucursal_id === "string" && b.sucursal_id.trim()) sucursalId = b.sucursal_id.trim();
    if (!superAdmin && !principal) sucursalId = auth.sucursal_id ?? null;
    if (!sucursalId && auth.sucursal_id) sucursalId = auth.sucursal_id;

    const entidadBancariaId =
      typeof b.entidad_bancaria_id === "string" && b.entidad_bancaria_id.trim()
        ? b.entidad_bancaria_id.trim()
        : null;
    const cajaId =
      typeof b.caja_id === "string" && b.caja_id.trim() ? b.caja_id.trim() : null;
    const referencia =
      typeof b.referencia === "string" ? b.referencia.trim().slice(0, 200) || null : null;
    const observaciones =
      typeof b.observaciones === "string" ? b.observaciones.trim().slice(0, 1000) || null : null;

    const sql =
      `INSERT INTO ${t} (empresa_id, sucursal_id, caja_id, fecha, concepto, monto, metodo_pago, ` +
      `entidad_bancaria_id, referencia, observaciones, creado_por, creado_por_email) ` +
      `VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6::numeric, $7, $8::uuid, $9, $10, $11::uuid, $12) ` +
      `RETURNING ${COLS}`;
    const { rows } = await pool().query(sql, [
      auth.empresa_id,
      sucursalId,
      cajaId,
      fecha,
      concepto,
      monto,
      metodoPagoRaw,
      entidadBancariaId,
      referencia,
      observaciones,
      auth.usuarioCatalogId ?? null,
      auth.user?.email ?? null,
    ]);
    return NextResponse.json(successResponse({ ingreso: rows[0] }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo registrar el ingreso.";
    console.error("[/api/otros-ingresos POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
