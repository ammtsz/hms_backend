#!/usr/bin/env node
/**
 * Bootstrap admin user creation script.
 *
 * Usage:
 *   node scripts/create-admin.js --email admin@example.com --name "Admin User"
 *
 * Prompts for a password (min 12 chars), hashes it, and inserts into the database.
 * Uses DATABASE_URL or individual POSTGRES_* env vars from .env / .env.local.
 *
 * --dev flag: generates a random 24-char password and prints it once (for local dev only).
 *
 * RUN ONCE PER ENVIRONMENT
 * ------------------------
 * Run this script only when bootstrapping the first admin for a new database.
 * Re-running with the same email OVERWRITES the password_hash for that user
 * (ON CONFLICT DO UPDATE). Do not use this script for routine password resets.
 */

'use strict';

const readline = require('readline');
const crypto = require('crypto');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env.local then .env
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
  const envPath = path.join(__dirname, '..', file);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// Simple arg parsing
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const email = getArg('--email');
const name = getArg('--name');
const isDev = hasFlag('--dev');

if (!email || !name) {
  console.error('Usage: node scripts/create-admin.js --email <email> --name "<name>" [--dev]');
  process.exit(1);
}

async function hashPassword(password) {
  // Dynamic require to avoid bundler issues
  const bcrypt = require('bcrypt');
  return bcrypt.hash(password, 10);
}

/** Mirrors src/common/utils/databaseSsl.ts */
function getDatabaseSslConfig() {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.toLowerCase() !== 'false';
  return { rejectUnauthorized };
}

async function createAdmin(password) {
  const hash = await hashPassword(password);

  const client = new Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ssl: getDatabaseSslConfig() }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
          user: process.env.POSTGRES_USER,
          password: process.env.POSTGRES_PASSWORD,
          database: process.env.POSTGRES_DB,
        }
  );

  await client.connect();

  try {
    const result = await client.query(
      `INSERT INTO hms_user (email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, is_active = true
       RETURNING id, email, name, role`,
      [email, hash, name]
    );

    const user = result.rows[0];
    console.log(`✅ Admin user created/updated (run once per environment — re-run resets password for this email):`);
    console.log(`   ID:    ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name:  ${user.name}`);
    console.log(`   Role:  ${user.role}`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (isDev) {
    const password = crypto.randomBytes(18).toString('base64').slice(0, 24);
    console.log(`⚠️  DEV MODE: generated password = ${password}`);
    console.log('   Store this securely — it will not be shown again.');
    await createAdmin(password);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.stdoutMuted = true;

  const ask = (prompt) =>
    new Promise((resolve) => {
      process.stdout.write(prompt);
      rl.question('', (answer) => {
        process.stdout.write('\n');
        resolve(answer);
      });
    });

  // Mute echoing
  rl._writeToOutput = (s) => {
    if (rl.stdoutMuted) process.stdout.write('*');
    else process.stdout.write(s);
  };

  const password = await ask('Password (min 12 chars): ');
  const confirm = await ask('Confirm password: ');
  rl.close();

  if (password !== confirm) {
    console.error('❌ Passwords do not match.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('❌ Password must be at least 12 characters.');
    process.exit(1);
  }

  await createAdmin(password);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
