#!/usr/bin/env node
/**
 * Generate a bcrypt hash for a password.
 * Usage: node hash-password.js <your-password>
 */
const bcrypt = require('bcrypt');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log('\n✅ Bcrypt hash (cost=12):');
  console.log(hash);
  console.log('\nCopy this into your seed SQL file.');
});
