-- Migration 003: Seed Data
-- Creates the initial admin account
-- Password: Admin@MCT2024 (bcrypt hash — change after first login!)

INSERT INTO users (username, password_hash, full_name, role)
VALUES (
  'admin',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGHF5EvKQ7GbCkpEpH2Qs5KHKF2',
  'MCT System Administrator',
  'admin'
);
-- NOTE: The hash above is a placeholder. Run `node database/hash-password.js Admin@MCT2024`
-- to generate a real bcrypt hash and update this seed file before deploying.
