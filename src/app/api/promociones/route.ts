import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { isAdmin } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id,empresa_id,nombre,descripcion,tipo,valor,lleve_n,pague_m,cupon_codigo,ambito,franja_id,sucursal_id,cliente_id,fecha_desde,fecha_hasta,minimo_compra,activo,created_at";

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  try {
    const url = new URL(request.url);
    const soloActivas = url.searchParams.get("solo_activas") === "1";
    let q = ctx.supabase
      .from("promociones")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("created_at", { ascending: false });
    if (soloActivas) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) {
      if (/does not exist|42P01/i.test(error.message)) {
        return NextResponse.json(successResponse({
          promociones: [],
          warning: "La tabla pronimerp.promociones no existe. Aplicá la migración 20260817000000_pronimerp_promociones.sql.",
        }));
      }
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ promociones: data ?? [] }));
  } catch (e) {
    console.error("[/api/promociones GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron cargar las promociones."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  if (!isAdmin(ctx.auth)) return NextResponse.json(errorResponse("Solo administradores pueden crear promociones."), { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const nombre = String(body.nombre ?? "").trim();
  const tipo = String(body.tipo ?? "");
  if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
  if (!["descuento_pct","descuento_fijo","lleve_n_pague_m","cashback"].includes(tipo)) {
    return NextResponse.json(errorResponse("Tipo de promoción inválido."), { status: 400 });
  }
  const valor = Number(body.valor);
  if (!Number.isFinite(valor) || valor < 0) return NextResponse.json(errorResponse("Valor inválido."), { status: 400 });
  if ((tipo === "descuento_pct" || tipo === "cashback") && valor > 100) {
    return NextResponse.json(errorResponse("El porcentaje no puede superar 100."), { status: 400 });
  }
  const lleve_n = body.lleve_n != null ? Number(body.lleve_n) : null;
  const pague_m = body.pague_m != null ? Number(body.pague_m) : null;
  if (tipo === "lleve_n_pague_m") {
    if (!Number.isFinite(Number(lleve_n)) || !Number.isFinite(Number(pague_m)) || (lleve_n as number) <= (pague_m as number)) {
      return NextResponse.json(errorResponse("Para 3x2 lleve_n debe ser mayor que pague_m."), { status: 400 });
    }
  }
  const ambito = String(body.ambito ?? "general");
  if (!["general","franja","sucursal","cliente"].includes(ambito)) {
    return NextResponse.json(errorResponse("Ámbito inválido."), { status: 400 });
  }

  const payload = {
    empresa_id: ctx.auth.empresa_id,
    nombre,
    descripcion: body.descripcion ? String(body.descripcion).slice(0, 500) : null,
    tipo,
    valor,
    lleve_n: tipo === "lleve_n_pague_m" ? lleve_n : null,
    pague_m: tipo === "lleve_n_pague_m" ? pague_m : null,
    cupon_codigo: body.cupon_codigo ? String(body.cupon_codigo).trim().toUpperCase() || null : null,
    ambito,
    franja_id: ambito === "franja" && typeof body.franja_id === "string" ? body.franja_id : null,
    sucursal_id: ambito === "sucursal" && typeof body.sucursal_id === "string" ? body.sucursal_id : null,
    cliente_id: ambito === "cliente" && typeof body.cliente_id === "string" ? body.cliente_id : null,
    fecha_desde: body.fecha_desde ? String(body.fecha_desde) : null,
    fecha_hasta: body.fecha_hasta ? String(body.fecha_hasta) : null,
    minimo_compra: Number(body.minimo_compra) || 0,
    activo: body.activo !== false,
    created_by: ctx.auth.usuarioCatalogId ?? null,
  };

  const { data, error } = await ctx.supabase
    .from("promociones")
    .insert(payload)
    .select(COLS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(errorResponse("Ya existe una promoción con ese código de cupón."), { status: 409 });
    }
    return NextResponse.json(errorResponse(error.message), { status: 400 });
  }
  return NextResponse.json(successResponse({ promocion: data }));
}

export async function PATCH(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  if (!isAdmin(ctx.auth)) return NextResponse.json(errorResponse("Solo administradores pueden modificar promociones."), { status: 403 });

  let body: { id?: string; activo?: boolean; nombre?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json(errorResponse("Falta el id."), { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.activo === "boolean") updates.activo = body.activo;
  if (typeof body.nombre === "string") updates.nombre = body.nombre.trim();
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(errorResponse("No hay cambios."), { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("promociones")
    .update(updates)
    .eq("id", id)
    .eq("empresa_id", ctx.auth.empresa_id)
    .select(COLS)
    .single();
  if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
  return NextResponse.json(successResponse({ promocion: data }));
}
