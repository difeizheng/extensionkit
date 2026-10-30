'use strict';

/**
 * Rate limit tests in an isolated process (own env + fresh limiter):
 *   - activate is limited to RATE_LIMIT_ACTIVATE_PER_MIN per client
 *   - 429 carries a Retry-After header
 *   - Stripe webhooks are exempt (must never be turned away)
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.LICENSE_SECRET = 'rl-test-secret-0123456789abcdef0123456789';
process.env.ADMIN_KEY = 'rl-test-admin-key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_rl_test_0123456789';
process.env.RATE_LIMIT_ACTIVATE_PER_MIN = '5';
process.env.DB_FILE = path.join(os.tmpdir(), `extensionkit-rl-test-${process.pid}.db`);

function findCoreIndex() {
  const candidates = [
    path.join(__dirname, '../src/index.js'),
    path.join(__dirname, '../../core/server/src/index.js'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('core server index.js not found');
  return found;
}

const { server, CONFIG } = require(findCoreIndex());

test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
});

test.after(() => {
  server.close();
  try { fs.unlinkSync(CONFIG.dbFile); } catch {}
});

async function activate() {
  const res = await fetch(baseUrl + '/v1/licenses/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: 'AAAA-BBBB-CCCC-DDDD', instance_id: 'rl-device-0001' }),
  });
  return { status: res.status, retryAfter: res.headers.get('retry-after') };
}

let baseUrl;

// set after listen; activate() closes over baseUrl via hoisted let
test.before(() => {
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('activate rejects the 6th call inside the window with 429 + Retry-After', async () => {
  for (let i = 0; i < 5; i += 1) {
    const r = await activate();
    assert.equal(r.status, 403, `call ${i + 1} passes the limiter (403 = license check, expected)`);
    assert.equal(r.retryAfter, null);
  }
  const sixth = await activate();
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.retryAfter) >= 1, 'Retry-After header present');
});

test('stripe webhooks bypass the rate limiter', async () => {
  const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_rl_001', customer_details: { email: 'rl@example.com' } } } };
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  const res = await fetch(baseUrl + '/v1/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` },
    body: raw,
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
});

test('healthz is exempt', async () => {
  const res = await fetch(baseUrl + '/healthz');
  assert.equal(res.status, 200);
});
