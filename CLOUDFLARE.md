# CLOUDFLARE.md — Deployment & Tunnel Configuration

## Architecture

Two independent deployments from the same codebase:

```
# Deployment 1: Personal account (materalab.us)
User → x9-150.materalab.us (Worker: x9-150)
         ├─ /fetch, /generate, /notify → proxied to tunnel
         │     → x9-api.materalab.us → cloudflared → localhost:5010 → qr_appserver.py
         └─ everything else → static assets (dist/)

# Deployment 2: Business account (materalabs.us)
User → materalabs.us/x9.150/* (Worker: x9-150-wallet, route-based)
         ├─ /x9.150/fetch, /generate, /notify → strip prefix → proxy to tunnel
         │     → x9-api.materalabs.us → cloudflared → localhost:5010 → qr_appserver.py
         └─ /x9.150/* → strip prefix → static assets (dist/)
```

## Account Setup

Each deployment lives entirely within one Cloudflare account (Worker + DNS zone + tunnel must match):

### Deployment 1: Personal account (materalab.us)

| Resource | Account | Account ID |
|---|---|---|
| DNS zone `materalab.us` | Carlos Netto (gmail) | `8a5cfa2ea39c6e7e6e049f5a3ce13aa3` |
| Worker `x9-150` | Carlos Netto (gmail) | `8a5cfa2ea39c6e7e6e049f5a3ce13aa3` |
| Tunnel `x9-150-py` | Carlos Netto (gmail) | `8a5cfa2ea39c6e7e6e049f5a3ce13aa3` |

### Deployment 2: Business account (materalabs.us)

| Resource | Account | Account ID |
|---|---|---|
| DNS zone `materalabs.us` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |
| Worker `x9-150-wallet` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |
| Route `materalabs.us/x9.150/*` | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |
| Tunnel (TBD) | Tic.cloud@matera.com | `45281eba1857e04d45fe46d31bdc2f0b` |

The materalabs.us worker uses a **route** (`materalabs.us/x9.150/*`) instead of a custom domain. This allows it to coexist with the existing "materalabs" worker that serves the root domain. Cloudflare routes are matched by specificity — the `/x9.150/*` route takes priority over the catch-all.

### Critical Lesson: Account Mismatch

The user has **three** Cloudflare accounts accessible via different logins:

| Account Name | Account ID | Login |
|---|---|---|
| Carlos Netto | `8a5cfa2ea39c6e7e6e049f5a3ce13aa3` | `carlos.netto@gmail.com` |
| Carlos.netto@matera.com's Account | `b57de325eb89f1948551f4cada6d40c3` | `carlos.netto@matera.com` |
| Tic.cloud@matera.com's Account | `45281eba1857e04d45fe46d31bdc2f0b` | `carlos.netto@matera.com` |

**The Worker, DNS zone, and tunnel MUST all be on the same account.** If the Worker is on one account but the DNS zone is on another, custom domains will serve the HTML but fail to load assets (JS bundle returns 404).

To check which account a zone is on: look at the URL in the Cloudflare dashboard → `dash.cloudflare.com/<ACCOUNT_ID>/materalab.us/...`

### Wrangler Login

Wrangler must be logged in with the account that owns the DNS zone:

```bash
npx wrangler login  # Opens browser — log in with carlos.netto@gmail.com
npx wrangler whoami  # Verify: should show "Carlos Netto" / 8a5cfa2e...
```

### Cloudflared Login

Cloudflared also needs its own authentication per zone:

```bash
# Move existing cert if switching accounts
mv ~/.cloudflared/cert.pem ~/.cloudflared/cert.pem.backup
cloudflared tunnel login  # Opens browser — select materalab.us zone
```

The cert at `~/.cloudflared/cert.pem` is tied to a specific zone. Tunnel operations (create, route dns) use this cert to determine which account/zone to act on.

## DNS Records

| Type | Name | Content | Notes |
|---|---|---|---|
| Worker | x9-150 | x9-150 | Custom domain for the Worker |
| Tunnel | x9-api | x9-150-py | Routes to cloudflared tunnel |

## Files

### Shared
| File | Purpose |
|---|---|
| `.env.local` | Local dev: `VITE_QRAPPSERVER_URL=http://localhost:5010` |

### Deployment 1: materalab.us (personal)
| File | Purpose |
|---|---|
| `wrangler.jsonc` | Worker config: name `x9-150`, personal account, assets |
| `worker.ts` | Reverse proxy for API paths + static asset serving (root path) |
| `.env.production` | `VITE_QRAPPSERVER_URL=` (empty — same-origin API calls) |
| `x9.150-py/cloudflared-config.yml` | Tunnel config: `x9-api.materalab.us` → `localhost:5010` |

### Deployment 2: materalabs.us/x9.150 (business)
| File | Purpose |
|---|---|
| `wrangler-materalabs.jsonc` | Worker config: name `x9-150-wallet`, tic.cloud account, route `materalabs.us/x9.150/*` |
| `worker-materalabs.ts` | Strips `/x9.150` prefix, then proxies API calls or serves assets + SPA fallback |
| `.env.materalabs` | `VITE_QRAPPSERVER_URL=/x9.150` (API calls go to `/x9.150/fetch` etc.) |

