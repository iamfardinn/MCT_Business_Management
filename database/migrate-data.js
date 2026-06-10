require('dotenv').config({ path: '../backend/.env' });
const fs = require('fs');
const { Client } = require('pg');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip embedded carriage returns / newlines and trim whitespace.
 * Fixes corruption in fields like Sales-Olympic Group that contain "\r\n".
 */
const clean = (val) =>
  val != null ? String(val).replace(/[\r\n\t]+/g, ' ').trim() || null : null;

/**
 * Map Access expense Group / SubGroup strings to the expense_category ENUM.
 * Previously all expenses were mapped to 'other', losing all category info.
 */
const mapExpenseCategory = (group, subGroup) => {
  const g  = (group    || '').toLowerCase();
  const sg = (subGroup || '').toLowerCase();
  if (g.includes('transport')  || sg.includes('transport') || sg.includes('truck'))   return 'transport_bill';
  if (sg.includes('labor')     || sg.includes('labour')    || sg.includes('loading')) return 'labor_bill';
  if (sg.includes('carry')     || sg.includes('carrying'))                            return 'carrying_cost';
  if (g.includes('sallary')    || g.includes('salary')     || sg.includes('payroll')) return 'employee_payroll';
  if (sg.includes('adjust'))                                                          return 'salary_adjustment';
  if (sg.includes('family'))                                                          return 'withdraw_family';
  if (sg.includes('personal')  || sg.includes('withdraw'))                           return 'personal_withdrawal';
  return 'other';
};

/** Map Access contact type strings to the contact_type ENUM */
const mapContactType = (str) => {
  if (!str) return 'retailer';
  const s = str.toLowerCase();
  if (s.includes('sub') || s.includes('dealer'))  return 'sub_dealer';
  if (s.includes('side') || s.includes('due'))    return 'side_market';
  if (s.includes('employee'))                     return 'employee';
  return 'retailer';
};

