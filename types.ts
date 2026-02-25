export enum ViewState {
  LOGIN = 'LOGIN',
  SETUP = 'SETUP',
  WALLET_CHOICE = 'WALLET_CHOICE',
  IMPORT = 'IMPORT',
  DASHBOARD = 'DASHBOARD',
  SEND = 'SEND',
  RECEIVE = 'RECEIVE',
  PAY = 'PAY',
  CHARGE = 'CHARGE',
  SETTINGS = 'SETTINGS',
}

export interface Transaction {
  hash: string;
  type: 'in' | 'out';
  amount: string;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
  to?: string;
  from?: string;
}

export interface WalletState {
  address: string;
  mnemonic: string | null;
  balance: string;
  solBalance: string;
  transactions: Transaction[];
}

export const USDC_MINT_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_RPC_URL = 'https://solana-rpc.publicnode.com';
export const RPC_TIMEOUT_MS = 15_000;    // 15s per-request timeout
export const TX_HISTORY_LIMIT = 10;       // signatures to fetch for history
