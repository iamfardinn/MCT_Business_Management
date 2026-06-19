-- MCT Business Management System
-- Migration 010: Chart of Accounts & GL Foundation

-- The Chart of Accounts is the backbone of the ERP.
-- Every financial transaction must debit one account and credit another.

CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  type account_type NOT NULL,
  parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coa_type ON chart_of_accounts(type);
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_id);

-- Optional: Link existing cashbook transactions to the formal chart of accounts
-- Currently, debit_ledger and credit_ledger are text fields.
-- We add UUID fields so we can start mapping them.
ALTER TABLE cashbook_transactions
  ADD COLUMN IF NOT EXISTS debit_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS credit_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;

-- Seed a foundational Chart of Accounts
-- 1000 - Assets
INSERT INTO chart_of_accounts (id, code, name, type) VALUES
  ('10000000-0000-0000-0000-000000000001', '1000', 'Current Assets', 'asset'),
  ('10000000-0000-0000-0000-000000000002', '1100', 'Cash in Hand', 'asset'),
  ('10000000-0000-0000-0000-000000000003', '1200', 'Cash at Bank', 'asset'),
  ('10000000-0000-0000-0000-000000000004', '1300', 'Accounts Receivable', 'asset'),
  ('10000000-0000-0000-0000-000000000005', '1400', 'Inventory', 'asset');

UPDATE chart_of_accounts SET parent_id = '10000000-0000-0000-0000-000000000001' WHERE code IN ('1100', '1200', '1300', '1400');

-- 2000 - Liabilities
INSERT INTO chart_of_accounts (id, code, name, type) VALUES
  ('20000000-0000-0000-0000-000000000001', '2000', 'Current Liabilities', 'liability'),
  ('20000000-0000-0000-0000-000000000002', '2100', 'Accounts Payable', 'liability'),
  ('20000000-0000-0000-0000-000000000003', '2200', 'Taxes Payable', 'liability');

UPDATE chart_of_accounts SET parent_id = '20000000-0000-0000-0000-000000000001' WHERE code IN ('2100', '2200');

-- 3000 - Equity
INSERT INTO chart_of_accounts (id, code, name, type) VALUES
  ('30000000-0000-0000-0000-000000000001', '3000', 'Owner''s Equity', 'equity'),
  ('30000000-0000-0000-0000-000000000002', '3100', 'Retained Earnings', 'equity');

-- 4000 - Revenue
INSERT INTO chart_of_accounts (id, code, name, type) VALUES
  ('40000000-0000-0000-0000-000000000001', '4000', 'Sales Revenue', 'revenue'),
  ('40000000-0000-0000-0000-000000000002', '4100', 'Broadband Revenue', 'revenue'),
  ('40000000-0000-0000-0000-000000000003', '4200', 'Other Income', 'revenue');

-- 5000 - Expenses
INSERT INTO chart_of_accounts (id, code, name, type) VALUES
  ('50000000-0000-0000-0000-000000000001', '5000', 'Cost of Goods Sold', 'expense'),
  ('50000000-0000-0000-0000-000000000002', '5100', 'Operating Expenses', 'expense'),
  ('50000000-0000-0000-0000-000000000003', '5110', 'Salaries & Wages', 'expense'),
  ('50000000-0000-0000-0000-000000000004', '5120', 'Rent Expense', 'expense'),
  ('50000000-0000-0000-0000-000000000005', '5130', 'Utilities', 'expense'),
  ('50000000-0000-0000-0000-000000000006', '5140', 'General Expenses', 'expense');

UPDATE chart_of_accounts SET parent_id = '50000000-0000-0000-0000-000000000002' WHERE code IN ('5110', '5120', '5130', '5140');