/** Map invoice group strings to the invoice_category ENUM */
const mapInvoiceCategory = (str) => {
  if (!str) return 'matador';
  const s = str.toLowerCase();
  if (s.includes('olympic'))                      return 'olympic';
  if (s.includes('bombay'))                       return 'bombay';
  if (s.includes('mtb') || s.includes('broadband')) return 'mtb_broadband';
  return 'matador';
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('🚀 Starting Data Migration from Access to PostgreSQL...');

  let raw = fs.readFileSync('access-schema.json', 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
  const data = JSON.parse(raw);

  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'mct_bms',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  await client.connect();

  // Get admin user for created_by fields
  const userRes = await client.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  if (!userRes.rows.length) throw new Error('Admin user not found. Run seed first.');
  const adminId = userRes.rows[0].id;

  // ─── Helper: chunked batch insert ─────────────────────────────────────────
  /**
   * @param {string} tableName
   * @param {string[]} columns
   * @param {object[]} rows
   * @param {(row: object) => any[]} mapRow
   * @param {string} onConflict  — default: do nothing; pass custom clause for upserts
   */
  async function batchInsert(tableName, columns, rows, mapRow, onConflict = 'ON CONFLICT DO NOTHING') {
    if (!rows || rows.length === 0) {
      console.log(`⚠️  ${tableName}: no rows to insert`);
      return;
    }

    const CHUNK_SIZE = 500;
    let totalProcessed = 0;

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

      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders.join(', ')} ${onConflict}`;
      try {
        await client.query(query, values);
        totalProcessed += chunk.length;
      } catch (e) {
        console.error(`❌ Error inserting into ${tableName}:`, e.message);
        throw e;
      }
    }
    console.log(`✅ ${tableName}: processed ${totalProcessed} rows`);
  }

  try {
    // ─── 1. CONFIG TABLES ──────────────────────────────────────────────────

    await batchInsert('categories', ['name', 'type', 'legacy_id'],
      data['Table-Category'].rows,
      r => [clean(r.Category), clean(r.Type), `cat-${r.ID}`]
    );

    // FIX #3a: Build category name → id map so user_groups can set category_id FK
    const catRes = await client.query('SELECT id, name FROM categories WHERE legacy_id IS NOT NULL');
    const catNameMap = {};
    catRes.rows.forEach(r => { catNameMap[r.name] = r.id; });

    await batchInsert('user_groups', ['name', 'type', 'category_id', 'legacy_id'],
      data['Table-Group'].rows,
      // CategoryID in Access is a text name (e.g. "Due Entry") not an integer
      r => [clean(r['Group Name']), clean(r.Type), catNameMap[r.CategoryID] || null, `grp-${r.ID}`]
    );

    // FIX #3b: Build group name → id map so sub_groups can set group_id FK
    const grpRes = await client.query('SELECT id, name FROM user_groups WHERE legacy_id IS NOT NULL');
    const grpNameMap = {};
    grpRes.rows.forEach(r => { grpNameMap[r.name] = r.id; });

    await batchInsert('sub_groups', ['name', 'type', 'group_id', 'reference', 'legacy_id'],
      data['Table-SubGroup'].rows,
      // GroupID in Access is a text name (e.g. "Due Collections") not an integer
      r => [clean(r.SubGroup), clean(r.Type), grpNameMap[r.GroupID] || null, clean(r.Ref), `subgrp-${r.ID}`]
    );

    await batchInsert('locations', ['name', 'group_name', 'legacy_id'],
      data['MTB-Location'].rows,
      r => [clean(r.Location), clean(r.Group), `loc-${r.ID}`]
    );

    await batchInsert('broadband_packages', ['package_to', 'name', 'monthly_fee', 'legacy_id'],
      data['Table-Package'].rows,
      r => [clean(r['Package To']), clean(r['Package Name']), r['Monthly Fee'] || 0, `pkg-${r.ID}`]
    );

    await batchInsert('reference_lists', ['reference_by', 'group_name', 'type', 'legacy_id'],
      data['Table-Reference List'].rows,
      r => [clean(r['Reference By']), clean(r.Group), clean(r.Type), `ref-${r.ID}`]
    );

    // ─── 2. PRODUCTS ───────────────────────────────────────────────────────
    await batchInsert('products', [
      'group_name', 'name', 'unit', 'sales_rate', 's_unit', 'p_unit',
      'purchase_rate', 'offer', 'offer_rate', 'offer_sales', 'category', 'legacy_id'
    ], data['Table-Product List'].rows, r => [
      // FIX #7: clean() strips \r\n from group/name fields
      clean(r['Group Name']), clean(r['Product Name']), clean(r.Unit),
      r['Sales Rate'] || 0, r.SUnit || 0, r.PUnit || 0, r['Purchase Rate'] || 0,
      r.Offer || 0, r.Offer_Rate || 0, r.Offer_Sales || 0,
      clean(r.Category), `prod-${r.ID}`
    ]);

    // ─── 3. CONTACTS ───────────────────────────────────────────────────────
    // FIX #2 (partial): uses correct Access table [Table-Contacts] and real
    // field 'Contcts Type' (intentional typo in Access column name)
    await batchInsert('contacts', [
      'type', 'name', 'phone', 'address', 'area', 'created_by', 'legacy_id'
    ], data['Table-Contacts'].rows, r => [
      mapContactType(r['Contcts Type']),
      clean(r.ContactName) || 'Unknown',
      clean(r.MobilePhone),
      clean(r.Address),
      clean(r['City/Thana']),
      adminId,
      `cnt-${r.ID}`
    ]);

    // ─── 4. SUBSCRIBERS (deduplicated) ─────────────────────────────────────
    // FIX #8: Both source tables share the same IDs. Merge them — s2 (Update)
    // overwrites s1 (Original) for the same ID so we get the latest data only.
    const subById = new Map();
    data['MTB-Subscriber Clients'].rows.forEach(r =>
      subById.set(r.ID, { ...r, __s: 's1' })
    );
    data['MTB-Subscriber Clients Update'].rows.forEach(r =>
      subById.set(r.ID, { ...r, __s: 's2' }) // s2 wins
    );
    const allSubs = [...subById.values()];

    await batchInsert('subscribers', [
      'name', 'phone', 'address', 'area_group', 'status',
      'monthly_bill', 'running_balance', 'created_by', 'legacy_id'
    ], allSubs, r => [
      clean(r.ContactName || r.Username) || 'Unknown',
      clean(r.MobilePhone),
      clean(r.Address) || '',
      clean(r.Group),
      r.Status === 'Active' ? 'active' : 'inactive',
      r['Running Bill'] || 0,
      r['Previous Balance'] || 0,
      adminId,
      `sub-${r.ID}` // unified key — no source prefix since deduped
    ]);

    // ─── FETCH MAPS FOR LINKING ────────────────────────────────────────────
    const contactMap          = {};
    const contactNameMap      = {};
    const contactNormalizedMap = {};
    const subMap              = {};

    const cRes = await client.query(
      'SELECT id, legacy_id, name FROM contacts WHERE legacy_id IS NOT NULL'
    );
    cRes.rows.forEach(r => {
      contactMap[r.legacy_id]                              = r.id;
      contactNameMap[r.name]                               = r.id;
      // FIX #5: also index by lowercase-trimmed name for fuzzy matching
      contactNormalizedMap[(r.name || '').toLowerCase().trim()] = r.id;
    });

    const sRes = await client.query(
      'SELECT id, legacy_id FROM subscribers WHERE legacy_id IS NOT NULL'
    );
    sRes.rows.forEach(r => { subMap[r.legacy_id] = r.id; });

    // Fallback contact for invoices whose "Invoice To" name has no match
    const fallbackRes = await client.query(
      `INSERT INTO contacts (type, name, created_by)
       VALUES ('retailer', 'Legacy Unknown', $1)
       ON CONFLICT DO NOTHING RETURNING id`,
      [adminId]
    );
    let fallbackContactId = fallbackRes.rows[0]?.id;
    if (!fallbackContactId) {
      const fbRes = await client.query(
        "SELECT id FROM contacts WHERE name = 'Legacy Unknown' LIMIT 1"
      );
      fallbackContactId = fbRes.rows[0]?.id;
    }

    // ─── 5. INVOICES ───────────────────────────────────────────────────────
    const allInvoices = [
      ...data['MCT-Invoice'].rows.map(r        => ({ ...r, __source: 'mct'     })),
      ...data['MCT-Invoice Manual'].rows.map(r => ({ ...r, __source: 'mct_man' })),
      ...data['CTG-Invoice'].rows.map(r        => ({ ...r, __source: 'ctg'     })),
    ];

    // FIX #13: include due_collections + collections_date (NULL for non-manual rows)
    await batchInsert('invoices', [
      'invoice_number', 'category', 'status', 'submitted_by', 'created_at',
      'legacy_id', 'contact_id', 'notes', 'due_collections', 'collections_date'
    ], allInvoices, r => {
      const invoiceTo = clean(r['Invoice To'] || r.Invoice_To) || 'Unknown';
      // FIX #5: try exact name, then case-insensitive, then fallback
      const contactId =
        contactNameMap[invoiceTo] ||
        contactNormalizedMap[invoiceTo.toLowerCase().trim()] ||
        fallbackContactId;
      return [
        `INV-${r.__source}-${r.ID}`.substring(0, 30),
        mapInvoiceCategory(r['Invoice Group'] || r.Group),
        'approved',
        adminId,
        r.Date || new Date(),
        `inv-${r.__source}-${r.ID}`,
        contactId,
        `Legacy Invoice To: ${invoiceTo}`,
        // MCT-Manual unique fields
        r.__source === 'mct_man' ? (r['Due Collections'] || 0) : null,
        r.__source === 'mct_man' ? (r['Collections Date'] || null) : null,
      ];
    });

    // Fetch invoice map
    const invoiceMap = {};
    const iRes = await client.query(
      'SELECT id, legacy_id FROM invoices WHERE legacy_id IS NOT NULL'
    );
    iRes.rows.forEach(r => { invoiceMap[r.legacy_id] = r.id; });

    // ─── 6. INVOICE ITEMS ──────────────────────────────────────────────────
    // FIX #6: use stable index instead of Math.random() for rows without IDs
    // FIX #4: try both 'mct' and 'mct_man' keys when resolving invoice
    // FIX #7: clean() strips \r\n from Group/Product Name fields
    const rawItems = [
      ...data['Sales-Matador Group'].rows.map((r, i)    => ({ ...r, __source: 'mct', __i: i })),
      ...data['Sales-Olympic A-Group'].rows.map((r, i)  => ({ ...r, __source: 'mct', __i: 10000 + i })),
      ...data['Sales-Olympic B Group'].rows.map((r, i)  => ({ ...r, __source: 'mct', __i: 20000 + i })),
      ...data['Sales-Bombay Grroup'].rows.map((r, i)    => ({ ...r, __source: 'mct', __i: 30000 + i })),
      ...data['CTG-Invoice Details'].rows.map((r, i)    => ({ ...r, __source: 'ctg', __i: 40000 + i })),
    ];

    const resolvedItems = rawItems
      .map(r => {
        const invId = r['Invoice ID'];
        // FIX #4: try own source first, then the other invoice source as fallback
        const resolvedInvoiceId =
          invoiceMap[`inv-${r.__source}-${invId}`] ||
          invoiceMap[`inv-mct_man-${invId}`]       ||
          invoiceMap[`inv-mct-${invId}`];
        return resolvedInvoiceId ? { ...r, __invoice_id: resolvedInvoiceId } : null;
      })
      .filter(Boolean);

    console.log(`📋 invoice_items: ${rawItems.length - resolvedItems.length} unresolved items dropped`);

    await batchInsert('invoice_items', [
      'invoice_id', 'product_name', 'line_total', 'free_items', 'legacy_id'
    ], resolvedItems, r => [
      r.__invoice_id,
      clean(r['Product Name']) || 'Unknown',
      r['Line Total'] || 0,
      r.Free || 0,
      `itm-${r.__source}-${r.ID || r.__i}` // FIX #6: stable index, no Math.random()
    ]);

    // ─── 7. CASHBOOK ENTRIES (UPSERT) ──────────────────────────────────────
    // FIX #10: use ON CONFLICT DO UPDATE so duplicate-date corrections in
    // Access overwrite earlier records instead of being silently dropped
    await batchInsert('cashbook_entries', [
      'entry_date', 'today_income', 'today_expense', 'today_due',
      'previous_cash', 'notes', 'created_by', 'legacy_id'
    ], data['Cashbook Date'].rows, r => [
      r['Cashbook Date'],
      r['Today Income']  || 0,
      r['Today Expense'] || 0,
      r['Today Due']     || 0,
      r['Previous Cash'] || 0,
      clean(r.Remarks),
      adminId,
      `cb-${r.ID}`
    ],
    `ON CONFLICT (entry_date) DO UPDATE SET
       today_income  = EXCLUDED.today_income,
       today_expense = EXCLUDED.today_expense,
       today_due     = EXCLUDED.today_due,
       previous_cash = EXCLUDED.previous_cash,
       notes         = EXCLUDED.notes`
    );

    // ─── 8. EXPENSES (with category mapping) ───────────────────────────────
    // FIX #9: mapExpenseCategory() replaces the old hardcoded 'other' value
    await batchInsert('expenses', [
      'category', 'amount', 'description', 'expense_date', 'status', 'submitted_by', 'legacy_id'
    ], data['CB-Expense Transaction'].rows, r => [
      mapExpenseCategory(r.Group, r.SubGroup),
      Math.abs(r.Ammounts || 0),
      clean(r.Note || r.SubGroup) || 'Expense',
      r.Date || new Date(),
      'approved',
      adminId,
      `exp-${r.ID}`
    ]);

    // ─── 9. CASHBOOK TRANSACTIONS (Income + Due + Prv Due List) ────────────
    // FIX #12: include previously-missed [Prv Due List] table (156 rows)
    // FIX #6:  use stable __idx instead of Math.random() for rows without ID
    const allCbTrans = [
      ...data['CB-Income Transaction'].rows.map((r, i) => ({
        ...r, __t: 'income', __idx: `inc-${r['Sr No'] || i}`
      })),
      ...data['CB-Due Transaction'].rows.map((r, i) => ({
        ...r, __t: 'due', __idx: `due-${r['Sr No'] || i}`
      })),
      // Previously ignored table — now migrated
      ...data['Prv Due List'].rows.map((r, i) => ({
        ...r,
        __t:   'due',
        __idx: `prv-${r['Sr No'] || i}`,
        'Collect By': r['Due By'], // normalise field name to match CB-Due
      })),
    ];

    await batchInsert('cashbook_transactions', [
      'transaction_date', 'type', 'group_name', 'sub_group', 'contact_name',
      'debit', 'amount', 'actual_amount', 'note', 'collected_by', 'legacy_id'
    ], allCbTrans, r => [
      r.Date || new Date(),
      r.__t,
      clean(r.Group),
      clean(r.SubGroup),
      clean(r['Contact Name']),
      clean(r.Debit),
      r.Ammounts || 0,
      r.Acctual  || 0,
      clean(r.Note),
      clean(r['Collect By'] || r['Due By']),
      `cbtr-${r.__t}-${r.ID || r.__idx}` // FIX #6: stable key
    ]);

    // ─── 10. BROADBAND PAYMENTS ────────────────────────────────────────────
    // FIX #11: use NULL when Pay_Date is missing — was incorrectly defaulting
    // to new Date() (today's date), fabricating historical payment dates
    await batchInsert('broadband_payments', [
      'month_name', 'group_name', 'monthly_charge', 'client_name', 'address',
      'pay_date', 'running_bill', 'payment_amount', 'total_balance',
      'status', 'comments', 'legacy_id'
    ], data['MTB-Transactions'].rows, r => [
      clean(r.MonthName),
      clean(r.Group),
      r['Monthly Charge'] || 0,
      clean(r.ClientsName),
      clean(r.Address),
      r.Pay_Date || null,  // FIX #11: NULL instead of today
      r['Running Bill'] || 0,
      r.Payments    || 0,
      r.TotalBalance || 0,
      clean(r.Status),
      clean(r.Comments),
      `mtbp-${r.ID}`
    ]);

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
  } finally {
    await client.end();
    console.log('\n✅ Migration complete!');
  }
}

run();
