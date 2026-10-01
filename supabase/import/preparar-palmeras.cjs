// Limpia y clasifica el diario de Palmeras para importarlo.
//
// Convencion de signos del Excel, deducida de los datos (no estaba escrita):
// positivo = plata que ENTRA (la clienta compra), negativo = plata que SALE
// (le pagamos a la clienta las prendas que trajo). TARJETA nunca es negativa,
// porque a un proveedor no se le paga con tarjeta. Los 234 "TRANSF negativos"
// que parecian un error son exactamente eso: transferencias de salida, y los
// 631 de EFECTIVO tambien.
const XLSX = require("C:/Users/Neura/Neura/pronim-erp/node_modules/xlsx");
const fs = require("fs");
const path = require("path");

const F = "C:/Users/Neura/AppData/Local/Packages/5319275A.WhatsAppDesktop_cv1g1gvanyjgm/LocalState/sessions/D9C12B328A073E2B742569128C5B11A6732BB30F/transfers/2026-40/document-1790876393099.vnd.openxmlformats-officedocument.spreadsheetml.sheet.xlsx";
const OUT = process.argv[2] || ".";

const rows = XLSX.utils.sheet_to_json(
  XLSX.readFile(F, { cellDates: true, raw: true }).Sheets["YO CRECI DIARIO"],
  { header: 1, defval: null, blankrows: false },
);
const body = rows.slice(1);

// Guaranies: no hay centavos. 18 filas traen decimales (promedios mal pegados
// en el Excel); se redondean.
const gs = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : 0);
const ent = (v) => (v > 0 ? v : 0);   // parte que entra
const sal = (v) => (v < 0 ? -v : 0);  // parte que sale, en positivo

// Las fechas vienen de dos formas: texto "14/04/2025" (3.077 filas) y Date
// (13.907). Las Date llegan como 03:00:40Z, que es la medianoche local de
// Asuncion: hay que leerlas en UTC o se corren un dia para atras.
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

// Clave para agrupar al mismo cliente escrito distinto. Es SOLO para agrupar:
// el nombre que se guarda es el original, tal cual lo escribio ella.
const clave = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

// Telefono paraguayo: 9 digitos empezando en 9. El Excel trae de todo.
function tel(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (s === "" || s === "-") return null;
  s = s.replace(/\D/g, "");
  if (s.startsWith("595")) s = s.slice(3);
  if (s.length === 10 && s.startsWith("0")) s = s.slice(1);
  return /^9\d{8}$/.test(s) ? s : null;
}

// Filas que no son una persona: compras de fardo y movimientos con Lillo.
const RE_NO_CLIENTE = /\b(fardo|estoque|stock|transferencia|egreso)\b|ingreso de lillo|ingreso lillo|de lil+io|de lillo para|a lillo/i;

const out = [];
const avisos = { sinFecha: 0, sinCliente: 0, telInvalido: 0, decimales: 0, clienteNumerico: 0 };

body.forEach((r, i) => {
  const f = fecha(r[1]);
  if (!f) avisos.sinFecha++;

  let nombre = String(r[2] ?? "").trim().replace(/\s+/g, " ");
  if (typeof r[2] === "number") { avisos.clienteNumerico++; nombre = ""; }
  if (!nombre) avisos.sinCliente++;

  const telefono = tel(r[3]);
  const telCrudo = String(r[3] ?? "").trim();
  if (telCrudo && telCrudo !== "-" && !telefono) avisos.telInvalido++;
  if ([4, 5, 13].some((c) => typeof r[c] === "number" && r[c] % 1 !== 0)) avisos.decimales++;

  const venta = gs(r[4]), evaluacion = gs(r[5]), devolucion = gs(r[6]);
  const prendas = gs(r[7]), estoque = gs(r[8]);
  const efectivo = gs(r[10]), transf = gs(r[11]), tarjeta = gs(r[12]);
  const credGen = Math.abs(gs(r[13]));   // viene negativo en el Excel
  const credUso = gs(r[14]), descuento = gs(r[15]);

  let tipo;
  if (RE_NO_CLIENTE.test(nombre))          tipo = "ajuste_stock";
  else if (venta > 0)                      tipo = "venta";
  else if (evaluacion > 0)                 tipo = "evaluacion";
  else if (devolucion > 0)                 tipo = "devolucion";
  else if (prendas !== 0 || estoque !== 0) tipo = "ajuste_stock";
  else                                     tipo = "otro";

  out.push({
    fila_excel: i + 2,
    controle: typeof r[0] === "number" ? r[0] : null,
    fecha: f, tipo,
    cliente_nombre: nombre,
    cliente_clave: nombre ? clave(nombre) : "",
    telefono: telefono ?? "",
    venta, evaluacion, devolucion, prendas, estoque,
    efectivo_in: ent(efectivo), efectivo_out: sal(efectivo),
    transf_in: ent(transf),     transf_out: sal(transf),
    tarjeta_in: ent(tarjeta),
    credito_generado: credGen,
    credito_utilizado: credUso,
    descuento,
  });
});

