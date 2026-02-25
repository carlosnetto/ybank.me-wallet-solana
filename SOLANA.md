# SOLANA.md — Tips & Lessons Learned

Practical lessons from building a Solana USDC wallet in React/TypeScript with Vite. Everything here was learned the hard way.

---

## 1. RPC: The Public Endpoint Blocks Browsers

**`api.mainnet-beta.solana.com` returns 403 for browser requests.**

Browsers send an `Origin` header on every request. The Solana public RPC rejects these. Your app will silently fail — no balance, no transactions, no errors in the terminal (only in the browser console, if you look).

```bash
# Works (no Origin header, like Node.js):
curl -X POST https://api.mainnet-beta.solana.com -d '...'  # 200 OK

# Fails (browser sends Origin):
curl -X POST https://api.mainnet-beta.solana.com -H "Origin: http://localhost:3000" -d '...'  # 403
```

**Fix:** Use a CORS-friendly RPC. We use `https://solana-rpc.publicnode.com`. For production, use a dedicated provider (Helius, QuickNode, etc.).

**How to test:** `curl` your RPC with `-H "Origin: http://localhost:3000"` before writing any code.

---

## 2. Key Derivation: Use Pure JS Libraries

**`ed25519-hd-key` depends on Node.js `crypto` and will break in Vite/webpack.**

It calls `crypto.createHmac()` internally. Vite replaces Node.js built-ins with silent stubs for browser compatibility. The key derivation silently returns garbage, React never mounts, and you get a blank page with zero build errors.

**Fix:** Use `micro-key-producer` instead. It's pure JavaScript, uses `@noble/hashes` (no Node.js built-ins), and is the library recommended by the official Solana docs.

```ts
// Before (breaks in browser without crypto polyfill):
import { derivePath } from 'ed25519-hd-key';
const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
const keypair = Keypair.fromSeed(derived);

// After (works everywhere, no polyfill needed):
import { HDKey } from 'micro-key-producer/slip10.js';
const hd = HDKey.fromMasterSeed(seed);
const child = hd.derive("m/44'/501'/0'/0'");
const keypair = Keypair.fromSeed(child.privateKey);
```

Both produce identical keypairs. We verified this with the `abandon abandon ... about` test mnemonic.

Note: `micro-ed25519-hdkey` is also deprecated — `micro-key-producer` is its successor.

---

## 3. Vite Polyfills: Only What You Actually Need

With `micro-key-producer`, you do NOT need the `crypto` polyfill. This saves ~560 KB of bundle size.

```ts
// vite.config.ts
nodePolyfills({
  include: ['buffer', 'stream', 'events', 'process'],  // no 'crypto'
  globals: { Buffer: true, global: true, process: true },
})
```

**Why the others are still needed:** `@solana/web3.js` v1.x has transitive dependencies (`bn.js`, `borsh`, `jayson`) that use `buffer`, `stream`, `events`, and `process` internally.

**How to check if a polyfill is needed:** Build without it and grep the output for `browser-external:MODULE_NAME`. If Vite externalized it, you need the polyfill.

---

## 4. Error Handling: Never Swallow RPC Errors as "Zero Balance"

This pattern is a trap:

```ts
// BAD — hides network errors as "0 balance"
try {
  const account = await getAccount(connection, ata);
  return account.amount;
} catch {
  return "0.00";  // Could be 403, timeout, rate limit...
}
```

Fix: Only catch the specific "account doesn't exist" error:

```ts
// GOOD — only catches expected case
try {
  const account = await getAccount(connection, ata);
  return account.amount;
} catch (error) {
  if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
    return "0.00";  // Account genuinely doesn't exist
  }
  throw error;  // Network error — let it propagate
}
```

Import `TokenAccountNotFoundError` and `TokenInvalidAccountOwnerError` from `@solana/spl-token`.

---

## 5. SPL Token Addresses: Wallets Don't Hold Tokens Directly

On Solana, tokens aren't stored at your wallet address. Each token has a separate **Associated Token Account (ATA)** derived from your wallet + the token mint:

```
Wallet:  D8NSFxJkf2LcF1SgCTZfe8SDrTJtdJkAeNXcQYzTk93F   (your public key)
USDC ATA: 7NCZDbcWGMY4zgNZr7JzefRW2iHtDpqv41uFRt63ZV8y   (derived, holds your USDC)
```

**When sending USDC:** The recipient might not have a USDC ATA yet. You must create it in the same transaction (sender pays ~0.002 SOL rent). Use `getAccount()` to check and `createAssociatedTokenAccountInstruction()` to create.

**When fetching transaction history:** Query signatures on the ATA address, not the wallet address. `getSignaturesForAddress(ata)` finds USDC transfers; `getSignaturesForAddress(wallet)` finds SOL transfers.

---

## 6. Simulate Transactions Before Sending

Always simulate before sending. It catches errors instantly instead of making the user wait for a failed transaction.

```ts
const simulation = await connection.simulateTransaction(transaction, [keypair]);
if (simulation.value.err) {
  // Parse simulation.value.err and simulation.value.logs for details
  throw new Error("...");
}

transaction.sign(keypair);
const signature = await connection.sendRawTransaction(transaction.serialize());
```

Common simulation errors:
- `InsufficientFunds` — not enough USDC
- Custom program error `0x1` — not enough SOL for fees/rent
- Account-related errors — invalid recipient, wrong token program

---

## 7. Blockhash Lifecycle

Solana transactions expire. A blockhash is valid for ~60 seconds (~150 blocks). If you get a blockhash, simulate, wait for user confirmation, then send — the blockhash may have expired.

