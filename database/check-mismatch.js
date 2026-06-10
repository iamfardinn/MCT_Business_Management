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
  
  // 1. Check if some invoice 'To' names exist in contacts
  const res = await client.query("SELECT count(id) as c FROM contacts WHERE name LIKE '%Hafizur%'");
  console.log('Matches for Hafizur in contacts:', res.rows[0].c);
  
  // 2. Count total invoices mapped to legacy unknown
  const cntRes = await client.query("SELECT count(id) as c FROM invoices WHERE contact_id = (SELECT id FROM contacts WHERE name = 'Legacy Unknown')");
  console.log('Total invoices mapped to Legacy Unknown:', cntRes.rows[0].c);
  
  await client.end();
}
run();