// ── CSV ──────────────────────────────────────────────────────────────────
const cols = Object.keys(out[0]);
const esc = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
fs.writeFileSync(
  path.join(OUT, "palmeras_movimientos.csv"),
  [cols.join(",")].concat(out.map((o) => cols.map((c) => esc(o[c])).join(","))).join("\n"),
  "utf8",
);

// ── Control ──────────────────────────────────────────────────────────────
const S = (f, filtro = () => true) => out.filter(filtro).reduce((a, o) => a + f(o), 0);
const porTipo = {};
out.forEach((o) => { porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1; });

const cli = new Map();
out.forEach((o) => {
  if (!o.cliente_clave || o.tipo === "ajuste_stock") return;
  const c = cli.get(o.cliente_clave) || { nombre: o.cliente_nombre, tel: "", gen: 0, uso: 0 };
  if (!c.tel && o.telefono) c.tel = o.telefono;
  c.gen += o.credito_generado; c.uso += o.credito_utilizado;
  cli.set(o.cliente_clave, c);
});
const saldos = [...cli.values()].map((c) => ({ ...c, saldo: c.gen - c.uso }));
const n = (x) => x.toLocaleString("es-PY");

console.log("FILAS:", out.length, "| POR TIPO:", JSON.stringify(porTipo));
console.log("AVISOS:", JSON.stringify(avisos));
console.log("\nCLIENTES UNICOS:", cli.size, "| con telefono:", saldos.filter((c) => c.tel).length);

console.log("\nVENTAS");
const vendido = S((o) => o.venta);
const cobrado = S((o) => o.efectivo_in + o.transf_in + o.tarjeta_in + o.credito_utilizado + o.descuento);
console.log("  vendido :", n(vendido));
console.log("  cobrado :", n(cobrado), "  (efectivo", n(S((o) => o.efectivo_in)),
  "| transf", n(S((o) => o.transf_in)), "| tarjeta", n(S((o) => o.tarjeta_in)),
  "| credito", n(S((o) => o.credito_utilizado)), "| descuento", n(S((o) => o.descuento)), ")");
console.log("  descuadre:", n(vendido - cobrado),
  "en", out.filter((o) => o.tipo === "venta" && !o.efectivo_in && !o.transf_in && !o.tarjeta_in && !o.credito_utilizado && !o.descuento).length, "ventas sin pago cargado");

console.log("\nCOMPRA DE PRENDAS A CLIENTES (evaluaciones)");
const evaluado = S((o) => o.evaluacion);
const pagadoEv = S((o) => o.efectivo_out + o.transf_out + o.credito_generado);
console.log("  evaluado:", n(evaluado));
console.log("  pagado  :", n(pagadoEv), "  (efectivo", n(S((o) => o.efectivo_out)),
  "| transf", n(S((o) => o.transf_out)), "| credito", n(S((o) => o.credito_generado)), ")");
console.log("  descuadre:", n(evaluado - pagadoEv));

console.log("\nSALDOS DE CREDITO");
console.log("  a favor  :", saldos.filter((c) => c.saldo > 0).length, "=", n(saldos.filter((c) => c.saldo > 0).reduce((a, c) => a + c.saldo, 0)));
console.log("  negativos:", saldos.filter((c) => c.saldo < 0).length, "=", n(saldos.filter((c) => c.saldo < 0).reduce((a, c) => a + c.saldo, 0)));
console.log("  en cero  :", saldos.filter((c) => c.saldo === 0).length);

console.log("\nPRENDAS  entradas:", n(S((o) => (o.prendas > 0 ? o.prendas : 0))),
  "| salidas:", n(S((o) => (o.prendas < 0 ? o.prendas : 0))),
  "| EN STOCK:", n(S((o) => o.prendas)));
console.log("VALOR DE STOCK NETO:", n(S((o) => o.estoque)));
