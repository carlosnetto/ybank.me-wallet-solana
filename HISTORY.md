# HISTORY.md — Debugging the Blank Page After Solana Migration

After porting all code from Base/ethers.js to Solana (@solana/web3.js, @solana/spl-token, bip39, ed25519-hd-key), the app compiled and built successfully but rendered a **blank white page** in the browser. No visible errors in the terminal. This document traces every attempt to fix it.

---

## Root Cause (discovered at the end)

`ed25519-hd-key` internally calls `crypto.createHmac()` from Node.js's `crypto` module. Vite externalizes Node.js built-in modules for browser compatibility, replacing them with warning stubs that do nothing. So `createHmac` silently returned nothing, the key derivation crashed, and React never mounted — producing a blank page with no obvious error in the terminal (only a console warning in the browser).

---

## Attempt 1 — Manual Buffer polyfill + stream/events aliases

### What was tried

1. Installed `buffer`, `stream-browserify`, `events` as dependencies
2. Added a `<script>` tag in `index.html` to polyfill `global` and `process`:
   ```html
   <script>
     window.global = window.global || window;
     window.process = window.process || { env: {} };
   </script>
   ```
3. Added Buffer polyfill at the top of `index.tsx` (before any other imports):
   ```ts
   import { Buffer } from 'buffer';
   window.Buffer = Buffer;
   ```
4. Updated `vite.config.ts` with manual resolve aliases and a define:
   ```ts
   resolve: {
     alias: {
       stream: 'stream-browserify',
       events: 'events',
     }
   },
   define: {
     'global': 'globalThis',
   },
   ```
