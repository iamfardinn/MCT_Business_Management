-- MCT Business Management System
-- Migration 011: Unified General Ledger View

-- This view unifies legacy cashbook_transactions, approved invoices, and approved expenses
-- into a standard double-entry general ledger format. This enables real-time P&L and Balance Sheets.

CREATE OR REPLACE VIEW general_ledger AS

  -- 1. Cashbook Transactions (Mapped via debit/credit_account_id)
  -- Debit side
  SELECT
    ct.id AS source_id,
    'cashbook' AS source_type,
    ct.transaction_date AS entry_date,
    ct.debit_account_id AS account_id,
    ct.debit_amount AS debit,
    0 AS credit
  FROM cashbook_transactions ct
  WHERE ct.debit_account_id IS NOT NULL AND ct.debit_amount > 0

  UNION ALL

  -- Credit side
  SELECT
    ct.id AS source_id,
    'cashbook' AS source_type,
    ct.transaction_date AS entry_date,
    ct.credit_account_id AS account_id,
    0 AS debit,
    ct.credit_amount AS credit
  FROM cashbook_transactions ct
  WHERE ct.credit_account_id IS NOT NULL AND ct.credit_amount > 0

  UNION ALL

  -- 2. Approved Invoices (Dr: Accounts Receivable/Cash, Cr: Sales Revenue)
  -- Invoice Sales Revenue (Credit)
  SELECT
    i.id AS source_id,
    'invoice' AS source_type,
    i.created_at::date AS entry_date,
    '40000000-0000-0000-0000-000000000001'::uuid AS account_id, -- Sales Revenue
    0 AS debit,
    COALESCE(it.total, 0) AS credit
  FROM invoices i
  LEFT JOIN LATERAL (
    SELECT SUM(line_total) AS total FROM invoice_items WHERE invoice_id = i.id
  ) it ON TRUE
  WHERE i.status = 'approved' AND COALESCE(it.total, 0) > 0

  UNION ALL

  -- Invoice Asset (Debit)
  SELECT
    i.id AS source_id,
    'invoice' AS source_type,
    i.created_at::date AS entry_date,
    -- If it's a cash sale (no contact), it goes to Cash, otherwise Accounts Receivable
    CASE WHEN i.contact_id IS NULL AND i.subscriber_id IS NULL THEN '10000000-0000-0000-0000-000000000002'::uuid ELSE '10000000-0000-0000-0000-000000000004'::uuid END AS account_id,
    COALESCE(it.total, 0) AS debit,
    0 AS credit
  FROM invoices i
  LEFT JOIN LATERAL (
    SELECT SUM(line_total) AS total FROM invoice_items WHERE invoice_id = i.id
  ) it ON TRUE
  WHERE i.status = 'approved' AND COALESCE(it.total, 0) > 0

  UNION ALL

  -- 3. Approved Expenses (Dr: General Expense, Cr: Cash)
  -- Expense (Debit)
  SELECT
    e.id AS source_id,
    'expense' AS source_type,
    e.expense_date AS entry_date,
    '50000000-0000-0000-0000-000000000006'::uuid AS account_id, -- General Expense
    e.amount AS debit,
    0 AS credit
  FROM expenses e
  WHERE e.status = 'approved' AND e.amount > 0

  UNION ALL

  -- Expense Cash Outflow (Credit)
  SELECT
    e.id AS source_id,
    'expense' AS source_type,
    e.expense_date AS entry_date,
    '10000000-0000-0000-0000-000000000002'::uuid AS account_id, -- Cash in Hand
    0 AS debit,
    e.amount AS credit
  FROM expenses e
  WHERE e.status = 'approved' AND e.amount > 0;
