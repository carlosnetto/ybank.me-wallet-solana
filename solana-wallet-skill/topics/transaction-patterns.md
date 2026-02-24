# Transaction Lifecycle: Build → Simulate → Sign → Send → Confirm

## Full Pattern

Every Solana transaction should follow this sequence using a single blockhash:

```typescript
import { Connection, Transaction, Keypair } from '@solana/web3.js';

const sendTransaction = async (
  connection: Connection,
  transaction: Transaction,
  keypair: Keypair
): Promise<string> => {
  // 1. Get blockhash (valid for ~60 seconds / ~150 blocks)
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = keypair.publicKey;

  // 2. Simulate BEFORE signing — catches errors instantly
  const simulation = await connection.simulateTransaction(transaction, [keypair]);
  if (simulation.value.err) {
    const errStr = JSON.stringify(simulation.value.err);
    const logs = simulation.value.logs;

    if (errStr.includes('InsufficientFunds') ||
        logs?.some(l => l.includes('insufficient'))) {
      throw new Error("Insufficient token balance.");
    }
    if (errStr.includes('0x1') ||
        logs?.some(l => l.includes('insufficient lamports'))) {
      throw new Error("Insufficient SOL for transaction fees.");
    }
    throw new Error("Transaction simulation failed.");
  }

  // 3. Sign with the SAME blockhash used for simulation
  transaction.sign(keypair);

  // 4. Send the signed transaction
  const signature = await connection.sendRawTransaction(transaction.serialize());

  // 5. Confirm using the SAME blockhash for expiry awareness
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  return signature;
};
```

## Why Simulate First?

Simulation runs the transaction against current state without submitting it to the network. Benefits:
- **Instant feedback** — no waiting for block inclusion to discover errors
- **No fees charged** — simulation is free
- **Better error messages** — simulation logs contain program-level error details

Without simulation, the user submits a transaction, waits 5-30 seconds, and then sees a generic failure.

## Blockhash Lifecycle

Blockhashes expire after ~60 seconds (~150 blocks). If you get a blockhash, show a confirmation dialog, wait for user input, then send — the blockhash may have expired.

**Rule**: Get blockhash → simulate → sign → send → confirm, all in one flow with the same blockhash.

If confirmation fails with `block height exceeded` or `Blockhash not found`, get a fresh blockhash and retry the entire flow.

## Common Simulation Errors

| Error | Meaning | User Message |
|---|---|---|
| `InsufficientFunds` | Not enough tokens | "Insufficient USDC balance" |
| Custom program error `0x1` | Not enough SOL for fees/rent | "Insufficient SOL for transaction fees" |
| Account-related errors | Invalid recipient, wrong program | "Invalid recipient address" |

## Confirmation Levels

| Level | Meaning | Use Case |
|---|---|---|
| `processed` | Seen by RPC node | Don't use — can be dropped |
| `confirmed` | Voted on by supermajority | Balance updates, UI feedback |
| `finalized` | Rooted (irreversible) | High-value, critical operations |

Use `confirmed` for most wallet operations. It's fast (~400ms) and reliable.

## Error Handling After Send

```typescript
try {
  const signature = await sendTransaction(connection, transaction, keypair);
  return signature;
} catch (error: any) {
  if (error.message?.includes('insufficient lamports')) {
    throw new Error("Insufficient SOL for transaction fees.");
  }
  if (error.message?.includes('Blockhash not found') ||
      error.message?.includes('block height exceeded')) {
    throw new Error("Transaction expired. Please try again.");
  }
  throw new Error(error.message || "Transaction failed.");
}
```
