-- MCT Business Management System
-- Migration 001: Initial Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'employee');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  role          user_role NOT NULL DEFAULT 'employee',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CONTACTS ─────────────────────────────────────────────────────────────────

CREATE TYPE contact_type AS ENUM ('sub_dealer', 'retailer', 'side_market', 'employee');

CREATE TABLE contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                contact_type NOT NULL,
  name                VARCHAR(200) NOT NULL,
  phone               VARCHAR(30),
  address             TEXT,
  area                VARCHAR(100),
  outstanding_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BROADBAND SUBSCRIBERS ────────────────────────────────────────────────────

CREATE TYPE subscriber_status AS ENUM ('active', 'inactive');

CREATE TABLE subscribers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(200) NOT NULL,
  phone            VARCHAR(30),
  address          TEXT NOT NULL,
  area_group       VARCHAR(100),
  status           subscriber_status NOT NULL DEFAULT 'active',
  monthly_bill     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  running_balance  NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  connection_date  DATE,
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────

CREATE TYPE invoice_category AS ENUM ('matador', 'olympic', 'bombay', 'mtb_broadband');
CREATE TYPE record_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(30) UNIQUE NOT NULL,
  category         invoice_category NOT NULL,
  contact_id       UUID REFERENCES contacts(id) ON DELETE RESTRICT,
  subscriber_id    UUID REFERENCES subscribers(id) ON DELETE RESTRICT,
  status           record_status NOT NULL DEFAULT 'pending',
  notes            TEXT,
  submitted_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by      UUID REFERENCES users(id) ON DELETE RESTRICT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoice_contact_or_subscriber CHECK (
    contact_id IS NOT NULL OR subscriber_id IS NOT NULL OR category = 'mtb_broadband'
  )
);

-- ─── INVOICE ITEMS ────────────────────────────────────────────────────────────

CREATE TABLE invoice_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  -- Product fields (matador / olympic / bombay)
  product_name       VARCHAR(200),
  line_total         NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  damage_a           NUMERIC(12, 2),
  damage_b           NUMERIC(12, 2),
  free_items         INTEGER,
  commission         NUMERIC(12, 2),
  -- Broadband fields (mtb_broadband)
  month_name         VARCHAR(30),
  subscriber_address TEXT,
  running_bill       NUMERIC(12, 2),
  item_subscriber_id UUID REFERENCES subscribers(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── EXPENSES ─────────────────────────────────────────────────────────────────

CREATE TYPE expense_category AS ENUM (
  'transport_bill',
  'labor_bill',
  'carrying_cost',
  'employee_payroll',
  'salary_adjustment',
  'withdraw_family',
  'personal_withdrawal',
  'other'
);

CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     expense_category NOT NULL,
  amount       NUMERIC(14, 2) NOT NULL,
  description  TEXT,
  expense_date DATE NOT NULL,
  status       record_status NOT NULL DEFAULT 'pending',
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by  UUID REFERENCES users(id) ON DELETE RESTRICT,
  approved_at  TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CASHBOOK ─────────────────────────────────────────────────────────────────

CREATE TABLE cashbook_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date      DATE UNIQUE NOT NULL,
  today_income    NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  today_expense   NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  today_due       NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  previous_cash   NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  closing_balance NUMERIC(14, 2) GENERATED ALWAYS AS
    (previous_cash + today_income - today_expense - today_due) STORED,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── APPROVAL RECORDS ─────────────────────────────────────────────────────────

CREATE TYPE approval_action AS ENUM ('approve', 'reject');

CREATE TABLE approval_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('invoice', 'expense')),
  record_id   UUID NOT NULL,
  action      approval_action NOT NULL,
  actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason      TEXT,
  acted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ────────────────────────────────────────────────────────────────

CREATE TYPE audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT');

CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  record_id  UUID NOT NULL,
  action     audit_action NOT NULL,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── REFRESH TOKENS ───────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INVOICE NUMBER SEQUENCE ──────────────────────────────────────────────────

CREATE SEQUENCE invoice_number_seq START 1000;

-- ─── UPDATED_AT TRIGGER FUNCTION ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'contacts', 'subscribers', 'invoices', 'expenses', 'cashbook_entries']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      t, t
    );
  END LOOP;
END;
$$;
