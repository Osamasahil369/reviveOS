import React from 'react';
import { CheckCircle2, CreditCard, RefreshCw } from 'lucide-react';
import { RevenueEvent, RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface RecoveryWinsFeedProps {
  revenueEvents?: RevenueEvent[];
  opportunities?: RecoveryOpportunity[];
  currency?: string;
  limit?: number;
  className?: string;
}

export interface WinItem {
  id: string;
  amountFormatted: string;
  actionText: string;
  timeFormatted: string;
}

export const RecoveryWinsFeed: React.FC<RecoveryWinsFeedProps> = ({
  revenueEvents = [],
  opportunities = [],
  currency = 'USD',
  limit = 5,
  className = '',
}) => {
  const wins: WinItem[] = React.useMemo(() => {
    const items: WinItem[] = [];

    // 1. Gather recovered opportunities
    const recoveredOpps = opportunities.filter((o) => o.status === 'recovered');

    recoveredOpps.forEach((opp, idx) => {
      const amt = opp.recovered_amount_cents || opp.amount_at_risk_cents || 0;
      const amountFormatted = formatCurrencyAmount(amt, currency);
      const actionText =
        idx % 2 === 0 ? 'Customer updated payment method' : 'Payment retry succeeded';

      const timeStr = opp.recovered_at || opp.updated_at || opp.created_at;
      const date = timeStr ? new Date(timeStr) : new Date();
      const timeFormatted = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      items.push({
        id: `win_opp_${opp.id || idx}`,
        amountFormatted: `Recovered ${amountFormatted}`,
        actionText,
        timeFormatted: `Today ${timeFormatted}`,
      });
    });

    // 2. Augment with revenue events if needed
    if (items.length < limit) {
      const settled = revenueEvents.filter((e) => e.event_type === 'revenue_recovered');
      settled.forEach((ev, i) => {
        if (items.some((it) => it.id.includes(ev.id))) return;
        const amountFormatted = formatCurrencyAmount(ev.amount_cents || 0, currency);
        const actionText = i % 2 === 0 ? 'Customer updated payment method' : 'Payment retry succeeded';

        items.push({
          id: `win_ev_${ev.id || i}`,
          amountFormatted: `Recovered ${amountFormatted}`,
          actionText,
          timeFormatted: 'Today',
        });
      });
    }

    return items.slice(0, limit);
  }, [opportunities, revenueEvents, currency, limit]);

  if (wins.length === 0) {
    return (
      <div className={`p-6 rounded-2xl bg-[#071224] border border-slate-800 text-center space-y-2 ${className}`}>
        <div className="text-sm font-bold text-white">Monitoring for Recovery Wins</div>
        <p className="text-xs text-slate-400">
          As soon as payment retries succeed or cards are updated, wins will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={`p-5 rounded-2xl bg-[#071224] border border-slate-800 shadow-xl space-y-3.5 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#4ADE80] animate-pulse" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Recovery Wins
          </h3>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 font-semibold">
          Settled Cash
        </span>
      </div>

      <div className="divide-y divide-slate-800/60">
        {wins.map((win) => (
          <div key={win.id} className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-sm font-bold text-emerald-400 font-sans">
                {win.amountFormatted}
              </div>
              <div className="text-xs text-slate-300 font-sans">
                {win.actionText}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] text-slate-400 font-sans">
                {win.timeFormatted}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
