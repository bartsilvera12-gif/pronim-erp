import XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/Neura/Downloads/YO CRECI DIARIO PALMERAS 2025 (11-02) (1).xlsx");
console.log("SHEETS:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    console.log(i, JSON.stringify(rows[i]));
  }
}