5. Also removed the stale `importmap` in `index.html` that still referenced `ethers` from esm.sh (this was left over from the original Base version and conflicted with Vite's module resolution).

### Result

- **Build succeeded.** The `stream` and `events` externalization warnings disappeared.
- **Still blank page.** The `crypto` module was still being externalized — not covered by the manual aliases.

### Why it didn't work

The manual approach only polyfilled `Buffer`, `stream`, `events`, `global`, and `process`. It missed `crypto`, which `ed25519-hd-key` depends on for HMAC-SHA512 key derivation. There was no build error because Vite replaces externalized modules with stubs that log warnings at runtime rather than failing at build time.

---

## Attempt 2 — Debugging via curl to find the actual failure

### What was tried

Started the Vite dev server and used `curl` to fetch the pre-bundled dependency files directly:

```bash
curl -sS "http://localhost:3004/node_modules/.vite/deps/ed25519-hd-key.js" | grep "browser-external:crypto"
```

### What was found

The pre-bundled `ed25519-hd-key.js` contained this stub:

```js
// browser-external:crypto
var require_crypto = __commonJS({
  "browser-external:crypto"(exports, module) {
    console.warn(`Module "crypto" has been externalized for browser compatibility. Cannot access "crypto.${key}" in client code.`);
  }
});
```

This confirmed that `createHmac` was being called on a dummy object, returning `undefined`, and crashing the derivation silently.

---

## Attempt 3 (Final Fix) — vite-plugin-node-polyfills

### What was done

1. Installed `vite-plugin-node-polyfills`:
   ```bash
   npm install vite-plugin-node-polyfills
   ```

2. Replaced all manual polyfill config in `vite.config.ts` with the plugin:
   ```ts
   import { nodePolyfills } from 'vite-plugin-node-polyfills';

   export default defineConfig(() => {
     return {
       plugins: [
         react(),
         nodePolyfills({
           include: ['buffer', 'crypto', 'stream', 'events', 'process'],
           globals: {
             Buffer: true,
             global: true,
             process: true,
           },
         }),
       ],
       // ...
     };
   });
   ```

3. Removed all manual polyfill hacks:
   - Removed the `<script>` polyfill block from `index.html`
   - Removed the `import { Buffer } from 'buffer'; window.Buffer = Buffer;` from `index.tsx`
   - Removed the manual `resolve.alias` entries for `stream` and `events`
   - Removed the `define: { 'global': 'globalThis' }` block

4. Cleared the Vite pre-bundle cache:
   ```bash
   rm -rf node_modules/.vite
   ```

5. Verified the fix by curling the rebuilt dependency:
   ```bash
   curl -sS "http://localhost:3005/node_modules/.vite/deps/ed25519-hd-key.js" | grep -c "browser-external:crypto"
   # Output: 0 (no more externalized crypto)
   ```

### Result

App loaded successfully. Login screen rendered. The plugin provides a proper browser-compatible `crypto` implementation (via `crypto-browserify`) so `createHmac` works correctly.

---

## Summary of what was wrong

| Module | Node.js API used | Vite behavior without polyfill | Symptom |
|---|---|---|---|
| `ed25519-hd-key` | `crypto.createHmac` | Externalized to warning stub | Silent crash in key derivation → blank page |
| `bip39` | `Buffer` | `ReferenceError: Buffer is not defined` | Crash before render |
| `cipher-base` (transitive) | `stream` | Externalized | Potential runtime errors |
| `readable-stream` (transitive) | `events` | Externalized | Potential runtime errors |

## Lesson learned

When using Solana libraries (or any library that depends on Node.js built-ins) in a Vite project, use `vite-plugin-node-polyfills` from the start. Manual aliasing is fragile because it's easy to miss modules (like `crypto`) that are used deep in the dependency tree, and Vite's externalization produces silent runtime failures rather than build errors.

---

## Permanent fix (Feb 2026)

Replaced `ed25519-hd-key` with `micro-key-producer` — a pure JavaScript SLIP-0010 implementation that does not depend on Node.js `crypto` at all. This eliminated the root cause entirely and allowed removing `crypto` from the Vite polyfill list. The `vite-plugin-node-polyfills` config now only includes `buffer`, `stream`, `events`, `process` (needed by `@solana/web3.js` transitive dependencies).

Bundle size dropped from 1,556 KB to 996 KB (36% reduction) by removing `crypto-browserify` and its dependency tree.

`micro-key-producer` is also the library recommended by the official Solana docs (solana.com/developers/cookbook/wallets/restore-from-mnemonic). The older `micro-ed25519-hdkey` package was deprecated in favor of `micro-key-producer`.

---

## RPC resilience: timeouts, batch limits, and poll overlap (Feb 2026)

The app worked fine on mobile 5G but was painfully slow on corporate networks (firewall/proxy adding latency). Three issues were found and fixed:

### 1. No request timeouts

`@solana/web3.js` v1.x has no built-in timeout. On slow networks, a single RPC call could hang indefinitely, making the app appear frozen. Fixed by wrapping `fetch` with an `AbortController` (15s timeout) and passing it via `ConnectionConfig.fetch`.

### 2. `getParsedTransactions` (plural) rejected by public RPC

Transaction history originally used 4 sequential batches of `getParsedTransaction` (singular), 5 at a time — 5 round-trips total. The optimization attempt switched to `getParsedTransactions` (plural), which sends all signatures as a single JSON-RPC batch. But `solana-rpc.publicnode.com` limits `getTransaction` batch calls to 1:

```
400 Bad Request: "Maximum number of 'getTransaction' calls in a batch request is 1"
```

The outer `try/catch` returned `[]`, silently hiding all transactions. Fixed by using `Promise.all` over individual `getParsedTransaction` calls — parallel HTTP requests, not a JSON-RPC batch. Combined with reducing the signature limit from 20 to 10, history went from 5 sequential round-trips to 2 (1 for signatures + 1 parallel burst).

### 3. Poll overlap on slow networks

Balance polls (10s interval) and history polls (30s interval) could overlap when responses took longer than the interval. Fixed by adding `pending` boolean flags — if the previous poll is still in-flight, the new interval tick is skipped.

### 4. `getSOLBalance` swallowing network errors

The function had a `try/catch` returning `"0.00"` on any error. But `getBalance` returns 0 for non-existent accounts (no exception), so the catch only triggered on real failures (timeout, 403, rate limit). Removed the catch to let network errors propagate to the polling handler.

### Lesson learned

`getParsedTransactions` (plural) and `getParsedTransaction` (singular) differ in transport, not just API shape. The plural form sends a JSON-RPC batch request; the singular form sends individual HTTP requests. Free public RPCs restrict batch sizes, so the plural form silently fails. Always test against your actual RPC endpoint — don't assume batch methods work just because they exist in the SDK.

---

## Dual deployment: materalab.us + materalabs.us/x9.150 (Feb 2026)

The wallet was originally deployed to `x9-150.carlos-netto.workers.dev` (personal Cloudflare account). The goal was to also deploy to `materalabs.us/x9.150` on the business account (tic.cloud@matera.com), where an existing "materalabs" worker already serves the root domain.

### Challenge: sub-path deployment

Serving a single-page app under a sub-path (`/x9.150/`) instead of at root requires three things to align:

1. **Vite build** must prefix all asset references with `/x9.150/` — otherwise `index.html` tries to load `/assets/index-xxx.js` which hits the existing materalabs worker (404)
2. **The worker** must strip `/x9.150` from incoming requests before serving assets from the `ASSETS` binding — because `dist/` contains `assets/index-xxx.js`, not `x9.150/assets/index-xxx.js`
3. **Frontend API calls** must go to `/x9.150/fetch` (not `/fetch`) — otherwise they hit the existing materalabs worker instead of our worker's route

### Solution: separate config per deployment

Created a fully independent deployment config — no existing files touched:

| File | Purpose |
|---|---|
| `wrangler-materalabs.jsonc` | Wrangler config with route `materalabs.us/x9.150/*` |
| `worker-materalabs.ts` | Worker that strips `/x9.150` prefix before serving assets or proxying API calls |
| `.env.materalabs` | Sets `VITE_QRAPPSERVER_URL=/x9.150` so React app's API calls target the right path |

Cloudflare routes are matched by specificity — `materalabs.us/x9.150/*` takes priority over the existing worker's catch-all, so only `/x9.150/*` traffic goes to our worker. The rest of `materalabs.us` is unaffected.

Build & deploy for each target:

```bash
# Personal account (unchanged)
npx vite build && npx wrangler deploy

# Materalabs (new)
npx vite build --base=/x9.150/ --mode materalabs
npx wrangler deploy --config wrangler-materalabs.jsonc
```

### Lesson learned

Vite's `--base` flag and `--mode` flag are the key to multi-target deployments. `--base=/x9.150/` rewrites all asset paths in `index.html`, and `--mode materalabs` loads `.env.materalabs` to configure runtime behavior. No changes to `vite.config.ts` needed — CLI flags handle everything.

---

## Navigation bar hidden on iPhone 16 (Feb 2026)

On iPhone 16 (Safari), the bottom navigation bar (Send, Receive, Pay, Charge, Settings) was completely hidden behind the browser's bottom toolbar. Only the top of the blue Pay button was barely visible. Users could not access any wallet actions without knowing to swipe up.

### Root Cause

The app container used `h-screen` (`100vh`). On iOS Safari, `100vh` is the **total** viewport height including the area behind the browser's bottom toolbar (back/forward/tabs bar). The navigation bar was positioned at `absolute bottom-6` inside this container, which placed it behind the browser chrome — invisible and untouchable.

This is a well-known iOS Safari bug. Apple intentionally made `100vh` equal to the largest possible viewport (toolbar hidden) so that pages don't reflow when the toolbar appears/disappears during scrolling. The side effect is that fixed/absolute-positioned bottom elements get clipped.

### Fix

Three changes:

1. **`index.html`** — Added `viewport-fit=cover` to the viewport meta tag to enable `env(safe-area-inset-bottom)`:
   ```html
   <meta name="viewport" content="..., viewport-fit=cover" />
   ```

2. **`App.tsx`** — Container height changed from `h-screen` to `h-[100dvh]`. The `dvh` unit (dynamic viewport height) represents the actual visible area, excluding browser chrome. It shrinks when the Safari toolbar is visible and grows when it's hidden:
   ```
   h-screen  → 100vh  → includes area behind browser toolbar (broken)
   h-[100dvh] → 100dvh → actual visible viewport (correct)
   ```

3. **`App.tsx`** — Navigation bar position changed from `bottom-6` to `bottom-[calc(0.5rem+env(safe-area-inset-bottom))]` to additionally clear the iPhone's home indicator. Content area padding increased from `pb-24` to `pb-28` to match.

### Lesson learned

Never use `100vh` for full-height mobile layouts. Use `100dvh` instead. The `dvh` unit is supported in all modern browsers (Safari 15.4+, Chrome 108+, Firefox 101+). For the bottom nav specifically, always account for `env(safe-area-inset-bottom)` on notched/Dynamic Island iPhones — it covers both the home indicator and any browser chrome overlap.

---

## Consolidated to business account only (Feb 2026)

The wallet originally had dual deployment configs — personal account (`materalab.us`, `wrangler.jsonc` + `worker.ts`) and business account (`materalabs.us/x9.150`, `wrangler-materalabs.jsonc` + `worker-materalabs.ts`). This was simplified to a single deployment on the business account only.

### What changed

- Deleted the personal account files (`wrangler.jsonc`, `worker.ts`, `.env.production`)
- Renamed materalabs files to be the primary files (`wrangler-materalabs.jsonc` → `wrangler.jsonc`, `worker-materalabs.ts` → `worker.ts`, `.env.materalabs` → `.env.production`)
- Hardcoded `base: '/x9.150/'` in `vite.config.ts` — no more `--base` or `--mode` CLI flags needed
- Updated tunnel scripts (`tunnel-pack.sh`, `tunnel-unpack.sh`) to use the materalabs tunnel
- Deploy is now just `npm run build && npx wrangler deploy`

### Why

Maintaining two parallel deployment configs added complexity with no benefit. The business account deployment (`materalabs.us/x9.150`) was the primary target. The personal account deployment was only used during initial development.

---

## Unauthorized tunnel connector and credential rotation (Feb 2026)

QR code generation stopped working — the app showed "API returned 530" (Cloudflare: origin unreachable). Investigation revealed the tunnel had an active connector from an unknown IP (`67.159.247.146` / Mundivox, São Paulo) while `cloudflared` was not running on any of our machines. Someone had obtained the tunnel credentials JSON and was running their own `cloudflared` instance against our tunnel.

### Discovery

1. `cloudflared tunnel info` showed 4 active connections from an IP that didn't match our machines
2. `lsof -i :5010` showed a mystery Python process on the dev machine (later disappeared)
3. The tunnel was accepting traffic but routing it to the unauthorized connector instead of our QR server

### Fix: credential rotation

1. `cloudflared tunnel cleanup x9-api-materalabs` — disconnected the rogue connector
2. `cloudflared tunnel delete x9-api-materalabs` — destroyed the compromised tunnel
3. `cloudflared tunnel create x9-api-materalabs` — new tunnel with fresh credentials (`6eb8781a-...`)
4. `cloudflared tunnel route dns -f x9-api-materalabs x9-api.materalabs.us` — updated DNS CNAME
5. Updated `tunnel.sh`, `tunnel-pack.sh`, `tunnel-unpack.sh` with the new tunnel ID

### Problem: shared server with multiple tunnels

The production server also runs a zoripay tunnel with its own `~/.cloudflared/config.yml`. Three issues hit in sequence:

1. **`run x9-api-materalabs` failed** — cloudflared looked up the tunnel name via `cert.pem`, which was tied to the zoripay account. Fix: run by UUID instead of name.

2. **No request logs, 404 on all endpoints** — even though the tunnel connected successfully (4 GRU connections), no traffic reached the QR server. The default `config.yml` had a catch-all `http_status:404` ingress rule that intercepted all requests before they could reach `--url http://localhost:5010`. Cloudflared silently prioritizes `config.yml` over CLI flags.

3. **Fix: dedicated config per tunnel** — `tunnel.sh` now auto-creates `~/.cloudflared/x9-api-materalabs.yml` with its own tunnel ID, credentials path, and ingress rules. Running with `--config` bypasses the default `config.yml` entirely.

### Lesson learned

On shared servers, never rely on default `~/.cloudflared/config.yml` or `cert.pem`. Each tunnel must be fully self-contained: dedicated config file, explicit credentials path, run by UUID. The `--url` and `--credentials-file` CLI flags are **not** sufficient — `config.yml` ingress rules silently override them.

---

## Claude Code skills extracted to dedicated repository (Feb 2026)

The project had accumulated two Claude Code skills — reusable knowledge packages that make hard-won lessons available across all sessions:

1. **`solana-wallet-skill`** — Patterns for building Solana wallet/payment apps in React/TypeScript with Vite (RPC selection, HD key derivation, SPL token operations, transaction lifecycle, error handling, bundler config). Created from lessons in this HISTORY.md and CLAUDE.md.

2. **`cloudflare-deployment-skill`** — Patterns for deploying apps on Cloudflare Workers with tunnels, sub-path routing, and multi-account setups (worker configuration, tunnel management, shared-server pitfalls, credential security). Created from lessons in CLOUDFLARE.md and the tunnel hijack incident above.

Both skills were moved from this repo to a dedicated repository: **https://github.com/carlosnetto/claude-skills**

Each skill has:
- `SKILL.md` — Main skill definition with frontmatter, operating procedure, quick reference, critical rules
- `install.sh` — Installs to `~/.claude/skills/` for use in all Claude Code sessions
- `topics/` — Detailed topic files with problem/solution/pitfalls patterns

To install either skill:
```bash
git clone https://github.com/carlosnetto/claude-skills.git
bash claude-skills/solana-wallet-skill/install.sh
bash claude-skills/cloudflare-deployment-skill/install.sh
```
