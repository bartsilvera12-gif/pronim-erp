// Genera los INSERT de UN DIA del diario, para `import_palmeras_fix`.
//
// Usa exactamente la misma normalizacion que `preparar-palmeras.cjs`: mismos
// signos, misma clasificacion de tipo, misma limpieza de telefono. Si no
// fuera la misma, el dia recargado quedaria distinto del resto del historico.
//
// Uso:
//   node supabase/import/generar-sql-un-dia.cjs "<ruta del xlsx>" 2026-09-08
//
// Salida: supabase/import/datos/dia_2026-09-08.sql — se pega en el SQL Editor
// despues de correr el BLOQUE 1 de _RECARGAR_un_dia.sql.
const XLSX = require("C:/Users/Neura/Neura/pronim-erp/node_modules/xlsx");
const fs = require("fs");
const path = require("path");

const ARCHIVO = process.argv[2];
const DIA = process.argv[3];
const HOJA = process.argv[4] || "YO CRECI DIARIO";

if (!ARCHIVO || !DIA) {
  console.error('Uso: node generar-sql-un-dia.cjs "<ruta del xlsx>" YYYY-MM-DD ["Nombre de la hoja"]');
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(DIA)) {
  console.error("La fecha va en formato YYYY-MM-DD.");
  process.exit(1);
}

const libro = XLSX.readFile(ARCHIVO, { cellDates: true, raw: true });
const hoja = libro.Sheets[HOJA];
if (!hoja) {
  console.error(`No encontre la hoja "${HOJA}". Hojas del archivo: ${libro.SheetNames.join(", ")}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, blankrows: false });
const body = rows.slice(1);

const gs = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : 0);
const ent = (v) => (v > 0 ? v : 0);
const sal = (v) => (v < 0 ? -v : 0);

function fecha(v) {
  if (v instanceof Date) {
    const y = v.getUTCFullYear(), m = v.getUTCMonth() + 1, d = v.getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const clave = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

function tel(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (s === "" || s === "-") return null;
  s = s.replace(/\D/g, "");
  if (s.startsWith("595")) s = s.slice(3);
  if (s.length === 10 && s.startsWith("0")) s = s.slice(1);
  return /^9\d{8}$/.test(s) ? s : null;
}

const RE_NO_CLIENTE = /\b(fardo|estoque|stock|transferencia|egreso)\b|ingreso de lillo|ingreso lillo|de lil+io|de lillo para|a lillo/i;

const filas = [];
body.forEach((r, i) => {
  const f = fecha(r[1]);
  if (f !== DIA) return;

  let nombre = String(r[2] ?? "").trim().replace(/\s+/g, " ");
  if (typeof r[2] === "number") nombre = "";

  const venta = gs(r[4]), evaluacion = gs(r[5]), devolucion = gs(r[6]);
  const prendas = gs(r[7]), estoque = gs(r[8]);
  const efectivo = gs(r[10]), transf = gs(r[11]), tarjeta = gs(r[12]);
  const credGen = Math.abs(gs(r[13]));
  const credUso = gs(r[14]), descuento = gs(r[15]);

  let tipo;
  if (RE_NO_CLIENTE.test(nombre))          tipo = "ajuste_stock";
  else if (venta > 0)                      tipo = "venta";
  else if (evaluacion > 0)                 tipo = "evaluacion";
  else if (devolucion > 0)                 tipo = "devolucion";
  else if (prendas !== 0 || estoque !== 0) tipo = "ajuste_stock";
  else                                     tipo = "otro";

  filas.push({
    fila_excel: i + 2,
    controle: typeof r[0] === "number" ? r[0] : null,
    fecha: f, tipo,
    cliente_nombre: nombre,
    cliente_clave: nombre ? clave(nombre) : "",
    telefono: tel(r[3]) ?? "",
    venta, evaluacion, devolucion, prendas, estoque,
    efectivo_in: ent(efectivo), efectivo_out: sal(efectivo),
    transf_in: ent(transf), transf_out: sal(transf),
    tarjeta_in: ent(tarjeta),
    credito_generado: credGen, credito_utilizado: credUso, descuento,
  });
});

if (filas.length === 0) {
  console.error(`No hay filas con fecha ${DIA} en la hoja "${HOJA}".`);
  process.exit(1);
}

const txt = (s) => (s === null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => (n === null || n === undefined ? "NULL" : String(n));

const COLS = "fila_excel, controle, fecha, tipo, cliente_nombre, cliente_clave, telefono, "
  + "venta, evaluacion, devolucion, prendas, estoque, efectivo_in, efectivo_out, "
  + "transf_in, transf_out, tarjeta_in, credito_generado, credito_utilizado, descuento";

const valores = filas.map((f) => "  (" + [
  num(f.fila_excel), num(f.controle), txt(f.fecha), txt(f.tipo),
  txt(f.cliente_nombre), txt(f.cliente_clave), txt(f.telefono),
  num(f.venta), num(f.evaluacion), num(f.devolucion), num(f.prendas), num(f.estoque),
  num(f.efectivo_in), num(f.efectivo_out), num(f.transf_in), num(f.transf_out),
  num(f.tarjeta_in), num(f.credito_generado), num(f.credito_utilizado), num(f.descuento),
].join(", ") + ")").join(",\n");

const sql = [
  `-- Dia ${DIA} del diario, ${filas.length} filas.`,
  `-- Generado desde: ${path.basename(ARCHIVO)} · hoja "${HOJA}"`,
  `-- Correr DESPUES del BLOQUE 1 de _RECARGAR_un_dia.sql.`,
  ``,
  `INSERT INTO pronimerp.import_palmeras_fix (${COLS}) VALUES`,
  valores + ";",
  ``,
  `SELECT count(*) AS filas, min(fecha) AS dia FROM pronimerp.import_palmeras_fix;`,
  ``,
].join("\n");

const DIR = path.join(__dirname, "datos");
fs.mkdirSync(DIR, { recursive: true });
const destino = path.join(DIR, `dia_${DIA}.sql`);
fs.writeFileSync(destino, sql, "utf8");

const resumen = filas.reduce((a, f) => {
  a[f.tipo] = (a[f.tipo] ?? 0) + 1;
  a._venta += f.venta; a._credGen += f.credito_generado; a._credUso += f.credito_utilizado;
  return a;
}, { _venta: 0, _credGen: 0, _credUso: 0 });

console.log(`${filas.length} filas del ${DIA} → ${destino}`);
console.log("por tipo:", Object.fromEntries(Object.entries(resumen).filter(([k]) => !k.startsWith("_"))));
console.log("venta:", resumen._venta.toLocaleString("es-PY"),
            "· credito generado:", resumen._credGen.toLocaleString("es-PY"),
            "· credito usado:", resumen._credUso.toLocaleString("es-PY"));