## Deploy Commands

### Deployment 1: materalab.us (personal)

```bash
# Build (default mode=production, base=/)
npm run build

# Deploy (uses wrangler.jsonc → x9-150.carlos-netto.workers.dev / x9-150.materalab.us)
npx wrangler deploy
```

### Deployment 2: materalabs.us/x9.150 (business)

```bash
# Build with /x9.150/ base path and materalabs env
npx vite build --base=/x9.150/ --mode materalabs

# Deploy (uses wrangler-materalabs.jsonc → materalabs.us/x9.150)
npx wrangler deploy --config wrangler-materalabs.jsonc
```

**Note:** `wrangler login` must be done with an account that has access to the target account before deploying. For the business deployment, log in as `carlos.netto@matera.com` (who has access to tic.cloud).

### Start the tunnel (run from any directory)

```bash
cloudflared tunnel --config /Users/cnetto/Git/x9.150-py/cloudflared-config.yml run x9-150-py
```

## Tunnel Details

- **Tunnel name:** `x9-150-py`
- **Tunnel ID:** `a04396d8-5ca2-40f8-9a67-d8206fbb74fe`
- **Credentials:** `~/.cloudflared/a04396d8-5ca2-40f8-9a67-d8206fbb74fe.json`
- **Config:** `/Users/cnetto/Git/x9.150-py/cloudflared-config.yml`
- **Routes:** `x9-api.materalab.us` → `http://localhost:5010`

## How the API Proxy Works

The Worker (`worker.ts`) intercepts requests to `/fetch`, `/generate`, and `/notify` and proxies them to the tunnel URL (`https://x9-api.materalab.us`). All other requests are served as static assets from `dist/`.

In production builds, `VITE_QRAPPSERVER_URL` is empty (set via `.env.production`), so the frontend uses relative URLs (`/fetch`, `/generate`, `/notify`) which hit the same origin — the Worker.

In local dev, `.env.local` sets `VITE_QRAPPSERVER_URL=http://localhost:5010`, so the frontend talks directly to the Python server.

## Lessons Learned

### 1. Worker and DNS zone must be on the same account
If the Worker is deployed to account A but the DNS zone is on account B, custom domains appear to work (HTML loads) but assets return 404. Always verify the account ID matches by checking the dashboard URL.

### 2. Wrangler can't find zones on accounts it can't access
`"Could not find zone for materalab.us"` means the wrangler OAuth token doesn't have access to the account where the zone lives. Fix: `npx wrangler login` with the correct account.

### 3. Cloudflared cert is per-zone
`cloudflared tunnel route dns` uses `~/.cloudflared/cert.pem` to determine which zone to create DNS records in. If the cert is for `zoripay.xyz`, DNS records will be created there even if you specify a `materalab.us` hostname. Fix: re-login cloudflared and select the correct zone.

### 4. `cloudflared tunnel route dns` may route to the wrong tunnel
By default it can pick up the tunnel ID from `~/.cloudflared/config.yml` instead of the tunnel name you specify. Use the `-f` flag with the tunnel UUID to force:
```bash
cloudflared tunnel -f route dns <TUNNEL-UUID> <hostname>
```

### 5. Cloudflare cache can serve stale content after redeployment
After deploying, if you see old content, purge the cache: **Cloudflare dashboard → materalab.us → Caching → Configuration → Purge Everything**. Also hard-refresh the browser (Cmd+Shift+R) or test in incognito.

### 6. Cloudflare Zero Trust is required for tunnels
Creating tunnels on an account requires the "Cloudflare One Connector: cloudflared Write" permission. If `cloudflared tunnel login` fails with this error, the account needs the Zero Trust Free plan enabled (dashboard → Zero Trust → activate).

### 7. `.env.local` is loaded in all Vite modes
Vite loads `.env.local` in both dev and production. To override a value for production builds only, create `.env.production` — it takes priority over `.env.local` in production mode.

### 8. Don't upload source files to Cloudflare
Only upload `dist/` (the built output). If the source `index.html` (which references `index.tsx`) gets deployed, the app shows a white page because the browser can't load uncompiled TypeScript.

## Sub-Path Deployment Details (materalabs.us/x9.150)

The materalabs deployment serves the app under `/x9.150/` instead of root. This requires:

1. **Build-time:** `vite build --base=/x9.150/` rewrites asset paths in `index.html` to `/x9.150/assets/...`
2. **Runtime (worker):** `worker-materalabs.ts` strips the `/x9.150` prefix from all incoming requests before serving assets from the `ASSETS` binding (since `dist/` has `assets/...`, not `x9.150/assets/...`)
3. **Runtime (frontend):** `.env.materalabs` sets `VITE_QRAPPSERVER_URL=/x9.150` so API calls go to `/x9.150/fetch` (matching our worker's route) instead of `/fetch` (which would hit the existing materalabs worker)

The worker also includes SPA fallback: any non-asset path that returns 404 from `ASSETS` is served `index.html` instead, allowing client-side routing to work.

## Cleanup Notes

The old Worker `x9-150` was previously deleted from the business account (`45281eba...`). The new Worker `x9-150-wallet` now lives on that account with a route-based deployment instead of a custom domain.
