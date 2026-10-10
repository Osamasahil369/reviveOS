import React, { useState } from 'react';
import { Check, X, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';
import { RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface RecoveryInboxProps {
  opportunities: RecoveryOpportunity[];
  currency?: string;
  onApprove: (oppId: string) => Promise<void> | void;
  onReject: (oppId: string) => Promise<void> | void;
  className?: string;
}

export interface InboxItem {
  opportunityId: string;
  customerName: string;
  amountFormatted: string;
  reason: string;
  recommendedAction: string;
}

export const RecoveryInbox: React.FC<RecoveryInboxProps> = ({
  opportunities,
  currency = 'USD',
  onApprove,
  onReject,
  className = '',
}) => {
  const [inFlightId, setInFlightId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  // Single flat queue of items requiring attention
  const queueItems: InboxItem[] = React.useMemo(() => {
    const items: InboxItem[] = [];

    const unrecovered = opportunities.filter(
      (o) => o.status !== 'recovered' && !resolvedIds.has(o.id)
    );

    unrecovered.forEach((opp) => {
      const isHighValue = (opp.amount_at_risk_cents || 0) >= 25000;
      const needsAttention =
        opp.is_fraud ||
        opp.customer?.is_vip ||
        opp.customer?.is_enterprise ||
        opp.policy_decision?.decision === 'MANUAL_REVIEW' ||
        isHighValue ||
        (opp.status as string) === 'AWAITING_REVIEW';

      if (!needsAttention) return;

      const customerName = opp.customer?.name || (opp as any).customer_name || 'Customer Account';
      const amountFormatted = formatCurrencyAmount(opp.amount_at_risk_cents || 0, currency);

      let reason = 'High-value invoice requires owner confirmation';
      if (opp.is_fraud) {
        reason = 'Unusual card activity flagged';
      } else if (opp.customer?.is_vip) {
        reason = 'VIP account relationship protection hold';
      } else if (opp.customer?.is_enterprise) {
        reason = 'Enterprise subscription renewal confirmation needed';
      }

      let recommendedAction = 'Send 1-Click Payment Link';
      if (opp.recommended_action === 'retry_payment') {
        recommendedAction = 'Retry Payment';
      }

      items.push({
        opportunityId: opp.id,
        customerName,
        amountFormatted,
        reason,
        recommendedAction,
      });
    });

    return items;
  }, [opportunities, currency, resolvedIds]);

  const handleAction = async (oppId: string, action: 'approve' | 'reject') => {
    setInFlightId(oppId);
    try {
      if (action === 'approve') {
        await onApprove(oppId);
      } else {
        await onReject(oppId);
      }
      setResolvedIds((prev) => new Set(prev).add(oppId));
    } catch (err) {
      console.error(`Failed to ${action} queue item`, err);
    } finally {
      setInFlightId(null);
    }
  };

  if (queueItems.length === 0) {
    return (
      <div className={`p-8 rounded-2xl bg-[#071224] border border-slate-800 text-center space-y-3 ${className}`}>
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
          <Sparkles className="w-5 h-5 stroke-[2.5]" />
        </div>
        <div className="text-base font-bold text-white">No action required</div>
        <p className="text-sm text-slate-300 font-sans max-w-md mx-auto">
          ReviveOS is recovering revenue automatically. All active payment flows are operating safely without manual intervention.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            Recovery Inbox ({queueItems.length} Cases)
          </h3>
        </div>
        <span className="text-xs font-mono text-amber-400 font-semibold">
          Action Required
        </span>
      </div>

      <div className="space-y-3">
        {queueItems.map((item) => {
          const isProcessing = inFlightId === item.opportunityId;

          return (
            <div
              key={item.opportunityId}
              className="p-5 rounded-2xl bg-[#071224] border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-slate-700"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-white font-sans truncate">
                    {item.customerName}
                  </span>
                  <span className="text-sm font-bold text-amber-400 font-mono bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/25">
                    {item.amountFormatted}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-sans">
                  <strong className="text-slate-200">Why attention is needed:</strong> {item.reason}
                </p>
                <p className="text-xs text-slate-400 font-mono">
                  Recommended action:{' '}
                  <span className="text-emerald-400 font-semibold">{item.recommendedAction}</span>
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/80">
                <button
                  onClick={() => handleAction(item.opportunityId, 'approve')}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/20"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Approve</span>
                </button>

                <button
                  onClick={() => handleAction(item.opportunityId, 'reject')}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
