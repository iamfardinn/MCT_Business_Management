const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'localhost', port: 5432, database: 'mct_bms', user: 'postgres', password: 'Fardin@YES3669'
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
