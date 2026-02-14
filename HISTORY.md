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
