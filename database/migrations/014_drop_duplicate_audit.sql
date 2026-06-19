-- 014_drop_duplicate_audit.sql
-- Drop the duplicate audit_logs table created by mistake in 013.
-- We will use the existing audit_log table from 001_initial_schema.sql.

DROP TABLE IF EXISTS audit_logs;
