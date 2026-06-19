-- 012_referential_integrity.sql

-- First, ensure all existing daybook references are valid. If there are orphans, this migration might fail, 
-- but that's by design to alert us to bad data. 
-- First, ensure name is UNIQUE so it can be referenced.
-- If this fails, it means there are duplicate ledger names which must be cleaned up first.
ALTER TABLE chart_of_accounts ADD CONSTRAINT uq_chart_of_accounts_name UNIQUE (name);

-- Add foreign key constraints to cashbook_transactions for debit and credit ledgers
ALTER TABLE cashbook_transactions
  ADD CONSTRAINT fk_cashbook_debit_ledger
  FOREIGN KEY (debit_ledger)
  REFERENCES chart_of_accounts(name)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE cashbook_transactions
  ADD CONSTRAINT fk_cashbook_credit_ledger
  FOREIGN KEY (credit_ledger)
  REFERENCES chart_of_accounts(name)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Removed dummy constraint placeholder.
-- The above is just a structural example. In PostgreSQL, we can't do the status FK. 
-- Let's just drop the dummy one and focus on the COA locks.

-- Note: We do not add constraints to cashbook_transactions because daybook is our system of record for double-entry.
