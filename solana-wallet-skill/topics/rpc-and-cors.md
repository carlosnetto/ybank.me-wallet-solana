# RPC Endpoint Selection & CORS

## The Problem

Solana's public RPC `api.mainnet-beta.solana.com` rejects browser requests. Browsers send an `Origin` header on every fetch/XHR request. The public endpoint returns **403 Forbidden** for any request that includes this header.

This causes **silent failures** — no balance, no transactions, no errors in the terminal. The 403 only appears in the browser DevTools console.

```bash
# Works (no Origin header, like Node.js or curl):
curl -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["YOUR_PUBKEY"]}' # 200 OK

# Fails (browser sends Origin):
curl -X POST https://api.mainnet-beta.solana.com \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["YOUR_PUBKEY"]}' # 403
```

## Free CORS-Friendly RPCs

| Endpoint | CORS | Rate Limit | Notes |
|---|---|---|---|
| `https://solana-rpc.publicnode.com` | Yes | Moderate | Recommended free option |
| `https://api.mainnet-beta.solana.com` | **No** | Strict | Do NOT use in browsers |
| `https://rpc.ankr.com/solana` | **No** | — | Returns 403 with Origin |

## Production RPCs (Paid)

For production apps, use a dedicated provider:
- **Helius** — `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` (free tier available)
- **QuickNode** — Custom endpoint per account
- **Alchemy** — `https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY`
- **Triton (RPC Pool)** — `https://YOUR_ID.mainnet.rpcpool.com`

## How to Test an RPC Before Using It

Always test with an Origin header before writing any code:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://YOUR-RPC-ENDPOINT \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

If the response is 200, it's CORS-friendly. If 403 or no CORS headers, it will fail in browsers.

## Connection Setup Pattern

```typescript
import { Connection } from '@solana/web3.js';

const SOLANA_RPC_URL = 'https://solana-rpc.publicnode.com';

// Singleton pattern — avoid creating multiple connections
let connectionInstance: Connection | null = null;

export const getConnection = (): Connection => {
  if (!connectionInstance) {
    connectionInstance = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connectionInstance;
};
```

Use `'confirmed'` commitment level for balance queries and transaction confirmation. Use `'finalized'` only when you need absolute certainty (slower).

## Request Timeouts

`@solana/web3.js` v1.x has **no built-in request timeout**. On slow networks (corporate firewalls, proxies), RPC calls can hang indefinitely. Wrap `fetch` with an `AbortController` and pass it via `ConnectionConfig.fetch`:

```typescript
const RPC_TIMEOUT_MS = 15_000; // 15 seconds

export const getConnection = (): Connection => {
  if (!connectionInstance) {
    const timeoutFetch: typeof fetch = (input, init) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      return fetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(id));
    };
    connectionInstance = new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      fetch: timeoutFetch,
    });
  }
  return connectionInstance;
};
```

Every RPC call goes through this wrapper automatically — no per-call changes needed.

## Batch Request Limits

Free public RPCs restrict JSON-RPC batch requests. `solana-rpc.publicnode.com` limits `getTransaction` to **1 call per batch**. This means `getParsedTransactions` (plural, sends a JSON-RPC batch) will fail with a 400 error, while `getParsedTransaction` (singular, sends individual HTTP requests) works fine.

```typescript
// BAD — JSON-RPC batch, rejected by publicnode
const txs = await connection.getParsedTransactions(sigStrings, opts);

// GOOD — parallel individual HTTP requests
const txs = await Promise.all(
  signatures.map(sig =>
    connection.getParsedTransaction(sig.signature, opts).catch(() => null)
  )
);
```

**Key insight**: plural vs singular SDK methods differ in **transport**, not just API shape. The plural form batches into one HTTP request; the singular form sends separate requests. Always test batch methods against your actual RPC endpoint.

## Poll Overlap Protection

On slow networks, polling intervals can fire before previous polls complete, piling up concurrent requests. Guard each poller with a boolean flag:

```typescript
let pending = false;
const poll = async () => {
  if (pending) return;
  pending = true;
  try { /* fetch data */ }
  catch { /* log warning */ }
  finally { pending = false; }
};
setInterval(poll, 10_000);
```
