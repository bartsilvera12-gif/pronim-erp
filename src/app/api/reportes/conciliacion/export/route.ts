import { NextRequest } from "next/server";
import { GET as dataGET } from "../route";
import { buildXlsxBufferSheets, sheetFromRows, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import type { ConciliacionReporte } from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

const fecha = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? (s ?? "") : d; };

export async function GET(request: NextRequest) {
  try {
    const res = await dataGET(request);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) {
      return new Response(JSON.stringify({ error: j?.error ?? "No se pudo generar la conciliación." }), {
        status: res.status || 500, headers: { "Content-Type": "application/json" },
      });
    }
    const data = j.data as ConciliacionReporte;

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Movimientos", data.movimientos, [
        { header: "FECHA", value: (r) => fecha(r.fecha), width: 18 },
        { header: "TIPO", value: (r) => r.tipo, width: 10 },
        { header: "N_VENTA", value: (r) => r.numero ?? "", width: 16 },
        { header: "CLIENTE", value: (r) => r.cliente ?? "", width: 28 },
        { header: "METODO", value: (r) => r.metodo_pago ?? "", width: 16 },
        { header: "ENTIDAD", value: (r) => r.entidad ?? "", width: 18 },
        { header: "REFERENCIA", value: (r) => r.referencia ?? "", width: 18 },
        { header: "TITULAR", value: (r) => r.titular ?? "", width: 24 },
        { header: "MONTO", value: (r) => r.monto, width: 16 },
        { header: "ESTADO", value: (r) => r.estado, width: 12 },
      ]),
      sheetFromRows("Por metodo", data.porMetodo, [
        { header: "METODO", value: (r) => r.clave, width: 20 },
        { header: "CANTIDAD", value: (r) => r.cantidad, width: 10 },
        { header: "TOTAL", value: (r) => r.total, width: 16 },
      ]),
      sheetFromRows("Por entidad", data.porEntidad, [
        { header: "ENTIDAD", value: (r) => r.clave, width: 20 },
        { header: "CANTIDAD", value: (r) => r.cantidad, width: 10 },
        { header: "TOTAL", value: (r) => r.total, width: 16 },
      ]),
    ]);

    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`conciliacion-${data.mes || nowStamp()}`) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/conciliacion/export]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
