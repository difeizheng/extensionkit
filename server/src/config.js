'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadEnv(dir) {
  const envPath = path.join(dir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

function int(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function buildConfig(dir) {
  loadEnv(dir);
  return {
    port: int('PORT', 8787),
    licenseSecret: required('LICENSE_SECRET'),
    adminKey: required('ADMIN_KEY'),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    maxActivationsPerKey: int('MAX_ACTIVATIONS_PER_KEY', 3),
    tokenTtlDays: int('TOKEN_TTL_DAYS', 7),
    graceDays: int('GRACE_DAYS', 3),
    trustProxy: process.env.TRUST_PROXY === '1',
    rateLimit: {
      windowMs: int('RATE_LIMIT_WINDOW_MS', 60000),
      activatePerMin: int('RATE_LIMIT_ACTIVATE_PER_MIN', 10),
      validatePerMin: int('RATE_LIMIT_VALIDATE_PER_MIN', 120),
      deactivatePerMin: int('RATE_LIMIT_DEACTIVATE_PER_MIN', 30),
      adminPerMin: int('RATE_LIMIT_ADMIN_PER_MIN', 120),
    },
    dbFile: process.env.DB_FILE || path.join(dir, 'data', 'licenses.db'),
  };
}

module.exports = { buildConfig };
