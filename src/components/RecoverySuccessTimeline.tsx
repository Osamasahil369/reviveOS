import React, { useMemo } from 'react';
import { CheckCircle2, CreditCard, RefreshCw, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { RevenueEvent, RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RecoverySuccessTimelineProps {
  revenueEvents: RevenueEvent[];
  opportunities: RecoveryOpportunity[];
  currency: string;
  className?: string;
  limit?: number;
}

export const RecoverySuccessTimeline: React.FC<RecoverySuccessTimelineProps> = ({
  revenueEvents,
  opportunities,
  currency,
  className = '',
  limit = 10,
}) => {
  const timelineItems = useMemo(() => {
    const list: Array<{
      id: string;
      customerName: string;
      amountCents: number;
      methodLabel: string;
      timestamp: string;
      timeFormatted: string;
      iconType: 'retry' | 'link' | 'card';
    }> = [];

    // Map human readable method labels without technical codes
    const formatMethod = (methodRaw: string): { label: string; icon: 'retry' | 'link' | 'card' } => {
      const lower = (methodRaw || '').toLowerCase();
      if (lower.includes('retry') || lower.includes('provider_retry') || lower.includes('smart_retry')) {
        return { label: 'Payment retry succeeded', icon: 'retry' };
      }
      if (lower.includes('card') || lower.includes('update') || lower.includes('customer_update')) {
        return { label: 'Customer updated card', icon: 'card' };
      }
      return { label: 'Payment link completed', icon: 'link' };
    };

    // 1. Ingest real revenue recovered events
    for (const rev of revenueEvents) {
      if (rev.event_type === 'revenue_recovered') {
        const { label, icon } = formatMethod(rev.recovered_via || 'payment_link');
        const d = new Date(rev.recorded_at);
        list.push({
          id: `rec-timeline-${rev.id}`,
          customerName: rev.customer_name || 'Subscriber',
          amountCents: rev.amount_cents,
          methodLabel: label,
          timestamp: rev.recorded_at,
          timeFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          iconType: icon,
        });
      }
    }

    // 2. Cross check recovered opportunities
    for (const opp of opportunities) {
      if (opp.status === 'recovered') {
        const name = opp.customer?.name || (opp as any).customer_name || 'Subscriber';
        if (!list.some((item) => item.customerName === name && item.amountCents === (opp.recovered_amount_cents || opp.amount_at_risk_cents))) {
          const { label, icon } = formatMethod(opp.recommended_action || 'payment_link');
          const d = new Date(opp.recovered_at || opp.updated_at);
          list.push({
            id: `opp_timeline_${opp.id}`,
            customerName: name,
            amountCents: opp.recovered_amount_cents || opp.amount_at_risk_cents || 0,
            methodLabel: label,
            timestamp: opp.recovered_at || opp.updated_at,
            timeFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            iconType: icon,
          });
        }
      }
    }

    return list
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }, [revenueEvents, opportunities, limit]);

  return (
    <div
      className={`p-4 rounded-xl bg-[#071224] border border-slate-800 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Recovery Success Timeline
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Verified chronological customer recovery ledger
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 font-semibold">
          {timelineItems.length} Verified Events
        </span>
      </div>

      {timelineItems.length === 0 ? (
        <div className="py-6 text-center text-xs font-mono text-slate-400">
          No recovered payments recorded yet. Active recoveries are in flight.
        </div>
      ) : (
        <div className="space-y-2 pt-1 font-mono">
          {timelineItems.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center shrink-0">
                  {item.iconType === 'retry' ? (
                    <RefreshCw className="w-3 h-3 text-[#4ADE80]" />
                  ) : item.iconType === 'card' ? (
                    <CreditCard className="w-3 h-3 text-[#4ADE80]" />
                  ) : (
                    <LinkIcon className="w-3 h-3 text-[#4ADE80]" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5 truncate">
                    <span className="text-[#4ADE80]">
                      Recovered {formatCurrencyAmount(item.amountCents, currency)}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-300 font-sans font-medium truncate">
                      {item.customerName}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{item.methodLabel}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500 text-[10px]">{item.timeFormatted}</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Settled
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