**Pattern:** Get blockhash → simulate → sign → send → confirm, all using the same blockhash:

```ts
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
transaction.recentBlockhash = blockhash;
transaction.feePayer = senderPubkey;

// ... simulate, sign, send ...

await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  'confirmed'
);
```

If confirmation fails with `block height exceeded`, get a fresh blockhash and retry.

---

## 8. Transaction Parsing: `transfer` vs `transferChecked`

SPL token transfers come in two flavors. Your parser must handle both:

- **`transfer`** — older style, amount is raw integer in `info.amount`
- **`transferChecked`** — newer style (wallets like Phantom use this), amount is in `info.tokenAmount.uiAmountString`

```ts
if (parsed.type === 'transferChecked') {
  tokenAmount = parseFloat(info.tokenAmount.uiAmountString);
} else {
  tokenAmount = Number(info.amount) / Math.pow(10, USDC_DECIMALS);
}
```

The `uiAmountString` field is the human-readable amount. The deprecated `uiAmount` field has floating-point precision issues — always use `uiAmountString`.

---

## 9. USDC Decimals: Same as EVM, Different from SOL

| Token | Decimals | 1.00 in atomic units |
|---|---|---|
| USDC | 6 | 1,000,000 |
| SOL | 9 | 1,000,000,000 |
| ETH (for reference) | 18 | 1,000,000,000,000,000,000 |

USDC is 6 decimals on both Solana and EVM. This is nice for porting. But SOL is 9 decimals (not 18 like ETH), so `lamports / 1e9 = SOL`.

---

## 10. Solana Ecosystem Direction (Feb 2026)

The Solana Foundation now recommends `@solana/kit` (v5.x) over `@solana/web3.js` (v1.x) for new projects. Key differences:

| web3.js (legacy) | Kit (recommended) |
|---|---|
| `new Connection(url)` | `createSolanaRpc(url)` |
| `new PublicKey(addr)` | `address(addr)` |
| `Keypair.fromSeed()` | `createKeyPairSignerFromPrivateKeyBytes()` |
| `new Transaction().add(ix)` | `pipe(createTransactionMessage(), ...)` |
| `@solana/spl-token` | `@solana-program/token` |
| OOP style | Functional/pipe style |

Kit is tree-shakeable and ~26% smaller. But web3.js v1.x works fine and has more community resources. No rush to migrate for existing projects.

**Resources:**
- Solana Dev Skill for Claude Code: https://github.com/solana-foundation/solana-dev-skill
- Kit docs: https://www.solanakit.com/
- Awesome Solana AI: https://github.com/solana-foundation/awesome-solana-ai
- Solana.com pages return markdown with `Accept: text/markdown` header (saves tokens for AI tools)

---

## 11. Public RPCs: Batch Request Limits and Timeouts

Free public RPCs impose limits that affect how you fetch data. Two key discoveries:

### Batch JSON-RPC requests are restricted

`solana-rpc.publicnode.com` limits `getTransaction` to **1 call per batch request**. The `@solana/web3.js` method `getParsedTransactions` (plural) sends all signatures as a single JSON-RPC batch, which gets rejected:

```
400 Bad Request: "Maximum number of 'getTransaction' calls in a batch request is 1"
```

**Fix:** Use `Promise.all` over individual `getParsedTransaction` (singular) calls. Each goes as a separate HTTP request, avoiding the batch limit while still running in parallel:

```typescript
// BAD — sends JSON-RPC batch, rejected by publicnode
const txs = await connection.getParsedTransactions(sigStrings, opts);

// GOOD — parallel individual requests, works everywhere
const txs = await Promise.all(
  signatures.map(sig =>
    connection.getParsedTransaction(sig.signature, opts).catch(() => null)
  )
);
```

This is a publicnode-specific limit. Paid RPCs (Helius, QuickNode) allow larger batches.

### Add per-request timeouts

`@solana/web3.js` v1.x has no built-in request timeout. On slow networks (corporate firewalls, proxies), a single RPC call can hang indefinitely, blocking polling and making the app appear frozen.

**Fix:** Wrap `fetch` with an `AbortController` and pass it via `ConnectionConfig.fetch`:

```typescript
const timeoutFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15_000); // 15s
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(id));
};

connectionInstance = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  fetch: timeoutFetch,
});
```

Every RPC call goes through this wrapper — no code changes needed elsewhere.

### Guard polling against overlap

On slow networks, a 10-second poll interval can fire before the previous poll finishes, piling up concurrent requests. Use a boolean flag per poller:

```typescript
let pending = false;
const poll = async () => {
  if (pending) return;   // skip if previous poll still in-flight
  pending = true;
  try { /* ... */ }
  catch { /* ... */ }
  finally { pending = false; }
};
```

---

## 12. Debugging Checklist

When something doesn't work and you see no errors:

1. **Open browser DevTools console** — Vite externalizations only log warnings there, not in the terminal
2. **Check the RPC with an Origin header** — `curl -H "Origin: http://localhost:3000"` your endpoint
3. **Check if the polyfill is actually loaded** — `curl` the Vite pre-bundled dependency and grep for `browser-external:MODULE_NAME`
4. **Verify key derivation matches** — Test with the `abandon abandon ... about` mnemonic and compare the derived address against another wallet
5. **Check the ATA, not the wallet address** — USDC lives in the ATA, not at the wallet pubkey
6. **Clear Vite cache** — `rm -rf node_modules/.vite` after changing polyfills or dependencies
