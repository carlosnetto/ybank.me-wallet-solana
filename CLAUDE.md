# CLAUDE.md — Solana Wallet Port

## Project Context

This is a fork of `ybank.me-wallet`, a React/TypeScript mobile payment wallet originally built for **Base (EVM)**. The goal is to port it to **Solana** while keeping the same UI/UX flow.

The original Base version lives at `/Users/cnetto/Git/ybank.me-wallet` and should not be modified.

## Current State

The codebase is an **unmodified copy** of the Base wallet. No Solana changes have been made yet. Everything still references ethers.js, Base RPC, and EVM concepts.

## Architecture Overview

```
index.tsx                     # React DOM entry point
App.tsx                       # Main app state, routing, wallet lifecycle
types.ts                      # TypeScript types, config constants
components/
  AuthViews.tsx               # Login, Setup, Import/Create wallet screens
  ActionViews.tsx             # Send, Pay (QR scan), Charge (QR generate), Settings
  DashboardComponents.tsx     # Header, balance display, transaction list, receive
services/
  walletService.ts            # ALL blockchain interactions (this is the main file to rewrite)
```

## What Needs to Change

### 1. Dependencies (`package.json`)

**Remove:**
- `ethers` (v6.16.0)

**Add:**
- `@solana/web3.js` — Solana RPC, transactions, keypairs
- `@solana/spl-token` — SPL token operations (USDC is an SPL token on Solana)
- `bip39` — mnemonic generation/validation (ethers.js currently handles this internally)
- `ed25519-hd-key` or `@solana/wallet-standard` — HD key derivation from mnemonic (Solana uses derivation path m/44'/501'/0'/0')

### 2. `services/walletService.ts` — Full Rewrite

This file contains ALL blockchain logic. Every function must be reimplemented:

| Current Function | What It Does | Solana Equivalent |
|---|---|---|
| `getProvider()` | Creates `ethers.JsonRpcProvider` for Base RPC | `new Connection(clusterApiUrl('mainnet-beta'))` or custom RPC |
| `getWalletFromMnemonic(phrase)` | `ethers.Wallet.fromPhrase()` → EVM keypair | Derive Solana `Keypair` from mnemonic using BIP44 path `m/44'/501'/0'/0'` |
| `validateMnemonic(phrase)` | `ethers.Mnemonic.isValidMnemonic()` | Use `bip39.validateMnemonic()` |
| `getETHBalance(address)` | `provider.getBalance()` → ETH balance | `connection.getBalance()` → SOL balance (in lamports, divide by 10^9) |
| `getUSDCBalance(address)` | ERC-20 `balanceOf()` call | Find associated token account for USDC mint, get token balance via `getTokenAccountBalance()` |
| `sendUSDC(wallet, to, amount)` | ERC-20 `transfer()` call | SPL token transfer instruction. Must handle associated token accounts (recipient may not have one yet — create if needed) |
| `getRecentTransactions(address)` | ERC-20 Transfer event log filtering in 2500-block chunks | `getSignaturesForAddress()` + `getParsedTransaction()` — completely different API |

**Key Solana differences to handle:**
- Solana uses `Keypair` (Ed25519), not ECDSA like EVM
- USDC on Solana is an SPL token with mint address `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet)
- SPL tokens require "associated token accounts" — the recipient must have one or you create it in the same transaction
- Transaction model is instruction-based, not contract-call-based
- Gas fees are paid in SOL (like ETH on Base, but much cheaper)

### 3. `App.tsx` — Moderate Changes

- **Line ~187-202**: Wallet creation — replace `ethers.Wallet.createRandom()` with `bip39.generateMnemonic()` + Solana keypair derivation
- **Line ~149**: Mnemonic validation — replace `ethers.Mnemonic.isValidMnemonic()`
- **Line ~12-19**: Wallet state types — change `ethers.HDNodeWallet` to Solana `Keypair`
- **Line ~90**: Balance polling — update function calls to Solana equivalents
- **Line ~213-230**: Send flow — update to use Solana send function
- **localStorage key**: Consider renaming from `'base_wallet_mnemonic'` to `'solana_wallet_mnemonic'` (note: same mnemonic phrase format, but derives different addresses)

### 4. `components/ActionViews.tsx` — Targeted Changes

- **Address validation** (~line 86 in SendView): Replace `0x` hex format check with Base58 Solana address validation
- **Explorer links**: Replace `basescan.org/tx/` with `solscan.io/tx/` or `explorer.solana.com/tx/`
- **PayView** (~line 282): Payment data extraction looks for `baseMethod?.networks?.Base?.address` — change to look for Solana network/address in the QR payment data
- **Amount conversion**: Replace `ethers.parseUnits` / `ethers.formatUnits` with manual math (USDC is still 6 decimals on Solana)
- **Notification payloads**: Update `network: 'Base'` references to `'Solana'`

### 5. `components/DashboardComponents.tsx` — Minor Changes

- **Network badge** (~line 38): Change "Base Mainnet" to "Solana Mainnet"
- **Explorer links** (~line 139): `basescan.org` → `solscan.io`
- **Gas label** (~line 71): "ETH" → "SOL"

### 6. `types.ts` — Minor Changes

- Rename/replace `USDC_ADDRESS_BASE` with Solana USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Update type definitions that reference `ethers` types
- Update RPC URL constant to a Solana RPC endpoint

## Key Constants for Solana

```
USDC Mint Address (mainnet): EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
USDC Decimals: 6 (same as Base)
SOL Decimals: 9 (vs ETH's 18)
Derivation Path: m/44'/501'/0'/0'
RPC Options: https://api.mainnet-beta.solana.com (rate-limited) or a paid provider
```

## Recommended Order of Work

1. Swap dependencies in `package.json` and `npm install`
2. Rewrite `services/walletService.ts` entirely for Solana
3. Update `App.tsx` wallet creation/restoration logic
4. Update `types.ts` constants and types
5. Update `components/ActionViews.tsx` (address validation, explorer links, payment flow)
6. Update `components/DashboardComponents.tsx` (labels, links)
7. Test wallet creation, balance fetching, sending USDC, and transaction history

## Backend / QR Server

The app communicates with a QR payment server (`VITE_QRAPPSERVER_URL`, default `http://localhost:5010`). The endpoints `/fetch`, `/generate`, and `/notify` may need updates on the server side to support Solana addresses and transaction formats. This is **out of scope** for this repo but should be coordinated.

## What NOT to Change

- Overall UI/UX flow and component structure
- QR code scanning/generation logic (jsqr, qrcode.react)
- Merchant settings and localStorage patterns
- Authentication flow (login/setup screens)
- Tailwind styling
