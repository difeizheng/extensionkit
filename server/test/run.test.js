'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.LICENSE_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.ADMIN_KEY = 'test-admin-key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `extensionkit-test-${process.pid}.db`);

const { server, CONFIG } = require('../src/index');
const { verifyToken, generateLicenseKey } = require('../src/tokens');
const { openDb } = require('../src/db');

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function post(p, body, headers = {}) {
  const res = await fetch(baseUrl + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

function seedLicense(key, maxActivations = 2) {
  openDb(CONFIG.dbFile).createLicense({
    key,
    email: 'buyer@example.com',
    stripeSession: `cs_test_${key}`,
    maxActivations,
  });
}

test('healthz responds ok', async () => {
  const res = await fetch(baseUrl + '/healthz');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('activate issues a verifiable token', async () => {
  const key = generateLicenseKey();
  seedLicense(key);
  const { status, json } = await post('/v1/licenses/activate', {
    license_key: key,
    instance_id: 'instance-abc12345',
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  const payload = verifyToken(CONFIG.licenseSecret, json.token);
  assert.ok(payload, 'token should verify');
  assert.equal(payload.lic, key);
  assert.equal(payload.inst, 'instance-abc12345');
});

test('activate rejects unknown license', async () => {
  const { status } = await post('/v1/licenses/activate', {
    license_key: 'AAAA-BBBB-CCCC-DDDD',
    instance_id: 'instance-abc12345',
  });
  assert.equal(status, 403);
});

test('activate enforces the per-key limit', async () => {
  const key = generateLicenseKey();
  seedLicense(key, 2);
  const first = await post('/v1/licenses/activate', { license_key: key, instance_id: 'device-1-aaaaaa' });
  assert.equal(first.status, 200);
  const second = await post('/v1/licenses/activate', { license_key: key, instance_id: 'device-2-bbbbbb' });
  assert.equal(second.status, 200);
  const third = await post('/v1/licenses/activate', { license_key: key, instance_id: 'device-3-cccccc' });
  assert.equal(third.status, 409);
  // re-activating an already-activated device must still succeed (idempotent)
  const again = await post('/v1/licenses/activate', { license_key: key, instance_id: 'device-1-aaaaaa' });
  assert.equal(again.status, 200);
});

test('validate after deactivate reports not_activated', async () => {
  const key = generateLicenseKey();
  seedLicense(key);
  await post('/v1/licenses/activate', { license_key: key, instance_id: 'device-x-123456' });
  const before = await post('/v1/licenses/validate', { license_key: key, instance_id: 'device-x-123456' });
  assert.equal(before.json.ok, true);
  await post('/v1/licenses/deactivate', { license_key: key, instance_id: 'device-x-123456' });
  const after = await post('/v1/licenses/validate', { license_key: key, instance_id: 'device-x-123456' });
  assert.equal(after.json.ok, false);
  assert.equal(after.json.reason, 'not_activated');
});

test('stripe webhook creates a license exactly once', async () => {
  const event = {
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_new_001', customer_details: { email: 'new-buyer@example.com' } } },
  };
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  const { status, json } = await post(
    '/v1/webhooks/stripe',
    event,
    { 'Stripe-Signature': `t=${t},v1=${sig}` }
  );
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.match(json.license_key, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);

  // replay: same session must not mint a second key
  const replay = await post('/v1/webhooks/stripe', event, { 'Stripe-Signature': `t=${t},v1=${sig}` });
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.license_key, json.license_key);

  // the issued key must activate
  const activation = await post('/v1/licenses/activate', {
    license_key: json.license_key,
    instance_id: 'fresh-device-0001',
  });
  assert.equal(activation.status, 200);
});

test('stripe webhook rejects bad signatures', async () => {
  const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_evil' } } };
  const { status } = await post('/v1/webhooks/stripe', event, { 'Stripe-Signature': 't=1,v1=deadbeef' });
  assert.equal(status, 400);
});

test('admin endpoints require the bearer key', async () => {
  const denied = await fetch(baseUrl + '/admin/licenses');
  assert.equal(denied.status, 401);
  const ok = await fetch(baseUrl + '/admin/licenses', {
    headers: { Authorization: `Bearer ${CONFIG.adminKey}` },
  });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.ok(Array.isArray(body.licenses) && body.licenses.length >= 3);
});

test('cleanup temp db', () => {
  try { fs.unlinkSync(CONFIG.dbFile); } catch {}
});
