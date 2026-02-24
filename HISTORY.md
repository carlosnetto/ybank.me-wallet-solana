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
