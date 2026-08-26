import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/promociones/asignadas
 *
 * Promociones EXCLUSIVAS de un cliente (ambito='cliente'), con:
 *   cliente · fecha asignada · promo · validez · si ya se usó (y cuándo).
 *
 * El "usada" sale de `promocion_aplicaciones` (auditoría que se escribe al
 * confirmar la venta). Se devuelve la PRIMERA aplicación —que es la que
 * interesa para saber si el beneficio ya se consumió— y el total de usos.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });

  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(successResponse({ asignadas: [] }));

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tP = quoteSchemaTable(schema, "promociones");
    const tA = quoteSchemaTable(schema, "promocion_aplicaciones");
    const tC = quoteSchemaTable(schema, "clientes");
    const tV = quoteSchemaTable(schema, "ventas");

    const r = await pool.query<{
      id: string;
      cliente_id: string | null;
      cliente_nombre: string | null;
      cliente_telefono: string | null;
      promo_nombre: string;
      tipo: string;
      valor: string;
      cupon_codigo: string | null;
      fecha_asignada: string;
      fecha_desde: string | null;
      fecha_hasta: string | null;
      activo: boolean;
      usos: string;
      primera_uso_at: string | null;
      descuento_aplicado: string | null;
      venta_numero: string | null;
    }>(
      `SELECT p.id,
              p.cliente_id,
              COALESCE(NULLIF(TRIM(c.nombre_contacto), ''), NULLIF(TRIM(c.nombre), ''), NULLIF(TRIM(c.empresa), '')) AS cliente_nombre,
              c.telefono AS cliente_telefono,
              p.nombre        AS promo_nombre,
              p.tipo,
              p.valor::text,
              p.cupon_codigo,
              p.created_at::text  AS fecha_asignada,
              p.fecha_desde::text,
              p.fecha_hasta::text,
              p.activo,
              COALESCE(ap.usos, 0)::text        AS usos,
              ap.primera_uso_at::text,
              ap.descuento_aplicado::text,
              v.numero_control                  AS venta_numero
         FROM ${tP} p
         LEFT JOIN ${tC} c ON c.id = p.cliente_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS usos,
                  MIN(a.created_at) AS primera_uso_at,
                  (ARRAY_AGG(a.descuento_aplicado ORDER BY a.created_at))[1] AS descuento_aplicado,
                  (ARRAY_AGG(a.venta_id ORDER BY a.created_at))[1] AS venta_id
             FROM ${tA} a
            WHERE a.promocion_id = p.id
         ) ap ON true
         LEFT JOIN ${tV} v ON v.id = ap.venta_id
        WHERE p.empresa_id = $1::uuid
          AND p.ambito = 'cliente'
        ORDER BY p.created_at DESC
        LIMIT 500`,
      [auth.empresa_id],
    );

    const hoy = new Date().toISOString().slice(0, 10);
    const asignadas = r.rows.map((row) => {
      const usos = Number(row.usos) || 0;
      const vencida = !!row.fecha_hasta && row.fecha_hasta < hoy;
      const aunNoVigente = !!row.fecha_desde && row.fecha_desde > hoy;
      // Estado legible: lo que la usuaria quiere ver de un vistazo.
      const estado = usos > 0
        ? "usada"
        : !row.activo
          ? "inactiva"
          : vencida
            ? "vencida"
            : aunNoVigente
              ? "programada"
              : "pendiente";
      return {
        id: row.id,
        cliente_id: row.cliente_id,
        cliente_nombre: row.cliente_nombre,
        cliente_telefono: row.cliente_telefono,
        promo_nombre: row.promo_nombre,
        tipo: row.tipo,
        valor: Number(row.valor) || 0,
        cupon_codigo: row.cupon_codigo,
        fecha_asignada: row.fecha_asignada,
        fecha_desde: row.fecha_desde,
        fecha_hasta: row.fecha_hasta,
        activo: row.activo,
        usos,
        usada_at: row.primera_uso_at,
        descuento_aplicado: row.descuento_aplicado != null ? Number(row.descuento_aplicado) : null,
        venta_numero: row.venta_numero,
        estado,
      };
    });

    return NextResponse.json(successResponse({ asignadas }));
  } catch (e) {
    console.error("[promociones/asignadas GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron cargar las promociones asignadas."), { status: 500 });
  }
}
