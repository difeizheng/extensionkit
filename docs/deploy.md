# Deploying the license server

The server is a single Node process with a SQLite file — it runs anywhere Node ≥ 22.5 runs.
Three proven paths, cheapest first.

## Option A: Railway / Render / Fly.io (easiest)

Any platform that runs `npm start` works. Railway specifics:

1. New project → Deploy from GitHub repo → select the `server/` directory (or monorepo root
   with start command `node server/src/index.js`... keep it simple: a repo containing only `server/`)
2. Add the env vars from `.env.example` (`LICENSE_SECRET`, `ADMIN_KEY`, ...)
3. Railway gives you `https://something.up.railway.app` — that's your `SERVER_URL`
4. Persistence: mount a volume at `/data` and set `DB_FILE=/data/licenses.db`
   (otherwise licenses reset on redeploy)

Free tiers exist on all three; a license server for one extension costs ~$5/mo or less.

## Option B: any VPS (Hetzner, DigitalOcean, a $4 box)

```bash
# with Node 22+ installed:
git clone <your repo> && cd server
cp .env.example .env   # fill in real secrets
node src/index.js      # it's literally this
```

Then put it behind Caddy (automatic HTTPS, 3-line config):

```
license.yourdomain.com {
    reverse_proxy localhost:8787
}
```

Run it under systemd (`Restart=always`). That's the whole production setup.

## Option C: serverless (advanced)

The code is dependency-free CommonJS, but SQLite needs a writable disk, so AWS Lambda /
Cloudflare Workers require swapping `node:sqlite` for Turso/LibreSQL or D1. Doable, but
start with Option A — a license server's traffic is tiny (a few calls per user per week).

## HTTPS is not optional

The extension sends license keys over the network. `SERVER_URL` must be `https://`
in production, and `manifest.json` `host_permissions` must match that origin.

## Post-deploy checklist

- [ ] `GET /healthz` returns `{"ok":true}` over HTTPS
- [ ] Stripe webhook endpoint created + `STRIPE_WEBHOOK_SECRET` set (see stripe-setup.md)
- [ ] `LICENSE_SECRET` and `ADMIN_KEY` are *not* the example values
- [ ] `DB_FILE` points at a persisted volume (Option A) or stable disk (Option B)
- [ ] One end-to-end test purchase done in Stripe test mode
