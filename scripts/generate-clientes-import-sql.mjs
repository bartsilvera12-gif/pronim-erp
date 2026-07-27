import XLSX from "xlsx";
import fs from "fs";

const wb = XLSX.readFile("C:/Users/Neura/Downloads/YO CRECI DIARIO PALMERAS 2025 (11-02) (1).xlsx");
const ws = wb.Sheets["YO CRECI DIARIO"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const iFecha = 1, iCliente = 2, iTelefono = 3, iTarjetaVip = 4, iSexo = 5,
      iVenta = 6, iEvaluacion = 7, iCambio = 8, iFormaPg = 9;

function normNombre(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().replace(/\s+/g, " ");
}
function sqlStr(s) {
  if (s == null || s === "") return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function num(x) {
  if (x == null || x === "" || x === "-") return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
// Paraguay mobile: 09XX XXX XXX (10 digits total starting with 09)
function normTelPy(t) {
  if (t == null) return "";
  let s = String(t).replace(/\D/g, "");
  if (!s) return "";
  // strip country code 595
  if (s.startsWith("595")) s = s.slice(3);
  // 9 digits starting with 9 → prepend 0
  if (s.length === 9 && s.startsWith("9")) s = "0" + s;
  // 8 digits fixed line? leave as is
  // 10 digits starting with 09 → keep
  return s;
}
function sexoErp(s) {
  // Excel usa M/A/O (Masc/Adulto/Otro?) — mapeo a los que soporta el ERP:
  //   M = masculino, F = femenino, O = otro. A y otros → NULL para no romper.
  if (!s || s === "-") return null;
  const up = String(s).trim().toUpperCase();
  if (up === "M") return "M";
  if (up === "F") return "F";
  return null;
}

const EXCLUIR_PREFIX = ["estoque", "fardo"];
const EXCLUIR_EXACTO = new Set([
  "", "cliente", "-", "regalos", "no sabemos", "tassi",
  "28 de julio", "8 de agosto",
]);

const clientes = new Map();

for (let i = 3; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const nombre = normNombre(r[iCliente]);
  if (!nombre) continue;
  const key = nombre.toLowerCase();
  if (EXCLUIR_EXACTO.has(key)) continue;
  if (EXCLUIR_PREFIX.some(p => key.startsWith(p))) continue;

  const acc = clientes.get(key) ?? {
    nombre, telefonos: new Set(), sexos: new Set(), vips: new Set(),
    total_evaluaciones: 0, ops: 0, ultima_visita: null,
  };
  acc.ops++;
  const tel = normTelPy(r[iTelefono]);
  if (tel) acc.telefonos.add(tel);
  const sexo = sexoErp(r[iSexo]);
  if (sexo) acc.sexos.add(sexo);
  const vip = r[iTarjetaVip];
  if (vip && vip !== "-") acc.vips.add(String(vip).trim());
  acc.total_evaluaciones += num(r[iEvaluacion]);
  const fecha = r[iFecha];
  if (fecha && (!acc.ultima_visita || String(fecha) > String(acc.ultima_visita))) {
    acc.ultima_visita = fecha;
  }
  clientes.set(key, acc);
}

const arr = [...clientes.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
console.log(`Clientes únicos: ${arr.length}`);
console.log(`Con evaluación > 0: ${arr.filter(c => c.total_evaluaciones > 0).length}`);

// ═══════════════════════════════════════════════════════════════════
// SQL generation
// ═══════════════════════════════════════════════════════════════════

const CHUNK = 500; // filas por INSERT
const parts = [];

parts.push(`-- ============================================================
-- Importación de clientes histórico "YO CRECI DIARIO PALMERAS 2025"
-- ${arr.length} clientes únicos · ${arr.filter(c => c.total_evaluaciones > 0).length} con evaluaciones > 0
-- Idempotente: usa ON CONFLICT DO NOTHING sobre (empresa_id, nombre normalizado)
-- Los créditos se cargan como ENTRADA con origen='ajuste_manual' y observación 'Migración histórica'
-- ============================================================

DO $mig$
DECLARE
  v_empresa_id uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM pronimerp.sucursales
  WHERE es_principal = true
  LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No hay sucursal Principal (es_principal=true). Abortando.';
  END IF;

  -- Marcador para skip clientes ya importados
  CREATE TEMP TABLE IF NOT EXISTS tmp_import_clientes (
    nombre_key text PRIMARY KEY,
    cliente_id uuid,
    evaluaciones numeric(14,2)
  ) ON COMMIT DROP;
`);

// Bloque de INSERT clientes
for (let i = 0; i < arr.length; i += CHUNK) {
  const chunk = arr.slice(i, i + CHUNK);
  const values = chunk.map(c => {
    const tel = [...c.telefonos][0] ?? null;
    const vip = [...c.vips][0] ?? null;
    return `(
      v_empresa_id,
      ${sqlStr(c.nombre)},
      ${sqlStr(tel)},
      ${sqlStr(vip)},
      ${sqlStr(c.nombre.toLowerCase())}
    )`;
  }).join(",\n    ");

  parts.push(`
  -- Chunk ${i / CHUNK + 1}: filas ${i + 1}..${Math.min(i + CHUNK, arr.length)}
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      ${values}
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;
`);
}

// Poblar tmp con evaluaciones y matchear clientes existentes que ya estaban
parts.push(`
  -- Traer también clientes preexistentes que matchean por nombre (para poder
  -- registrarles créditos igual). Merge por nombre_key.
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT lower(trim(c.nombre)), c.id, 0
  FROM pronimerp.clientes c
  WHERE c.empresa_id = v_empresa_id
  ON CONFLICT (nombre_key) DO NOTHING;

  -- Setear evaluaciones desde el mapa que sigue
`);

// Update de evaluaciones por chunks
const conCredito = arr.filter(c => c.total_evaluaciones > 0);
for (let i = 0; i < conCredito.length; i += CHUNK) {
  const chunk = conCredito.slice(i, i + CHUNK);
  const values = chunk.map(c => `(${sqlStr(c.nombre.toLowerCase())}, ${Math.round(c.total_evaluaciones)})`).join(",\n    ");
  parts.push(`
  UPDATE tmp_import_clientes t
  SET evaluaciones = v.eval
  FROM (VALUES
    ${values}
  ) AS v(nombre_key, eval)
  WHERE t.nombre_key = v.nombre_key;
`);
}

// Insertar créditos ENTRADA solo para los que tienen eval > 0 Y no tienen ya un movimiento de migración
parts.push(`
  -- Insertar ENTRADA de crédito histórico. Idempotente: skip si ya
  -- existe un movimiento con observaciones LIKE 'Migración histórica Excel%'
  -- para ese cliente (así correr el script 2 veces no duplica).
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_tipo, observaciones, usuario_nombre
  )
  SELECT v_empresa_id, t.cliente_id, 'ENTRADA', t.evaluaciones, 'ajuste_manual',
         'migracion', 'Migración histórica Excel YO CRECI DIARIO PALMERAS 2025',
         'Migración automática'
  FROM tmp_import_clientes t
  WHERE t.evaluaciones > 0
    AND NOT EXISTS (
      SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
      WHERE m.cliente_id = t.cliente_id
        AND m.observaciones LIKE 'Migración histórica Excel%'
    );

  RAISE NOTICE 'Migración completa. Empresa: %', v_empresa_id;
END
$mig$;
`);

const sql = parts.join("\n");
fs.writeFileSync("scripts/clientes-import.sql", sql);
console.log(`\nSQL generado: scripts/clientes-import.sql (${(sql.length / 1024).toFixed(0)} KB)`);
