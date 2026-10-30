'use strict';

/**
 * Minimal in-memory rate limiter (zero dependencies).
 *
 * Fixed-window counters keyed by `route|client`. Suited to a license server's
 * tiny traffic; not a general-purpose gateway. State resets on restart, which
 * is acceptable: worst case after a restart, a client gets one extra window.
 */
function createRateLimiter({ windowMs, limits }) {
  const hits = new Map();

  function check(key, route) {
    const limit = limits[route] != null ? limits[route] : limits.default;
    const now = Date.now();
    const mapKey = route + '|' + key;
    let entry = hits.get(mapKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(mapKey, entry);
    }
    entry.count += 1;
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }
    return {
      allowed: entry.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  return check;
}

module.exports = { createRateLimiter };
