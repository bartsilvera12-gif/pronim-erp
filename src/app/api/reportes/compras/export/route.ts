import { NextRequest } from "next/server";
import { GET as dataGET } from "../route";
import { buildXlsxBufferSheets, sheetFromRows, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import type { ComprasReporte } from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

const fecha = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? (s ?? "") : d; };

export async function GET(request: NextRequest) {
  try {
    const res = await dataGET(request);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) {
      return new Response(JSON.stringify({ error: j?.error ?? "No se pudo generar el reporte de compras." }), {
        status: res.status || 500, headers: { "Content-Type": "application/json" },
      });
    }
    const data = j.data as ComprasReporte;

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Compras", data.compras, [
        { header: "FECHA", value: (r) => fecha(r.fecha), width: 18 },
        { header: "N_CONTROL", value: (r) => r.numero_control, width: 16 },
        { header: "PROVEEDOR", value: (r) => r.proveedor_nombre, width: 30 },
        { header: "ITEMS", value: (r) => r.items_count, width: 8 },
        { header: "SUBTOTAL", value: (r) => r.subtotal, width: 14 },
        { header: "IVA", value: (r) => r.monto_iva, width: 12 },
        { header: "TOTAL", value: (r) => r.total, width: 16 },
        { header: "PAGO", value: (r) => r.tipo_pago, width: 12 },
        { header: "TIMBRADO", value: (r) => r.nro_timbrado ?? "", width: 18 },
        { header: "COMPROBANTE", value: (r) => (r.tiene_comprobante ? "Sí" : "No"), width: 12 },
      ]),
      sheetFromRows("Items", data.items, [
        { header: "FECHA", value: (r) => fecha(r.fecha), width: 18 },
        { header: "N_CONTROL", value: (r) => r.numero_control, width: 16 },
        { header: "PROVEEDOR", value: (r) => r.proveedor_nombre, width: 30 },
        { header: "PRODUCTO", value: (r) => r.producto_nombre, width: 30 },
        { header: "CANTIDAD", value: (r) => r.cantidad, width: 10 },
        { header: "COSTO_UNIT", value: (r) => r.costo_unitario, width: 14 },
        { header: "TOTAL_LINEA", value: (r) => r.total_linea, width: 14 },
      ]),
      sheetFromRows("Por proveedor", data.porProveedor, [
        { header: "PROVEEDOR", value: (r) => r.proveedor_nombre, width: 30 },
        { header: "COMPRAS", value: (r) => r.compras, width: 10 },
        { header: "TOTAL", value: (r) => r.total, width: 16 },
      ]),
      sheetFromRows("Por producto", data.porProducto, [
        { header: "PRODUCTO", value: (r) => r.producto_nombre, width: 30 },
        { header: "CANTIDAD", value: (r) => r.cantidad, width: 12 },
        { header: "GASTO", value: (r) => r.gasto, width: 16 },
      ]),
    ]);

    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`reporte-compras-${data.mes || nowStamp()}`) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/compras/export]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
