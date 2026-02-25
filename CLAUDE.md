# CLAUDE.md — Solana Wallet

## Project Context

This is a fork of `ybank.me-wallet`, a React/TypeScript mobile payment wallet originally built for **Base (EVM)**, now fully ported to **Solana**.

The original Base version lives at `/Users/cnetto/Git/ybank.me-wallet` and should not be modified.

## Current State

The port to Solana is **complete and functional**. The app handles wallet creation/import, USDC balance display, sending USDC, receiving (QR), merchant payment flows, and transaction history — all on Solana mainnet.

## Architecture Overview

```
index.tsx                     # React DOM entry point
App.tsx                       # Main app state, routing, wallet lifecycle
types.ts                      # TypeScript types, Solana constants
components/
  AuthViews.tsx               # Login, Setup, Import/Create wallet screens
  ActionViews.tsx             # Send, Pay (QR scan), Charge (QR generate), Settings
  DashboardComponents.tsx     # Header, balance display, transaction list, receive
services/
  walletService.ts            # All Solana blockchain interactions
```

## Dependencies (Solana Stack)

| Package | Purpose |
|---|---|
| `@solana/web3.js` (v1.x) | RPC connection, keypairs, transactions |
| `@solana/spl-token` (v0.4.x) | USDC (SPL token) operations, ATA management |
| `bip39` | BIP39 mnemonic generation and validation |
| `micro-key-producer` | SLIP-0010 Ed25519 HD key derivation (pure JS, no Node.js crypto) |
| `vite-plugin-node-polyfills` | Buffer/stream/events polyfills for browser |

### Why These Choices

- **`micro-key-producer`** over `ed25519-hd-key`: Pure JS implementation, no dependency on Node.js `crypto` module. Eliminates the blank-page bug caused by Vite externalizing `crypto.createHmac()` (see HISTORY.md). Also the officially recommended library in Solana docs.
- **`@solana/web3.js` v1.x** over `@solana/kit`: The ecosystem is moving to `@solana/kit` (labeled "recommended" in Solana docs, with v1.x labeled "legacy"), but v1.x is stable, well-documented, and sufficient for this wallet. Migration to Kit is a future consideration.
- **`vite-plugin-node-polyfills`**: Only polyfills `buffer`, `stream`, `events`, `process` — `crypto` polyfill was removed after switching to `micro-key-producer`.

## Key Constants

```
USDC Mint Address (mainnet): EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
USDC Decimals: 6
SOL Decimals: 9
Derivation Path: m/44'/501'/0'/0'
RPC Endpoint: https://solana-rpc.publicnode.com
Token Program: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
```

## RPC Endpoint

**Do NOT use `api.mainnet-beta.solana.com` from browser code.** It returns 403 for all requests with an `Origin` header (which browsers always send). The app uses `solana-rpc.publicnode.com` which allows CORS.

For production, consider a dedicated RPC provider (Helius, QuickNode, etc.) for better reliability and enhanced APIs.

## walletService.ts — Function Reference

| Function | What It Does |
|---|---|
| `getConnection()` | Singleton `Connection` to Solana RPC |
| `getKeypairFromMnemonic(phrase)` | BIP39 seed → SLIP-0010 derivation → Ed25519 `Keypair` |
| `validateMnemonic(phrase)` | BIP39 mnemonic validation |
| `getSOLBalance(address)` | Lamports → SOL (10^9) |
| `getUSDCBalance(address)` | ATA lookup → SPL token balance, with `getTokenAccountsByOwner` fallback |
| `sendUSDC(keypair, to, amount)` | Simulate → sign → send → confirm (handles ATA creation for recipient) |
| `getRecentTransactions(address)` | `getSignaturesForAddress` on ATA → `getParsedTransaction` → parse `transferChecked` instructions |

### Send Flow Details

`sendUSDC` follows this sequence:
1. Build transaction (create recipient ATA if needed + transfer instruction)
2. Get latest blockhash
3. **Simulate** transaction to catch errors before signing (insufficient SOL/USDC, invalid accounts)
4. Sign with keypair
5. Send raw transaction
6. Confirm with blockhash expiry tracking (retries if blockhash expires)

