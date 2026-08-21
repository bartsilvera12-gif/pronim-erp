import { NextRequest } from "next/server";
import { GET as dataGET } from "../route";
import { buildXlsxBufferSheets, sheetFromRows, xlsxResponseHeaders, nowStamp, type XlsxSheetSpec } from "@/lib/excel/export";
import type { EstadoCuentaReporte } from "@/lib/reportes/types";

export const dynamic = "force-dynamic";

const fecha = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? (s ?? "") : d; };

export async function GET(request: NextRequest) {
  try {
    const res = await dataGET(request);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) {
      return new Response(JSON.stringify({ error: j?.error ?? "No se pudo generar el estado de cuenta." }), {
        status: res.status || 500, headers: { "Content-Type": "application/json" },
      });
    }
    const data = j.data as EstadoCuentaReporte;

    const resumen: XlsxSheetSpec = {
      sheetName: "Resumen",
      aoa: [
        ["CONCEPTO", "MONTO"],
        ["Ingresos por ventas", data.ingresosVentas],
        ["Compras", data.compras],
        ["Gastos", data.gastos],
        ["Resultado", data.resultado],
        ["Por cobrar (crédito)", data.porCobrar],
        ["Por pagar (crédito)", data.porPagar],
      ],
      colWidths: [28, 18],
    };

    const buf = buildXlsxBufferSheets([
      resumen,
      sheetFromRows("Movimientos", data.movimientos, [
        { header: "FECHA", value: (r) => fecha(r.fecha), width: 18 },
        { header: "TIPO", value: (r) => r.tipo, width: 12 },
        { header: "REFERENCIA", value: (r) => r.referencia, width: 18 },
        { header: "DESCRIPCION", value: (r) => r.descripcion, width: 34 },
        { header: "ENTRADA", value: (r) => r.entrada, width: 16 },
        { header: "SALIDA", value: (r) => r.salida, width: 16 },
      ]),
    ]);

    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`estado-cuenta-${data.mes || nowStamp()}`) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/estado-cuenta/export]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
