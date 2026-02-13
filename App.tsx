import React, { useState, useEffect } from "react";
import { ethers } from 'ethers';
import { ViewState, WalletState, Transaction } from './types';
import { getWalletFromMnemonic, getUSDCBalance, getETHBalance, sendUSDC, getRecentTransactions } from './services/walletService';
import { LoginView, ImportWalletView, SetupWalletView } from './components/AuthViews';
import { WalletHeader, TransactionList, ReceiveCard, LogoutModal } from './components/DashboardComponents';
import { SendView, PayView, ChargeView, SettingsView } from './components/ActionViews';
import { ArrowUpRight, ArrowDownLeft, Scan, CreditCard, Settings, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.LOGIN);
  const [wallet, setWallet] = useState<ethers.HDNodeWallet | null>(null);
  const [walletState, setWalletState] = useState<WalletState>({
    address: '',
    mnemonic: null,
    balance: '0.00',
    ethBalance: '0.00',
    transactions: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [merchantSettings, setMerchantSettings] = useState(() => {
    const savedSettings = localStorage.getItem('ybank_merchant_settings');
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings);
      } catch (e) {
        console.error("Failed to load merchant settings", e);
      }
    }
    return {
      businessName: 'My Merchant',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      country: 'US',
      postalCode: '',
      phone: '',
      email: '',
      mcc: '5812',
      tipMin: '0',
      tipMax: '25',
      tipPreset1: '15',
      tipPreset2: '18',
      tipPreset3: '20',
      qrExpiry: '15'
    };
  });

  // Load existing session on mount
  useEffect(() => {
    console.log("🚀 App initializing...");

    const serverUrl = import.meta.env.VITE_QRAPPSERVER_URL || 'http://localhost:5010';
    console.log(`🔗 Backend API configured at: ${serverUrl}`);

    const savedMnemonic = localStorage.getItem('base_wallet_mnemonic');
    const isLoggedIn = localStorage.getItem('base_wallet_logged_in');

    if (isLoggedIn === 'true' && savedMnemonic) {
      initializeWallet(savedMnemonic);
    } else {
      setView(ViewState.LOGIN);
      console.log("No session found, showing login.");
    }
  }, []);

  // Poll for balance updates and history
  useEffect(() => {
    if (!wallet || !walletState.address) return;

    const fetchData = async () => {
      // Fetch balances
      const [usdcBal, ethBal] = await Promise.all([
        getUSDCBalance(walletState.address),
        getETHBalance(walletState.address)
      ]);

      setWalletState(prev => ({
        ...prev,
        balance: usdcBal,
        ethBalance: ethBal
      }));
    };

    fetchData();
    // Refresh balances every 10s
    const interval = setInterval(fetchData, 10000);

    // Fetch history separately to avoid blocking, refresh every 30s
    const historyInterval = setInterval(async () => {
      const history = await getRecentTransactions(walletState.address);
      setWalletState(prev => ({ ...prev, transactions: history }));
    }, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(historyInterval);
    };
  }, [wallet, walletState.address]);

  const initializeWallet = async (mnemonic: string) => {
    setIsLoading(true);
    try {
      const newWallet = getWalletFromMnemonic(mnemonic);
      const address = await newWallet.getAddress();

      // Set wallet state immediately to allow dashboard access
      setWallet(newWallet);
      setWalletState(prev => ({
        ...prev,
        address,
        mnemonic,
        // Keep previous values if re-initializing or default to 0
        balance: prev.balance !== '0.00' ? prev.balance : '0.00',
        ethBalance: prev.ethBalance !== '0.00' ? prev.ethBalance : '0.00'
      }));

      localStorage.setItem('base_wallet_mnemonic', mnemonic);
      localStorage.setItem('base_wallet_logged_in', 'true');

      // Move to dashboard immediately so user isn't stuck waiting
      setView(ViewState.DASHBOARD);

      // Fetch initial data in background
      try {
        const [initialBalance, initialEthBalance, history] = await Promise.all([
          getUSDCBalance(address),
          getETHBalance(address),
          getRecentTransactions(address)
        ]);

        setWalletState(prev => ({
          ...prev,
          balance: initialBalance,
          ethBalance: initialEthBalance,
          transactions: history
        }));
      } catch (innerError) {
        console.warn("Initial background fetch failed, retrying via polling:", innerError);
      }

    } catch (e) {
      console.error("Failed to init wallet", e);
      localStorage.removeItem('base_wallet_mnemonic');
      localStorage.removeItem('base_wallet_logged_in');
      setView(ViewState.LOGIN);
      alert("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!wallet || !walletState.address) return;
    setIsRefreshing(true);
    try {
      // Fetch everything
      const [usdcBal, ethBal, history] = await Promise.all([
        getUSDCBalance(walletState.address),
        getETHBalance(walletState.address),
        getRecentTransactions(walletState.address)
      ]);

      setWalletState(prev => ({
        ...prev,
        balance: usdcBal,
        ethBalance: ethBal,
        transactions: history
      }));
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Google Login entry point
  const handleLogin = () => {
    // Always go to setup screen to allow user to choose between existing, new, or import
    setView(ViewState.SETUP);
  };

  // Create New Wallet Flow
  const handleCreateWallet = () => {
    try {
      const randomWallet = ethers.Wallet.createRandom();
      const newMnemonic = randomWallet.mnemonic?.phrase;

      if (newMnemonic) {
        initializeWallet(newMnemonic);
      } else {
        throw new Error("Mnemonic generation failed");
      }
    } catch (err) {
      console.error("Wallet Creation Error", err);
      alert("Secure Wallet Creation Failed.");
      setView(ViewState.LOGIN);
    }
  };

  // Import Flow
  const handleImport = (mnemonic: string) => {
    initializeWallet(mnemonic);
  };

  const handleSend = async (to: string, amount: string) => {
    if (!wallet) return;
    try {
      const txHash = await sendUSDC(wallet, to, amount);

      // Add to local history optimistically
      const newTx: Transaction = {
        hash: txHash,
        type: 'out',
        amount,
        timestamp: Date.now(),
        status: 'pending',
        to
      };

      setWalletState(prev => ({
        ...prev,
        transactions: [newTx, ...prev.transactions]
      }));

      // Optimistically update balance
      const newBal = (parseFloat(walletState.balance) - parseFloat(amount)).toFixed(2);
      setWalletState(prev => ({ ...prev, balance: newBal }));

      return txHash;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    // Remove logged_in flag but keep mnemonic for "Continue" functionality
    localStorage.removeItem('base_wallet_logged_in');
    setWallet(null);
    setView(ViewState.LOGIN);
  };

  const handleUpdateSettings = (newSettings: typeof merchantSettings) => {
    setMerchantSettings(newSettings);
    localStorage.setItem('ybank_merchant_settings', JSON.stringify(newSettings));
  };

  const containerClasses = "flex flex-col h-screen max-w-[393px] mx-auto bg-gray-50 shadow-2xl relative overflow-hidden";

  // Global Loading State
  if (isLoading) {
    return (
      <div className={containerClasses}>
        <div className="flex flex-col items-center justify-center flex-1">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
          <h2 className="text-xl font-bold text-gray-900">Accessing Secure Vault</h2>
          <p className="text-gray-500 text-sm mt-2">Syncing with Base Blockchain...</p>
        </div>
      </div>
    );
  }

  console.log("Current View:", view);

  // Render Logic
  if (view === ViewState.LOGIN) return (
    <div className={containerClasses}>
      <LoginView onLogin={handleLogin} />
    </div>
  );

  if (view === ViewState.SETUP) {
    const savedMnemonic = localStorage.getItem('base_wallet_mnemonic');
    return (
      <div className={containerClasses}>
        <SetupWalletView
          onCreate={handleCreateWallet}
          onImport={() => setView(ViewState.IMPORT)}
          onContinue={savedMnemonic ? () => initializeWallet(savedMnemonic) : undefined}
        />
      </div>
    );
  }

  if (view === ViewState.IMPORT) return (
    <div className={containerClasses}>
      <ImportWalletView onImport={handleImport} onCancel={() => setView(ViewState.SETUP)} />
    </div>
  );

  if (view === ViewState.PAY) return (
    <div className={containerClasses}>
      <PayView
        onCancel={() => setView(ViewState.DASHBOARD)}
        onPay={handleSend}
        address={walletState.address}
      />
    </div>
  );

  // Settings view takes full screen like Pay, but inside the main layout wrapper
  if (view === ViewState.SETTINGS) {
    return (
      <div className={containerClasses}>
        <SettingsView
          onBack={() => setView(ViewState.DASHBOARD)}
          settings={merchantSettings}
          onUpdate={handleUpdateSettings}
        />
      </div>
    );
  }

  return (
    <div className={containerClasses}>

      <LogoutModal
        isOpen={showLogoutModal}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {view === ViewState.DASHBOARD && (
          <>
            <WalletHeader
              balance={walletState.balance}
              ethBalance={walletState.ethBalance}
              address={walletState.address}
              onLogout={() => setShowLogoutModal(true)}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />
            <TransactionList transactions={walletState.transactions} />
          </>
        )}

        {view === ViewState.SEND && (
          <SendView
            onSend={handleSend}
            onCancel={() => setView(ViewState.DASHBOARD)}
            balance={walletState.balance}
          />
        )}

        {view === ViewState.RECEIVE && (
          <div className="h-full relative">
            <button
              onClick={() => setView(ViewState.DASHBOARD)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2"
            >
              Close
            </button>
            <ReceiveCard address={walletState.address} />
          </div>
        )}

        {view === ViewState.CHARGE && (
          <div className="h-full relative">
            <button
              onClick={() => setView(ViewState.DASHBOARD)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2"
            >
              Close
            </button>
            <ChargeView
              onCancel={() => setView(ViewState.DASHBOARD)}
              address={walletState.address}
              merchantSettings={merchantSettings}
            />
          </div>
        )}
      </div>

      {/* Navigation Toolbar */}
      {view === ViewState.DASHBOARD && (
        <div className="absolute bottom-6 left-4 right-4 bg-white rounded-2xl shadow-xl border border-gray-100 p-1 flex justify-around items-center z-30">

          <NavButton
            icon={<ArrowUpRight className="w-6 h-6" />}
            label="Send"
            onClick={() => setView(ViewState.SEND)}
          />

          <NavButton
            icon={<ArrowDownLeft className="w-6 h-6" />}
            label="Receive"
            onClick={() => setView(ViewState.RECEIVE)}
          />

          <div className="relative -top-8">
            <button
              onClick={() => setView(ViewState.PAY)}
              className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-300 hover:scale-105 transition-transform active:scale-95"
            >
              <Scan className="w-8 h-8" />
            </button>
          </div>

          <NavButton
            icon={<CreditCard className="w-6 h-6" />}
            label="Charge"
            onClick={() => setView(ViewState.CHARGE)}
          />

          <NavButton
            icon={<Settings className="w-6 h-6" />}
            label="Settings"
            onClick={() => setView(ViewState.SETTINGS)}
          />
        </div>
      )}
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode, label: string, onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center flex-1 h-14 gap-1 text-gray-400 hover:text-blue-600 active:text-blue-800 transition-colors min-w-0"
  >
    {icon}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default App;