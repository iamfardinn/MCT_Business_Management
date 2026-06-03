const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'localhost', port: 5432, database: 'mct_bms', user: 'postgres', password: 'Fardin@YES3669'
  });
  await client.connect();
  
  // 1. Check if some invoice 'To' names exist in contacts
  const res = await client.query("SELECT count(id) as c FROM contacts WHERE name LIKE '%Hafizur%'");
  console.log('Matches for Hafizur in contacts:', res.rows[0].c);
  
  // 2. Count total invoices mapped to legacy unknown
  const cntRes = await client.query("SELECT count(id) as c FROM invoices WHERE contact_id = (SELECT id FROM contacts WHERE name = 'Legacy Unknown')");
  console.log('Total invoices mapped to Legacy Unknown:', cntRes.rows[0].c);
  
  await client.end();
}
run();
