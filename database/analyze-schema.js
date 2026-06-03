const fs = require('fs');
let raw = fs.readFileSync('A:/MTB/mct-bms/database/access-schema.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) {
  raw = raw.slice(1);
}
const data = JSON.parse(raw);

for (const [tableName, tableData] of Object.entries(data)) {
  if (tableData.error) {
    console.log(`[${tableName}] ERROR: ${tableData.error}`);
    continue;
  }
  const cols = tableData.columns.map(c => c.name).join(', ');
  console.log(`[${tableName}] (${tableData.rowCount} rows)`);
  console.log(`  Cols: ${cols}`);
  if (tableData.rows.length > 0) {
    console.log(`  Sample: ${JSON.stringify(tableData.rows[0]).substring(0, 150)}...`);
  }
  console.log();
}
