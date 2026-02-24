import {
  Connection,
  Keypair,
  PublicKey,
  Transaction as SolanaTransaction,
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
import { HDKey } from 'micro-key-producer/slip10.js';
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
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(DERIVATION_PATH);
  return Keypair.fromSeed(child.privateKey);
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
      // ATA lookup failed — try getTokenAccountsByOwner as fallback
      console.warn("ATA getAccount failed, trying getTokenAccountsByOwner:", error);
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        ownerPubkey,
        { mint: USDC_MINT },
        { commitment: 'confirmed' }
      );
      if (tokenAccounts.value.length === 0) return "0.00";
      // Parse the first matching account
      const data = tokenAccounts.value[0].account.data;
      const parsed = data as any;
      if (parsed.parsed?.info?.tokenAmount?.uiAmountString) {
        return parseFloat(parsed.parsed.info.tokenAmount.uiAmountString).toFixed(2);
      }
      return "0.00";
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

    // Set recent blockhash and fee payer before simulation
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    // Simulate transaction before sending to catch errors early
    const simulation = await connection.simulateTransaction(transaction, [keypair]);
    if (simulation.value.err) {
      const errStr = JSON.stringify(simulation.value.err);
      console.error("Transaction simulation failed:", errStr, simulation.value.logs);

      if (errStr.includes('InsufficientFunds') || simulation.value.logs?.some(l => l.includes('insufficient'))) {
        throw new Error("Insufficient USDC balance.");
      }
      if (errStr.includes('0x1') || simulation.value.logs?.some(l => l.includes('insufficient lamports'))) {
        throw new Error("Insufficient SOL for transaction fees. Please deposit SOL.");
      }
      throw new Error("Transaction simulation failed. Please try again.");
    }

    // Sign and send with the same blockhash used for simulation
    transaction.sign(keypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());

    // Wait for confirmation with blockhash expiry awareness
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return signature;
  } catch (error: any) {
    console.error("Send Transaction Error:", error);

    if (error.message?.includes('insufficient lamports')) {
      throw new Error("Insufficient SOL for transaction fees. Please deposit SOL.");
    }

    if (error.message?.includes('insufficient funds') || error.message?.includes('Insufficient USDC')) {
      throw new Error("Insufficient USDC balance.");
    }

    if (error.message?.includes('Blockhash not found') || error.message?.includes('block height exceeded')) {
      throw new Error("Transaction expired. Please try again.");
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
