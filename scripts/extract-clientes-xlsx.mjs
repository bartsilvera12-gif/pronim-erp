import XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/Neura/Downloads/YO CRECI DIARIO PALMERAS 2025 (11-02) (1).xlsx");
const ws = wb.Sheets["YO CRECI DIARIO"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

// Headers en row 2:
// [null,"Fecha","Cliente","Telefono","Tarjeta VIP","Sexo","Venta","Evaluacion","Cambio","Forma de PG","Qtde","Cod","Estoque","Med","Med2","Marg","Qtde3","Estoque final","dato","ZERO","EFECTIVO","TRANSF","TARJETA","CAMBIO","CREDITOS","DESC",null,"OTROS CAJA","OTROS"]
const iFecha = 1, iCliente = 2, iTelefono = 3, iTarjetaVip = 4, iSexo = 5,
      iVenta = 6, iEvaluacion = 7, iCambio = 8, iFormaPg = 9,
      iCreditos = 24;

// Normalizar nombre: trim, collapse spaces, title-case
function normNombre(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().replace(/\s+/g, " ");
}
function normTel(t) {
  if (t == null) return "";
  const s = String(t).replace(/[^\d]/g, "");
  if (!s || s === "-") return "";
  return s;
}
function num(x) {
  if (x == null || x === "" || x === "-") return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// Filas para excluir (headers, stock, fardos, etc.)
const EXCLUIR = new Set([
  "", "estoque", "estoque lillo", "fardo 1", "fardo 2", "fardo 3", "fardo 4",
  "cliente", "-", "tassi", "regalos", "no sabemos"
]);

// Agrupar por (nombre) — teléfono como tiebreaker
const clientes = new Map(); // key = nombre normalizado lowercase; value = agregado
let totalFilas = 0, filasIgnoradas = 0;

for (let i = 3; i < rows.length; i++) {
  const r = rows[i];
  if (!r) { filasIgnoradas++; continue; }
  const nombre = normNombre(r[iCliente]);
  if (!nombre) { filasIgnoradas++; continue; }
  const nombreKey = nombre.toLowerCase();
  if (EXCLUIR.has(nombreKey)) { filasIgnoradas++; continue; }
  // Ignorar filas que empiezan con "estoque" (son movimientos de stock)
  if (nombreKey.startsWith("estoque")) { filasIgnoradas++; continue; }
  if (nombreKey.startsWith("fardo")) { filasIgnoradas++; continue; }

  totalFilas++;
  const telefono = normTel(r[iTelefono]);
  const vip = r[iTarjetaVip];
  const sexo = r[iSexo];
  const venta = num(r[iVenta]);
  const evaluacion = num(r[iEvaluacion]);
  const cambio = num(r[iCambio]);
  const formaPg = String(r[iFormaPg] ?? "").toLowerCase();
  const creditoCol = num(r[iCreditos]);

  const acc = clientes.get(nombreKey) ?? {
    nombre, telefonos: new Set(), sexos: new Set(), vips: new Set(),
    total_ventas: 0, total_evaluaciones: 0, total_cambios: 0,
    total_creditos_col: 0, ops: 0,
    primera_visita: null, ultima_visita: null,
  };
  acc.ops++;
  if (telefono) acc.telefonos.add(telefono);
  if (sexo && sexo !== "-") acc.sexos.add(sexo);
  if (vip && vip !== "-") acc.vips.add(String(vip));
  acc.total_ventas += venta;
  acc.total_evaluaciones += evaluacion;
  acc.total_cambios += cambio;
  acc.total_creditos_col += creditoCol;
  const fecha = r[iFecha];
  if (fecha) {
    if (!acc.primera_visita || String(fecha) < String(acc.primera_visita)) acc.primera_visita = fecha;
    if (!acc.ultima_visita || String(fecha) > String(acc.ultima_visita)) acc.ultima_visita = fecha;
  }
  clientes.set(nombreKey, acc);
}

// Resumen
const arr = [...clientes.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
console.log(`\nTotal filas procesadas: ${totalFilas}`);
console.log(`Filas ignoradas: ${filasIgnoradas}`);
console.log(`Clientes únicos: ${arr.length}`);
console.log(`\nPrimeros 15:`);
for (const c of arr.slice(0, 15)) {
  console.log(`  ${c.nombre.padEnd(30)} · tel=${[...c.telefonos][0] ?? "-"} · sexo=${[...c.sexos][0] ?? "-"} · vip=${[...c.vips][0] ?? "-"} · ops=${c.ops} · ventas=${c.total_ventas} · evals=${c.total_evaluaciones} · cambios=${c.total_cambios} · creditos_col=${c.total_creditos_col}`);
}
console.log(`\nCon crédito (evaluaciones > 0):`);
const conCredito = arr.filter(c => c.total_evaluaciones > 0);
console.log(`  ${conCredito.length} clientes con evaluaciones > 0`);
console.log(`  Suma total evaluaciones: ${conCredito.reduce((s,c) => s + c.total_evaluaciones, 0).toLocaleString("es-PY")}`);

// Guardar como JSON para revisión
import fs from "fs";
const out = arr.map(c => ({
  nombre: c.nombre,
  telefono: [...c.telefonos][0] ?? null,
  telefonos_alt: [...c.telefonos].slice(1),
  sexo: [...c.sexos][0] ?? null,
  vip: [...c.vips][0] ?? null,
  ops: c.ops,
  total_ventas: c.total_ventas,
  total_evaluaciones: c.total_evaluaciones,
  total_cambios: c.total_cambios,
  total_creditos_col: c.total_creditos_col,
  primera_visita: c.primera_visita,
  ultima_visita: c.ultima_visita,
}));
fs.writeFileSync("scripts/clientes-extract.json", JSON.stringify(out, null, 2));
console.log(`\nGuardado en scripts/clientes-extract.json`);
