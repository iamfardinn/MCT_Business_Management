-- MCT Business Management System
-- Migration 007: Double-entry voucher support for the Daybook
--
-- Tally vouchers are double-entry: each voucher debits one ledger and credits
-- another for the same amount. To support creating/editing such vouchers from
-- the Daybook we add:
--   • debit_ledger  / credit_ledger : the two account/party names
--   • voucher_group : groups the paired rows that make up one voucher
--   • created_by    : the admin who created the manual voucher
--
-- A manual double-entry voucher is stored as TWO rows in cashbook_transactions
-- sharing the same voucher_group:
--   row 1 -> debit_amount  = amount, particulars = debit_ledger
--   row 2 -> credit_amount = amount, particulars = credit_ledger
--
-- The Daybook view is rebuilt so each manual voucher shows as ONE line with
-- both its debit and credit ledgers (Tally style).

ALTER TABLE cashbook_transactions
  ADD COLUMN IF NOT EXISTS debit_ledger  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS credit_ledger VARCHAR(200),
  ADD COLUMN IF NOT EXISTS voucher_group UUID,
  ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cashbook_tx_vgroup ON cashbook_transactions(voucher_group);

-- Allow 'manual' as a transaction type so new vouchers are distinguishable
-- from legacy income/due/expense rows.
ALTER TABLE cashbook_transactions DROP CONSTRAINT IF EXISTS cashbook_transactions_type_check;
ALTER TABLE cashbook_transactions
  ADD CONSTRAINT cashbook_transactions_type_check
  CHECK (type IN ('income', 'due', 'expense', 'manual'));

-- ─── Rebuild the Daybook view with ledger columns ──────────────────────────────
-- DROP first: CREATE OR REPLACE cannot add columns in the middle / reorder.
DROP VIEW IF EXISTS daybook_entries;

CREATE VIEW daybook_entries AS
  -- (a) Legacy + manual cashbook transactions
  SELECT
    ct.id,
    ct.transaction_date                          AS entry_date,
    ct.voucher_type,
    COALESCE(ct.voucher_no, 'CB-' || LEFT(ct.id::text, 8)) AS voucher_no,
    COALESCE(NULLIF(ct.contact_name, ''),
             NULLIF(ct.sub_group, ''),
             NULLIF(ct.group_name, ''),
             'Cash')                             AS particulars,
    ct.group_name,
    ct.note                                      AS narration,
    ct.debit_amount,
    ct.credit_amount,
    ct.debit_ledger,
    ct.credit_ledger,
    ct.voucher_group,
    'cashbook'::text                             AS source
  FROM cashbook_transactions ct
  -- For paired manual vouchers, only emit the debit row so the voucher
  -- appears once (the credit row carries the same info via credit_ledger).
  WHERE ct.voucher_group IS NULL OR ct.debit_amount > 0

  UNION ALL

  -- (b) Approved invoices -> Sales voucher -> debit
  SELECT
    i.id,
    i.created_at::date                           AS entry_date,
    'Sales'                                       AS voucher_type,
    i.invoice_number                              AS voucher_no,
    COALESCE(c.name, s.name, 'Cash Sales')        AS particulars,
    i.category::text                              AS group_name,
    i.notes                                       AS narration,
    COALESCE(it.total, 0)                         AS debit_amount,
    0                                             AS credit_amount,
    COALESCE(c.name, s.name, 'Cash Sales')        AS debit_ledger,
    'Sales Account'                               AS credit_ledger,
    NULL::uuid                                    AS voucher_group,
    'invoice'::text                               AS source
  FROM invoices i
  LEFT JOIN contacts    c ON c.id = i.contact_id
  LEFT JOIN subscribers s ON s.id = i.subscriber_id
  LEFT JOIN LATERAL (
    SELECT SUM(line_total) AS total FROM invoice_items WHERE invoice_id = i.id
  ) it ON TRUE
  WHERE i.status = 'approved'

  UNION ALL

  -- (c) Approved expenses -> Payment voucher -> credit
  SELECT
    e.id,
    e.expense_date                               AS entry_date,
    'Payment'                                     AS voucher_type,
    'EXP-' || LEFT(e.id::text, 8)                 AS voucher_no,
    COALESCE(NULLIF(e.description, ''),
             REPLACE(e.category::text, '_', ' ')) AS particulars,
    e.category::text                             AS group_name,
    e.description                                AS narration,
    0                                             AS debit_amount,
    e.amount                                      AS credit_amount,
    REPLACE(e.category::text, '_', ' ')          AS debit_ledger,
    'Cash'                                        AS credit_ledger,
    NULL::uuid                                    AS voucher_group,
    'expense'::text                              AS source
  FROM expenses e
  WHERE e.status = 'approved';

COMMENT ON VIEW daybook_entries IS
  'Tally-style Daybook with double-entry ledgers: manual vouchers (cashbook), approved invoices (Sales), approved expenses (Payment).';
