-- MCT Business Management System
-- Migration 006: Tally-style Daybook
--
-- Builds a single-entry voucher Daybook on top of the already-migrated
-- `cashbook_transactions` table (income / due / expense rows from Access).
--
-- Model (single-entry, cash-centric — like the Tally ERP 9 Daybook):
--   • income / due  -> Receipt voucher -> money IN  -> DEBIT  cash
--   • expense       -> Payment voucher -> money OUT -> CREDIT cash
--
-- We:
--   1. Add voucher columns to cashbook_transactions and backfill them.
--   2. Create a read-only `daybook_entries` view that unions the legacy
--      cashbook transactions with approved invoices and approved expenses,
--      so the Daybook is a single chronological journal of everything.

-- ─── 1. Voucher columns on the existing transactions table ─────────────────────

ALTER TABLE cashbook_transactions
  ADD COLUMN IF NOT EXISTS voucher_type  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS voucher_no    VARCHAR(40),
  ADD COLUMN IF NOT EXISTS debit_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

-- Backfill voucher_type from the legacy `type` column
UPDATE cashbook_transactions
SET voucher_type = CASE
  WHEN type = 'expense' THEN 'Payment'
  ELSE 'Receipt'           -- income + due are both money received
END
WHERE voucher_type IS NULL;

-- Backfill debit / credit. Use actual_amount when present, else amount.
UPDATE cashbook_transactions
SET
  debit_amount  = CASE WHEN type IN ('income', 'due')
                       THEN COALESCE(NULLIF(actual_amount, 0), amount) ELSE 0 END,
  credit_amount = CASE WHEN type = 'expense'
                       THEN COALESCE(NULLIF(actual_amount, 0), amount) ELSE 0 END
WHERE debit_amount = 0 AND credit_amount = 0;

-- Backfill a stable voucher number from the legacy id (e.g. cbtr-due-123 -> DUE-123)
UPDATE cashbook_transactions
SET voucher_no = UPPER(REPLACE(REPLACE(legacy_id, 'cbtr-', ''), '_', '-'))
WHERE voucher_no IS NULL AND legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashbook_tx_date  ON cashbook_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_cashbook_tx_vtype ON cashbook_transactions(voucher_type);

-- ─── 2. Unified Daybook view ───────────────────────────────────────────────────
-- Chronological journal combining:
--   a) legacy cashbook_transactions (income/due/expense)
--   b) approved invoices  (Sales vouchers  -> debit)
--   c) approved expenses  (Payment vouchers -> credit)

CREATE OR REPLACE VIEW daybook_entries AS
  -- (a) Legacy cashbook transactions
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
    'cashbook'::text                             AS source
  FROM cashbook_transactions ct

  UNION ALL

  -- (b) Approved invoices -> Sales voucher -> debit (money receivable/received)
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
    'invoice'::text                               AS source
  FROM invoices i
  LEFT JOIN contacts    c ON c.id = i.contact_id
  LEFT JOIN subscribers s ON s.id = i.subscriber_id
  LEFT JOIN LATERAL (
    SELECT SUM(line_total) AS total FROM invoice_items WHERE invoice_id = i.id
  ) it ON TRUE
  WHERE i.status = 'approved'

  UNION ALL

  -- (c) Approved expenses -> Payment voucher -> credit (money out)
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
    'expense'::text                              AS source
  FROM expenses e
  WHERE e.status = 'approved';

COMMENT ON VIEW daybook_entries IS
  'Tally-style single-entry Daybook: legacy cashbook transactions + approved invoices (Sales/debit) + approved expenses (Payment/credit).';
