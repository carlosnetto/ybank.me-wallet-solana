# Error Handling Patterns

## Rule #1: Never Swallow RPC Errors as Zero Balance

This is the most common trap in Solana wallet code:

```typescript
// BAD — hides 403s, timeouts, rate limits as "0 balance"
try {
  const account = await getAccount(connection, ata);
  return account.amount;
} catch {
  return "0.00";
}
```

The fix: only catch the specific "account doesn't exist" errors:

```typescript
// GOOD — only catches expected cases
import {
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';

try {
  const account = await getAccount(connection, ata);
  return Number(account.amount) / Math.pow(10, decimals);
} catch (error) {
  if (error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError) {
    return "0.00"; // Account genuinely doesn't exist
  }
  throw error; // Network error — propagate it
}
```

## Error Categories

### 1. RPC/Network Errors
These should ALWAYS propagate — never hide them.

| Error | Cause | Action |
|---|---|---|
| 403 Forbidden | CORS-blocked RPC | Switch to CORS-friendly RPC |
| Timeout | RPC overloaded | Retry with backoff |
| Rate limited | Too many requests | Back off, consider paid RPC |
| Connection refused | RPC down | Show connection error UI |

### 2. Account Errors (Expected)
These are normal and can be caught specifically.

| Error | Cause | Action |
|---|---|---|
| `TokenAccountNotFoundError` | ATA doesn't exist yet | Return 0 balance / create ATA |
| `TokenInvalidAccountOwnerError` | ATA owned by wrong program | Return 0 balance |

### 3. Transaction Errors
Catch and translate for the user.

| Error | Cause | User Message |
|---|---|---|
| `InsufficientFunds` | Not enough tokens | "Insufficient USDC balance" |
| `insufficient lamports` | Not enough SOL for fees | "Insufficient SOL for fees. Deposit SOL." |
| `Blockhash not found` | Transaction expired | "Transaction expired. Try again." |
| `block height exceeded` | Transaction expired | "Transaction expired. Try again." |

## Polling Pattern

For balance/history polling, catch errors per-poll but don't crash. Use overlap guards to prevent pile-up on slow networks:

```typescript
useEffect(() => {
  if (!wallet || !address) return;

  let balancePending = false;

  const fetchBalances = async () => {
    if (balancePending) return; // skip if previous poll still in-flight
    balancePending = true;
    try {
      const [usdcBal, solBal] = await Promise.all([
        getUSDCBalance(address),
        getSOLBalance(address)
      ]);
      setBalance(usdcBal);
      setSolBalance(solBal);
    } catch (error) {
      console.warn("Balance poll failed, will retry:", error);
      // Don't update state — keep showing last known balance
    } finally {
      balancePending = false;
    }
  };

  fetchBalances();
  const interval = setInterval(fetchBalances, 10000);
  return () => clearInterval(interval);
}, [wallet, address]);
```

Key points:
- Each poll is independent — one failure doesn't break the next
- Keep showing the last known balance on failure
- Use `console.warn` not `console.error` for transient poll failures
- Fetch immediately on mount, then poll on interval
- **Guard against overlap** — on slow networks (2s+ latency), a 10s interval fires before the previous poll finishes, piling up concurrent requests. The `pending` flag skips ticks when a poll is already in-flight

## SOL Balance: Don't Swallow Network Errors

`connection.getBalance()` returns 0 for non-existent accounts (no exception). So a try/catch returning `"0.00"` only hides real failures:

```typescript
// BAD — hides timeouts, 403s, rate limits
try {
  const balance = await connection.getBalance(pubkey);
  return (balance / 1e9).toFixed(9);
} catch {
  return "0.00";
}

// GOOD — let network errors propagate to the polling catch
const balance = await connection.getBalance(pubkey);
return (balance / 1e9).toFixed(9);
```

This is different from `getAccount()` for SPL tokens, where `TokenAccountNotFoundError` is an expected case that should be caught.

## Debugging Checklist

When something doesn't work and you see no errors in the terminal:

1. **Open browser DevTools console** — Vite externalization warnings only show there
2. **Test RPC with Origin header** — `curl -H "Origin: http://localhost:3000"` your endpoint
3. **Check pre-bundled deps for stubs** — `grep "browser-external:MODULE" node_modules/.vite/deps/...`
4. **Verify key derivation** — Test with `abandon abandon ... about` mnemonic, compare address against Phantom
5. **Check the ATA, not the wallet** — USDC lives in the ATA, not at the wallet pubkey
6. **Clear Vite cache** — `rm -rf node_modules/.vite` after changing polyfills or deps
