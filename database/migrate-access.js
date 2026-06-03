#!/usr/bin/env node
/**
 * MCT BMS — Access Database Migration Script
 * 
 * Migrates data from the legacy MCT-Run.accdb (MS Access) database
 * to PostgreSQL. Uses node-adodb which requires the Microsoft Access
 * Database Engine (32-bit ODBC driver) to be installed on Windows.
 *
 * Prerequisites:
 *   1. Install Microsoft Access Database Engine:
 *      https://www.microsoft.com/en-us/download/details.aspx?id=54920
 *   2. npm install node-adodb pg dotenv
 *   3. Copy .env.example to .env and fill in DB credentials
 *
 * Usage:
 *   node migrate-access.js [--dry-run]
 *
 * The --dry-run flag reads from Access and reports counts without inserting.
 */

const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const ACCESS_FILE = path.resolve(__dirname, '../../../MCT-Run.accdb');

async function loadAdodb() {
  try {
    return require('node-adodb');
  } catch {
    console.error('❌ node-adodb not installed. Run: npm install node-adodb');
    process.exit(1);
  }
}

async function run() {
  console.log('\n📦 MCT Access → PostgreSQL Migration');
  console.log('════════════════════════════════════');
  if (DRY_RUN) console.log('⚠️  DRY RUN mode — no data will be inserted\n');

  const ADODB = await loadAdodb();
  const connection = ADODB.open(
    `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${ACCESS_FILE};Persist Security Info=False;`
  );

  const pg = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'mct_bms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  if (!DRY_RUN) await pg.connect();

  const report = { tables: [], errors: [] };

  // ─── Helper: migrate a table ──────────────────────────────────────────────

  async function migrateTable(accessQuery, tableName, transform, insertFn) {
    console.log(`\n🔄 Migrating: ${tableName}`);
    try {
      const rows = await connection.query(accessQuery);
      console.log(`   Found ${rows.length} rows in Access`);

      if (DRY_RUN) {
        report.tables.push({ table: tableName, count: rows.length });
        return;
      }

      let inserted = 0;
      let skipped = 0;
      for (const row of rows) {
        try {
          const transformed = transform(row);
          if (transformed) {
            await insertFn(pg, transformed);
            inserted++;
          } else {
            skipped++;
          }
        } catch (err) {
          skipped++;
          if (report.errors.length < 20) {
            report.errors.push({ table: tableName, error: err.message, row: JSON.stringify(row).slice(0, 100) });
          }
        }
      }
      report.tables.push({ table: tableName, count: rows.length, inserted, skipped });
      console.log(`   ✅ Inserted: ${inserted}, Skipped: ${skipped}`);
    } catch (err) {
      console.error(`   ❌ Failed to migrate ${tableName}:`, err.message);
      report.tables.push({ table: tableName, error: err.message });
    }
  }

  // ─── First: create a system admin user placeholder for created_by fields ──

  let systemUserId;
  if (!DRY_RUN) {
    const { rows } = await pg.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
    systemUserId = rows[0]?.id;
    if (!systemUserId) {
      console.warn('⚠️  No admin user found in PostgreSQL. Run migration seed first.');
      process.exit(1);
    }
  }

  // ─── Contacts / Dealers ───────────────────────────────────────────────────
  // Adjust the Access query to match your actual table/field names

  await migrateTable(
    `SELECT * FROM [Sub-Dealer]`,
    'contacts (sub_dealers)',
    (row) => ({
      type: 'sub_dealer',
      name: row['DealerName'] || row['Name'] || 'Unknown',
      phone: row['Phone'] || row['Mobile'] || null,
      address: row['Address'] || null,
      area: row['Area'] || row['Zone'] || null,
      outstanding_balance: parseFloat(row['DueAmount'] || row['Balance'] || 0) || 0,
    }),
    async (client, r) => {
      await client.query(
        `INSERT INTO contacts (type, name, phone, address, area, outstanding_balance, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [r.type, r.name, r.phone, r.address, r.area, r.outstanding_balance, systemUserId]
      );
    }
  );

  await migrateTable(
    `SELECT * FROM [Retailer]`,
    'contacts (retailers)',
    (row) => ({
      type: 'retailer',
      name: row['RetailerName'] || row['Name'] || 'Unknown',
      phone: row['Phone'] || row['Mobile'] || null,
      address: row['Address'] || null,
      area: row['Area'] || null,
      outstanding_balance: parseFloat(row['DueAmount'] || row['Balance'] || 0) || 0,
    }),
    async (client, r) => {
      await client.query(
        `INSERT INTO contacts (type, name, phone, address, area, outstanding_balance, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [r.type, r.name, r.phone, r.address, r.area, r.outstanding_balance, systemUserId]
      );
    }
  );

  // ─── Broadband Subscribers ────────────────────────────────────────────────
  await migrateTable(
    `SELECT * FROM [Subscriber]`,
    'subscribers',
    (row) => ({
      name: row['SubscriberName'] || row['Name'] || 'Unknown',
      phone: row['Phone'] || row['Mobile'] || null,
      address: row['Address'] || row['SubscriberAddress'] || 'Unknown',
      area_group: row['Group'] || row['Location'] || null,
      status: (row['Status'] || '').toLowerCase() === 'active' ? 'active' : 'inactive',
      monthly_bill: parseFloat(row['MonthlyBill'] || row['Bill'] || 0) || 0,
      running_balance: parseFloat(row['RunningBill'] || row['Balance'] || 0) || 0,
    }),
    async (client, r) => {
      await client.query(
        `INSERT INTO subscribers (name, phone, address, area_group, status, monthly_bill, running_balance, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [r.name, r.phone, r.address, r.area_group, r.status, r.monthly_bill, r.running_balance, systemUserId]
      );
    }
  );

  // ─── Cashbook Entries ─────────────────────────────────────────────────────
  await migrateTable(
    `SELECT * FROM [Cashbook]`,
    'cashbook_entries',
    (row) => {
      const entryDate = row['Date'] || row['EntryDate'];
      if (!entryDate) return null;
      return {
        entry_date: new Date(entryDate).toISOString().split('T')[0],
        today_income: parseFloat(row['TodayIncome'] || row['Income'] || 0) || 0,
        today_expense: parseFloat(row['TodayExpense'] || row['Expense'] || 0) || 0,
        today_due: parseFloat(row['TodayDue'] || row['Due'] || 0) || 0,
        previous_cash: parseFloat(row['PreviousCash'] || row['PrevCash'] || 0) || 0,
        notes: row['Notes'] || row['Remarks'] || null,
      };
    },
    async (client, r) => {
      await client.query(
        `INSERT INTO cashbook_entries (entry_date, today_income, today_expense, today_due, previous_cash, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (entry_date) DO NOTHING`,
        [r.entry_date, r.today_income, r.today_expense, r.today_due, r.previous_cash, r.notes, systemUserId]
      );
    }
  );

  // ─── Final Report ─────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════');
  console.log('📊 Migration Report');
  console.log('════════════════════════════════════');
  for (const t of report.tables) {
    if (t.error) {
      console.log(`❌ ${t.table}: ERROR — ${t.error}`);
    } else if (DRY_RUN) {
      console.log(`📋 ${t.table}: ${t.count} rows found (dry run)`);
    } else {
      console.log(`✅ ${t.table}: ${t.inserted}/${t.count} inserted, ${t.skipped} skipped`);
    }
  }

  if (report.errors.length > 0) {
    console.log('\n⚠️  Sample errors (first 20):');
    for (const e of report.errors) {
      console.log(`   [${e.table}] ${e.error} | Row: ${e.row}`);
    }
  }

  if (!DRY_RUN) await pg.end();
  console.log('\n🎉 Migration complete!\n');
}

run().catch((err) => {
  console.error('\n❌ Fatal migration error:', err.message);
  process.exit(1);
});
