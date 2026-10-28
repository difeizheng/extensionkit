'use strict';

/**
 * ExtensionKit license client — the only file you must edit.
 *
 * 1. Set SERVER_URL to your deployed license server (no trailing slash).
 * 2. Add the same origin to manifest.json host_permissions.
 *
 * Flow:
 *   activate(key)   -> POST /v1/licenses/activate  -> caches a signed token
 *   validate()      -> offline check when token is fresh, server refresh otherwise
 *   deactivate()    -> frees a device slot on the server
 *   isLicensed()    -> the single call your Pro features gate on
 */
(function (root) {
  const SERVER_URL = 'https://your-license-server.example.com';

  const STORAGE_KEYS = {
    licenseKey: 'ek_license_key',
    instanceId: 'ek_instance_id',
    token: 'ek_token',
    expiresAt: 'ek_expires_at',
    lastCheckedAt: 'ek_last_checked_at',
  };

  // Revalidate with the server when less than this much token life remains.
  const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

  function instanceId() {
    return chrome.storage.local.get({ [STORAGE_KEYS.instanceId]: null }).then((data) => {
      if (data[STORAGE_KEYS.instanceId]) return data[STORAGE_KEYS.instanceId];
      const fresh = crypto.randomUUID();
      return chrome.storage.local.set({ [STORAGE_KEYS.instanceId]: fresh }).then(() => fresh);
    });
  }

  async function cachedState() {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.licenseKey,
      STORAGE_KEYS.token,
      STORAGE_KEYS.expiresAt,
      STORAGE_KEYS.lastCheckedAt,
    ]);
    return {
      licenseKey: data[STORAGE_KEYS.licenseKey] || null,
      token: data[STORAGE_KEYS.token] || null,
      expiresAt: data[STORAGE_KEYS.expiresAt] || 0,
      lastCheckedAt: data[STORAGE_KEYS.lastCheckedAt] || 0,
    };
  }

  /**
   * A cached token is trustworthy until `expiresAt` because it is HMAC-signed
   * by the server; within the offline window we never require network access.
   */
  function tokenIsFresh(state, marginMs) {
    return Boolean(state.token && state.expiresAt - Date.now() > marginMs);
  }

  async function callServer(pathname, payload) {
    const res = await fetch(`${SERVER_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  async function activate(licenseKey) {
    const id = await instanceId();
    const { status, json } = await callServer('/v1/licenses/activate', {
      license_key: licenseKey.trim(),
      instance_id: id,
    });
    if (status !== 200 || !json.ok) {
      return { ok: false, error: json.error || `server returned ${status}` };
    }
    await chrome.storage.local.set({
      [STORAGE_KEYS.licenseKey]: licenseKey.trim(),
      [STORAGE_KEYS.token]: json.token,
      [STORAGE_KEYS.expiresAt]: json.expires_at,
      [STORAGE_KEYS.lastCheckedAt]: Date.now(),
    });
    return { ok: true };
  }

  /**
   * Returns { licensed: boolean, reason?: string }.
   * Offline-first: uses the cached token when fresh, refreshes from the server
   * otherwise. Network failures inside the offline window are not errors.
   */
  async function validate() {
    const state = await cachedState();
    if (!state.licenseKey) return { licensed: false, reason: 'no_license' };
    if (tokenIsFresh(state, 0)) {
      if (Date.now() - state.lastCheckedAt < REFRESH_MARGIN_MS) {
        return { licensed: true };
      }
    }
    if (tokenIsFresh(state, REFRESH_MARGIN_MS)) {
      // Token still has >24h left; try a silent refresh but tolerate failure.
      try {
        const id = await instanceId();
        const { json } = await callServer('/v1/licenses/validate', {
          license_key: state.licenseKey,
          instance_id: id,
        });
        if (json.ok) {
          await chrome.storage.local.set({
            [STORAGE_KEYS.token]: json.token,
            [STORAGE_KEYS.expiresAt]: json.expires_at,
            [STORAGE_KEYS.lastCheckedAt]: Date.now(),
          });
          return { licensed: true };
        }
        if (json.reason === 'inactive' || json.reason === 'not_activated') {
          return { licensed: false, reason: json.reason };
        }
      } catch (err) {
        console.warn('[license] refresh failed, staying offline-valid:', err);
      }
      return { licensed: true };
    }
    // Token expired: one hard revalidation attempt, then fail closed.
    try {
      const id = await instanceId();
      const { json } = await callServer('/v1/licenses/validate', {
        license_key: state.licenseKey,
        instance_id: id,
      });
      if (json.ok) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.token]: json.token,
          [STORAGE_KEYS.expiresAt]: json.expires_at,
          [STORAGE_KEYS.lastCheckedAt]: Date.now(),
        });
        return { licensed: true };
      }
    } catch (err) {
      console.warn('[license] revalidation unreachable:', err);
    }
    return { licensed: false, reason: 'expired_or_unreachable' };
  }

  async function isLicensed() {
    const { licensed } = await validate();
    return licensed;
  }

  async function deactivate() {
    const state = await cachedState();
    if (state.licenseKey) {
      const id = await instanceId();
      try {
        await callServer('/v1/licenses/deactivate', { license_key: state.licenseKey, instance_id: id });
      } catch (err) {
        console.warn('[license] deactivate call failed; clearing locally anyway:', err);
      }
    }
    await chrome.storage.local.remove([
      STORAGE_KEYS.licenseKey,
      STORAGE_KEYS.token,
      STORAGE_KEYS.expiresAt,
      STORAGE_KEYS.lastCheckedAt,
    ]);
    return { ok: true };
  }

  const api = { SERVER_URL, activate, validate, isLicensed, deactivate, cachedState };
  root.LicenseClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
