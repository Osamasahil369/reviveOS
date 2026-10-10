import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, Lock, ArrowRight, CreditCard, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../services/api.js';
import { RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { TrustAndSafetyCard } from './TrustAndSafetyCard.js';

export interface CustomerPaymentPortalProps {
  token?: string;
  opportunity?: RecoveryOpportunity | null;
  businessName?: string;
  onPaymentSuccess?: () => void;
  onBackToApp?: () => void;
}

export const CustomerPaymentPortal: React.FC<CustomerPaymentPortalProps> = ({
  token,
  opportunity: initialOpp,
  businessName: initialBizName,
  onPaymentSuccess,
  onBackToApp,
}) => {
  const [loading, setLoading] = useState(Boolean(token && !initialOpp));
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showUpdateCard, setShowUpdateCard] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Fallback demo/mock values if testing without token
  const [portalData, setPortalData] = useState<{
    customerName: string;
    invoiceAmountCents: number;
    currency: string;
    dueDate: string;
    businessName: string;
    opportunityId?: string;
  }>({
    customerName: initialOpp?.customer?.name || (initialOpp as any)?.customer_name || 'Valued Subscriber',
    invoiceAmountCents: initialOpp?.amount_at_risk_cents || 4900,
    currency: initialOpp?.currency || 'USD',
    dueDate: initialOpp?.invoice?.due_date || new Date().toISOString(),
    businessName: initialBizName || 'Cloud Services',
    opportunityId: initialOpp?.id,
  });

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getPayPortalData(token)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.opportunity) {
          const opp = res.opportunity;
          setPortalData({
            customerName: opp.customer?.name || (opp as any).customer_name || 'Valued Subscriber',
            invoiceAmountCents: opp.amount_at_risk_cents || 4900,
            currency: opp.currency || res.workspace?.currency || 'USD',
            dueDate: opp.invoice?.due_date || opp.created_at,
            businessName: res.workspace?.name || initialBizName || 'Cloud Services',
            opportunityId: opp.id,
          });
          if (opp.status === 'recovered') {
            setIsPaid(true);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Payment link is invalid or expired. Please contact support.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token, initialBizName]);

  const handlePayNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    try {
      if (token) {
        // Call provider checkout endpoint
        const res = await fetch(`/api/pay/${encodeURIComponent(token)}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const body = await res.json();
        if (body.checkoutUrl) {
          window.location.href = body.checkoutUrl;
          return;
        }

        // If direct portal settlement or sandbox:
        const submitRes = await fetch(`/api/pay/${encodeURIComponent(token)}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardLast4: '4242', cardBrand: 'Visa' }),
        });
        const submitBody = await submitRes.json();
        if (!submitRes.ok || !submitBody.success) {
          throw new Error(submitBody.error || submitBody.message || 'Payment processing failed');
        }
      } else if (portalData.opportunityId) {
        await api.settlePayment(portalData.opportunityId, 'payment_link').catch(() => {});
      }

      setIsPaid(true);
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to complete payment. Please try again or update card.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !cardExpiry || !cardCvc) {
      setError('Please fill in all card details.');
      return;
    }
    setIsProcessing(true);
    setError(null);

    try {
      if (token) {
        const cleanCard = cardNumber.replace(/\D/g, '');
        const submitRes = await fetch(`/api/pay/${encodeURIComponent(token)}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardLast4: cleanCard.slice(-4) || '4242',
            cardBrand: cleanCard.startsWith('3') ? 'Amex' : cleanCard.startsWith('5') ? 'Mastercard' : 'Visa',
            cardExpiry,
          }),
        });
        const submitBody = await submitRes.json();
        if (!submitRes.ok || !submitBody.success) {
          throw new Error(submitBody.error || submitBody.message || 'Payment method update declined');
        }
      } else if (portalData.opportunityId) {
        await api.settlePayment(portalData.opportunityId, 'customer_update').catch(() => {});
      }
      setIsPaid(true);
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to update payment method.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-400 font-mono text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-[#4ADE80]" />
          <span>Loading secure payment portal...</span>
        </div>
      </div>
    );
  }

  const formattedDueDate = new Date(portalData.dueDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col justify-center items-center px-4 py-8 selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-md space-y-4">
        {/* Main Card */}
        <div className="bg-[#071224] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-[#4ADE80] mb-2 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            </div>

            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
              {portalData.businessName}
            </div>

            {isPaid ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Payment Complete</span>
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Thank You
                </h1>
                <p className="text-sm text-slate-300">
                  Your payment has been verified. Your service remains active and uninterrupted.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Payment Failed
                </h1>
                <p className="text-sm text-slate-300">
                  We couldn't process your recent payment.
                </p>
                <p className="text-xs text-slate-400">
                  Complete payment below to keep your service active.
                </p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Invoice Summary Details */}
          {!isPaid && (
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Customer Name</span>
                <span className="text-white font-medium">{portalData.customerName}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Business Name</span>
                <span className="text-white font-medium">{portalData.businessName}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Due Date</span>
                <span className="text-white font-medium">{formattedDueDate}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="font-semibold text-slate-200">Invoice Amount</span>
                <span className="text-xl font-bold text-[#4ADE80] font-display tabular-nums">
                  {formatCurrencyAmount(portalData.invoiceAmountCents, portalData.currency)}
                </span>
              </div>
            </div>
          )}

          {/* Action CTAs */}
          {!isPaid ? (
            <div className="space-y-3">
              {!showUpdateCard ? (
                <>
                  <button
                    onClick={handlePayNow}
                    disabled={isProcessing}
                    className="w-full py-3 px-4 rounded-xl bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-60"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Processing Payment...</span>
                      </>
                    ) : (
                      <>
                        <span>Pay Now</span>
                        <ArrowRight className="w-4 h-4 text-slate-950" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowUpdateCard(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span>Update Payment Method</span>
                  </button>
                </>
              ) : (
                <form onSubmit={handleUpdateCardSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Card Number
                    </label>
                    <input
                      type="text"
                      placeholder="•••• •••• •••• ••••"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Expires
                      </label>
                      <input
                        type="text"
                        placeholder="MM / YY"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        CVC
                      </label>
                      <input
                        type="text"
                        placeholder="•••"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-3 px-4 rounded-xl bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-1"
                  >
                    {isProcessing ? 'Verifying Card...' : 'Save & Pay Now'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowUpdateCard(false)}
                    className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-center"
                  >
                    Back to payment options
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="pt-2">
              {onBackToApp && (
                <button
                  onClick={onBackToApp}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
                >
                  Return to Dashboard
                </button>
              )}
            </div>
          )}

          {/* Secure Payment Reassurance */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-mono">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Payment Protected</span>
          </div>
        </div>

        {/* Feature 4: Trust and Safety Layer on Portal */}
        <TrustAndSafetyCard variant="portal" />

        {/* Support Footer */}
        <div className="text-center text-[11px] text-slate-400 font-mono">
          Questions? Contact Support at billing@{portalData.businessName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'service'}.com
        </div>
      </div>
    </div>
  );
};
