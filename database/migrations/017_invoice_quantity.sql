-- 017_invoice_quantity.sql
-- MCT Business Management System
-- Adds quantity to invoice_items to support inventory stock tracking.

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS rate NUMERIC(14, 2) DEFAULT 0.00;
