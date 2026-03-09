import React, { useState, useEffect, useRef } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Loader2, Camera, X, Check, ArrowRight, DollarSign, Save, ChevronLeft, AlertCircle, Eye, EyeOff, Copy, ExternalLink, Plus, Minus, ShoppingBag, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getRecentTransactions } from '../services/walletService';
import jsQR from 'jsqr';

const DEFAULT_SETTINGS = {
  businessName: 'Big Burger Bar',
  addressLine1: '789 Patty Blvd',
  addressLine2: '',
  city: 'Los Angeles',
  state: 'CA',
  country: 'US',
  postalCode: '90001',
  phone: '+12135550006',
  email: 'hello@bigburger.com',
  mcc: '5812',
  tipMin: '0',
  tipMax: '25',
  tipPreset1: '15',
  tipPreset2: '18',
  tipPreset3: '20',
  qrExpiry: '15'
};

const QRAPPSERVER_URL = import.meta.env.VITE_QRAPPSERVER_URL || '';

// --- SEND VIEW ---
interface SendProps {
  onSend: (to: string, amount: string) => Promise<void>;
  onCancel: () => void;
  balance: string;
}

export const SendView: React.FC<SendProps> = ({ onSend, onCancel, balance }) => {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !amount) return;
    if (parseFloat(amount) > parseFloat(balance)) {
      setError("Insufficient balance");
      return;
    }

    // Validate Solana address
    try {
      new PublicKey(to);
    } catch {
      setError("Invalid Solana address");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSend(to, amount);
      setSuccess(true);
      setTimeout(onCancel, 2000); // Go back after success
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Transaction failed. Check address and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 text-green-600">
          <Check className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sent Successfully!</h2>
        <p className="text-gray-500">Your USDC is on its way.</p>
      </div>
    );
  }

  return (
    <div className="p-6 pt-10 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Send USDC</h2>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Address</label>
          <input
            type="text"
            placeholder="Solana address..."
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-4 px-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount (USDC)</label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-4 pl-12 pr-4 text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
              step="0.01"
            />
          </div>
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => setAmount(balance)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Max: ${balance}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg break-words">
            {error}
          </div>
        )}

        <div className="mt-auto grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="py-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !to || !amount}
            className="py-4 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>Send <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </form>
    </div>
  );
};

// --- PAY VIEW (Mock Camera) ---
interface PayProps {
  onCancel: () => void;
  onPay: (to: string, amount: string) => Promise<string>;
  address: string;
}

