/**
 * Util generico para exportar a Excel (.xlsx).
 *
 * Recibe headers (titulos legibles) y filas, construye un workbook con una
 * hoja y devuelve un Buffer listo para servir en una Response.
 *
 * Usa `xlsx-js-style` (fork de SheetJS con soporte de estilos) para que las
 * tablas salgan con encabezado de color, filas alternadas, bordes finos y
 * autofiltro (dropdowns por columna). NO se debe tocar
 * src/lib/campaigns/campaign-import-service.ts.
 */
import * as XLSX from "xlsx-js-style";

// ── Paleta (marca ZENTRA / teal) ───────────────────────────────────────────────
const HEADER_FILL = "4FAEB2";   // teal de marca
const HEADER_TEXT = "FFFFFF";
const BAND_FILL = "EAF6F6";     // celeste muy suave para filas pares
const BORDER = "D8E3E3";        // borde fino
const TOTAL_FILL = "0B3A3D";    // fila de total (turquesa profundo)

type CellStyle = Record<string, unknown>;

const thinBorder = {
  top: { style: "thin", color: { rgb: BORDER } },
  bottom: { style: "thin", color: { rgb: BORDER } },
  left: { style: "thin", color: { rgb: BORDER } },
  right: { style: "thin", color: { rgb: BORDER } },
};

function headerStyle(): CellStyle {
  return {
    font: { bold: true, sz: 11, color: { rgb: HEADER_TEXT } },
    fill: { patternType: "solid", fgColor: { rgb: HEADER_FILL } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: thinBorder,
  };
}

function bodyStyle(rowIdx: number, isNumber: boolean): CellStyle {
  const banded = rowIdx % 2 === 1;
  return {
    font: { sz: 10, color: { rgb: "1F2937" } },
    ...(banded ? { fill: { patternType: "solid", fgColor: { rgb: BAND_FILL } } } : {}),
    alignment: { horizontal: isNumber ? "right" : "left", vertical: "center" },
    border: thinBorder,
  };
}

const looksNumeric = (v: unknown) => typeof v === "number";

export interface ExportColumn<T> {
  header: string;
  /** Funcion para extraer el valor de la fila (string | number | null | undefined | boolean | Date). */
  value: (row: T) => string | number | boolean | null | undefined | Date;
  /** Ancho aproximado en caracteres (opcional). */
  width?: number;
}

export interface ExportOptions {
  /** Nombre de la hoja dentro del libro. Por defecto "Datos". */
  sheetName?: string;
  /** Nombre del archivo sugerido (sin extension). */
  filename?: string;
}

/** Aplica estilos (header + filas alternadas), autofiltro y freeze a una hoja ya armada. */
function styleSheet(
  ws: XLSX.WorkSheet,
  nCols: number,
  nDataRows: number,
  colWidths?: number[]
) {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      if (r === 0) {
        cell.s = headerStyle();
      } else {
        cell.s = bodyStyle(r, looksNumeric(cell.v));
      }
    }
  }
  if (colWidths && colWidths.length > 0) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  }
  ws["!rows"] = [{ hpt: 22 }]; // header un poco más alto
  // Autofiltro sobre todo el rango (dropdowns por columna) + freeze del header.
  if (nCols > 0) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, nDataRows), c: nCols - 1 } }) };
  }
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
}

export function buildXlsxBuffer<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  opts: ExportOptions = {}
): Buffer {
  const sheetName = (opts.sheetName ?? "Datos").slice(0, 31); // limite Excel
  const headerRow = columns.map((c) => c.header);
  const dataRows = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      if (v == null) return "";
      return v;
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  styleSheet(ws, columns.length, dataRows.length, columns.map((c) => c.width ?? 16));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
  return buf;
}

/** Spec de una hoja ya materializada (header + filas como matriz). */
export interface XlsxSheetSpec {
  sheetName: string;
  aoa: (string | number | boolean | Date)[][];
  colWidths?: number[];
  /** Si es true, la última fila se estiliza como fila de TOTAL (fondo oscuro, texto claro). */
  totalRow?: boolean;
}

/** Convierte filas tipadas + columnas en una hoja (header incluido). */
export function sheetFromRows<T>(
  sheetName: string,
  rows: T[],
  columns: ExportColumn<T>[]
): XlsxSheetSpec {
  const header = columns.map((c) => c.header);
  const data = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      if (v == null) return "";
      return v;
    })
  );
  return {
    sheetName: sheetName.slice(0, 31),
    aoa: [header, ...data],
    colWidths: columns.map((c) => c.width ?? 16),
  };
}

/** Construye un workbook con varias hojas y devuelve el Buffer. */
export function buildXlsxBufferSheets(sheets: XlsxSheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    const nCols = s.aoa[0]?.length ?? 0;
    const nDataRows = Math.max(0, s.aoa.length - 1);
    styleSheet(ws, nCols, nDataRows, s.colWidths);
    // Fila de total opcional (última fila): fondo oscuro + texto claro + negrita.
    if (s.totalRow && s.aoa.length > 1) {
      const r = s.aoa.length - 1;
      for (let c = 0; c < nCols; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: TOTAL_FILL } },
          alignment: { horizontal: looksNumeric(cell.v) ? "right" : "left", vertical: "center" },
          border: thinBorder,
        };
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, s.sheetName.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

export function xlsxResponseHeaders(filename: string): HeadersInit {
  const safe = filename.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  return {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${safe}.xlsx"`,
    "Cache-Control": "no-store",
  };
}

/** Helper: yyyy-mm-dd-HHMM para sufijos de nombre de archivo. */
export function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
