# CLOUDFLARE.md — Deployment & Tunnel Configuration

## Architecture

Single deployment on the business Cloudflare account (materalabs.us):

```
User → materalabs.us/x9.150/* (Worker: x9-150-wallet, route-based)
         ├─ /x9.150/fetch, /generate, /notify → strip prefix → proxy to tunnel
         │     → x9-api.materalabs.us → cloudflared → localhost:5010 → qr_appserver.py
         └─ /x9.150/* → strip prefix → static assets (dist/)
```

## Account Setup

| Resource | Account | Account ID |
|---|---|---|
| DNS zone `materalabs.us` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |
| Worker `x9-150-wallet` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |
| Route `materalabs.us/x9.150/*` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |
| Tunnel `x9-api-materalabs` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |

The worker uses a **route** (`materalabs.us/x9.150/*`) instead of a custom domain. This allows it to coexist with the existing "materalabs" worker that serves the root domain. Cloudflare routes are matched by specificity — the `/x9.150/*` route takes priority over the catch-all.

### Wrangler Login

Wrangler must be logged in with an account that has access to the business account:

```bash
npx wrangler login  # Opens browser — log in as carlos.netto@matera.com
npx wrangler whoami  # Verify: should show Tic.cloud / 45281eba...
```

### Cloudflared Login

Cloudflared uses `~/.cloudflared/cert.pem` — tied to a single zone. Must be set to **materalabs.us**.

```bash
rm ~/.cloudflared/cert.pem
cloudflared tunnel login  # Opens browser — select materalabs.us
```

## DNS Records (materalabs.us)

| Type | Name | Content | Notes |
|---|---|---|---|
| Worker | materalabs.us | materalabs | Existing worker (root domain — do not touch) |
| Tunnel | x9-api | x9-api-materalabs | Routes to cloudflared tunnel |

## Files

| File | Purpose |
|---|---|
| `wrangler.jsonc` | Worker config: name `x9-150-wallet`, business account, route `materalabs.us/x9.150/*` |
| `worker.ts` | Strips `/x9.150` prefix, then proxies API calls or serves assets + SPA fallback |
| `.env.production` | `VITE_QRAPPSERVER_URL=/x9.150` (API calls go to `/x9.150/fetch` etc.) |
| `.env.local` | Local dev: `VITE_QRAPPSERVER_URL=http://localhost:5010` |

## Deploy Commands

```bash
# Build and deploy (no flags needed)
npm run build && npx wrangler deploy
```

`vite.config.ts` has `base: '/x9.150/'` hardcoded, and `.env.production` sets the correct `VITE_QRAPPSERVER_URL`.

### Start the tunnel

```bash
./tunnel.sh   # reads .tunnel-token, uses tunnel-config.yml
```

`tunnel.sh` reads the token from `.tunnel-token` (gitignored) and runs with `--config tunnel-config.yml` to bypass `~/.cloudflared/config.yml` on shared servers.

To regenerate `.tunnel-token`:
```bash
cloudflared tunnel token 6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04 > .tunnel-token
```

## Tunnel Details

- **Tunnel name:** `x9-api-materalabs`
- **Tunnel ID:** `6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04`
- **Token:** stored in `.tunnel-token` (gitignored)
- **Config:** `tunnel-config.yml` (ingress only, committed to git)
- **Routes:** `x9-api.materalabs.us` → `http://localhost:5010`

## How the API Proxy Works

The Worker intercepts `/fetch`, `/generate`, and `/notify` requests (after stripping the `/x9.150` prefix) and proxies them to the tunnel URL (`https://x9-api.materalabs.us`). All other requests are served as static assets with SPA fallback.

**Production builds:** `.env.production` sets `VITE_QRAPPSERVER_URL=/x9.150`, so the frontend uses same-origin URLs that hit the Worker.

**Local dev:** `.env.local` sets `VITE_QRAPPSERVER_URL=http://localhost:5010`, so the frontend talks directly to the Python server.

## Sub-Path Deployment Details

The app is served under `/x9.150/` instead of root. This requires:

