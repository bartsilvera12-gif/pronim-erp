import { NextRequest } from "next/server";
import { GET as dataGET } from "../route";
import { buildXlsxBufferSheets, sheetFromRows, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import type { VentasReporte } from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

const fecha = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? (s ?? "") : d; };

export async function GET(request: NextRequest) {
  try {
    const res = await dataGET(request);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) {
      return new Response(JSON.stringify({ error: j?.error ?? "No se pudo generar el reporte de ventas." }), {
        status: res.status || 500, headers: { "Content-Type": "application/json" },
      });
    }
    const data = j.data as VentasReporte;

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Ventas", data.ventas, [
        { header: "FECHA", value: (r) => fecha(r.fecha), width: 18 },
        { header: "N_VENTA", value: (r) => r.numero_control, width: 16 },
        { header: "CLIENTE", value: (r) => r.cliente ?? "", width: 28 },
        { header: "PAGO", value: (r) => r.metodo_pago ?? "", width: 14 },
        { header: "ITEMS", value: (r) => r.items_count, width: 8 },
        { header: "TOTAL", value: (r) => r.total, width: 16 },
      ]),
      sheetFromRows("Items", data.items, [
        { header: "FECHA", value: (r) => fecha(r.fecha), width: 18 },
        { header: "N_VENTA", value: (r) => r.numero_control, width: 16 },
        { header: "PRODUCTO", value: (r) => r.producto_nombre, width: 30 },
        { header: "CANTIDAD", value: (r) => r.cantidad, width: 10 },
        { header: "PRECIO", value: (r) => r.precio_venta, width: 14 },
        { header: "SUBTOTAL", value: (r) => r.subtotal, width: 14 },
        { header: "IVA", value: (r) => r.monto_iva, width: 12 },
        { header: "TOTAL_LINEA", value: (r) => r.total_linea, width: 14 },
      ]),
      sheetFromRows("Por producto", data.porProducto, [
        { header: "PRODUCTO", value: (r) => r.producto_nombre, width: 30 },
        { header: "CANTIDAD", value: (r) => r.cantidad, width: 12 },
        { header: "TOTAL", value: (r) => r.total, width: 16 },
      ]),
    ]);

    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`reporte-ventas-${data.mes || nowStamp()}`) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/ventas/export]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
