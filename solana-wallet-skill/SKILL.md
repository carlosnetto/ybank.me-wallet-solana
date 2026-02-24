---
name: solana-wallet-dev
description: Practical patterns for building Solana wallet and payment apps in React/TypeScript with Vite. Covers RPC selection, HD key derivation, SPL token operations, transaction lifecycle, error handling, and bundler configuration. Learned from production wallet development.
user-invocable: false
---

# Solana Wallet & Payment App Development

You are an expert in building Solana wallet and payment applications using React, TypeScript, and Vite. You follow battle-tested patterns for browser-based Solana development.

## Operating Procedure

1. When the user asks about Solana wallet development, SPL token operations, or browser-based Solana apps, load the relevant topic file(s) from the `topics/` directory adjacent to this SKILL.md.
2. Apply the patterns and avoid the pitfalls described in the topic files.
3. Always prefer pure JavaScript libraries over those with Node.js dependencies when targeting browsers.
4. When uncertain about an API or pattern, check Solana docs at solana.com (use `Accept: text/markdown` header to get markdown responses and save tokens).

## Quick Reference

### Key Libraries
| Purpose | Library | Notes |
|---|---|---|
| RPC & Transactions | `@solana/web3.js` v1.x | Legacy but stable; v2 is `@solana/kit` |
| SPL Tokens | `@solana/spl-token` | ATA management, transfers |
| Mnemonics | `bip39` | Generation and validation |
| HD Key Derivation | `micro-key-producer` | Pure JS, no Node.js crypto dependency |
| Vite Polyfills | `vite-plugin-node-polyfills` | Only `buffer`, `stream`, `events`, `process` needed |

### Key Constants
| Constant | Value |
|---|---|
| USDC Mint (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDC Decimals | 6 |
| SOL Decimals | 9 |
| Derivation Path | `m/44'/501'/0'/0'` |
| Free CORS-friendly RPC | `https://solana-rpc.publicnode.com` |

### Critical Rules
- **Never use `api.mainnet-beta.solana.com` in browser apps** — it returns 403 for requests with an `Origin` header.
- **Never use `ed25519-hd-key`** in browser builds — it depends on Node.js `crypto.createHmac` which Vite silently stubs out, causing blank pages with no build errors.
- **Never swallow RPC errors as zero balance** — only catch `TokenAccountNotFoundError` and `TokenInvalidAccountOwnerError`.
- **Always simulate transactions before sending** — catches errors instantly instead of waiting for on-chain failure.
- **Always derive token balance from the ATA address**, not the wallet address — Solana wallets don't hold tokens directly.

## Topic Files

Load these for detailed patterns:

- `topics/rpc-and-cors.md` — RPC endpoint selection, CORS issues, testing
- `topics/key-derivation.md` — Mnemonic to Keypair, HD derivation, library choice
- `topics/spl-tokens.md` — ATAs, balance fetching, transfers, account creation
- `topics/transaction-patterns.md` — Build, simulate, sign, send, confirm lifecycle
- `topics/vite-polyfills.md` — Bundler configuration, which polyfills are needed and why
- `topics/error-handling.md` — Error classification, specific catch patterns, debugging
- `topics/ecosystem-direction.md` — web3.js vs Kit, migration considerations

## Ecosystem Resources

- Solana Dev Skill (broader Solana development): https://github.com/solana-foundation/solana-dev-skill
- Kit docs (next-gen SDK): https://www.solanakit.com/
- Awesome Solana AI: https://github.com/solana-foundation/awesome-solana-ai
- Community skills: https://www.solanaskills.com/
- Solana docs (markdown-enabled): Add `Accept: text/markdown` header to any solana.com page
