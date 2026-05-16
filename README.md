# YBank.me Wallet — Solana

A React/TypeScript mobile payment wallet for **Solana**, supporting USDC transfers, QR-based payments, and merchant charging.

Originally written for Base (EVM) and rebuilt for Solana's instruction-based transaction model with SPL token support — same UI/UX.

## Features

- **Installable PWA** — Add to home screen on iOS and Android for a fullscreen, app-like experience
- **Wallet creation & import** — BIP39 mnemonic generation, HD key derivation (`m/44'/501'/0'/0'`)
- **USDC balance & SOL gas display** — Real-time polling via Solana RPC
- **Send USDC** — SPL token transfers with automatic associated token account creation. Scan a Solana address QR (plain base58 or `solana:` Solana Pay URI) instead of typing.
- **Receive** — QR code with your Solana address
- **Pay** — Scan merchant QR codes, review bill details, add tip, confirm payment
- **Charge** — Generate payment QR codes for customers (merchant mode)
- **Transaction history** — Parsed SPL token transfer history from on-chain data
- **Merchant settings** — Configurable business info, tip presets, QR expiry
- **Logout with optional wipe** — Choose to erase the recovery phrase from device storage on logout, or keep it for quick re-entry

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
index.tsx                     # React DOM entry point + service worker registration
index.html                    # PWA meta tags, manifest link, Apple touch icon
App.tsx                       # Main app state, routing, wallet lifecycle
types.ts                      # TypeScript types, Solana constants
components/
  AuthViews.tsx               # Splash, Setup, Import/Create wallet screens
  ActionViews.tsx             # Send (with Solana QR scan), Pay, Charge, Settings
  DashboardComponents.tsx     # Header, balance display, transaction list, receive, logout modal
services/
  walletService.ts            # All Solana blockchain interactions
public/                       # PWA assets: manifest.json, sw.js, icons (served as-is)
worker.ts                     # Cloudflare Worker: strips /x9.150 prefix, proxies API, SPA fallback
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

## Deploy

Deployed to **materalabs.us/x9.150** (Cloudflare Workers).

```bash
npm run build && npx wrangler deploy
```

Wrangler uses OAuth (`npx wrangler login`) — no API token in the repo.

The QR payment backend runs on `localhost:5010` and is exposed via a Cloudflare tunnel:

```bash
./tunnel.sh   # reads .tunnel-token
```

See `CLOUDFLARE.md` for full deployment and tunnel details.

## Install as a PWA

- **iOS Safari** — Share → Add to Home Screen
- **Android Chrome** — three-dot menu → Install app

The home-screen launch opens fullscreen with the Solana-palette icon. Service worker is a pass-through (no offline caching) so the wallet always shows fresh balances.
