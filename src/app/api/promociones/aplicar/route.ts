import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type ItemCart = { franja_id: string; cantidad: number; precio_unitario: number };
type Body = {
  cliente_id?: string | null;
  sucursal_id?: string | null;
  cupon?: string | null;
  items: ItemCart[];
};

type PromoRow = {
  id: string;
  nombre: string;
  tipo: "descuento_pct" | "descuento_fijo" | "lleve_n_pague_m" | "cashback";
  valor: number;
  lleve_n: number | null;
  pague_m: number | null;
  cupon_codigo: string | null;
  ambito: "general" | "franja" | "sucursal" | "cliente";
  franja_id: string | null;
  sucursal_id: string | null;
  cliente_id: string | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  minimo_compra: number;
};

/**
 * POST /api/promociones/aplicar
 *
 * Evalúa el carrito contra las promociones activas y devuelve la MEJOR
 * aplicable (mayor descuento). Si viene `cupon`, filtra por código exacto;
 * si no, solo considera las que NO requieren cupón (automáticas).
 *
 * Devuelve:
 *   { promocion, descuento, cashback }  o  { descuento: 0 }
 *
 * NO persiste nada; el frontend usa el descuento al enviar la venta y
 * después crea la aplicación en /aplicaciones.
 */
export async function POST(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  let body: Body;
  try { body = await request.json(); } catch {
    return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0) : [];
  const subtotal = items.reduce((s, i) => s + (Number(i.precio_unitario) || 0) * (Number(i.cantidad) || 0), 0);
  if (subtotal <= 0 || items.length === 0) {
    return NextResponse.json(successResponse({ descuento: 0, cashback: 0 }));
  }

  const cupon = typeof body.cupon === "string" && body.cupon.trim() ? body.cupon.trim().toUpperCase() : null;
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : null;
  const sucursalId = typeof body.sucursal_id === "string" ? body.sucursal_id : ctx.auth.sucursal_id ?? null;
  const hoy = new Date().toISOString().slice(0, 10);

  try {
    let q = ctx.supabase
      .from("promociones")
      .select("id,nombre,tipo,valor,lleve_n,pague_m,cupon_codigo,ambito,franja_id,sucursal_id,cliente_id,fecha_desde,fecha_hasta,minimo_compra")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("activo", true);
    if (cupon) q = q.ilike("cupon_codigo", cupon);
    else q = q.is("cupon_codigo", null);
    const { data, error } = await q;
    if (error) {
      if (/does not exist|42P01/i.test(error.message)) {
        return NextResponse.json(successResponse({ descuento: 0, cashback: 0 }));
      }
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    const promos = (data ?? []) as PromoRow[];
    if (cupon && promos.length === 0) {
      return NextResponse.json(errorResponse(`El cupón "${cupon}" no existe o está inactivo.`), { status: 404 });
    }

    // Filtrar por vigencia, ámbito, mínimo de compra.
    const aplicables = promos.filter((p) => {
      if (p.minimo_compra > 0 && subtotal < p.minimo_compra) return false;
      if (p.fecha_desde && hoy < p.fecha_desde) return false;
      if (p.fecha_hasta && hoy > p.fecha_hasta) return false;
      if (p.ambito === "cliente" && p.cliente_id && p.cliente_id !== clienteId) return false;
      if (p.ambito === "sucursal" && p.sucursal_id && p.sucursal_id !== sucursalId) return false;
      if (p.ambito === "franja" && p.franja_id) {
        if (!items.some((i) => i.franja_id === p.franja_id)) return false;
      }
      return true;
    });

    if (aplicables.length === 0) {
      if (cupon) return NextResponse.json(errorResponse(`El cupón "${cupon}" no aplica a este carrito (verificá fecha, mínimo de compra, sucursal o cliente).`), { status: 400 });
      return NextResponse.json(successResponse({ descuento: 0, cashback: 0 }));
    }

    // Evaluar cada una y quedarse con el mejor descuento (o el cashback más alto si no hay descuentos directos).
    let mejor: { promo: PromoRow; descuento: number; cashback: number } | null = null;
    for (const p of aplicables) {
      let desc = 0; let cash = 0;
      const subFranja = p.ambito === "franja" && p.franja_id
        ? items.filter((i) => i.franja_id === p.franja_id).reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
        : subtotal;

      if (p.tipo === "descuento_pct") {
        desc = Math.min(subFranja * (p.valor / 100), subFranja);
      } else if (p.tipo === "descuento_fijo") {
        desc = Math.min(p.valor, subFranja);
      } else if (p.tipo === "lleve_n_pague_m" && p.lleve_n && p.pague_m) {
        // Aplica solo a la franja indicada (o a cada franja del carrito si es "general").
        const franjasAplicables = p.ambito === "franja" && p.franja_id
          ? items.filter((i) => i.franja_id === p.franja_id)
          : items;
        for (const it of franjasAplicables) {
          const grupos = Math.floor(it.cantidad / p.lleve_n);
          desc += grupos * (p.lleve_n - p.pague_m) * it.precio_unitario;
        }
      } else if (p.tipo === "cashback") {
        cash = subFranja * (p.valor / 100);
      }

      desc = Math.round(Math.max(0, desc));
      cash = Math.round(Math.max(0, cash));

      const score = desc + cash;
      if (!mejor || score > mejor.descuento + mejor.cashback) {
        mejor = { promo: p, descuento: desc, cashback: cash };
      }
    }

    if (!mejor || (mejor.descuento === 0 && mejor.cashback === 0)) {
      return NextResponse.json(successResponse({ descuento: 0, cashback: 0 }));
    }
    return NextResponse.json(successResponse({
      promocion: {
        id: mejor.promo.id,
        nombre: mejor.promo.nombre,
        tipo: mejor.promo.tipo,
        cupon_codigo: mejor.promo.cupon_codigo,
      },
      descuento: mejor.descuento,
      cashback: mejor.cashback,
    }));
  } catch (e) {
    console.error("[/api/promociones/aplicar]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo evaluar la promoción."), { status: 500 });
  }
}
