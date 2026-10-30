'use strict';

const http = require('node:http');
const path = require('node:path');
const { buildConfig } = require('./config');
const { openDb } = require('./db');
const { signToken, verifyToken, generateLicenseKey } = require('./tokens');
const { verifyStripeSignature, parseCheckoutCompleted } = require('./stripe');
const { createRateLimiter } = require('./ratelimit');

const CONFIG = buildConfig(__dirname);
const store = openDb(CONFIG.dbFile);

// Per-client fixed-window rate limits. Webhooks and health checks are exempt:
// Stripe retries are legitimate traffic and must never be turned away.
const rateLimit = createRateLimiter({
  windowMs: CONFIG.rateLimit.windowMs,
  limits: {
    activate: CONFIG.rateLimit.activatePerMin,
    validate: CONFIG.rateLimit.validatePerMin,
    deactivate: CONFIG.rateLimit.deactivatePerMin,
    admin: CONFIG.rateLimit.adminPerMin,
    default: 60,
  },
});

function routeClass(pathname) {
  if (pathname === '/v1/licenses/activate') return 'activate';
  if (pathname === '/v1/licenses/validate') return 'validate';
  if (pathname === '/v1/licenses/deactivate') return 'deactivate';
  if (pathname.startsWith('/admin/')) return 'admin';
  return 'default';
}

function rateLimitDenied(res, check) {
  const payload = JSON.stringify({ error: 'rate limited', retry_after: check.retryAfterSeconds });
  res.writeHead(429, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Retry-After': String(check.retryAfterSeconds),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

// Optional plugin (Pro pack): handles subscription lifecycle webhooks.
// Set SUBSCRIPTION_MODULE=/path/to/subscription.js to enable; without it the
// server still handles one-time/lifetime keys exactly as before.
let subscriptionModule = null;
if (process.env.SUBSCRIPTION_MODULE) {
  try {
    subscriptionModule = require(path.resolve(process.env.SUBSCRIPTION_MODULE));
    console.log(`[config] subscription module loaded: ${process.env.SUBSCRIPTION_MODULE}`);
  } catch (err) {
    console.error(`[config] SUBSCRIPTION_MODULE failed to load: ${err.message}`);
  }
}

const MAX_BODY_BYTES = 256 * 1024;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(payload);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function cleanString(v, maxLen) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, maxLen) : null;
}

const INSTANCE_ID_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleActivate(req, res) {
  const body = await readJson(req);
  if (!body) return fail(res, 400, 'invalid JSON body');
  const key = cleanString(body.license_key, 64);
  const instanceId = cleanString(body.instance_id, 128);
  if (!key || !instanceId || !INSTANCE_ID_RE.test(instanceId)) {
    return fail(res, 400, 'license_key and instance_id (8-128 url-safe chars) are required');
  }
  const license = store.getLicense(key);
  if (!license || license.status !== 'active') return fail(res, 403, 'license not found or inactive');

  const existing = store.listActivations(key);
  const already = existing.some((a) => a.instance_id === instanceId);
  if (!already && existing.length >= license.max_activations) {
    return fail(res, 409, `activation limit reached (${license.max_activations}). Deactivate a device first.`);
  }
  store.activate(key, instanceId);
  const token = signToken(CONFIG.licenseSecret, key, instanceId, CONFIG.tokenTtlDays);
  json(res, 200, {
    ok: true,
    token,
    expires_at: Date.now() + CONFIG.tokenTtlDays * 86400 * 1000,
    activations_used: already ? existing.length : existing.length + 1,
    activations_max: license.max_activations,
  });
}

async function handleValidate(req, res) {
  const body = await readJson(req);
  if (!body) return fail(res, 400, 'invalid JSON body');
  const key = cleanString(body.license_key, 64);
  const instanceId = cleanString(body.instance_id, 128);
  if (!key || !instanceId) return fail(res, 400, 'license_key and instance_id are required');
  const license = store.getLicense(key);
  // 'canceled' subscriptions stay usable until expires_at + grace (checked below).
  if (!license || (license.status !== 'active' && license.status !== 'canceled')) {
    return json(res, 200, { ok: false, reason: 'inactive' });
  }
  if (license.expires_at) {
    const graceMs = (license.grace_days == null ? CONFIG.graceDays : license.grace_days) * 86400000;
    if (Date.now() > license.expires_at + graceMs) {
      return json(res, 200, { ok: false, reason: 'subscription_expired' });
    }
  }
  const known = store.listActivations(key).some((a) => a.instance_id === instanceId);
  if (!known) return json(res, 200, { ok: false, reason: 'not_activated' });
  store.touch(key, instanceId);
  const token = signToken(CONFIG.licenseSecret, key, instanceId, CONFIG.tokenTtlDays);
  json(res, 200, { ok: true, token, expires_at: Date.now() + CONFIG.tokenTtlDays * 86400 * 1000 });
}

async function handleDeactivate(req, res) {
  const body = await readJson(req);
  if (!body) return fail(res, 400, 'invalid JSON body');
  const key = cleanString(body.license_key, 64);
  const instanceId = cleanString(body.instance_id, 128);
  if (!key || !instanceId) return fail(res, 400, 'license_key and instance_id are required');
  store.deactivate(key, instanceId);
  json(res, 200, { ok: true });
}