### Error Handling

- `getUSDCBalance` only catches `TokenAccountNotFoundError` / `TokenInvalidAccountOwnerError` as "0 balance" — other errors (network, 403, rate limiting) propagate with logging
- `sendUSDC` provides specific error messages: insufficient SOL, insufficient USDC, transaction expired
- Balance/history polling in `App.tsx` catches errors per-poll to avoid breaking the interval

## Mobile Viewport

The app uses `100dvh` (not `100vh`) for full-height layout and `env(safe-area-inset-bottom)` for the bottom nav bar. This is required for iOS Safari where `100vh` includes the area behind the browser toolbar, hiding bottom-positioned elements.

Key details:
- `index.html` has `viewport-fit=cover` in the viewport meta tag — this enables `env(safe-area-inset-bottom)`
- `App.tsx` container uses `h-[100dvh]` — dynamic viewport height that excludes browser chrome
- Nav bar uses `bottom-[calc(0.5rem+env(safe-area-inset-bottom))]` — clears the iPhone home indicator
- Content area uses `pb-28` to avoid clipping behind the nav bar

**Do NOT change these back to `h-screen` / `100vh` / `bottom-6`.** It will break on iPhone (see HISTORY.md).

## Lessons Learned

1. **Solana public RPC blocks browser requests** — `api.mainnet-beta.solana.com` returns 403 when `Origin` header is present. Use CORS-friendly RPCs.
2. **`ed25519-hd-key` requires Node.js crypto** — Causes silent blank page in Vite (see HISTORY.md). Replaced with `micro-key-producer` (pure JS).
3. **Silent error catching hides real failures** — Never catch all errors as "balance is 0". Distinguish between "account not found" (expected) and network errors (unexpected).
4. **Simulate before sending** — Catches insufficient balance/fees before the user waits for a failed transaction.
5. **Never use `100vh` for mobile layouts** — iOS Safari's `100vh` includes the area behind the browser toolbar. Use `100dvh` instead, and use `env(safe-area-inset-bottom)` for bottom-positioned elements. See HISTORY.md for the full story.
6. **`getParsedTransactions` (plural) fails on public RPCs** — It sends a JSON-RPC batch request. `publicnode.com` limits batch `getTransaction` to 1 call, returning 400. Use `Promise.all` over individual `getParsedTransaction` (singular) calls instead — same parallelism, separate HTTP requests. See HISTORY.md.

## Ecosystem Direction (As of Feb 2026)

The Solana Foundation recommends these for new projects:

| Current (Legacy) | Recommended (New) |
|---|---|
| `@solana/web3.js` | `@solana/kit` (v5.x) |
| `@solana/spl-token` | `@solana-program/token` |
| `ed25519-hd-key` | `micro-key-producer` (already adopted) |
| Manual React polling | `@solana/react-hooks` (for dApps with wallet adapters) |

Resources:
- [Solana Dev Skill](https://github.com/solana-foundation/solana-dev-skill) — Claude Code skill with opinionated Solana best practices
- [Solana Kit docs](https://www.solanakit.com/) — New SDK documentation
- Solana.com pages return markdown with `Accept: text/markdown` header

### Future Considerations

- **Helius RPC** — Enhanced APIs (`getTransactionsForAddress`) would simplify transaction history
- **Kora** — Gasless transactions (users pay fees in USDC instead of needing SOL)
- **Commerce Kit** (`@solana/commerce-kit`) — Drop-in payment verification for QR/Pay flows
- **Migration to `@solana/kit`** — Use `solana-kit-migration-skill` when ready

## Backend / QR Server

The app communicates with a QR payment server (`VITE_QRAPPSERVER_URL`, default `http://localhost:5010`). The endpoints `/fetch`, `/generate`, and `/notify` may need updates on the server side to support Solana addresses and transaction formats. This is **out of scope** for this repo.

## What NOT to Change

- Overall UI/UX flow and component structure
- QR code scanning/generation logic (jsqr, qrcode.react)
- Merchant settings and localStorage patterns
- Authentication flow (login/setup screens)
- Tailwind styling
