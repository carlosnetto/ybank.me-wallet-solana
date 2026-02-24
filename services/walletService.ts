import {
  Connection,
  Keypair,
  PublicKey,
  Transaction as SolanaTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { SOLANA_RPC_URL, USDC_MINT_SOLANA, Transaction } from '../types';

const USDC_MINT = new PublicKey(USDC_MINT_SOLANA);
const USDC_DECIMALS = 6;
const DERIVATION_PATH = "m/44'/501'/0'/0'";

// Singleton connection instance
let connectionInstance: Connection | null = null;

export const getConnection = (): Connection => {
  if (!connectionInstance) {
    connectionInstance = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connectionInstance;
};

export const validateMnemonic = (phrase: string): boolean => {
  return bip39.validateMnemonic(phrase);
};

export const getKeypairFromMnemonic = (phrase: string): Keypair => {
  const seed = bip39.mnemonicToSeedSync(phrase);
  const derivedSeed = derivePath(DERIVATION_PATH, seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed);
};

export const getSOLBalance = async (address: string): Promise<string> => {
  try {
    const connection = getConnection();
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    // Lamports to SOL (10^9)
    return (balance / 1e9).toFixed(9);
  } catch (error) {
    console.error("Error fetching SOL balance:", error);
    return "0.00";
  }
};

export const getUSDCBalance = async (address: string): Promise<string> => {
  try {
    const connection = getConnection();
    const ownerPubkey = new PublicKey(address);
    const ata = await getAssociatedTokenAddress(USDC_MINT, ownerPubkey);

    try {
      const accountInfo = await getAccount(connection, ata);
      // Convert from atomic units (6 decimals) to human-readable
      const balance = Number(accountInfo.amount) / Math.pow(10, USDC_DECIMALS);
      return balance.toFixed(2);
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
        // Token account doesn't exist yet — balance is 0
        return "0.00";
      }
      throw error;
    }
  } catch (error) {
    console.warn("Error fetching USDC balance:", error);
    return "0.00";
  }
};

export const sendUSDC = async (
  keypair: Keypair,
  to: string,
  amount: string
): Promise<string> => {
  const connection = getConnection();
  const recipientPubkey = new PublicKey(to);
  const senderPubkey = keypair.publicKey;

  // Convert amount to atomic units
  const amountInUnits = Math.round(parseFloat(amount) * Math.pow(10, USDC_DECIMALS));

  try {
    // Get associated token accounts
    const senderAta = await getAssociatedTokenAddress(USDC_MINT, senderPubkey);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);

    const transaction = new SolanaTransaction();

    // Check if recipient ATA exists, create if needed
    try {
      await getAccount(connection, recipientAta);
    } catch {
      // Recipient ATA doesn't exist — create it (sender pays for account creation)
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPubkey,    // payer
          recipientAta,    // associated token account
          recipientPubkey, // owner
          USDC_MINT        // mint
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        senderAta,     // source
        recipientAta,  // destination
        senderPubkey,  // owner/authority
        amountInUnits  // amount in atomic units
      )
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
    return signature;
  } catch (error: any) {
    console.error("Send Transaction Error:", error);

    if (error.message?.includes('insufficient lamports')) {
      throw new Error("Insufficient SOL for transaction fees. Please deposit SOL.");
    }

    if (error.message?.includes('insufficient funds')) {
      throw new Error("Insufficient USDC balance.");
    }

    throw new Error(error.message || "Transaction failed. Please check your connection and balance.");
  }
};

export const getRecentTransactions = async (address: string): Promise<Transaction[]> => {
  try {
    const connection = getConnection();
    const ownerPubkey = new PublicKey(address);

    // Get the associated token account for USDC
    const ata = await getAssociatedTokenAddress(USDC_MINT, ownerPubkey);

    // Fetch recent signatures for the token account
    const signatures = await connection.getSignaturesForAddress(ata, { limit: 20 });

    if (signatures.length === 0) return [];

    // Fetch parsed transactions in batches
    const transactions: Transaction[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
      const batch = signatures.slice(i, i + BATCH_SIZE);
      const parsedTxs = await Promise.all(
        batch.map(sig =>
          connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          }).catch(() => null)
        )
      );

      for (let j = 0; j < parsedTxs.length; j++) {
        const parsedTx = parsedTxs[j];
        const sigInfo = batch[j];

        if (!parsedTx?.meta || parsedTx.meta.err) continue;

        // Look for SPL token transfer instructions
        const instructions = parsedTx.transaction.message.instructions;
        for (const ix of instructions) {
          if ('parsed' in ix && ix.program === 'spl-token') {
            const parsed = ix.parsed;
            if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
              const info = parsed.info;

              // Determine direction based on source/destination ATA
              const source = info.source || info.authority;
              const destination = info.destination;

              // Get the actual token amount
              let tokenAmount: number;
              if (parsed.type === 'transferChecked') {
                tokenAmount = parseFloat(info.tokenAmount?.uiAmountString || '0');
              } else {
                tokenAmount = Number(info.amount) / Math.pow(10, USDC_DECIMALS);
              }

              if (tokenAmount <= 0) continue;

              const isIncoming = destination === ata.toBase58();

              transactions.push({
                hash: sigInfo.signature,
                type: isIncoming ? 'in' : 'out',
                amount: tokenAmount.toFixed(2),
                timestamp: (sigInfo.blockTime || Math.floor(Date.now() / 1000)) * 1000,
                status: 'confirmed',
                from: source,
                to: destination,
              });

              break; // Only count one transfer per transaction
            }
          }
        }
      }
    }

    // Deduplicate by signature
    const seen = new Set<string>();
    const unique = transactions.filter(tx => {
      if (seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });

    // Sort by time descending
    return unique.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.warn("Error fetching history:", error);
    return [];
  }
};
