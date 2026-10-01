// Para cada tt("...") que hay en el codigo, dice si tiene traduccion pt-BR.
// Una clave envuelta pero sin traducir sigue saliendo en espanol: envolver sin
// traducir no arregla nada, solo lo esconde.
const fs = require("fs");
const path = require("path");

const dict = fs.readFileSync("src/lib/i18n/dict.ts", "utf8");
const ptBR = dict.slice(dict.indexOf("const ptBR"), dict.indexOf("const dicts"));
const traducidas = new Map();
for (const m of ptBR.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
  // Las claves del diccionario vienen con las comillas escapadas, igual que en
  // el codigo. Sin desescapar las dos, una clave con comillas adentro parece
  // faltante cuando en realidad esta.
  traducidas.set(m[1].replace(/\\"/g, '"'), m[2]);
}

const archivos = [];
(function caminar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) caminar(p);
    else if (/\.tsx?$/.test(e.name)) archivos.push(p);
  }
})("src");

const usadas = new Map();   // clave -> archivos donde se usa
for (const f of archivos) {
  if (f.includes("i18n")) continue;
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/\btt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const k = m[1].replace(/\\"/g, '"');
    if (!usadas.has(k)) usadas.set(k, []);
    usadas.get(k).push(f);
  }
}

const filtro = process.argv[2];
const sinTraducir = [];
const identicas = [];
for (const [k, files] of usadas) {
  if (filtro && !files.some((f) => f.includes(filtro))) continue;
  if (!traducidas.has(k)) sinTraducir.push(k);
  else if (traducidas.get(k) === k && /[áéíóúñ¿¡]|\b(el|la|los|las|del|para|con|por|que)\b/i.test(k)) identicas.push(k);
}

console.log("claves tt() en uso:", usadas.size);
console.log("SIN traduccion pt-BR:", sinTraducir.length);
sinTraducir.slice(0, 40).forEach((k) => console.log("   " + k));
if (identicas.length) {
  console.log("\nTRADUCIDAS IGUAL QUE EL ORIGINAL (revisar):", identicas.length);
  identicas.slice(0, 20).forEach((k) => console.log("   " + k));
}
