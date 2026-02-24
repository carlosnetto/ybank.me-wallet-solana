# SPL Token Operations (USDC)

## Core Concept: Associated Token Accounts (ATAs)

On Solana, tokens are NOT stored at your wallet address. Each token type has a separate **Associated Token Account (ATA)** derived deterministically from your wallet public key + the token mint address.

```
Wallet Address:  D8NSFx...  (your Ed25519 public key)
USDC ATA:        7NCZDb...  (derived, holds your USDC)
BONK ATA:        Hx8mKL...  (derived, holds your BONK)
```

This means:
- **Fetching balance**: Query the ATA, not the wallet address
- **Fetching transaction history**: Query signatures on the ATA, not the wallet
- **Sending tokens**: The recipient might not have an ATA yet — you must create it

## Fetching Token Balance

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

export const getUSDCBalance = async (address: string): Promise<string> => {
  const connection = getConnection();
  const ownerPubkey = new PublicKey(address);
  const ata = await getAssociatedTokenAddress(USDC_MINT, ownerPubkey);

  try {
    const accountInfo = await getAccount(connection, ata);
    const balance = Number(accountInfo.amount) / Math.pow(10, USDC_DECIMALS);
    return balance.toFixed(2);
  } catch (error) {
    // ONLY catch "account doesn't exist" errors
    if (error instanceof TokenAccountNotFoundError ||
        error instanceof TokenInvalidAccountOwnerError) {
      return "0.00"; // Account genuinely doesn't exist yet
    }
    throw error; // Network errors, 403s, etc. — let them propagate
  }
};
```

### Fallback: `getTokenAccountsByOwner`

If the standard ATA lookup fails (e.g., the account uses a non-standard derivation), fall back to scanning all token accounts for the mint:

```typescript
const tokenAccounts = await connection.getTokenAccountsByOwner(
  ownerPubkey,
  { mint: USDC_MINT },
  { commitment: 'confirmed' }
);

if (tokenAccounts.value.length === 0) return "0.00";
```

## Sending Tokens (Transfer)

```typescript
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { Transaction, Keypair, PublicKey, Connection } from '@solana/web3.js';

export const sendUSDC = async (
  keypair: Keypair,
  to: string,
  amount: string
): Promise<string> => {
  const connection = getConnection();
  const recipientPubkey = new PublicKey(to);
  const senderPubkey = keypair.publicKey;
  const amountInUnits = Math.round(parseFloat(amount) * Math.pow(10, USDC_DECIMALS));

  const senderAta = await getAssociatedTokenAddress(USDC_MINT, senderPubkey);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);

  const transaction = new Transaction();

  // Check if recipient ATA exists — create if needed (sender pays ~0.002 SOL rent)
  try {
    await getAccount(connection, recipientAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        senderPubkey,    // payer
        recipientAta,    // ATA to create
        recipientPubkey, // owner of the ATA
        USDC_MINT        // token mint
      )
    );
  }

  // Add transfer instruction
  transaction.add(
    createTransferInstruction(
      senderAta,     // source ATA
      recipientAta,  // destination ATA
      senderPubkey,  // authority (signer)
      amountInUnits  // amount in atomic units
    )
  );

  // See transaction-patterns.md for simulate → sign → send → confirm
};
```

## Fetching Transaction History

Query the ATA address (not the wallet address) for token transfer history:

```typescript
const ata = await getAssociatedTokenAddress(USDC_MINT, ownerPubkey);
const signatures = await connection.getSignaturesForAddress(ata, { limit: 20 });
```

### Parsing Transfers

SPL token transfers come in two instruction types. Your parser must handle both:

```typescript
for (const ix of instructions) {
  if ('parsed' in ix && ix.program === 'spl-token') {
    const parsed = ix.parsed;
    if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
      let tokenAmount: number;

      if (parsed.type === 'transferChecked') {
        // Newer style — used by Phantom, Solflare, etc.
        tokenAmount = parseFloat(parsed.info.tokenAmount.uiAmountString);
      } else {
        // Older style — raw integer amount
        tokenAmount = Number(parsed.info.amount) / Math.pow(10, USDC_DECIMALS);
      }

      const isIncoming = parsed.info.destination === ata.toBase58();
    }
  }
}
```

**Important**: Always use `uiAmountString` (not `uiAmount`). The `uiAmount` field has floating-point precision issues.

## Decimal Reference

| Token | Decimals | 1.00 in atomic units |
|---|---|---|
| USDC (Solana) | 6 | 1,000,000 |
| USDC (EVM) | 6 | 1,000,000 |
| SOL | 9 | 1,000,000,000 |
| ETH | 18 | 1,000,000,000,000,000,000 |

USDC is 6 decimals on both Solana and EVM — convenient for porting.
