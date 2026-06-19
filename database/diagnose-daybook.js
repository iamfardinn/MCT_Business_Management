require('dotenv').config({ path: '../backend/.env' });
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mct_bms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });
  await c.connect();

  const ct = await c.query(
    `SELECT type, COUNT(*) AS n, SUM(amount) AS amount, SUM(actual_amount) AS actual,
            SUM(debit_amount) AS debit, SUM(credit_amount) AS credit
     FROM cashbook_transactions GROUP BY type ORDER BY type`
  );
  console.log('=== cashbook_transactions by type ===');
  ct.rows.forEach(r =>
    console.log(` type=${r.type} | rows=${r.n} | amount=${r.amount} | actual=${r.actual} | debit=${r.debit} | credit=${r.credit}`)
  );

  const vt = await c.query(
    `SELECT type, voucher_type, COUNT(*) AS n FROM cashbook_transactions
     GROUP BY type, voucher_type ORDER BY type`
  );
  console.log('\n=== cashbook_transactions: type -> voucher_type ===');
  vt.rows.forEach(r => console.log(` type=${r.type} -> voucher_type=${r.voucher_type} (${r.n})`));

  const ex = await c.query(`SELECT status, COUNT(*) AS n, SUM(amount) AS amt FROM expenses GROUP BY status`);
  console.log('\n=== expenses table by status ===');
  ex.rows.forEach(r => console.log(` status=${r.status} | rows=${r.n} | amt=${r.amt}`));

  // Sample a few expense-type cashbook rows to see their amount columns
  const samp = await c.query(
    `SELECT amount, actual_amount, debit_amount, credit_amount, group_name, sub_group
     FROM cashbook_transactions WHERE type = 'expense' LIMIT 5`
  );
  console.log('\n=== sample expense cashbook rows ===');
  samp.rows.forEach((r, i) => console.log(` [${i}]`, JSON.stringify(r)));

  const et = await c.query(
    `SELECT COUNT(*) AS n, MIN(expense_date) AS mn, MAX(expense_date) AS mx FROM expenses`
  );
  console.log('\n=== expenses table totals ===');
  console.log(` rows=${et.rows[0].n} dates ${et.rows[0].mn} -> ${et.rows[0].mx}`);

  const lg = await c.query(`SELECT COUNT(*) AS n FROM expenses WHERE legacy_id LIKE 'exp-%'`);
  console.log(` with legacy 'exp-' id=${lg.rows[0].n}`);

  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
