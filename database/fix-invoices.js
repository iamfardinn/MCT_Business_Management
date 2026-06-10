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
  
  console.log('Fetching contacts...');
  const cRes = await client.query('SELECT id, name FROM contacts');
  const contactNameMap = {};
  cRes.rows.forEach(r => contactNameMap[r.name] = r.id);
  
  console.log('Fetching invoices with Legacy Unknown contact...');
  const invRes = await client.query("SELECT id, notes FROM invoices WHERE notes LIKE 'Legacy Invoice To:%'");
  
  console.log(`Found ${invRes.rows.length} invoices to re-map.`);
  
  let mappedCount = 0;
  for (const inv of invRes.rows) {
    const legacyNameMatch = inv.notes.match(/^Legacy Invoice To: (.*)$/);
    if (legacyNameMatch) {
      const legacyName = legacyNameMatch[1];
      const contactId = contactNameMap[legacyName];
      if (contactId) {
        await client.query("UPDATE invoices SET contact_id = $1 WHERE id = $2", [contactId, inv.id]);
        mappedCount++;
      }
    }
  }
  
  console.log(`✅ Successfully re-mapped ${mappedCount} invoices to real contacts.`);
  
  // Count remaining
  const cntRes = await client.query("SELECT count(id) as c FROM invoices WHERE contact_id = (SELECT id FROM contacts WHERE name = 'Legacy Unknown')");
  console.log('Remaining invoices still mapped to Legacy Unknown (names not found in Contacts table):', cntRes.rows[0].c);

  await client.end();
}
run();
