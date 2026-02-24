# Solana Ecosystem Direction (2026)

## web3.js v1.x vs @solana/kit (v2/v5)

The Solana Foundation now recommends `@solana/kit` for new projects. It's the successor to `@solana/web3.js`.

| | web3.js v1.x (Legacy) | @solana/kit (Recommended) |
|---|---|---|
| Package | `@solana/web3.js` | `@solana/kit` |
| Style | OOP (classes) | Functional (pipes) |
| Tree-shaking | Limited | Full |
| Bundle size | Larger | ~26% smaller |
| Connection | `new Connection(url)` | `createSolanaRpc(url)` |
| Public keys | `new PublicKey(addr)` | `address(addr)` |
| Keypairs | `Keypair.fromSeed()` | `createKeyPairSignerFromPrivateKeyBytes()` |
| Transactions | `new Transaction().add(ix)` | `pipe(createTransactionMessage(), ...)` |
| SPL Tokens | `@solana/spl-token` | `@solana-program/token` |
| Community | Extensive resources | Growing |
| Status | Maintained, stable | Active development |

## When to Use Which

**Use web3.js v1.x when:**
- Existing project that already uses it
- You need community examples (most tutorials/StackOverflow use v1.x)
- Quick prototyping (simpler API for small projects)
- You depend on libraries that import from `@solana/web3.js`

**Use @solana/kit when:**
- Starting a brand new project
- Bundle size is critical
- You want the most modern patterns
- You're comfortable with functional pipe style

**No rush to migrate** existing projects. web3.js v1.x is stable and maintained.

## Key Ecosystem Libraries

### For Wallet Apps
| Purpose | Library |
|---|---|
| RPC + transactions | `@solana/web3.js` or `@solana/kit` |
| SPL tokens | `@solana/spl-token` or `@solana-program/token` |
| Mnemonics | `bip39` |
| HD derivation | `micro-key-producer` |
| QR codes | `qrcode.react` + `jsqr` |

### For Payments
| Purpose | Library/Service |
|---|---|
| Solana Pay | `@solana/pay` |
| Payment links | Solana Pay transfer requests |
| Commerce | Kora Commerce Kit (coming) |

## Solana Docs: Markdown Mode

Every page on solana.com returns markdown if you include `Accept: text/markdown` in the request header. This is useful for AI tools — saves tokens compared to parsing HTML.

```bash
curl -H "Accept: text/markdown" https://solana.com/developers/cookbook/wallets/restore-from-mnemonic
```

## Resources

- Kit documentation: https://www.solanakit.com/
- Solana Dev Skill (Claude Code): https://github.com/solana-foundation/solana-dev-skill
- Awesome Solana AI: https://github.com/solana-foundation/awesome-solana-ai
- Community skills marketplace: https://www.solanaskills.com/
- Solana Cookbook: https://solana.com/developers/cookbook
