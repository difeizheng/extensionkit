'use strict';

const crypto = require('node:crypto');

/**
 * Verifies a Stripe webhook signature header (`Stripe-Signature: t=...,v1=...`)
 * against the raw request body. Returns true when authentic and fresh (5 min
 * tolerance, same as Stripe's SDK default).
 */
function verifyStripeSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!secret || typeof header !== 'string') return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=', 2).map((s) => s.trim()))
  );
  const timestamp = parts.t;
  if (!timestamp || !parts.v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extracts what we need from a checkout.session.completed event. */
function parseCheckoutCompleted(event) {
  if (!event || event.type !== 'checkout.session.completed') return null;
  const session = event.data && event.data.object;
  if (!session) return null;
  return {
    sessionId: session.id,
    email: (session.customer_details && session.customer_details.email) || session.customer_email || '',
    // Present when the Payment Link / Checkout Session is subscription-mode.
    subscription: session.subscription || null,
  };
}

module.exports = { verifyStripeSignature, parseCheckoutCompleted };