export const PayView: React.FC<PayProps> = ({ onCancel, onPay, address }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [step, setStep] = useState<'scan' | 'loading-details' | 'review' | 'processing' | 'success'>('scan');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [isPaying, setIsPaying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        requestAnimationFrame(tick);
        setHasPermission(true);
      } catch (err) {
        console.error("Camera access denied", err);
        setHasPermission(false);
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && step === 'scan') {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (canvas) {
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });

            if (code) {
              console.log("🎯 Found QR Code:", code.data);
              handleScan(code.data);
              return; // Stop the loop once scanned
            }
          }
        }
      }
      if (step === 'scan') {
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    startCamera();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleScan = async (qrContent: string) => {
    setStep('loading-details');
    setApiError(null);

    try {
      const response = await fetch(`${QRAPPSERVER_URL}/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qrCodeContent: qrContent })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      setPaymentData(data);

      if (data.bill?.tip?.presets?.length > 0) {
        setTipPercent(data.bill.tip.presets[0]);
      }

      setStep('review');
    } catch (err: any) {
      console.error('❌ Error fetching payment details:', err);
      setApiError(err.message || "Failed to load payment details.");
      setStep('scan');
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentData) return;
    setIsPaying(true);
    setApiError(null);

    try {
      setStep('processing');
      const merchant = paymentData.creditor?.ultimateCreditor || paymentData.ultimateCreditor;
      const merchantName = merchant?.name || paymentData.creditor?.name || "Merchant";

      const baseAmount = paymentData.bill.amountDue.amount / 100;
      const tipAmount = baseAmount * (tipPercent / 100);
      const totalAmount = baseAmount + tipAmount;

      const amountToPay = totalAmount.toFixed(2);

      // Find the payment method for USDC on the Solana network
      const solanaMethod = paymentData.paymentMethods?.find((m: any) =>
        m.currency === "USDC" && m.networks?.Solana?.address
      );
      const recipient = solanaMethod?.networks?.Solana?.address;

      if (!recipient) {
        throw new Error(`USDC on Solana not supported by ${merchantName}`);
      }

      // Convert USD cents to USDC atomic units (6 decimals)
      // 1 cent = 10,000 units
      const amountUSDC = paymentData.bill.amountDue.amount * 10000;
      const tipAmountUSDC = Math.round(paymentData.bill.amountDue.amount * tipPercent * 100);

      const notificationPayload = {
        id: paymentData.id,
        payment: {
          amount: amountUSDC,
          tipAmount: tipAmountUSDC,
          currency: "USDC",
          network: "Solana"
        },
        payer: {
          info: "illnottellyou@gmail.com",
          fromAddress: address
        },
        expectedDate: new Date().toISOString()
      };

      const response = await fetch(`${QRAPPSERVER_URL}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPayload)
      });

      if (!response.ok) throw new Error("Notification failed");

      const hash = await onPay(recipient, amountToPay);
      setTxHash(hash);

      // Second call to /notify informing the transactionId
      try {
        await fetch(`${QRAPPSERVER_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...notificationPayload,
            payment: {
              ...notificationPayload.payment,
              transactionId: hash
            }
          })
        });
      } catch (notifyErr) {
        console.error('⚠️ Post-payment notification failed:', notifyErr);
      }

      setStep('success');
    } catch (err) {
      console.error('❌ Payment failed:', err);
      setApiError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setStep('review');
    } finally {
      setIsPaying(false);
    }
  };

  if (step === 'success') {
    const baseAmount = paymentData.bill.amountDue.amount / 100;
    const tipAmount = baseAmount * (tipPercent / 100);
    const totalAmount = baseAmount + tipAmount;

    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-white animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 text-green-600 shadow-lg shadow-green-50">
          <Check className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Paid!</h2>
        <p className="text-gray-500 mb-6">The merchant has been notified of your payment.</p>

        <div className="w-full bg-gray-50 rounded-2xl p-6 mb-8 space-y-3 border border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">Total Paid</span>
            <span className="text-xl font-bold text-gray-900">${totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Includes Tip</span>
            <span className="text-gray-900 font-medium">${tipAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Asset</span>
            <span className="text-blue-600 font-bold">USDC</span>
          </div>
        </div>

        {txHash && (
          <a
            href={`https://solscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-8 hover:underline"
          >
            View on Solscan <ExternalLink className="w-4 h-4" />
          </a>
        )}

        <button onClick={onCancel} className="w-full py-4 bg-gray-900 text-white rounded-xl font-semibold shadow-lg active:scale-95 transition-all">Done</button>
      </div>
    );
  }

  if (step === 'loading-details') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-white">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Fetching Payment Details...</p>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-white">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Processing Payment...</p>
      </div>
    );
  }

  if (step === 'review' && paymentData) {
    // Merchant Logic: Priority to ultimateCreditor (the Merchant).
    // ultimateCreditor can be top-level or nested inside creditor.
    const merchant = paymentData.creditor?.ultimateCreditor || paymentData.ultimateCreditor;
    const merchantName = merchant?.name || paymentData.creditor?.name;
    const processorName = merchant ? paymentData.creditor?.name : null;

    const baseAmount = paymentData.bill.amountDue.amount / 100;
    const tipAmount = baseAmount * (tipPercent / 100);
    const totalAmount = baseAmount + tipAmount;

    return (
      <div className="flex flex-col h-full bg-white overflow-hidden">
        <div className="p-6 pt-10 flex-1 overflow-y-auto no-scrollbar">
          <div className="text-center mb-8">
            <p className="text-gray-500 text-sm font-medium mb-1">Do you agree paying</p>
            <h1 className="text-5xl font-bold text-gray-900">
              ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
            <p className="text-blue-600 font-semibold text-sm mt-2">{paymentData.bill.amountDue.currency} (USDC)</p>
            <p className="text-gray-500 text-sm mt-4">to <span className="font-bold text-gray-900">{merchantName}</span></p>
            {processorName && (
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1 flex items-center justify-center gap-1"><Info className="w-2 h-2" /> Processed by {processorName}</p>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bill Details</h3>
              <p className="text-gray-700 font-medium mb-4">{paymentData.bill.description}</p>

              <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5">
                {paymentData.additionalInformation?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-[11px] font-mono leading-tight">
                    <span className="text-gray-500 uppercase">{item.key}</span>
                    <span className="text-gray-900">${item.value}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-200 flex justify-between font-bold text-sm">
                  <span className="text-gray-900">Subtotal</span>
                  <span className="text-gray-900">${baseAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {paymentData.bill.tip?.allowed && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add a Tip</h3>
                  <span className="text-blue-600 font-bold text-sm">{tipPercent}% (${tipAmount.toFixed(2)})</span>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setTipPercent(Math.max(0, tipPercent - 1))}
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200 shrink-0"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  {paymentData.bill.tip.presets.map((p: number) => (
                    <button
                      key={p}
                      onClick={() => setTipPercent(p)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${tipPercent === p ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {p}%
                    </button>
                  ))}

                  <button
                    onClick={() => {
                      const val = prompt("Enter tip percentage:", tipPercent.toString());
                      if (val !== null) {
                        const n = parseInt(val);
                        if (!isNaN(n)) setTipPercent(n);
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-500 hover:text-gray-700 transition-all"
                  >
                    Other
                  </button>

                  <button
                    onClick={() => setTipPercent(tipPercent + 1)}
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {apiError && (
          <div className="px-6 mb-4">
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {apiError}
            </div>
          </div>
        )}

        <div className="p-6 border-t border-gray-100 grid grid-cols-2 gap-4">
          <button
            onClick={onCancel}
            disabled={isPaying}
            className="py-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmPayment}
            disabled={isPaying}
            className="py-4 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
          >
            {isPaying ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Confirm & Pay <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="relative flex-1 bg-gray-900 overflow-hidden">
        {hasPermission === false ? (
          <div className="flex items-center justify-center h-full text-white/50">
            <p>Camera permission denied</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Mock Scan Frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 border-2 border-white/50 rounded-xl relative">
            <div className="absolute top-0 left-0 w-6 h-6 border-l-4 border-t-4 border-blue-500 -ml-1 -mt-1 rounded-tl-lg"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-r-4 border-t-4 border-blue-500 -mr-1 -mt-1 rounded-tr-lg"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-l-4 border-b-4 border-blue-500 -ml-1 -mb-1 rounded-bl-lg"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-r-4 border-b-4 border-blue-500 -mr-1 -mb-1 rounded-br-lg"></div>
          </div>
        </div>

        <div className="absolute top-8 w-full text-center">
          <span className="bg-black/40 text-white px-4 py-2 rounded-full text-sm backdrop-blur-md">
            Scan QR to Pay
          </span>
        </div>

        {/* Hidden canvas for frame processing */}
        <canvas ref={canvasRef} className="hidden" />

        {apiError && (
          <div className="absolute top-24 left-6 right-6 p-4 bg-red-500/90 text-white rounded-xl flex items-center gap-3 backdrop-blur-md">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-xs font-medium">{apiError}</p>
          </div>
        )}
      </div>

      <div className="bg-black p-6 pb-10 flex justify-center">
        <button
          onClick={onCancel}
          className="bg-white/10 text-white hover:bg-white/20 px-8 py-3 rounded-full font-medium transition-colors flex items-center gap-2"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
};

// --- CHARGE VIEW (Real API + Polling) ---
interface ChargeProps {
  onCancel: () => void;
  address: string;
  merchantSettings: any;
}

export const ChargeView: React.FC<ChargeProps> = ({ onCancel, address, merchantSettings }) => {
  const [step, setStep] = useState<'input' | 'loading' | 'qr' | 'success'>('input');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [qrCodeContent, setQrCodeContent] = useState('');
  const [initialTxHash, setInitialTxHash] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Poll for payment
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (step === 'qr') {
      const checkPayment = async () => {
        try {
          const txs = await getRecentTransactions(address);

          if (txs.length > 0) {
            const latestTx = txs[0];
            // Only trigger success if the most recent transaction is new and incoming
            if (latestTx.hash !== initialTxHash && latestTx.type === 'in') {
              setStep('success');
            }
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      };

      // Poll every 3 seconds
      interval = setInterval(checkPayment, 3000);
    }

    return () => clearInterval(interval);
  }, [step, address, initialTxHash]);


  const handleCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;

    const phone = merchantSettings.phone || '';
    if (!phone.startsWith('+')) {
      setApiError('Phone number must start with + (international format, e.g. +15556667777). Please update it in Settings.');
      return;
    }

    setApiError(null);
    setStep('loading');

    console.log('🚀 handleCharge started. Amount:', amount);

    try {
      // 1. Capture current latest transaction hash to detect new ones later
      const currentTxs = await getRecentTransactions(address);
      const latestHash = currentTxs.length > 0 ? currentTxs[0].hash : null;
      setInitialTxHash(latestHash);

      // 2. Prepare Payload
      const settings = merchantSettings;

      // Calculate amounts
      // USD amount in cents (integer)
      const amountCents = Math.round(parseFloat(amount) * 100);
      console.log('💰 Amount in cents:', amountCents);

      // USDC amount in atomic units (6 decimals)
      const usdcAtomic = Math.round(parseFloat(amount) * 1e6);

      // Sanitize to printable ASCII (^[ --~]*$) — replace curly quotes/apostrophes
      // with straight equivalents, then strip anything outside 0x20–0x7E.
      const toAscii = (s: string) => s
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // curly single quotes → '
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // curly double quotes → "
        .replace(/[\u2013\u2014]/g, '-')               // en/em dash → -
        .replace(/[^ -~]/g, '');                       // strip remaining non-ASCII

      const payload = {
        creditor: {
          name: toAscii(settings.businessName || settings.merchantName || "Merchant"),
          email: settings.email || "",
          phone: settings.phone || "",
          address: {
            line1: settings.addressLine1 || "",
            line2: settings.addressLine2 || "",
            city: settings.city || "",
            state: settings.state || "",
            postalCode: settings.postalCode || "",
            country: settings.country || ""
          },
          MCC: settings.mcc || "5812"
        },
        bill: {
          paymentTiming: "immediate",
          description: note || "Charge via YBank.me",
          amountDue: {
            amount: amountCents,
            currency: "USD",
          },
          tip: {
            allowed: true,
            range: {
              min: parseInt(settings.tipMin) || 0,
              max: parseInt(settings.tipMax) || 25
            },
            presets: [
              parseInt(settings.tipPreset1) || 15,
              parseInt(settings.tipPreset2) || 18,
              parseInt(settings.tipPreset3) || 20
            ].filter(n => !isNaN(n))
          }
        },
        paymentMethods: [
          {
            currency: "USDC",
            amount: usdcAtomic,
            networks: {
              "Solana": {
                address: address
              }
            }
          }
        ]
      };

      // Log the payload as a plain object
      console.log('📦 Prepared Payload:', payload);

      const response = await fetch(`${QRAPPSERVER_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let detail = response.statusText;
        try {
          const errBody = await response.json();
          detail = errBody.message || errBody.error || errBody.detail || JSON.stringify(errBody);
        } catch { /* non-JSON body — keep statusText */ }
        throw new Error(`Error ${response.status}: ${detail}`);
      }

      const data = await response.json();

      if (data.qrContent) {
        setQrCodeContent(data.qrContent);
        setStep('qr');
      } else {
        throw new Error("API response missing 'qrContent' field");
      }
    } catch (err: any) {
      console.error('❌ Error in handleCharge:', err);
      let message = "An unexpected error occurred.";

      if (err instanceof TypeError || err.message === "Failed to fetch") {
        console.warn("Potential CORS or Pinggy Interstitial block.");
        message = "Connection failed. Please authorize the server or check your connection.";
      } else if (err instanceof Error) {
        message = err.message;
      }

      setApiError(message);
      setStep('input');
    }
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in zoom-in duration-300">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-green-200 shadow-xl">
          <Check className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Payment Received</h2>
        <p className="text-gray-500 text-lg mb-8">Funds added to your balance.</p>

        <button
          onClick={onCancel}
          className="w-full max-w-xs bg-gray-900 text-white py-4 rounded-xl font-semibold shadow-lg active:scale-95 transition-all"
        >
          OK
        </button>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Generating Payment Code...</p>
      </div>
    );
  }

  if (step === 'qr') {
    return (
      <div className="flex flex-col items-center h-full p-6 pt-12">
        <h2 className="text-xl font-semibold text-gray-500 mb-2">Asking for</h2>
        <h1 className="text-5xl font-bold text-gray-900 mb-8">${parseFloat(amount).toFixed(2)}</h1>

        <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 mb-8 relative">
          {qrCodeContent && <QRCodeSVG value={qrCodeContent} size={240} level="M" />}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full animate-pulse whitespace-nowrap">
            Waiting for payment...
          </div>
        </div>

        {note && (
          <div className="bg-gray-50 px-4 py-2 rounded-lg text-gray-600 text-sm mb-8 text-center max-w-xs">
            "{note}"
          </div>
        )}

        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 font-medium py-2 px-6"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 pt-10 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Charge Amount</h2>

      <form onSubmit={handleCharge} className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col justify-center gap-8">
          <div className="relative">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 text-4xl font-light">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pl-10 bg-transparent text-6xl font-bold text-gray-900 placeholder-gray-200 outline-none"
              step="0.01"
              autoFocus
            />
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (e.g. Two Pizzas)"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-4 px-4 text-base focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {apiError && (
          <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{apiError}</p>
            </div>
            {/* Fallback Authorization Button */}
            {(apiError.includes("Connection failed") || apiError.includes("Failed to fetch")) && (
              <a
                href={QRAPPSERVER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="self-end flex items-center gap-2 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-lg font-semibold transition-colors"
              >
                Authorize Connection <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!amount}
          className="mt-6 w-full bg-blue-600 text-white font-semibold py-4 rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
        >
          Generate Payment Code
        </button>
      </form>
    </div>
  );
};

// --- SETTINGS VIEW ---
interface SettingsProps {
  onBack: () => void;
  settings: any;
  onUpdate: (settings: any) => void;
}

export const SettingsView: React.FC<SettingsProps> = ({ onBack, settings, onUpdate }) => {
  const [formData, setFormData] = useState(settings);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedMnemonic = localStorage.getItem('solana_wallet_mnemonic');
    setMnemonic(savedMnemonic);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const enforced = value.startsWith('+') ? value : '+' + value.replace(/^\+*/, '');
      setFormData(prev => ({ ...prev, phone: enforced }));
      setSaved(false);
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyMnemonic = () => {
    if (mnemonic) {
      navigator.clipboard.writeText(mnemonic);
      alert("Recovery phrase copied to clipboard");
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 bg-white shadow-sm flex items-center justify-between sticky top-0 z-10">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:text-gray-900">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Settings</h1>
        <div className="w-8"></div> {/* Spacer for centering */}
      </div>

      <div className="flex-1 overflow-y-auto p-6 pb-12">
        <form onSubmit={handleSave} className="space-y-8">

          {/* Security Section */}
          <section className="bg-orange-50 p-4 rounded-xl border border-orange-100">
            <h2 className="text-sm font-bold text-orange-900 uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Security
            </h2>
            <p className="text-xs text-orange-800 mb-4">
              Your wallet was auto-generated. Backup your recovery phrase to access these funds on other devices.
            </p>

            <div className="bg-white border border-orange-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500">Recovery Phrase</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowMnemonic(!showMnemonic)} className="text-gray-400 hover:text-gray-600">
                    {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={copyMnemonic} className="text-gray-400 hover:text-gray-600">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className={`font-mono text-sm break-all ${showMnemonic ? 'text-gray-800' : 'text-gray-300 blur-sm select-none'}`}>
                {mnemonic || "No wallet found"}
              </div>
            </div>
          </section>

          {/* Biller Data */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Biller Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Commercial Name</label>
                <input name="businessName" value={formData.businessName} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Joe's Pizza" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 1</label>
                <input name="addressLine1" value={formData.addressLine1} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="123 Main St" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 2</label>
                <input name="addressLine2" value={formData.addressLine2} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Apt 4B" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input name="city" value={formData.city} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                  <input name="state" value={formData.state} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                  <input name="country" value={formData.country} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Postal Code</label>
                  <input name="postalCode" value={formData.postalCode} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone (International)</label>
                <input name="phone" type="tel" value={formData.phone} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="+1 234 567 8900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">E-mail</label>
                <input name="email" type="email" value={formData.email} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="contact@business.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">MCC (Merchant Category Code)</label>
                <input name="mcc" value={formData.mcc} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="5812" />
              </div>
            </div>
          </section>

          {/* Tips Config */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Tips Configuration (%)</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Min %</label>
                  <input name="tipMin" type="number" min="0" value={formData.tipMin} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Max %</label>
                  <input name="tipMax" type="number" value={formData.tipMax} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Presets (Up to 3)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input name="tipPreset1" type="number" value={formData.tipPreset1} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none" placeholder="15" />
                  <input name="tipPreset2" type="number" value={formData.tipPreset2} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none" placeholder="18" />
                  <input name="tipPreset3" type="number" value={formData.tipPreset3} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none" placeholder="20" />
                </div>
              </div>
            </div>
          </section>

          {/* QR Config */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">QR Code Settings</h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Time to Live (Minutes)</label>
              <input name="qrExpiry" type="number" value={formData.qrExpiry} onChange={handleChange} className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              <p className="text-[10px] text-gray-400 mt-1">QR codes will expire after this duration.</p>
            </div>
          </section>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 sticky bottom-4"
          >
            {saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </form>
      </div>
    </div>
  );
};
