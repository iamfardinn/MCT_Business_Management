-- Migration 002: Performance Indexes
-- Run after 001_initial_schema.sql

-- Users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- Contacts
CREATE INDEX idx_contacts_type ON contacts(type);
CREATE INDEX idx_contacts_name ON contacts(name);
CREATE INDEX idx_contacts_is_active ON contacts(is_active);

-- Subscribers
CREATE INDEX idx_subscribers_status ON subscribers(status);
CREATE INDEX idx_subscribers_area_group ON subscribers(area_group);

-- Invoices
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_category ON invoices(category);
CREATE INDEX idx_invoices_submitted_by ON invoices(submitted_by);
CREATE INDEX idx_invoices_contact_id ON invoices(contact_id);
CREATE INDEX idx_invoices_subscriber_id ON invoices(subscriber_id);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);

-- Invoice items
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Expenses
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_submitted_by ON expenses(submitted_by);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date DESC);

-- Cashbook
CREATE INDEX idx_cashbook_entry_date ON cashbook_entries(entry_date DESC);

-- Approval records
CREATE INDEX idx_approval_records_record_id ON approval_records(record_id);
CREATE INDEX idx_approval_records_actor_id ON approval_records(actor_id);

-- Audit log
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Refresh tokens
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
