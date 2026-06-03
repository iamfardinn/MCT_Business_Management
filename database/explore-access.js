/**
 * MCT Access DB Explorer
 * Lists ALL tables and their columns + row counts from MCT-Run.accdb
 */
const ADODB = require('node-adodb');
const path  = require('path');

const ACCESS_FILE = path.resolve(__dirname, '../../MCT-Run.accdb');
const conn = ADODB.open(
  `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${ACCESS_FILE};Persist Security Info=False;`
);

// System tables to skip
const SKIP = new Set([
  'MSysObjects','MSysACEs','MSysQueries','MSysRelationships',
  'MSysAccessObjects','MSysAccessXML','MSysNameMap',
  'MSysNavPaneGroupCategories','MSysNavPaneGroups',
  'MSysNavPaneGroupToObjects','MSysNavPaneObjectIDs',
  'MSysComplexColumns','MSysResources',
  'Paste Errors','~TMPCLP','~sq_',
]);

async function run() {
  console.log('🔍 Discovering tables in MCT-Run.accdb...\n');

  // Get all user tables via schema query
  let tables;
  try {
    tables = await conn.schema(20); // 20 = adSchemaTables
  } catch (e) {
    console.error('❌ Could not open Access file:', e.message);
    console.error('   Make sure Microsoft Access Database Engine is installed.');
    console.error('   Download: https://www.microsoft.com/en-us/download/details.aspx?id=54920');
    process.exit(1);
  }

  const userTables = tables.filter(t =>
    t.TABLE_TYPE === 'TABLE' && !SKIP.has(t.TABLE_NAME) && !t.TABLE_NAME.startsWith('~')
  );

  console.log(`Found ${userTables.length} tables:\n`);

  for (const t of userTables) {
    const name = t.TABLE_NAME;
    try {
      // Get columns
      const cols = await conn.schema(4, [null, null, name]); // adSchemaColumns
      const colNames = cols.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE_NAME || c.DATA_TYPE})`).join(', ');

      // Get row count
      const rows = await conn.query(`SELECT COUNT(*) AS cnt FROM [${name}]`);
      const count = rows[0]?.cnt ?? '?';

      // Get first 3 rows to understand data
      const sample = await conn.query(`SELECT TOP 3 * FROM [${name}]`);

      console.log(`┌─ TABLE: [${name}]  (${count} rows)`);
      console.log(`│  Columns: ${colNames}`);
      if (sample.length) {
        console.log(`│  Sample:`, JSON.stringify(sample[0]));
      }
      console.log(`└─────────────────────────────────────────\n`);
    } catch (e) {
      console.log(`┌─ TABLE: [${name}]  — ERROR: ${e.message}`);
      console.log(`└─────────────────────────────────────────\n`);
    }
  }

  // Also list saved queries (forms/reports reference these)
  console.log('\n📋 SAVED QUERIES:');
  try {
    const queries = await conn.schema(16); // adSchemaViews
    for (const q of queries) {
      console.log(`  - ${q.TABLE_NAME}`);
    }
  } catch (e) {
    console.log('  (could not list queries)');
  }
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
