import { NextRequest } from "next/server";
import { GET as dataGET } from "../route";
import { buildXlsxBufferSheets, sheetFromRows, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import type { ProveedoresReporte } from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

const fecha = (s: string | null) => { if (!s) return ""; const d = new Date(s); return isNaN(d.getTime()) ? s : d; };

export async function GET(request: NextRequest) {
  try {
    const res = await dataGET(request);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) {
      return new Response(JSON.stringify({ error: j?.error ?? "No se pudo generar el reporte de proveedores." }), {
        status: res.status || 500, headers: { "Content-Type": "application/json" },
      });
    }
    const data = j.data as ProveedoresReporte;

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Proveedores", data.proveedores, [
        { header: "PROVEEDOR", value: (r) => r.nombre, width: 30 },
        { header: "RUC", value: (r) => r.ruc ?? "", width: 16 },
        { header: "TELEFONO", value: (r) => r.telefono ?? "", width: 16 },
        { header: "COMPRAS", value: (r) => r.cantidad, width: 10 },
        { header: "TOTAL_COMPRADO", value: (r) => r.total, width: 18 },
        { header: "ULTIMA_COMPRA", value: (r) => fecha(r.ultima_compra), width: 18 },
      ]),
    ]);

    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`reporte-proveedores-${data.mes || nowStamp()}`) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/proveedores/export]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
