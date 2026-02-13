import React from 'react';
import { Transaction } from '../types';
import { ArrowDownLeft, ArrowUpRight, Clock, Copy, CheckCircle2, Fuel, LogOut, RefreshCw, Signal } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface HeaderProps {
  balance: string;
  ethBalance: string;
  address: string;
  onLogout: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const WalletHeader: React.FC<HeaderProps> = ({ balance, ethBalance, address, onLogout, onRefresh, isRefreshing }) => {
  const [copied, setCopied] = React.useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-blue-600 text-white pt-10 pb-16 px-6 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <svg viewBox="0 0 100 100" className="w-full h-full">
           <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
           </pattern>
           <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      {/* Network Status Badge */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-blue-800/50 px-3 py-1 rounded-full border border-blue-500/30">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-[10px] font-medium text-blue-100 uppercase tracking-widest">Base Mainnet</span>
      </div>

      {/* Refresh Button (Top Left) */}
      <button 
        onClick={onRefresh}
        disabled={isRefreshing}
        className={`absolute top-6 left-6 z-20 p-2 text-blue-200 hover:text-white bg-blue-700/30 hover:bg-blue-700/50 rounded-full transition-all ${isRefreshing ? 'animate-spin' : ''}`}
        aria-label="Refresh"
      >
        <RefreshCw className="w-5 h-5" />
      </button>

      {/* Logout Button (Top Right) */}
      <button 
        onClick={onLogout}
        className="absolute top-6 right-6 z-20 p-2 text-blue-200 hover:text-white bg-blue-700/30 hover:bg-blue-700/50 rounded-full transition-all"
        aria-label="Logout"
      >
        <LogOut className="w-5 h-5" />
      </button>

      <div className="relative z-10 flex flex-col items-center mt-6">
        <span className="text-blue-100 text-sm font-medium mb-1">Total Balance</span>
        <h1 className="text-5xl font-bold tracking-tight mb-1">
          ${Number(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h1>
        <span className="text-blue-200 text-sm font-medium bg-blue-700/50 px-3 py-1 rounded-full mb-6">
          USDC on Base
        </span>

        <div className="flex items-center gap-2 text-xs text-blue-200 bg-blue-800/30 px-3 py-1.5 rounded-lg mb-6 border border-blue-500/30">
          <Fuel className="w-3 h-3" />
          <span>Gas Funds: {parseFloat(ethBalance).toFixed(4)} ETH</span>
        </div>

        <button 
          onClick={copyAddress}
          className="flex items-center gap-2 bg-blue-700/40 hover:bg-blue-700/60 transition-colors py-2 px-4 rounded-full text-xs font-mono text-blue-100"
        >
          {address.slice(0, 6)}...{address.slice(-4)}
          {copied ? <CheckCircle2 className="w-3 h-3 text-green-300" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};

export const LogoutModal: React.FC<{ isOpen: boolean; onConfirm: () => void; onCancel: () => void }> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel}></div>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Log Out?</h3>
        <p className="text-gray-500 mb-6">
          Are you sure you want to log out? Your secure wallet words will remain on this device unless you choose to replace them later.
        </p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};

interface TransactionListProps {
  transactions: Transaction[];
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions }) => {
  return (
    <div className="px-6 -mt-8 relative z-20 pb-24">
      <div className="bg-white rounded-2xl shadow-lg p-5 min-h-[300px]">
        <div className="flex justify-between items-center mb-4">
           <h3 className="text-gray-800 font-bold text-lg">Recent Activity</h3>
           <span className="text-xs text-gray-400 font-normal">Last ~4 Hours</span>
        </div>
        
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Clock className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No recent transactions found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => (
              <a 
                key={tx.hash} 
                href={`https://basescan.org/tx/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between group hover:bg-gray-50 p-2 rounded-lg -mx-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    tx.type === 'in' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tx.type === 'in' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {tx.type === 'in' ? 'Received' : 'Sent'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(tx.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${
                    tx.type === 'in' ? 'text-green-600' : 'text-gray-900'
                  }`}>
                    {tx.type === 'in' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 uppercase">USDC</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// RECEIVE VIEW COMPONENT
export const ReceiveCard: React.FC<{ address: string }> = ({ address }) => {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 pt-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Receive USDC</h2>
      
      <div className="bg-white p-6 rounded-3xl shadow-xl mb-8 border border-gray-100">
        <QRCodeSVG value={address} size={200} level="H" />
      </div>

      <div className="w-full max-w-sm">
        <p className="text-gray-500 text-center text-sm mb-2">Your Base Address</p>
        <button 
          onClick={copy}
          className="w-full bg-gray-100 active:bg-gray-200 py-4 px-4 rounded-xl flex items-center justify-between group transition-colors"
        >
          <span className="font-mono text-sm text-gray-600 truncate mr-2">{address}</span>
          <div className={`p-2 rounded-lg ${copied ? 'bg-green-100 text-green-600' : 'bg-white text-gray-600 shadow-sm'}`}>
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </div>
        </button>
      </div>

      <p className="mt-8 text-xs text-center text-gray-400 max-w-xs">
        Only send USDC on the Base network to this address. Sending other assets may result in permanent loss.
      </p>
    </div>
  );
};