-- MCT Business Management System
-- Migration 005: MCT-Invoice Manual Extra Fields
-- Adds fields that are unique to MCT-Invoice Manual records and were
-- previously lost during migration. NULL for all non-manual invoice rows.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS due_collections  NUMERIC(14, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS collections_date DATE           DEFAULT NULL;

COMMENT ON COLUMN invoices.due_collections  IS 'MCT-Invoice Manual only: amount of dues collected on this invoice';
COMMENT ON COLUMN invoices.collections_date IS 'MCT-Invoice Manual only: date when due collections were made';
