'use strict';

const crypto = require('node:crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * Issues a short-lived HMAC token the extension can cache and verify offline
 * until `exp`. Payload: { lic, inst, iat, exp }.
 */
function signToken(secret, licenseKey, instanceId, ttlDays) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { lic: licenseKey, inst: instanceId, iat: now, exp: now + ttlDays * 86400 };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(secret, token) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Human-friendly license key: XXXX-XXXX-XXXX-XXXX from 128 bits of entropy. */
function generateLicenseKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 — avoids support tickets
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

module.exports = { signToken, verifyToken, generateLicenseKey };
