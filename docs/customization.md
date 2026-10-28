# Making it yours

The kit is deliberately small. Here's where everything lives and what you're expected to change.

## The one mandatory edit

`extension/lib/license-client.js`:

```js
const SERVER_URL = 'https://your-license-server.example.com';
```

plus the matching `host_permissions` entry in `extension/manifest.json`.

## Rename & rebrand

| What | Where |
|---|---|
| Extension name/description | `extension/manifest.json` |
| Popup text & layout | `extension/popup/popup.html` |
| Options page copy | `extension/options/options.html` |
| Branding in server logs | `server/src/index.js` (cosmetic) |

## Gate your real Pro features

In the popup and in any extension page:

```js
if (await LicenseClient.isLicensed()) {
  runProFeature();
} else {
  showUpgradePrompt(); // link to your Stripe Payment Link
}
```

`isLicensed()` is offline-first: it uses the cached signed token when fresh and never
blocks your users on a network hiccup. Put `await LicenseClient.isLicensed()` in your
service worker too if the gated logic runs in the background (the revalidation alarm
keeps the token warm).

## Security model — what protects you

1. **The server is the only issuer of truth.** Tokens are HMAC-SHA256 signatures over
   `{license, instance, issued-at, expires-at}` — tampering breaks the signature.
2. **Offline window is bounded.** A revoked/refunded key stops validating within
   `TOKEN_TTL_DAYS` (default 7) — the maximum a cracked client stays ahead of you.
   Set it to 1 day for tightly-gated products; the client revalidates silently.
3. **Device slots cap casual sharing.** Default 3 per key; users self-serve deactivate.
   Raise it for team products, lower it for per-seat pricing.

Honest caveat: *any* client-side license check in a JS extension can be patched out by a
determined attacker. What you're buying here is the standard industry level of protection
(same as most paid extensions): it stops 99% of users, is a real product to maintain, and
keeps honest people honest. Ship your value server-side where it matters.

## Tunables (server `.env`)

| Var | Default | Meaning |
|---|---|---|
| `MAX_ACTIVATIONS_PER_KEY` | 3 | devices per key |
| `TOKEN_TTL_DAYS` | 7 | offline grace window |
| `PORT` | 8787 | listen port |

## Adding endpoints

`server/src/index.js` is ~230 lines of plain `node:http` with zero frameworks. Copy the
`handleActivate` pattern: read body → validate → touch DB → `json(res, 200, {...})`.
The DB helper in `db.js` is the place for new queries.
