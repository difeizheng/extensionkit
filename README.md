# ExtensionKit

**The fastest way to start charging money for your browser extension.**

License keys, a Stripe checkout → license delivery pipeline, offline validation, and a device-slot system — in one weekend-downloadable kit. **Zero npm dependencies** on the server; **zero build step** in the extension.

```
┌──────────────┐  pays   ┌─────────────────┐  webhook  ┌────────────────────┐
│    Buyer     │ ──────► │ Stripe Checkout │ ────────► │  License Server    │
└──────────────┘         └─────────────────┘           │  (this repo)       │
                                                       │  · issues key      │
┌──────────────┐  activates / validates (offline-first)│  · signs tokens    │
│  Extension   │ ◄───────────────────────────────────  │  · device slots    │
│ (this repo)  │                                       └────────────────────┘
└──────────────┘
```

## Why this exists

Every indie developer who ships a browser extension eventually hits the same wall:
**"How do I take payments for this?"** Chrome has no built-in payments anymore, Stripe
doesn't know what a "device" is, and rolling your own licensing is a week of yak-shaving
(webhook signatures, replay attacks, offline grace periods, shared devices...).

ExtensionKit is that week, already done — with tests.

## What's in the box

| Piece | What it does | Dependencies |
|---|---|---|
| `server/` | License server: issues keys from Stripe webhooks, activates devices, signs offline tokens, exposes an admin API | **0** (Node ≥ 22.5 built-ins only) |
| `extension/` | MV3 reference extension: activation UI, offline-first validation, periodic revalidation alarm, gated Pro feature | **0** (vanilla JS, no build) |
| `docs/` | Stripe setup, deployment (Railway/Fly/VPS), customization guide | — |

## Features

- **Stripe Checkout → license key, hands-off.** Configure a Payment Link + one webhook;
  every payment automatically mints a license key. Replay-protected, signature-verified.
- **Offline-first validation.** The extension caches an HMAC-signed token (default 7 days).
  Users on planes, in tunnels, or behind firewalls stay licensed. Renewal is silent.
- **Device slots without lock-ins.** Each key supports N devices (default 3); users can
  self-serve deactivate to free a slot. No support tickets.
- **Human-friendly keys.** `XXXX-XXXX-XXXX-XXXX` with the ambiguous chars (I, O, 0, 1)
  removed — fewer "it says invalid key" emails.
- **Zero-dependency server.** `node src/index.js` and you're live on any VPS, container,
  or free tier. SQLite storage via Node's built-in `node:sqlite`. Optional plugin hook
  (`SUBSCRIPTION_MODULE`) adds subscription-aware licensing without touching the core.
- **Tested.** The server ships with an end-to-end test suite (`npm test`): activation
  limits, token signatures, webhook forgery, replay protection, admin auth.

## Quickstart (5 minutes)

```bash
git clone https://github.com/difeizheng/extensionkit.git
cd extensionkit/server
cp .env.example .env          # then: fill LICENSE_SECRET & ADMIN_KEY
node src/index.js             # → http://localhost:8787
```

Load `extension/` in Chrome (`chrome://extensions` → Developer mode → Load unpacked),
point `extension/lib/license-client.js` at your server URL, activate a test key — done.

Full walkthrough: [docs/getting-started.md](docs/getting-started.md) ·
Stripe wiring: [docs/stripe-setup.md](docs/stripe-setup.md) ·
Deploy: [docs/deploy.md](docs/deploy.md)

## API

| Endpoint | Purpose |
|---|---|
| `POST /v1/licenses/activate` | Bind a license key to a device, get a signed token |
| `POST /v1/licenses/validate` | Refresh / verify a device (offline-first on the client) |
| `POST /v1/licenses/deactivate` | Free a device slot |
| `POST /v1/webhooks/stripe` | Payment → license key (signature-verified) |
| `GET /admin/licenses` | List licenses + activation counts (Bearer admin key) |
| `POST /admin/licenses` | Manually issue a license (comps, gifts, non-Stripe sales) |
| `PATCH /admin/licenses/:key` | Revoke or restore a license |
| `GET /healthz` | Health check |

## The Pro version

This repo is the free, MIT-licensed core. The **Pro pack** (paid) adds:

- Admin dashboard page (issue/refund/revoke keys from a browser, no SQL)
- Subscription-aware webhook handling (monthly keys that expire & renew)
- Chrome Web Store listing templates + launch checklist
- Email templates for license delivery & support
- 45-minute setup video walkthrough

→ [Get the Pro pack](https://YOUR-GUMROAD-LINK) *(link placeholder — see listing.md)*

## License

MIT — use it in commercial projects. Attribution appreciated, not required.
