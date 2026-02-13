import React, { useState } from 'react';
import { Loader2, Landmark, ArrowLeft, Plus, Download } from 'lucide-react';
import { validateMnemonic } from '../services/walletService';

interface LoginProps {
  onLogin: () => void;
}

export const LoginView: React.FC<LoginProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = () => {
    setIsLoading(true);
    // Simulate network delay for Google Auth
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 1500);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-blue-600 p-6 text-white relative">
      <div className="mb-16 flex flex-col items-center animate-in slide-in-from-bottom-4 duration-700">
        <div className="w-28 h-20 bg-blue-800 rounded-3xl flex items-center justify-center mb-6 shadow-2xl ring-4 ring-blue-400/30 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Landmark className="w-10 h-10 text-white fill-blue-800" strokeWidth={1.5} />
        </div>

        <h1 className="text-4xl font-bold tracking-tight mb-2">YBank.me</h1>
        <p className="text-blue-100 text-lg font-medium opacity-90">You are the bank.</p>
      </div>

      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="w-full max-w-xs bg-white text-gray-700 font-semibold py-4 px-6 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-gray-50 disabled:opacity-80 z-10"
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
          <>
            <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span>Continue with Google</span>
          </>
        )}
      </button>

      <p className="mt-8 text-xs text-blue-200 text-center max-w-xs opacity-75">
        By continuing, you verify that you are the owner of this account.
        Authentication is powered by secure token exchange.
      </p>
    </div>
  );
};

interface SetupProps {
  onCreate: () => void;
  onImport: () => void;
  onContinue?: () => void;
}

export const SetupWalletView: React.FC<SetupProps> = ({ onCreate, onImport, onContinue }) => {
  return (
    <div className="flex flex-col h-full bg-gray-50 p-6 pt-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
        <p className="text-gray-500 mt-2">Your Google account is verified. How would you like to set up your vault?</p>
      </div>

      <div className="space-y-4">
        <button
          onClick={onCreate}
          className="w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-gray-900">Create New Wallet</h3>
              <p className="text-sm text-gray-500">Generate a new 12-word seed phrase</p>
            </div>
          </div>
        </button>

        <button
          onClick={onImport}
          className="w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
              <Download className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-gray-900">Import Existing Wallet</h3>
              <p className="text-sm text-gray-500">Restore using your 12-word phrase</p>
            </div>
          </div>
        </button>
      </div>

      {onContinue && (
        <div className="mt-auto pb-8">
          <button
            onClick={onContinue}
            className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold shadow-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            Continue with Previous Wallet
          </button>
        </div>
      )}
    </div>
  );
};

interface ImportProps {
  onImport: (phrase: string) => void;
  onCancel: () => void;
}

export const ImportWalletView: React.FC<ImportProps> = ({ onImport, onCancel }) => {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      const cleanPhrase = phrase.trim().replace(/\s+/g, ' ');
      if (validateMnemonic(cleanPhrase)) {
        onImport(cleanPhrase);
      } else {
        setError("Invalid recovery phrase. Please ensure you entered all 12 words correctly.");
        setIsLoading(false);
      }
    }, 500);
  };

  return (
    <div className="flex flex-col h-full bg-white p-6">
      <button onClick={onCancel} className="self-start p-2 -ml-2 text-gray-600 mb-6 hover:bg-gray-100 rounded-full transition-colors">
        <ArrowLeft className="w-6 h-6" />
      </button>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Recovery</h1>
      <p className="text-gray-500 mb-8">Enter your 12-word secret phrase to restore your access.</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="relative flex-1">
          <textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="apple banana cherry dog elephant..."
            className="w-full h-48 p-4 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
          />
          <div className="absolute bottom-4 right-4 text-xs text-gray-400 pointer-events-none">
            {phrase.trim().split(/\s+/).filter(w => w.length > 0).length} / 12 words
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!phrase || isLoading}
          className="mt-8 mb-4 w-full bg-blue-600 text-white font-semibold py-4 rounded-xl shadow-lg disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center"
        >
          {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Restore Wallet"}
        </button>
      </form>
    </div>
  );
};