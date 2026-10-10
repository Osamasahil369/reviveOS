import React, { useState, useMemo } from 'react';
import { X, AlertTriangle, Zap, FileText, User, Coins, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Customer, FailureCategory } from '../types/index.js';
import { validateAmount } from '../utils/validation.js';
import { CURRENCY_LIST, getCurrencySymbol, getCurrencyConfig } from '../utils/currency.js';

interface IngestPaymentFailureModalProps {
  isOpen: boolean;
  customers: Customer[];
  selectedCustomerId?: string;
  currency: string;
  onClose: () => void;
  onSubmit: (data: {
    customerId: string;
    amountCents: number;
    currency?: string;
    providerFailureCode?: string;
    rawErrorMessage?: string;
    failureCategory?: FailureCategory;
    planName?: string;
  }) => Promise<void>;
}

export const IngestPaymentFailureModal: React.FC<IngestPaymentFailureModalProps> = ({
  isOpen,
  customers,
  selectedCustomerId,
  currency: workspaceCurrency,
  onClose,
  onSubmit,
}) => {
  const [customerId, setCustomerId] = useState(selectedCustomerId || (customers[0]?.id || ''));
  const [amount, setAmount] = useState('149.00');
  const [failureCurrency, setFailureCurrency] = useState<string>(workspaceCurrency || 'USD');
  const [failureCategory, setFailureCategory] = useState<FailureCategory>('insufficient_funds');
  const [providerFailureCode, setProviderFailureCode] = useState('insufficient_funds');
  const [rawErrorMessage, setRawErrorMessage] = useState(
    'Transaction failed: customer account balance is insufficient for recurring charge.'
  );
  const [planName, setPlanName] = useState('Pro Monthly Subscription');
  const [touchedAmount, setTouchedAmount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selectedCustomerId if passed and auto-detect customer's currency
  React.useEffect(() => {
    const targetId = selectedCustomerId || customerId || customers[0]?.id;
    if (targetId) {
      setCustomerId(targetId);
      const cust = customers.find((c) => c.id === targetId);
      if (cust && cust.currency) {
        setFailureCurrency(cust.currency);
      }
    }
  }, [selectedCustomerId, customers]);

  const amountValidation = useMemo(() => validateAmount(amount), [amount]);

  if (!isOpen) return null;

  const currencySymbol = getCurrencySymbol(failureCurrency);
  const currencyConfig = getCurrencyConfig(failureCurrency);

  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    const selected = customers.find((c) => c.id === id);
    if (selected && selected.currency) {
      setFailureCurrency(selected.currency);
    }
  };

  const handleCategoryChange = (cat: FailureCategory) => {
    setFailureCategory(cat);
    switch (cat) {
      case 'insufficient_funds':
        setProviderFailureCode('insufficient_funds');
        setRawErrorMessage('The customer balance is insufficient for the recurring subscription charge.');
        break;
      case 'expired_card':
        setProviderFailureCode('expired_card');
        setRawErrorMessage('The credit card expiry month/year is in the past.');
        break;
      case 'authentication_required':
        setProviderFailureCode('authentication_required');
        setRawErrorMessage('Cardholder 3D Secure / SCA step-up authorization failed or timed out.');
        break;
      case 'bank_related_failure':
        setProviderFailureCode('bank_issuer_downtime');
        setRawErrorMessage('Issuer network timeout: cardholder bank did not respond in time.');
        break;
      case 'payment_method_declined':
        setProviderFailureCode('generic_decline');
        setRawErrorMessage('Do not honor: card issuer rejected the scheduled recurring charge.');
        break;
      case 'invalid_payment_method':
        setProviderFailureCode('invalid_card');
        setRawErrorMessage('Card number reported lost, stolen, or closed by issuer.');
        break;
      default:
        setProviderFailureCode('processing_error');
        setRawErrorMessage('Provider processing failure.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouchedAmount(true);
    if (!customerId) {
      setError('Please select a valid customer.');
      return;
    }
    if (!amountValidation.isValid) {
      setError(amountValidation.error || 'Invalid payment amount');
      return;
    }

    const amountCents = Math.round(parseFloat(amountValidation.normalized || amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Invalid payment amount');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        customerId,
        amountCents,
        currency: failureCurrency,
        providerFailureCode,
        rawErrorMessage,
        failureCategory,
        planName,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to ingest payment failure');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ingest Failed Payment</h3>
              <p className="text-xs text-slate-400">
                Trigger involuntary churn recovery pipeline with multi-currency support
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Customer *
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email}) • {c.currency || workspaceCurrency} • {c.provider_type.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount with dynamic symbol */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Failed Amount ({currencySymbol}) *
                </label>
                {touchedAmount && amountValidation.isValid && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Valid
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="w-7 text-center text-xs font-mono font-bold text-slate-400 absolute left-2.5 top-2.5">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onBlur={() => setTouchedAmount(true)}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (!touchedAmount) setTouchedAmount(true);
                  }}
                  className={`w-full pl-9 pr-3 py-2 bg-slate-800 border rounded-lg text-xs text-white font-mono focus:outline-none transition-colors ${
                    touchedAmount && !amountValidation.isValid
                      ? 'border-rose-500 bg-rose-950/10'
                      : touchedAmount && amountValidation.isValid
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-700 focus:border-rose-500'
                  }`}
                />
              </div>
              {touchedAmount && !amountValidation.isValid && (
                <p className="mt-1 text-[11px] text-rose-400">{amountValidation.error}</p>
              )}
            </div>

            {/* Currency Selector (27 Currencies) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Currency ({failureCurrency})
              </label>
              <div className="relative">
                <Coins className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <select
                  value={failureCurrency}
                  onChange={(e) => setFailureCurrency(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  {CURRENCY_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} - {c.symbol} ({c.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Subscription Plan Name
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Failure Classification Reason *
            </label>
            <select
              value={failureCategory}
              onChange={(e) => handleCategoryChange(e.target.value as FailureCategory)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
            >
              <option value="insufficient_funds">Insufficient Funds (Smart retry candidate)</option>
              <option value="expired_card">Expired Card (Requires card update portal)</option>
              <option value="authentication_required">3D Secure / SCA Authentication Required</option>
              <option value="bank_related_failure">Bank Network / Issuer Temporary Outage</option>
              <option value="payment_method_declined">Generic Card Decline / Do Not Honor</option>
              <option value="invalid_payment_method">Lost or Invalid Card</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Provider Error Code</label>
              <input
                type="text"
                value={providerFailureCode}
                onChange={(e) => setProviderFailureCode(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Simulated Webhook Trigger</label>
              <div className="px-3 py-1.5 bg-slate-800/60 border border-slate-700 rounded-lg text-xs font-mono text-emerald-400">
                invoice.payment_failed
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Raw Error Message</label>
            <textarea
              rows={2}
              value={rawErrorMessage}
              onChange={(e) => setRawErrorMessage(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Action Callout */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2">
            <Zap className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Instant Pipeline Activation:</strong> This immediately provisions a recovery opportunity, generates a secure recovery token URL, and assigns the appropriate dunning schedule.
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !amountValidation.isValid || !customerId}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>{isSubmitting ? 'Ingesting...' : 'Ingest & Trigger Recovery'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
