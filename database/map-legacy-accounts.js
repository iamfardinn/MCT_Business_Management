const { Client } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const ACCOUNTS = {
  CASH: '10000000-0000-0000-0000-000000000002',
  AR: '10000000-0000-0000-0000-000000000004',
  SALES: '40000000-0000-0000-0000-000000000001',
  EXPENSE: '50000000-0000-0000-0000-000000000006'
};

async function mapLegacyTransactions() {
  const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mct_bms',
    password: process.env.DB_PASSWORD || '123456',
    port: parseInt(process.env.DB_PORT || '5432', 10),
  });

  try {
    await client.connect();
    console.log('✅ Connected to DB');

    await client.query('BEGIN');

    // 1. Income (Cash Sales) -> Dr: Cash, Cr: Sales Revenue
    const incomeRes = await client.query(`
      UPDATE cashbook_transactions 
      SET debit_account_id = $1, credit_account_id = $2 
      WHERE type = 'income' AND debit_account_id IS NULL
    `, [ACCOUNTS.CASH, ACCOUNTS.SALES]);
    console.log(`Mapped ${incomeRes.rowCount} 'income' transactions`);

    // 2. Expense -> Dr: General Expense, Cr: Cash
    const expenseRes = await client.query(`
      UPDATE cashbook_transactions 
      SET debit_account_id = $1, credit_account_id = $2 
      WHERE type = 'expense' AND debit_account_id IS NULL
    `, [ACCOUNTS.EXPENSE, ACCOUNTS.CASH]);
    console.log(`Mapped ${expenseRes.rowCount} 'expense' transactions`);

    // 3. Due (Credit Sales) -> Dr: Accounts Receivable, Cr: Sales Revenue
    const dueRes = await client.query(`
      UPDATE cashbook_transactions 
      SET debit_account_id = $1, credit_account_id = $2 
      WHERE type = 'due' AND debit_account_id IS NULL
    `, [ACCOUNTS.AR, ACCOUNTS.SALES]);
    console.log(`Mapped ${dueRes.rowCount} 'due' transactions`);

    // 4. Default for any manual/unmapped that are somehow blank -> Dr Cash, Cr Sales
    // We shouldn't force this if they are manual daybook double entries, 
    // but the system hasn't been used yet so manual is likely 0.
    
    await client.query('COMMIT');
    console.log('✅ Legacy transaction mapping complete.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during mapping:', err);
  } finally {
    await client.end();
  }
}

mapLegacyTransactions();
