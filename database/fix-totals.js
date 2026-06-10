require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
const fs = require('fs');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'mct_bms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });
  await client.connect();
  
  let raw = fs.readFileSync('access-schema.json', 'utf8');
  if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
  const data = JSON.parse(raw);

  // Map of invoice ID to total sales
  const invoiceTotals = {};
  data['MCT-Invoice'].rows.forEach(r => invoiceTotals[`inv-mct-${r.ID}`] = { total: r['Total Sales'], damageA: r.Damage_A, damageB: r.Damage_B, comm: r.Commission });
  data['MCT-Invoice Manual'].rows.forEach(r => invoiceTotals[`inv-mct_man-${r.ID}`] = { total: r['Total Sales'], damageA: r.Damage, damageB: 0, comm: r.Commission });
  data['CTG-Invoice'].rows.forEach(r => invoiceTotals[`inv-ctg-${r.ID}`] = { total: r.Subtotal, damageA: 0, damageB: 0, comm: 0 });

  // Get invoices with NO items
  const res = await client.query(`
    SELECT i.id, i.legacy_id, i.invoice_number 
    FROM invoices i 
    LEFT JOIN invoice_items ii ON ii.invoice_id = i.id 
    WHERE ii.id IS NULL
  `);

  console.log(`Found ${res.rows.length} invoices with NO items.`);

  let insertedCount = 0;
  for (const row of res.rows) {
    const legacyData = invoiceTotals[row.legacy_id];
    if (legacyData && legacyData.total > 0) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_name, line_total, damage_a, damage_b, commission, legacy_id)
         VALUES ($1, 'Legacy Summary', $2, $3, $4, $5, $6)`,
        [row.id, legacyData.total || 0, legacyData.damageA || 0, legacyData.damageB || 0, legacyData.comm || 0, `dummy-${row.legacy_id}`]
      );
      insertedCount++;
    }
  }

  console.log(`✅ Inserted ${insertedCount} dummy summary items to fix totals.`);
  await client.end();
}
run();
