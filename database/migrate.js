#!/usr/bin/env node
/**
 * MCT BMS — Database Migration Runner
 * Usage:
 *   node migrate.js          # runs all pending migrations
 *   node migrate.js --seed   # also runs seed data
 *   node migrate.js --reset  # DROP and recreate all (DANGEROUS — dev only)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const args = process.argv.slice(2);
const SEED = args.includes('--seed');
const RESET = args.includes('--reset');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'mct_bms',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  await client.connect();
  console.log('✅ Connected to PostgreSQL:', process.env.DB_NAME || 'mct_bms');

  try {
    if (RESET) {
      console.warn('⚠️  RESET mode: dropping all tables...');
      await client.query(`
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        GRANT ALL ON SCHEMA public TO postgres;
        GRANT ALL ON SCHEMA public TO public;
      `);
      console.log('🗑️  Schema reset complete.');
    }

    // Create migration tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Determine which files to run
    const allFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const migrationFiles = SEED
      ? allFiles
      : allFiles.filter((f) => !f.includes('seed'));

    const { rows: applied } = await client.query('SELECT filename FROM _migrations');
    const appliedSet = new Set(applied.map((r) => r.filename));

    let count = 0;
    for (const file of migrationFiles) {
      if (appliedSet.has(file)) {
        console.log(`⏭️  Skipping (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`🔄 Applying: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Applied: ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed on: ${file}`);
        throw err;
      }
    }

    if (count === 0) {
      console.log('ℹ️  No new migrations to apply.');
    } else {
      console.log(`\n🎉 ${count} migration(s) applied successfully.`);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
