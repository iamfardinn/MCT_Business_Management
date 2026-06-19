-- MCT Business Management System
-- Migration 009: Purchase System
-- Maps legacy PrG-Invoice and PrG-Invoice-S to Postgres

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(50) NOT NULL UNIQUE,
  purchase_date    DATE NOT NULL,
  supplier_name    VARCHAR(255),
  supplier_address TEXT,
  amount           NUMERIC(14, 2) DEFAULT 0.00,
  discount         NUMERIC(14, 2) DEFAULT 0.00,
  commission       NUMERIC(14, 2) DEFAULT 0.00,
  carrying_cost    NUMERIC(14, 2) DEFAULT 0.00,
  total_amount     NUMERIC(14, 2) DEFAULT 0.00,
  advance_payment  NUMERIC(14, 2) DEFAULT 0.00,
  due_amount       NUMERIC(14, 2) DEFAULT 0.00,
  total_due        NUMERIC(14, 2) DEFAULT 0.00,
  payment_date     DATE,
  status           VARCHAR(50) DEFAULT 'Active',
  notes            TEXT,
  submitted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_name     VARCHAR(255),
  quantity         NUMERIC(14, 2) DEFAULT 0.00,
  unit             VARCHAR(50),
  rate             NUMERIC(14, 2) DEFAULT 0.00,
  discount_percent NUMERIC(14, 2) DEFAULT 0.00,
  discount_amount  NUMERIC(14, 2) DEFAULT 0.00,
  line_total       NUMERIC(14, 2) DEFAULT 0.00
);

CREATE INDEX idx_purchase_invoices_date ON purchase_invoices(purchase_date);
CREATE INDEX idx_purchase_invoices_supplier ON purchase_invoices(supplier_name);
