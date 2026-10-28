# FAQ

**Why license keys instead of Chrome's built-in payments?**
Chrome Web Store payments was deprecated in 2020-2021. Since then every extension
developer has had to roll their own Stripe integration — this kit is exactly that,
pre-built and tested.

**Why not just use Firebase/Supabase + some tutorial code?**
You can. You'll spend a weekend on webhook signatures, replay protection, device slots,
offline grace periods, and the activation UX — then maintain it. This kit is that
weekend, done, with tests. If you enjoy building it yourself, the free core is MIT —
steal freely.

**What happens offline?**
The extension caches an HMAC-signed token for `TOKEN_TTL_DAYS` (default 7). Validation
against the server is a silent background refresh. A user on a flight stays licensed.

**What happens when a customer refunds?**
Deactivate their key server-side (one admin API call / SQL line). Their extension stops
validating within the token TTL.

**Can a user share one key with 10 friends?**
`MAX_ACTIVATIONS_PER_KEY` (default 3) caps concurrent devices, and users can see+free
their own slots. Determined pirates can defeat *any* client-side check — see the honest
note in customization.md.

**Is the server really dependency-free?**
`package.json` has no dependencies. Everything is Node built-ins: `node:http`,
`node:crypto`, `node:sqlite`, `node:fs`. That means no `npm install`, no supply-chain
audit surface, and it will still boot in 2030.

**Does it work in Firefox/Safari?**
The extension uses plain MV3 APIs (`storage`, `alarms`, fetch) that work in Firefox.
Safari needs conversion but nothing here is Chrome-specific.

**Subscriptions / trials / upgrades?**
The free core covers one-time lifetime keys. Subscription handling (expiry-aware keys
that renew via `invoice.paid`), trials, and upgrade paths are in the Pro pack.
