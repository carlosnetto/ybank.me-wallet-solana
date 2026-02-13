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
  ethBalance: string;
  transactions: Transaction[];
}

export const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_RPC_URL = 'https://mainnet.base.org';