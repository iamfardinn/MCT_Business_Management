-- MCT Business Management System
-- Migration 004: Legacy Access Database Compatibility Tables
-- Adds missing tables required to store all details from the Access database.

-- 1. Configuration & Grouping Tables
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(100),
  legacy_id   INTEGER UNIQUE
);

CREATE TABLE user_groups (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type        VARCHAR(100),
  legacy_id   INTEGER UNIQUE
);

CREATE TABLE sub_groups (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  group_id    INTEGER REFERENCES user_groups(id) ON DELETE SET NULL,
  type        VARCHAR(100),
  reference   VARCHAR(200),
  legacy_id   INTEGER UNIQUE
);

CREATE TABLE locations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  group_name  VARCHAR(200),
  legacy_id   INTEGER UNIQUE
);

CREATE TABLE broadband_packages (
  id          SERIAL PRIMARY KEY,
  package_to  VARCHAR(200),
  name        VARCHAR(200) NOT NULL,
  monthly_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  legacy_id   INTEGER UNIQUE
);

CREATE TABLE reference_lists (
  id           SERIAL PRIMARY KEY,
  reference_by VARCHAR(200),
  group_name   VARCHAR(200),
  type         VARCHAR(100),
  legacy_id    INTEGER UNIQUE
);

-- 2. Products Table
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name    VARCHAR(200),
  name          VARCHAR(200) NOT NULL,
  unit          VARCHAR(50),
  sales_rate    NUMERIC(14, 2) DEFAULT 0.00,
  s_unit        NUMERIC(10, 2) DEFAULT 0.00,
  p_unit        NUMERIC(10, 2) DEFAULT 0.00,
  purchase_rate NUMERIC(14, 2) DEFAULT 0.00,
  offer         NUMERIC(14, 2) DEFAULT 0.00,
  offer_rate    NUMERIC(14, 2) DEFAULT 0.00,
  offer_sales   NUMERIC(14, 2) DEFAULT 0.00,
  category      VARCHAR(200),
  legacy_id     INTEGER UNIQUE
);

-- 3. Detailed Cashbook Transactions (Income/Due)
CREATE TABLE cashbook_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL,
  type             VARCHAR(50) NOT NULL CHECK (type IN ('income', 'due', 'expense')),
  group_name       VARCHAR(200),
  sub_group        VARCHAR(200),
  contact_name     VARCHAR(200),
  debit            VARCHAR(50),
  credit           VARCHAR(50),
  amount           NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  actual_amount    NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  note             TEXT,
  collected_by     VARCHAR(200),
  legacy_id        INTEGER UNIQUE
);

-- 4. Broadband Detailed Payments
CREATE TABLE broadband_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_name       VARCHAR(100),
  group_name       VARCHAR(200),
  monthly_charge   NUMERIC(12, 2) DEFAULT 0.00,
  client_name      VARCHAR(200),
  address          TEXT,
  pay_date         DATE,
  running_bill     NUMERIC(12, 2) DEFAULT 0.00,
  payment_amount   NUMERIC(14, 2) DEFAULT 0.00,
  total_balance    NUMERIC(14, 2) DEFAULT 0.00,
  status           VARCHAR(50),
  comments         TEXT,
  legacy_id        INTEGER UNIQUE
);

-- Modify existing tables to allow linking via legacy IDs during migration
ALTER TABLE contacts ADD COLUMN legacy_id INTEGER UNIQUE;
ALTER TABLE subscribers ADD COLUMN legacy_id INTEGER UNIQUE;
ALTER TABLE invoices ADD COLUMN legacy_id INTEGER UNIQUE;
ALTER TABLE invoice_items ADD COLUMN legacy_id INTEGER UNIQUE;
ALTER TABLE expenses ADD COLUMN legacy_id INTEGER UNIQUE;
ALTER TABLE cashbook_entries ADD COLUMN legacy_id INTEGER UNIQUE;
