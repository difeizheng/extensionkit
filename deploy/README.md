# deploy/ — shipping the license server

Two supported one-liner paths. Pick one; they do the same thing.

## A. Bare VPS (systemd) — recommended

```bash
curl -fsSL https://raw.githubusercontent.com/difeizheng/extensionkit/main/deploy/install.sh | sudo bash
```

The script clones the repo to `/opt/extensionkit`, generates a real
`LICENSE_SECRET` and `ADMIN_KEY`, writes a hardened systemd unit, starts the
server and waits for `/healthz`.

- **Idempotent**: run it again to pull updates. Your `.env` is never
  overwritten, so secrets and issued licenses survive.
- **Needs**: Node.js ≥ 22.5 (`node:sqlite`), git, curl.
- **Data**: `/var/lib/extensionkit/licenses.db`. Back up that file plus
  `/opt/extensionkit/server/.env` — together they are the business.

Optional env overrides: `EXTENSIONKIT_DIR`, `EXTENSIONKIT_DATA_DIR`, `PORT`,
`EXTENSIONKIT_REPO`.

## B. Docker Compose

```bash
cd deploy
cp ../server/.env.example .env     # fill in real secrets
docker compose up -d
```

The compose file builds from `deploy/Dockerfile`, publishes the port on
`127.0.0.1` only (put a reverse proxy in front — see below) and keeps the
database in `./data`.

## HTTPS is not optional

License keys travel over the network. The server must be reachable over
`https://`, and the extension's `host_permissions` must match that origin.
With Caddy it is three lines and the certificate is free:

```
license.yourdomain.com {
    reverse_proxy 127.0.0.1:8787
}
```

## Post-deploy checklist

- [ ] `GET https://license.yourdomain.com/healthz` returns `{"ok":true}`
- [ ] `LICENSE_SECRET` and `ADMIN_KEY` are not the example values
- [ ] `STRIPE_WEBHOOK_SECRET` set and the webhook endpoint pointed at
      `https://license.yourdomain.com/v1/webhooks/stripe`
- [ ] `DB_FILE` points at a persistent path (volume or stable disk)
- [ ] One end-to-end test purchase in Stripe test mode
- [ ] Backups scheduled for `.env` and the database file
