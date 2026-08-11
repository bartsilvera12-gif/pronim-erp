import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/inventario-drill
 * Reporte de inventario con drill.
 *
 * Filtros:
 *   ?categoria_id=uuid & tipo_prenda_id=uuid & sucursal_id=uuid
 *   & solo_bajo_stock=1 & sin_stock=1 & activo=1|0 & q=texto
 *
 * Devuelve:
 *   - kpis: { productos_total, unidades_total, valor_stock,
 *             bajo_stock_count, sin_stock_count }
 *   - por_categoria, por_tipo_prenda, por_sucursal
 *   - productos: hasta 1000 filas
 *   - opciones: { categorias, tipos_prenda, sucursales }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión Postgres."), { status: 500 });

    const tP = quoteSchemaTable(schema, "productos");
    const tPC = quoteSchemaTable(schema, "producto_categorias");
    const tCP = quoteSchemaTable(schema, "categorias_productos");
    const tPSS = quoteSchemaTable(schema, "producto_stock_sucursal");
    const tS = quoteSchemaTable(schema, "sucursales");
    const tTP = quoteSchemaTable(schema, "tipos_prenda");

    // Detectar columnas opcionales del schema
    const colQ = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'productos'`,
      [schema],
    );
    const cols = new Set(colQ.rows.map((r) => r.column_name));
    const hasTipoPrenda = cols.has("tipo_prenda_id");
    const hasImagen = cols.has("imagen_url");
    const hasActivo = cols.has("activo");

    // Detectar existencia de tablas auxiliares
    const tblQ = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name IN ('producto_categorias','categorias_productos','producto_stock_sucursal','tipos_prenda')`,
      [schema],
    );
    const tbls = new Set(tblQ.rows.map((r) => r.table_name));
    const hasCat = tbls.has("producto_categorias") && tbls.has("categorias_productos");
    const hasStockSuc = tbls.has("producto_stock_sucursal");

    const sp = request.nextUrl.searchParams;
    const categoriaId = sp.get("categoria_id");
    const tipoPrendaId = sp.get("tipo_prenda_id");
    const sucursalId = sp.get("sucursal_id");
    const soloBajo = sp.get("solo_bajo_stock") === "1";
    const sinStock = sp.get("sin_stock") === "1";
    const soloActivo = sp.get("activo") !== "0";
    const q = (sp.get("q") ?? "").trim();

    // Stock efectivo: si hay filtro de sucursal usamos stock por sucursal,
    // sino usamos stock_actual del producto (agregado global).
    const stockExpr = sucursalId && hasStockSuc
      ? `COALESCE((SELECT ss.stock_actual FROM ${tPSS} ss WHERE ss.producto_id = p.id AND ss.sucursal_id = $__SUC__::uuid),0)`
      : "COALESCE(p.stock_actual,0)";

    const conds: string[] = ["p.empresa_id = $1"];
    const params: unknown[] = [auth.empresa_id];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      conds.push(sql.replace("?", `$${params.length}`));
    };
    if (hasActivo && soloActivo) conds.push("COALESCE(p.activo,true) = true");
    if (tipoPrendaId && hasTipoPrenda) push("p.tipo_prenda_id = ?::uuid", tipoPrendaId);
    if (categoriaId && hasCat) push(`EXISTS (SELECT 1 FROM ${tPC} pc WHERE pc.producto_id = p.id AND pc.categoria_id = ?::uuid)`, categoriaId);
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const p = `$${params.length}`;
      conds.push(`(LOWER(p.nombre) LIKE ${p} OR LOWER(COALESCE(p.sku,'')) LIKE ${p})`);
    }
    // sucursalId se resuelve luego (inyecta en stockExpr)
    let sucursalParamIdx: number | null = null;
    if (sucursalId && hasStockSuc) {
      params.push(sucursalId);
      sucursalParamIdx = params.length;
    }
    const stockFinal = stockExpr.replace("$__SUC__", `$${sucursalParamIdx}`);
    if (soloBajo) conds.push(`${stockFinal} <= COALESCE(p.stock_minimo,0) AND COALESCE(p.stock_minimo,0) > 0`);
    if (sinStock) conds.push(`${stockFinal} <= 0`);

    // KPIs
    const kpis = await pool.query<{
      cnt: string; unidades: string; valor: string; bajo: string; sin: string;
    }>(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(${stockFinal}),0)::text AS unidades,
              COALESCE(SUM(${stockFinal} * COALESCE(p.costo_promedio,0)),0)::text AS valor,
              COUNT(*) FILTER (WHERE ${stockFinal} <= COALESCE(p.stock_minimo,0) AND COALESCE(p.stock_minimo,0) > 0)::text AS bajo,
              COUNT(*) FILTER (WHERE ${stockFinal} <= 0)::text AS sin
         FROM ${tP} p WHERE ${conds.join(" AND ")}`,
      params,
    );
    const k = kpis.rows[0] ?? { cnt: "0", unidades: "0", valor: "0", bajo: "0", sin: "0" };

    // Por categoría
    const porCat = hasCat ? await pool.query<{ cat_id: string; cat_nombre: string; cnt: string; unidades: string; valor: string }>(
      `SELECT c.id::text AS cat_id, c.nombre AS cat_nombre,
              COUNT(DISTINCT p.id)::text AS cnt,
              COALESCE(SUM(${stockFinal}),0)::text AS unidades,
              COALESCE(SUM(${stockFinal} * COALESCE(p.costo_promedio,0)),0)::text AS valor
         FROM ${tP} p
         JOIN ${tPC} pc ON pc.producto_id = p.id
         JOIN ${tCP} c  ON c.id = pc.categoria_id
        WHERE ${conds.join(" AND ")}
        GROUP BY c.id, c.nombre ORDER BY valor DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ cat_id: string; cat_nombre: string; cnt: string; unidades: string; valor: string }> })) : { rows: [] };

    // Por tipo de prenda
    const porTP = hasTipoPrenda ? await pool.query<{ tp_id: string | null; tp_nombre: string | null; cnt: string; unidades: string; valor: string }>(
      `SELECT p.tipo_prenda_id::text AS tp_id,
              tp.nombre AS tp_nombre,
              COUNT(*)::text AS cnt,
              COALESCE(SUM(${stockFinal}),0)::text AS unidades,
              COALESCE(SUM(${stockFinal} * COALESCE(p.costo_promedio,0)),0)::text AS valor
         FROM ${tP} p
         LEFT JOIN ${tTP} tp ON tp.id = p.tipo_prenda_id
        WHERE ${conds.join(" AND ")}
        GROUP BY p.tipo_prenda_id, tp.nombre ORDER BY valor DESC`,
      params,
    ).catch(() => ({ rows: [] as Array<{ tp_id: string | null; tp_nombre: string | null; cnt: string; unidades: string; valor: string }> })) : { rows: [] };

    // Por sucursal — usamos stock por sucursal (siempre agregado global, no filtrado por sucursalId)
    const porSuc = hasStockSuc ? await pool.query<{ suc_id: string; suc_nombre: string; unidades: string; valor: string }>(
      `SELECT s.id::text AS suc_id, s.nombre AS suc_nombre,
              COALESCE(SUM(ss.stock_actual),0)::text AS unidades,
              COALESCE(SUM(ss.stock_actual * COALESCE(p.costo_promedio,0)),0)::text AS valor
         FROM ${tPSS} ss
         JOIN ${tP} p ON p.id = ss.producto_id
         JOIN ${tS} s ON s.id = ss.sucursal_id
        WHERE p.empresa_id = $1 AND s.empresa_id = $1
        GROUP BY s.id, s.nombre ORDER BY valor DESC`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ suc_id: string; suc_nombre: string; unidades: string; valor: string }> })) : { rows: [] };

    // Listado
    const prods = await pool.query<{
      id: string; sku: string | null; nombre: string;
      costo: string; precio: string;
      stock: string; stock_min: string;
      categorias: string | null;
      tipo_prenda: string | null;
      imagen_url: string | null;
    }>(
      `SELECT p.id::text, p.sku, p.nombre,
              COALESCE(p.costo_promedio,0)::text AS costo,
              COALESCE(p.precio_venta,0)::text AS precio,
              (${stockFinal})::text AS stock,
              COALESCE(p.stock_minimo,0)::text AS stock_min,
              ${hasCat ? `(SELECT string_agg(c2.nombre, ', ') FROM ${tPC} pc2 JOIN ${tCP} c2 ON c2.id = pc2.categoria_id WHERE pc2.producto_id = p.id)` : "NULL"} AS categorias,
              ${hasTipoPrenda ? "(SELECT tp2.nombre FROM " + tTP + " tp2 WHERE tp2.id = p.tipo_prenda_id)" : "NULL"} AS tipo_prenda,
              ${hasImagen ? "p.imagen_url" : "NULL"} AS imagen_url
         FROM ${tP} p WHERE ${conds.join(" AND ")}
        ORDER BY p.nombre LIMIT 1000`,
      params,
    );

    // Opciones para selects
    const opCat = hasCat ? await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tCP} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> })) : { rows: [] };

    const opTP = hasTipoPrenda ? await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tTP} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> })) : { rows: [] };

    const opSuc = await pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM ${tS} WHERE empresa_id = $1 ORDER BY nombre`,
      [auth.empresa_id],
    ).catch(() => ({ rows: [] as Array<{ id: string; nombre: string }> }));

    return NextResponse.json(successResponse({
      kpis: {
        productos_total: Number(k.cnt),
        unidades_total: Number(k.unidades),
        valor_stock: Number(k.valor),
        bajo_stock_count: Number(k.bajo),
        sin_stock_count: Number(k.sin),
      },
      por_categoria: porCat.rows.map((r) => ({ cat_id: r.cat_id, cat_nombre: r.cat_nombre, cnt: Number(r.cnt), unidades: Number(r.unidades), valor: Number(r.valor) })),
      por_tipo_prenda: porTP.rows.map((r) => ({ tp_id: r.tp_id, tp_nombre: r.tp_nombre ?? "Sin tipo", cnt: Number(r.cnt), unidades: Number(r.unidades), valor: Number(r.valor) })),
      por_sucursal: porSuc.rows.map((r) => ({ suc_id: r.suc_id, suc_nombre: r.suc_nombre, unidades: Number(r.unidades), valor: Number(r.valor) })),
      productos: prods.rows.map((r) => ({
        id: r.id, sku: r.sku, nombre: r.nombre,
        costo: Number(r.costo), precio: Number(r.precio),
        stock: Number(r.stock), stock_min: Number(r.stock_min),
        categorias: r.categorias ?? "",
        tipo_prenda: r.tipo_prenda ?? "",
        imagen_url: r.imagen_url,
      })),
      opciones: {
        categorias: opCat.rows,
        tipos_prenda: opTP.rows,
        sucursales: opSuc.rows,
      },
    }));
  } catch (err) {
    console.error("[/api/reportes/inventario-drill GET]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
