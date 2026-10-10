import React, { useState } from 'react';
import { X, Zap, CheckCircle2, ShieldAlert, Code2 } from 'lucide-react';

interface WebhookSimulatorModalProps {
  onClose: () => void;
  onSimulate: (payload: { provider: string; eventType: string; amount?: number; email?: string }) => Promise<void>;
}

export const WebhookSimulatorModal: React.FC<WebhookSimulatorModalProps> = ({
  onClose,
  onSimulate,
}) => {
  const [provider, setProvider] = useState<'stripe' | 'razorpay'>('stripe');
  const [eventType, setEventType] = useState('invoice.payment_failed');
  const [amount, setAmount] = useState(199);
  const [email, setEmail] = useState('jordan.vance@techscale.co');
  const [isFiring, setIsFiring] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleProviderChange = (p: 'stripe' | 'razorpay') => {
    setProvider(p);
    if (p === 'stripe') {
      setEventType('invoice.payment_failed');
    } else {
      setEventType('payment.failed');
    }
  };

  const handleFire = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFiring(true);
    try {
      await onSimulate({
        provider,
        eventType,
        amount,
        email,
      });
      setSuccessMsg(`Webhook received, verified HMAC signature, and processed successfully.`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } finally {
      setIsFiring(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Simulate Inbound Gateway Webhook</h3>
              <p className="text-xs text-slate-400">
                Trigger simulated live payment failure or success events to test engine reactions.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-5 space-y-4">
          {successMsg ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Event Ingested & Processed!</h4>
              <p className="text-xs text-slate-400 mt-1">{successMsg}</p>
            </div>
          ) : (
            <form onSubmit={handleFire} className="space-y-4">
              {/* Provider Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Billing Gateway</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleProviderChange('stripe')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      provider === 'stripe'
                        ? 'bg-[#635BFF]/20 border-[#635BFF] text-[#635BFF]'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    Stripe Billing
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange('razorpay')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      provider === 'razorpay'
                        ? 'bg-[#528FF0]/20 border-[#528FF0] text-[#528FF0]'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    Razorpay Subscriptions
                  </button>
                </div>
              </div>

              {/* Event Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                >
                  {provider === 'stripe' ? (
                    <>
                      <option value="invoice.payment_failed">invoice.payment_failed</option>
                      <option value="charge.failed">charge.failed</option>
                      <option value="invoice.paid">invoice.paid (Recovery Confirmation)</option>
                      <option value="customer.subscription.deleted">customer.subscription.deleted</option>
                    </>
                  ) : (
                    <>
                      <option value="payment.failed">payment.failed</option>
                      <option value="subscription.halted">subscription.halted</option>
                      <option value="payment.captured">payment.captured (Recovery Confirmation)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Invoice Amount ($)</label>
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Customer Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs text-slate-400">
                <span>The webhook handler verifies idempotency and creates a recovery pipeline entry.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isFiring}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  {isFiring ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>Dispatch Webhook</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
