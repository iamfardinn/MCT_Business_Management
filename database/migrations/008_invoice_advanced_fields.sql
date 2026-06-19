-- MCT Business Management System
-- Migration 008: Invoice Advanced Fields
-- Adds missing summary and tracking fields from the legacy MCT-Invoice table

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS market_cost  NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS carrying_cost NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS commission   NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS free_value   NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS damage_value NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS market_short NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS deposit_cash NUMERIC(14, 2) DEFAULT 0.00;

-- Optionally, add total_sales and invoice_total if not dynamically calculated
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS total_sales  NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(14, 2) DEFAULT 0.00;
