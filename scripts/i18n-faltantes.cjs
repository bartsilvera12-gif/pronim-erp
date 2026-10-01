// Cuenta los textos que el usuario ve y que NO pasan por el traductor.
//
// No es exacto: no hay forma barata de saber si un string es visible sin
// parsear el JSX de verdad. Pero es consistente, asi que sirve para comparar
// antes y despues, que es lo que importa.
const fs = require("fs");
const path = require("path");

const RAIZ = "src";
const EXT = new Set([".tsx", ".ts"]);
// Carpetas que el usuario final no ve.
const IGNORAR = /[\\/](api|lib[\\/]supabase|lib[\\/]middleware)[\\/]/;

const archivos = [];
(function caminar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) caminar(p);
    else if (EXT.has(path.extname(e.name))) archivos.push(p);
  }
})(RAIZ);

// Acentos, signos invertidos o palabras que en portugues se escriben distinto.
const ES = /[áéíóúñ¿¡]|\b(el|la|los|las|del|para|con|sin|por|que|cliente|venta|compra|caja|sucursal|monto|fecha|guardar|cancelar|agregar|buscar|cargando|nuevo|nueva|todos|todas|desde|hasta)\b/i;
// Lo que no es texto para leer: clases, rutas, claves, formatos.
const NO_TEXTO = /^[\s\d\W]*$|^[a-z0-9_.-]+$|[\\/]|^#|^\w+:\w|className|^[A-Z_]+$|^\d{4}-/;

let total = 0;
const porArchivo = [];

for (const f of archivos) {
  if (IGNORAR.test(f)) continue;
  let s = fs.readFileSync(f, "utf8");

  // Lo que ya pasa por el traductor se borra antes de contar.
  s = s.replace(/\b(tt|t)\(\s*"(?:[^"\\]|\\.)*"/g, "TRADUCIDO(");
  s = s.replace(/\b(tt|t)\(\s*'(?:[^'\\]|\\.)*'/g, "TRADUCIDO(");

  const hallazgos = new Set();

  // 1) Texto suelto dentro del JSX: >Hola mundo<
  for (const m of s.matchAll(/>([^<>{}\n]{3,80})</g)) {
    const txt = m[1].trim();
    if (txt && ES.test(txt) && !NO_TEXTO.test(txt)) hallazgos.add(txt);
  }
  // 2) Props que se leen en pantalla.
  const PROPS = /\b(label|placeholder|title|description|subtitle|eyebrow|tip|alt|texto|mensaje|nombre)\s*=\s*"([^"]{3,80})"/g;
  for (const m of s.matchAll(PROPS)) {
    const txt = m[2].trim();
    if (txt && ES.test(txt) && !NO_TEXTO.test(txt)) hallazgos.add(txt);
  }
  // 3) Lo mismo pero como propiedad de objeto: label: "..."
  for (const m of s.matchAll(/\b(label|titulo|descripcion|subtitulo|placeholder|tip)\s*:\s*"([^"]{3,80})"/g)) {
    const txt = m[2].trim();
    if (txt && ES.test(txt) && !NO_TEXTO.test(txt)) hallazgos.add(txt);
  }

  if (hallazgos.size) {
    total += hallazgos.size;
    porArchivo.push([f, hallazgos.size, [...hallazgos]]);
  }
}

porArchivo.sort((a, b) => b[1] - a[1]);
console.log("TEXTOS SIN TRADUCIR (estimado):", total, "en", porArchivo.length, "archivos\n");
console.log("LOS 25 PEORES:");
for (const [f, n] of porArchivo.slice(0, 25)) console.log(`  ${String(n).padStart(4)}  ${f}`);

if (process.argv[2] === "--detalle") {
  const filtro = process.argv[3];
  console.log("\nDETALLE:");
  for (const [f, n, lista] of porArchivo) {
    if (filtro && !f.includes(filtro)) continue;
    console.log(`\n── ${f} (${n})`);
    lista.slice(0, 40).forEach((x) => console.log("   " + x));
  }
}
