# YBank.me Wallet — Solana

A React/TypeScript mobile payment wallet for **Solana**, supporting USDC transfers, QR-based payments, and merchant charging.

Ported from the [Base (EVM) version](https://github.com/carlosnetto/ybank.me-wallet) — same UI/UX, rebuilt for Solana's instruction-based transaction model with SPL token support.

## Features

- **Wallet creation & import** — BIP39 mnemonic generation, HD key derivation (`m/44'/501'/0'/0'`)
- **USDC balance & SOL gas display** — Real-time polling via Solana RPC
- **Send USDC** — SPL token transfers with automatic associated token account creation for recipients
- **Receive** — QR code with your Solana address
- **Pay** — Scan merchant QR codes, review bill details, add tip, confirm payment
- **Charge** — Generate payment QR codes for customers (merchant mode)
- **Transaction history** — Parsed SPL token transfer history from on-chain data
- **Merchant settings** — Configurable business info, tip presets, QR expiry

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **@solana/web3.js** — RPC connection, transactions, keypairs
- **@solana/spl-token** — USDC (SPL token) operations
- **bip39** + **micro-key-producer** — Mnemonic generation and SLIP-0010 Ed25519 HD key derivation (pure JS)
- **Tailwind CSS** (CDN) — Styling
- **jsQR** + **qrcode.react** — QR scanning and generation

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `VITE_QRAPPSERVER_URL` | `http://localhost:5010` | QR payment server for Pay/Charge flows |

The wallet connects to Solana mainnet via `https://solana-rpc.publicnode.com` (CORS-friendly). To change the RPC endpoint, edit `SOLANA_RPC_URL` in `types.ts`. Note: `api.mainnet-beta.solana.com` blocks browser requests (returns 403 when an `Origin` header is present).

## Project Structure

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

## Key Constants

| Constant | Value |
|---|---|
| USDC Mint (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDC Decimals | 6 |
| SOL Decimals | 9 |
| Derivation Path | `m/44'/501'/0'/0'` |

## Build

```bash
npm run build
```

Output goes to `dist/`.
