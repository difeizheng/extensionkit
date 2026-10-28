# Getting started

Goal: a running license server + the demo extension activated against it, in ~5 minutes.

## 1. Start the server

Requirements: Node.js ≥ 22.5 (uses the built-in `node:sqlite`).

```bash
cd server
cp .env.example .env
```

Edit `.env`:

```bash
# generate a real secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- `LICENSE_SECRET` — paste the generated value (signs the offline tokens)
- `ADMIN_KEY` — any long random string (protects `/admin/*`)
- Leave `STRIPE_WEBHOOK_SECRET` empty for now (local testing doesn't need it)

```bash
node src/index.js
# License server listening on http://localhost:8787
```

## 2. Create a test license

The server mints keys automatically from Stripe webhooks (next section), but for local
testing create one directly with a two-line script:

```bash
node -e "
const { openDb } = require('./src/db');
const { generateLicenseKey } = require('./src/tokens');
const { buildConfig } = require('./src/config');
const cfg = buildConfig(__dirname);
const key = generateLicenseKey();
openDb(cfg.dbFile).createLicense({ key, email: 'test@example.com', stripeSession: 'manual-test', maxActivations: 3 });
console.log('license key:', key);
"
```

## 3. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder

## 4. Point the extension at your server

Open `extension/lib/license-client.js` and set:

```js
const SERVER_URL = 'http://localhost:8787';
```

Also update `host_permissions` in `extension/manifest.json`:

```json
"host_permissions": ["http://localhost:8787/*"]
```

Reload the extension in `chrome://extensions`.

## 5. Activate

Click the extension icon → **Manage license** → paste the key from step 2 → **Activate**.

You should see `ACTIVE` in the popup, and "Run Pro feature" should work. In the options
page you can **Deactivate this device** and watch the slot free up.

## 6. Run the server tests

```bash
cd server
npm test
```

9 tests cover activation, device limits, token signatures, Stripe webhook signature
verification, replay protection, and admin auth.

## What next?

- Wire up real payments: [stripe-setup.md](stripe-setup.md)
- Put it online: [deploy.md](deploy.md)
- Make it yours: [customization.md](customization.md)
