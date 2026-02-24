# HD Key Derivation: Mnemonic to Solana Keypair

## The Right Library: `micro-key-producer`

Use `micro-key-producer` for SLIP-0010 Ed25519 HD key derivation. It's pure JavaScript (uses `@noble/hashes` internally), has zero Node.js built-in dependencies, and is the library recommended by the official Solana docs.

**Do NOT use these alternatives:**
- `ed25519-hd-key` — Depends on Node.js `crypto.createHmac`. Vite silently stubs this out, causing key derivation to return garbage. React never mounts → blank page with zero build errors.
- `micro-ed25519-hdkey` — Deprecated in favor of `micro-key-producer`.

## Installation

```bash
npm install bip39 micro-key-producer
```

## Derivation Pattern

```typescript
import * as bip39 from 'bip39';
import { HDKey } from 'micro-key-producer/slip10.js';
import { Keypair } from '@solana/web3.js';

const DERIVATION_PATH = "m/44'/501'/0'/0'";

// Generate a new wallet
export const createNewWallet = (): { mnemonic: string; keypair: Keypair } => {
  const mnemonic = bip39.generateMnemonic();
  const keypair = getKeypairFromMnemonic(mnemonic);
  return { mnemonic, keypair };
};

// Restore wallet from mnemonic
export const getKeypairFromMnemonic = (phrase: string): Keypair => {
  const seed = bip39.mnemonicToSeedSync(phrase);
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(DERIVATION_PATH);
  return Keypair.fromSeed(child.privateKey);
};

// Validate a mnemonic phrase
export const validateMnemonic = (phrase: string): boolean => {
  return bip39.validateMnemonic(phrase);
};
```

## Important Notes

### Import Path
The import must use the `.js` extension: `micro-key-producer/slip10.js`. Without it, Node.js ESM resolution fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### Derivation Path
Solana uses BIP44 path `m/44'/501'/0'/0'` (coin type 501). This differs from:
- Ethereum: `m/44'/60'/0'/0/0` (coin type 60)
- Bitcoin: `m/44'/0'/0'/0/0` (coin type 0)

The same 12-word mnemonic produces completely different addresses on Solana vs Ethereum. This is expected.

### Verification
To verify your derivation is correct, use the standard test mnemonic:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

This should produce a known Solana address. Compare against Phantom, Solflare, or another established wallet that supports mnemonic import.

### Address Format
Solana addresses are Base58-encoded Ed25519 public keys (32-44 characters). They do NOT start with `0x` like Ethereum addresses.

```typescript
const address = keypair.publicKey.toBase58();
// Example: "D8NSFxJkf2LcF1SgCTZfe8SDrTJtdJkAeNXcQYzTk93F"
```
