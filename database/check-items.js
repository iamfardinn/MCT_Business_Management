require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
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
  const res = await client.query("SELECT * FROM invoice_items WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-mct-3984')");
  console.log('Items for INV-mct-3984:');
  console.log(res.rows);
  
  const cntRes = await client.query("SELECT count(*) as c, sum(line_total) as s FROM invoice_items WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-mct-3984')");
  console.log('Count:', cntRes.rows[0].c, 'Sum:', cntRes.rows[0].s);

  await client.end();
}
run();
