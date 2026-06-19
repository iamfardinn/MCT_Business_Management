/**
 * Backfill MISSING expense transactions into cashbook_transactions.
 *
 * Diagnosis: the original migrate-data.js routed Access [CB-Expense Transaction]
 * (15,437 rows) into the `expenses` table, but that batch failed (NOT NULL
 * submitted_by FK / enum constraints), leaving only 1 expense in the DB.
 * As a result the Daybook had almost no CREDIT (money-out) side.
 *
 * This script inserts those expense rows directly into cashbook_transactions
 * as type='expense', fully populating the voucher columns the Daybook reads:
 *   expense -> Payment voucher -> credit_amount (money out).
 *
 * Safe to re-run: uses ON CONFLICT (legacy_id) DO NOTHING.
 *
 * Usage:  node backfill-expenses.js
 */
require('dotenv').config({ path: '../backend/.env' });
const fs = require('fs');
const { Client } = require('pg');

const clean = (val) =>
  val != null ? String(val).replace(/[\r\n\t]+/g, ' ').trim() || null : null;

async function run() {
  let raw = fs.readFileSync('access-schema.json', 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const data = JSON.parse(raw);

  const rows = data['CB-Expense Transaction'].rows;
  console.log(`Found ${rows.length} expense rows in Access schema.`);

  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mct_bms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });
  await c.connect();

  const CHUNK = 500;
  let processed = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const placeholders = [];
    let p = 1;

    for (const r of chunk) {
      // Expense amount is money out -> credit. Use actual when present, else amount.
      const amount = Math.abs(Number(r.Ammounts) || 0);
      const actual = Math.abs(Number(r.Acctual) || 0) || amount;
      const credit = actual || amount;
      const srNo = r['Sr No'] != null ? r['Sr No'] : `${i}-${placeholders.length}`;
      const legacyId = `cbtr-expense-${srNo}`;

      const mapped = [
        r.Date || new Date(),         // transaction_date
        'expense',                     // type
        clean(r.Group),                // group_name
        clean(r.SubGroup),             // sub_group
        clean(r['Contact Name']),      // contact_name
        clean(r.Credit),              // debit (legacy text col; here holds Credit ref)
        amount,                        // amount
        actual,                        // actual_amount
        clean(r.Note),                 // note
        clean(r['Exp By']),            // collected_by
        legacyId,                      // legacy_id
        'Payment',                     // voucher_type
        ('EXP-' + srNo),               // voucher_no
        0,                             // debit_amount
        credit,                        // credit_amount
      ];

      const ph = mapped.map(() => `$${p++}`);
      placeholders.push(`(${ph.join(',')})`);
      values.push(...mapped);
    }

    const sql =
      `INSERT INTO cashbook_transactions
        (transaction_date, type, group_name, sub_group, contact_name, debit,
         amount, actual_amount, note, collected_by, legacy_id,
         voucher_type, voucher_no, debit_amount, credit_amount)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (legacy_id) DO NOTHING`;

    const res = await c.query(sql, values);
    processed += chunk.length;
    process.stdout.write(`\r  processed ${processed}/${rows.length} (last batch inserted ${res.rowCount})`);
  }

  console.log('\nDone inserting.');

  const check = await c.query(
    `SELECT COUNT(*) AS n, SUM(credit_amount) AS cr
     FROM cashbook_transactions WHERE type = 'expense'`
  );
  console.log(`Expense rows in cashbook_transactions now: ${check.rows[0].n}, total credit: ${check.rows[0].cr}`);

  const db = await c.query(
    `SELECT voucher_type, COUNT(*) AS n FROM daybook_entries GROUP BY voucher_type ORDER BY 2 DESC`
  );
  console.log('Daybook by voucher type:');
  db.rows.forEach((r) => console.log(`  ${r.voucher_type} = ${r.n}`));

  await c.end();
}

run().catch((e) => { console.error('ERR', e.message); process.exit(1); });
