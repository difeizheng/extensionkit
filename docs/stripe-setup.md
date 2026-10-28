# Stripe setup (payment → license, hands-off)

The goal: a buyer pays → Stripe calls your webhook → the server mints and stores a license
key → you deliver it. Two Stripe objects are needed: a **Payment Link** and a **webhook endpoint**.

## 1. Create a Payment Link

Stripe Dashboard → **Payment links** → New.

- Product: your extension's Pro version (e.g. "MyExtension Pro — lifetime")
- Price: one-time (for lifetime licenses; subscriptions are covered in the Pro pack)
- After payment: leave "Don't show a confirmation page" — the webhook does the work

Copy the link (`https://buy.stripe.com/...`). This is what your extension's landing page
and options page link to.

## 2. Create the webhook endpoint

Stripe Dashboard → **Developers → Webhooks** → Add endpoint.

- URL: `https://your-license-server.example.com/v1/webhooks/stripe`
- Event: `checkout.session.completed` (that's the only one needed)
- Copy the **Signing secret** (`whsec_...`) into your server's `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart the server. Until this variable is set, the webhook route returns `503` on purpose —
an unverified webhook would let anyone mint free licenses.

## 3. Test it

With the Stripe CLI:

```bash
stripe listen --forward-to localhost:8787/v1/webhooks/stripe
stripe trigger checkout_session_completed
```

Or make a real €1 test purchase with your own Payment Link in test mode.

Expected server log:

```
[stripe] issued license XXXX-XXXX-XXXX-XXXX for session cs_test_...
```

## 4. Deliver the key

For your first sales, deliver keys manually (the admin API makes this trivial):

```bash
curl -H "Authorization: Bearer $ADMIN_KEY" https://your-server/admin/licenses
```

The Pro pack includes an admin dashboard page and automated delivery email templates.
A free approach: Stripe's receipt email + a humanized reply with the key (totally fine
at low volume, and you'll want to see your first customers anyway).

## How the webhook is protected

- Signature header (`Stripe-Signature: t=...,v1=...`) is verified with an HMAC against
  the raw request body — forged or tampered payloads are rejected with `400`.
- Timestamps older than 5 minutes are rejected (replay window, same as Stripe SDKs).
- Replays of the *same* checkout session return the *same* key (`duplicate: true`)
  instead of minting a second license — so Stripe's retries are safe.
