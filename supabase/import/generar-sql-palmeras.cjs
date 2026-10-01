// Plan B del paso 1: convierte el CSV en archivos de INSERT para pegar en el
// SQL Editor, por si el importador de CSV del Table Editor no coopera.
//
// Uso:  node supabase/import/generar-sql-palmeras.cjs
// Salida: supabase/import/datos/palmeras_01.sql, _02.sql, ... (no van al repo)
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname);
const CSV = path.join(BASE, "palmeras_movimientos.csv");
const DIR = path.join(BASE, "datos");
const POR_ARCHIVO = 2000;   // ~300 KB cada uno: entra comodo en el SQL Editor

// Parser de CSV chico pero correcto: respeta comillas y comas adentro de un
// nombre ("Ferreira, Ana"). Separar con split(",") rompe justo en esos.
function parseCSV(txt) {
  const filas = [];
  let campo = "", fila = [], enComillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (enComillas) {
      if (c === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

const filas = parseCSV(fs.readFileSync(CSV, "utf8"));
const cols = filas[0];
const datos = filas.slice(1).filter((f) => f.length === cols.length);

// Que columnas son texto y cuales numero, para citar solo lo que corresponde.
const TEXTO = new Set(["fecha", "tipo", "cliente_nombre", "cliente_clave", "telefono"]);
const lit = (col, v) => {
  if (v === "" || v === null) return "NULL";
  if (TEXTO.has(col)) return "'" + String(v).replace(/'/g, "''") + "'";
  return String(v);
};

fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f));

const partes = Math.ceil(datos.length / POR_ARCHIVO);
for (let p = 0; p < partes; p++) {
  const trozo = datos.slice(p * POR_ARCHIVO, (p + 1) * POR_ARCHIVO);
  const nro = String(p + 1).padStart(2, "0");
  const sql =
    `-- Diario de Palmeras, parte ${p + 1} de ${partes} (filas ${p * POR_ARCHIVO + 1} a ${p * POR_ARCHIVO + trozo.length}).\n` +
    `-- Correr en orden. Se puede repetir sin miedo: ON CONFLICT no duplica.\n\n` +
    `INSERT INTO pronimerp.import_palmeras (${cols.join(", ")}) VALUES\n` +
    trozo.map((f) => "  (" + cols.map((c, i) => lit(c, f[i])).join(", ") + ")").join(",\n") +
    `\nON CONFLICT (fila_excel) DO NOTHING;\n\n` +
    `SELECT count(*) AS filas_cargadas FROM pronimerp.import_palmeras;\n`;
  const out = path.join(DIR, `palmeras_${nro}.sql`);
  fs.writeFileSync(out, sql, "utf8");
  console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + " KB", trozo.length + " filas");
}
console.log("\n" + datos.length + " filas en " + partes + " archivos. Correlos en orden.");
