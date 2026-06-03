require('dotenv').config({ path: '../backend/.env' });
const fs = require('fs');
const { Client } = require('pg');

async function run() {
  console.log('🚀 Starting Data Migration from Access to PostgreSQL...');
  
  let raw = fs.readFileSync('access-schema.json', 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const data = JSON.parse(raw);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mct_bms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  await client.connect();

  // First change legacy_id to VARCHAR(100) everywhere
  const tables = ['categories', 'user_groups', 'sub_groups', 'locations', 'broadband_packages', 'reference_lists', 'products', 'cashbook_transactions', 'broadband_payments', 'contacts', 'subscribers', 'invoices', 'invoice_items', 'expenses', 'cashbook_entries'];
  for (const t of tables) {
    await client.query(`ALTER TABLE ${t} ALTER COLUMN legacy_id TYPE VARCHAR(100)`);
  }
  console.log('✅ Updated legacy_id columns to VARCHAR(100)');

  // Get Admin User ID for created_by fields
  const userRes = await client.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  if (!userRes.rows.length) throw new Error("Admin user not found. Run seed first.");
  const adminId = userRes.rows[0].id;

  // Helper to run batch inserts
  async function batchInsert(tableName, columns, rows, mapRow) {
    if (!rows || rows.length === 0) return;
    
    const CHUNK_SIZE = 1000;
    let totalInserted = 0;
    
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      
      const values = [];
      const placeholders = [];
      let paramIdx = 1;
      
      for (const row of chunk) {
        const mapped = mapRow(row);
        const rowPlaceholders = [];
        for (const val of mapped) {
          values.push(val);
          rowPlaceholders.push(`$${paramIdx++}`);
        }
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
      }
      
      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`;
      try {
        await client.query(query, values);
        totalInserted += chunk.length;
      } catch(e) {
        console.error(`Error inserting into ${tableName}:`, e.message);
        throw e;
      }
    }
    console.log(`✅ ${tableName}: inserted ${totalInserted} rows`);
  }

  try {
    // --- 1. CONFIG TABLES ---
    await batchInsert('categories', ['name', 'type', 'legacy_id'], data['Table-Category'].rows, r => [
      r.Category, r.Type, `cat-${r.ID}`
    ]);
    await batchInsert('user_groups', ['name', 'type', 'legacy_id'], data['Table-Group'].rows, r => [
      r['Group Name'], r.Type, `grp-${r.ID}`
    ]);
    await batchInsert('sub_groups', ['name', 'type', 'reference', 'legacy_id'], data['Table-SubGroup'].rows, r => [
      r.SubGroup, r.Type, r.Ref, `subgrp-${r.ID}`
    ]);
    await batchInsert('locations', ['name', 'group_name', 'legacy_id'], data['MTB-Location'].rows, r => [
      r.Location, r.Group, `loc-${r.ID}`
    ]);
    await batchInsert('broadband_packages', ['package_to', 'name', 'monthly_fee', 'legacy_id'], data['Table-Package'].rows, r => [
      r['Package To'], r['Package Name'], r['Monthly Fee'] || 0, `pkg-${r.ID}`
    ]);
    await batchInsert('reference_lists', ['reference_by', 'group_name', 'type', 'legacy_id'], data['Table-Reference List'].rows, r => [
      r['Reference By'], r.Group, r.Type, `ref-${r.ID}`
    ]);

    // --- 2. PRODUCTS ---
    await batchInsert('products', [
      'group_name', 'name', 'unit', 'sales_rate', 's_unit', 'p_unit', 'purchase_rate', 'offer', 'offer_rate', 'offer_sales', 'category', 'legacy_id'
    ], data['Table-Product List'].rows, r => [
      r['Group Name'], r['Product Name'], r.Unit, r['Sales Rate'] || 0, r.SUnit || 0, r.PUnit || 0, r['Purchase Rate'] || 0, r.Offer || 0, r.Offer_Rate || 0, r.Offer_Sales || 0, r.Category, `prod-${r.ID}`
    ]);

    // --- 3. CONTACTS ---
    const mapContactType = (str) => {
      if (!str) return 'retailer';
      const s = str.toLowerCase();
      if (s.includes('sub') || s.includes('dealer')) return 'sub_dealer';
      if (s.includes('side') || s.includes('due')) return 'side_market';
      if (s.includes('employee')) return 'employee';
      return 'retailer';
    };
    await batchInsert('contacts', [
      'type', 'name', 'phone', 'address', 'area', 'created_by', 'legacy_id'
    ], data['Table-Contacts'].rows, r => [
      mapContactType(r['Contcts Type']), r.ContactName || 'Unknown', r.MobilePhone, r.Address, r['City/Thana'], adminId, `cnt-${r.ID}`
    ]);

    // --- 4. SUBSCRIBERS ---
    const allSubs = [...data['MTB-Subscriber Clients'].rows.map(r=>({...r,__s:'s1'})), ...data['MTB-Subscriber Clients Update'].rows.map(r=>({...r,__s:'s2'}))];
    await batchInsert('subscribers', [
      'name', 'phone', 'address', 'area_group', 'status', 'monthly_bill', 'running_balance', 'created_by', 'legacy_id'
    ], allSubs, r => [
      r.ContactName || r.Username || 'Unknown', r.MobilePhone, r.Address || '', r.Group, r.Status === 'Active' ? 'active' : 'inactive', r['Running Bill'] || 0, r['Previous Balance'] || 0, adminId, `sub-${r.__s}-${r.ID}`
    ]);

    // --- FETCH MAPS FOR LINKING ---
    const contactMap = {};
    const subMap = {};
    const cRes = await client.query('SELECT id, legacy_id FROM contacts WHERE legacy_id IS NOT NULL');
    cRes.rows.forEach(r => contactMap[r.legacy_id] = r.id);
    const sRes = await client.query('SELECT id, legacy_id FROM subscribers WHERE legacy_id IS NOT NULL');
    sRes.rows.forEach(r => subMap[r.legacy_id] = r.id);
    
    // Function to try to find a contact ID by name if legacy ID map fails
    const contactNameMap = {};
    cRes.rows.forEach(r => contactNameMap[r.name] = r.id);

    // Create a fallback contact for invoices with unmatched names
    let fallbackContactId = null;
    const fallbackRes = await client.query("INSERT INTO contacts (type, name, created_by) VALUES ('retailer', 'Legacy Unknown', $1) RETURNING id", [adminId]);
    fallbackContactId = fallbackRes.rows[0].id;

    // --- 5. INVOICES ---
    const mapInvoiceCategory = (str) => {
      if (!str) return 'matador';
      const s = str.toLowerCase();
      if (s.includes('olympic')) return 'olympic';
      if (s.includes('bombay')) return 'bombay';
      if (s.includes('mtb') || s.includes('broadband')) return 'mtb_broadband';
      return 'matador';
    };

    const allInvoices = [
      ...data['MCT-Invoice'].rows.map(r => ({ ...r, __source: 'mct' })),
      ...data['MCT-Invoice Manual'].rows.map(r => ({ ...r, __source: 'mct_man' })),
      ...data['CTG-Invoice'].rows.map(r => ({ ...r, __source: 'ctg' }))
    ];

    await batchInsert('invoices', [
      'invoice_number', 'category', 'status', 'submitted_by', 'created_at', 'legacy_id', 'contact_id', 'notes'
    ], allInvoices, r => {
      const invoiceTo = r['Invoice To'] || r.Invoice_To || 'Unknown';
      const contactId = contactNameMap[invoiceTo] || fallbackContactId;
      return [
        `INV-${r.__source}-${r.ID}`.substring(0, 30), mapInvoiceCategory(r['Invoice Group'] || r.Group), 'approved', adminId, r.Date || new Date(), `inv-${r.__source}-${r.ID}`, contactId, `Legacy Invoice To: ${invoiceTo}`
      ];
    });

    // Fetch invoice map
    const invoiceMap = {};
    const iRes = await client.query('SELECT id, legacy_id FROM invoices WHERE legacy_id IS NOT NULL');
    iRes.rows.forEach(r => invoiceMap[r.legacy_id] = r.id);

    // --- 6. INVOICE ITEMS ---
    const allItems = [
      ...data['Sales-Matador Group'].rows.map(r => ({ ...r, __source: 'mct' })),
      ...data['Sales-Olympic A-Group'].rows.map(r => ({ ...r, __source: 'mct' })),
      ...data['Sales-Olympic B Group'].rows.map(r => ({ ...r, __source: 'mct' })),
      ...data['Sales-Bombay Grroup'].rows.map(r => ({ ...r, __source: 'mct' })),
      ...data['CTG-Invoice Details'].rows.map(r => ({ ...r, __source: 'ctg' }))
    ];

    await batchInsert('invoice_items', [
      'invoice_id', 'product_name', 'line_total', 'free_items', 'legacy_id'
    ], allItems.filter(r => invoiceMap[`inv-${r.__source}-${r['Invoice ID']}`]), r => [
      invoiceMap[`inv-${r.__source}-${r['Invoice ID']}`], r['Product Name'] || 'Unknown', r['Line Total'] || 0, r.Free || 0, `itm-${r.__source}-${r.ID || Math.random()}`
    ]);

    // --- 7. CASHBOOK & EXPENSES ---
    await batchInsert('cashbook_entries', [
      'entry_date', 'today_income', 'today_expense', 'today_due', 'previous_cash', 'notes', 'created_by', 'legacy_id'
    ], data['Cashbook Date'].rows, r => [
      r['Cashbook Date'], r['Today Income'] || 0, r['Today Expense'] || 0, r['Today Due'] || 0, r['Previous Cash'] || 0, r.Remarks, adminId, `cb-${r.ID}`
    ]);

    await batchInsert('expenses', [
      'category', 'amount', 'description', 'expense_date', 'status', 'submitted_by', 'legacy_id'
    ], data['CB-Expense Transaction'].rows, r => [
      'other', Math.abs(r.Ammounts || 0), r.Note || r.SubGroup || 'Expense', r.Date || new Date(), 'approved', adminId, `exp-${r.ID}`
    ]);

    const allCbTrans = [
      ...data['CB-Income Transaction'].rows.map(r => ({ ...r, __t: 'income' })),
      ...data['CB-Due Transaction'].rows.map(r => ({ ...r, __t: 'due' }))
    ];
    await batchInsert('cashbook_transactions', [
      'transaction_date', 'type', 'group_name', 'sub_group', 'contact_name', 'debit', 'amount', 'actual_amount', 'note', 'collected_by', 'legacy_id'
    ], allCbTrans, r => [
      r.Date || new Date(), r.__t, r.Group, r.SubGroup, r['Contact Name'], r.Debit, r.Ammounts || 0, r.Acctual || 0, r.Note, r['Collect By'] || r['Due By'], `cbtr-${r.__t}-${r.ID || Math.random()}`
    ]);

    // --- 8. BROADBAND PAYMENTS ---
    await batchInsert('broadband_payments', [
      'month_name', 'group_name', 'monthly_charge', 'client_name', 'address', 'pay_date', 'running_bill', 'payment_amount', 'total_balance', 'status', 'comments', 'legacy_id'
    ], data['MTB-Transactions'].rows, r => [
      r.MonthName, r.Group, r['Monthly Charge'] || 0, r.ClientsName, r.Address, r.Pay_Date || new Date(), r['Running Bill'] || 0, r.Payments || 0, r.TotalBalance || 0, r.Status, r.Comments, `mtbp-${r.ID}`
    ]);

  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}
run();