async function handleStripeWebhook(req, res) {
  if (!CONFIG.stripeWebhookSecret) {
    return fail(res, 503, 'webhooks not configured: set STRIPE_WEBHOOK_SECRET in .env');
  }
  const raw = await readBody(req);
  const signature = req.headers['stripe-signature'];
  if (!verifyStripeSignature(raw.toString('utf8'), signature, CONFIG.stripeWebhookSecret)) {
    return fail(res, 400, 'invalid stripe signature');
  }
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return fail(res, 400, 'invalid JSON payload');
  }
  const checkout = parseCheckoutCompleted(event);
  if (checkout) {
    const existing = store.listLicenses().find((l) => l.stripe_session === checkout.sessionId);
    if (existing) {
      return json(res, 200, { ok: true, duplicate: true, license_key: existing.key });
    }
    const key = generateLicenseKey();
    store.createLicense({
      key,
      email: checkout.email,
      stripeSession: checkout.sessionId,
      maxActivations: CONFIG.maxActivationsPerKey,
      subscriptionId: checkout.subscription,
    });
    console.log(`[stripe] issued license ${key} for session ${checkout.sessionId}`);
    return json(res, 200, { ok: true, license_key: key });
  }
  if (subscriptionModule && subscriptionModule.handleSubscriptionEvent(store, event, CONFIG)) {
    return json(res, 200, { ok: true, handled_by_subscription_module: true });
  }
  json(res, 200, { ok: true, ignored: event && event.type });
}

function handleAdmin(req, res, pathname) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${CONFIG.adminKey}`) return fail(res, 401, 'unauthorized');
  if (req.method === 'GET' && pathname === '/admin/licenses') {
    return json(res, 200, { licenses: store.listLicenses() });
  }
  // Manually issue a license (comps, refunds-turned-gifts, non-Stripe sales).
  if (req.method === 'POST' && pathname === '/admin/licenses') {
    return readJson(req).then((body) => {
      if (!body) return fail(res, 400, 'invalid JSON body');
      const email = cleanString(body.email, 200);
      const maxActivations = Number.isFinite(Number(body.max_activations)) && Number(body.max_activations) > 0
        ? Math.floor(Number(body.max_activations))
        : CONFIG.maxActivationsPerKey;
      const key = generateLicenseKey();
      store.createLicense({ key, email, stripeSession: body.stripe_session || `manual:${Date.now()}`, maxActivations });
      json(res, 200, { ok: true, license_key: key });
    });
  }
  // Revoke / restore a license: PATCH /admin/licenses/XXXX-XXXX-XXXX-XXXX
  const match = pathname.match(/^\/admin\/licenses\/([A-Z0-9-]{10,64})$/);
  if (req.method === 'PATCH' && match) {
    return readJson(req).then((body) => {
      if (!body) return fail(res, 400, 'invalid JSON body');
      const status = body.status;
      if (status !== 'active' && status !== 'revoked') {
        return fail(res, 400, "status must be 'active' or 'revoked'");
      }
      const license = store.getLicense(match[1]);
      if (!license) return fail(res, 404, 'license not found');
      store.setStatus(match[1], status);
      json(res, 200, { ok: true, license_key: match[1], status });
    });
  }
  fail(res, 404, 'not found');
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }
    const exemptFromLimit = pathname === '/healthz' || pathname.startsWith('/v1/webhooks/');
    if (!exemptFromLimit) {
      const client = CONFIG.trustProxy && req.headers['x-forwarded-for']
        ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
        : (req.socket && req.socket.remoteAddress) || 'unknown';
      const check = rateLimit(client, routeClass(pathname));
      if (!check.allowed) return rateLimitDenied(res, check);
    }
    if (req.method === 'GET' && pathname === '/healthz') {
      return json(res, 200, { ok: true, uptime: process.uptime() });
    }
    if (req.method === 'POST' && pathname === '/v1/licenses/activate') return handleActivate(req, res);
    if (req.method === 'POST' && pathname === '/v1/licenses/validate') return handleValidate(req, res);
    if (req.method === 'POST' && pathname === '/v1/licenses/deactivate') return handleDeactivate(req, res);
    if (req.method === 'POST' && pathname === '/v1/webhooks/stripe') return handleStripeWebhook(req, res);
    if (pathname.startsWith('/admin/')) return handleAdmin(req, res, pathname);
    fail(res, 404, 'not found');
  } catch (err) {
    console.error('[server]', err);
    fail(res, err.statusCode || 500, err.statusCode ? err.message : 'internal error');
  }
});

if (require.main === module) {
  server.listen(CONFIG.port, () => {
    console.log(`License server listening on http://localhost:${CONFIG.port}`);
    console.log(`  db: ${CONFIG.dbFile}`);
    console.log(`  max activations per key: ${CONFIG.maxActivationsPerKey}, token TTL: ${CONFIG.tokenTtlDays}d`);
  });
}

module.exports = { server, CONFIG };