1. **Build-time:** `vite.config.ts` sets `base: '/x9.150/'` which rewrites asset paths in `index.html` to `/x9.150/assets/...`
2. **Runtime (worker):** `worker.ts` strips the `/x9.150` prefix from all incoming requests before serving assets from the `ASSETS` binding (since `dist/` has `assets/...`, not `x9.150/assets/...`)
3. **Runtime (frontend):** `.env.production` sets `VITE_QRAPPSERVER_URL=/x9.150` so API calls go to `/x9.150/fetch` (matching our worker's route) instead of `/fetch` (which would hit the existing materalabs worker)

The worker also includes SPA fallback: any non-asset path that returns 404 from `ASSETS` is served `index.html` instead, allowing client-side routing to work.

## Lessons Learned

### 1. Worker and DNS zone must be on the same account
If the Worker is deployed to account A but the DNS zone is on account B, custom domains appear to work (HTML loads) but assets return 404. Always verify the account ID matches by checking the dashboard URL.

### 2. Wrangler can't find zones on accounts it can't access
`"Could not find zone for materalabs.us"` means the wrangler OAuth token doesn't have access to the account where the zone lives. Fix: `npx wrangler login` with the correct account.

### 3. Cloudflared cert is per-zone
`cloudflared tunnel route dns` uses `~/.cloudflared/cert.pem` to determine which zone to create DNS records in. If the cert is for the wrong zone, DNS records will be created there. Fix: re-login cloudflared and select the correct zone.

### 4. `cloudflared tunnel route dns` may route to the wrong tunnel
By default it can pick up the tunnel ID from `~/.cloudflared/config.yml` instead of the tunnel name you specify. Use the `-f` flag with the tunnel UUID to force:
```bash
cloudflared tunnel -f route dns <TUNNEL-UUID> <hostname>
```

### 5. Cloudflare cache can serve stale content after redeployment
After deploying, if you see old content, purge the cache: **Cloudflare dashboard → materalabs.us → Caching → Configuration → Purge Everything**. Also hard-refresh the browser (Cmd+Shift+R) or test in incognito.

### 6. Cloudflare Zero Trust is required for tunnels
Creating tunnels on an account requires the "Cloudflare One Connector: cloudflared Write" permission. If `cloudflared tunnel login` fails with this error, the account needs the Zero Trust Free plan enabled (dashboard → Zero Trust → activate).

### 7. `.env.local` is loaded in all Vite modes
Vite loads `.env.local` in both dev and production. To override a value for production builds only, create `.env.production` — it takes priority over `.env.local` in production mode.

### 8. Don't upload source files to Cloudflare
Only upload `dist/` (the built output). If the source `index.html` (which references `index.tsx`) gets deployed, the app shows a white page because the browser can't load uncompiled TypeScript.

### 9. Workers Static Assets require explicit `binding` for `env.ASSETS`
When using `assets` with `main` (worker code), you must set `"binding": "ASSETS"` in the assets config. Without it, `env.ASSETS` is `undefined` and the worker crashes with error 1101.

### 10. `~/.cloudflared/config.yml` overrides tunnel credentials
If a `config.yml` exists in `~/.cloudflared/`, cloudflared uses its `tunnel` and `credentials-file` fields even when you specify a different tunnel name on the command line. Fix: delete the stale `config.yml`, or use `--credentials-file` explicitly.

### 11. `cloudflared tunnel route dns` fails by name, works by UUID
When running `cloudflared tunnel route dns <name> <hostname>`, cloudflared may fail with "Tunnel not found" if there are name collisions across accounts. Using the tunnel UUID directly always works.

### 12. Keep `~/.cloudflared/` clean
Stale credential files and config files from old projects cause hard-to-debug issues. Keep only the active tunnel credentials and cert.

### 13. Account mismatch across multiple Cloudflare accounts
The user has multiple Cloudflare accounts. The Worker, DNS zone, and tunnel MUST all be on the same account. To check which account a zone is on: look at the URL in the Cloudflare dashboard → `dash.cloudflare.com/<ACCOUNT_ID>/...`

### 14. Never rely on default `config.yml` on shared servers
On a server running multiple tunnels (possibly for different Cloudflare accounts), the default `~/.cloudflared/config.yml` belongs to another tunnel. Cloudflared reads it even when you pass `--url` on the command line — the `ingress` rules in `config.yml` take priority, and requests to your hostname hit the catch-all `http_status:404` instead of your service. **Fix:** `tunnel.sh` uses `--config tunnel-config.yml` (committed to repo), making the tunnel fully self-contained and immune to whatever is in `~/.cloudflared/`.

### 15. Run tunnels by UUID, not by name
Running `cloudflared tunnel run <name>` requires cloudflared to look up the name via `cert.pem`, which is tied to a specific Cloudflare account. On a shared server where `cert.pem` belongs to a different account, the lookup fails with "not found". Running by UUID (`cloudflared tunnel run <UUID>`) with `--credentials-file` bypasses the cert entirely — no account login needed.

### 16. Rotate tunnel credentials if an unauthorized connector appears
`cloudflared tunnel info` shows the origin IP of each connector. If the IP doesn't match your machines, someone else has your credentials JSON. Fix: `cloudflared tunnel cleanup && cloudflared tunnel delete <name>`, then recreate with `cloudflared tunnel create`. The old credentials become useless immediately.
