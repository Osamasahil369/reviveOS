import React, { useState } from 'react';
import { ShieldCheck, Check, X, Clock, AlertCircle } from 'lucide-react';
import { RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface ManualReviewCenterProps {
  opportunities: RecoveryOpportunity[];
  currency?: string;
  onApprove: (oppId: string) => Promise<void> | void;
  onReject: (oppId: string) => Promise<void> | void;
  onSelectOpportunity?: (oppId: string) => void;
  className?: string;
}

export interface ReviewItem {
  id: string;
  opportunityId: string;
  customerName: string;
  amountFormatted: string;
  reason: string;
  recommendedAction: string;
}

export const ManualReviewCenter: React.FC<ManualReviewCenterProps> = ({
  opportunities,
  currency = 'USD',
  onApprove,
  onReject,
  onSelectOpportunity,
  className = '',
}) => {
  const [inFlightId, setInFlightId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  // Filter opportunities needing manual human approval
  const reviewItems: ReviewItem[] = React.useMemo(() => {
    const items: ReviewItem[] = [];

    const unrecovered = opportunities.filter(
      (o) => o.status !== 'recovered' && !resolvedIds.has(o.id)
    );

    unrecovered.forEach((opp) => {
      const isHighValue = (opp.amount_at_risk_cents || 0) >= 25000;
      const needsReview =
        opp.is_fraud ||
        opp.customer?.is_vip ||
        opp.customer?.is_enterprise ||
        opp.policy_decision?.decision === 'MANUAL_REVIEW' ||
        isHighValue;

      if (!needsReview) return;

      const customerName = opp.customer?.name || (opp as any).customer_name || 'Customer Account';
      const amountFormatted = formatCurrencyAmount(opp.amount_at_risk_cents || 0, currency);

      // Plain English reason without technical codes
      let reason = 'High-value invoice requires owner confirmation';
      if (opp.is_fraud) {
        reason = 'Security safeguard: unusual location flagged';
      } else if (opp.customer?.is_vip) {
        reason = 'VIP customer: relationship protection hold';
      } else if (opp.customer?.is_enterprise) {
        reason = 'Enterprise contract payment awaiting confirmation';
      }

      // Plain English action without raw code
      let recommendedAction = 'Send 1-Click Recovery Link';
      if (opp.recommended_action === 'retry_payment') {
        recommendedAction = 'Retry Payment';
      } else if (opp.recommended_action === 'customer_outreach') {
        recommendedAction = 'Send Payment Reminder';
      }

      items.push({
        id: `rev_${opp.id}`,
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
      console.error(`Failed to ${action} item`, err);
    } finally {
      setInFlightId(null);
    }
  };

  return (
    <div
      className={`p-5 rounded-2xl bg-[#071224] border border-slate-800 shadow-xl space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Needs Approval
          </h3>
        </div>
        <span className="text-[11px] font-mono text-amber-400 font-semibold">
          {reviewItems.length} Pending
        </span>
      </div>

      {reviewItems.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-[#4ADE80] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="text-sm font-bold text-white">All Clear</div>
          <p className="text-xs text-slate-400 font-mono">
            Zero items need approval. Recovery rules are safely operating on autopilot.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {reviewItems.slice(0, 5).map((item) => {
            const isProcessing = inFlightId === item.opportunityId;

            return (
              <div
                key={item.id}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Information */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate font-sans">
                      {item.customerName}
                    </span>
                    <span className="text-xs font-bold text-amber-400 font-mono">
                      {item.amountFormatted}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-sans">{item.reason}</p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Recommended: <span className="text-emerald-400 font-semibold">{item.recommendedAction}</span>
                  </p>
                </div>

                {/* Actions: Approve / Reject */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(item.opportunityId, 'approve')}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Approve</span>
                  </button>

                  <button
                    onClick={() => handleAction(item.opportunityId, 'reject')}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
