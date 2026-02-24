# Vite/Bundler Configuration for Solana

## The Problem

`@solana/web3.js` v1.x has transitive dependencies (`bn.js`, `borsh`, `jayson`, `readable-stream`) that use Node.js built-in modules. Vite replaces these with empty stubs for browser compatibility — causing silent runtime failures.

## Solution: `vite-plugin-node-polyfills`

```bash
npm install vite-plugin-node-polyfills
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'stream', 'events', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
});
```

## Which Polyfills Are Needed (and Why)

| Polyfill | Required By | Needed? |
|---|---|---|
| `buffer` | `bip39`, `bn.js`, `borsh` | **Yes** |
| `stream` | `cipher-base`, `readable-stream` | **Yes** |
| `events` | `readable-stream` | **Yes** |
| `process` | Various transitive deps | **Yes** |
| `crypto` | `ed25519-hd-key` | **No** — use `micro-key-producer` instead |

### Why NOT `crypto`?

If you use `micro-key-producer` for HD key derivation (as recommended), you do NOT need the `crypto` polyfill. Removing it saves **~560 KB** of bundle size (`crypto-browserify` and its dependency tree).

If you're stuck with `ed25519-hd-key`, you MUST include `crypto` — but strongly consider switching libraries instead.

## How to Check If a Polyfill Is Needed

1. Build without the polyfill
2. Start the dev server
3. Check the pre-bundled dependency for externalization:

```bash
curl -sS "http://localhost:5173/node_modules/.vite/deps/DEPENDENCY_NAME.js" | grep "browser-external:MODULE_NAME"
```

If you find `browser-external:MODULE_NAME`, the polyfill is needed for that dependency.

## Common Pitfalls

### 1. Manual Aliasing Is Fragile

Don't do this:
```typescript
// BAD — easy to miss modules deep in the dependency tree
resolve: {
  alias: {
    stream: 'stream-browserify',
    events: 'events',
  }
},
define: {
  'global': 'globalThis',
}
```

Use `vite-plugin-node-polyfills` instead. It handles all the aliasing, shimming, and edge cases automatically.

### 2. Clear Cache After Changing Polyfills

After adding/removing polyfills or changing dependencies:
```bash
rm -rf node_modules/.vite
```

Vite's pre-bundle cache persists old configurations and won't pick up polyfill changes otherwise.

### 3. Externalization Warnings Are Browser-Only

When Vite externalizes a module, it logs a warning like:
```
Module "crypto" has been externalized for browser compatibility.
Cannot access "crypto.createHmac" in client code.
```

This warning only appears in the **browser DevTools console**, NOT in the terminal. If your app shows a blank page with no terminal errors, check the browser console.

## Bundle Size Reference

| Configuration | Approximate Size |
|---|---|
| With `crypto` polyfill | ~1,556 KB |
| Without `crypto` polyfill (using `micro-key-producer`) | ~996 KB |
| Savings | ~560 KB (36%) |
