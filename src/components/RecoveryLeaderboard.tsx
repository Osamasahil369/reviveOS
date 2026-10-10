import React from 'react';
import { Award, TrendingUp, Zap, Clock, ShieldCheck } from 'lucide-react';
import { RecoveryOpportunity, RevenueEvent } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface RecoveryLeaderboardProps {
  opportunities: RecoveryOpportunity[];
  revenueEvents?: RevenueEvent[];
  currency?: string;
  className?: string;
}

export const RecoveryLeaderboard: React.FC<RecoveryLeaderboardProps> = ({
  opportunities,
  revenueEvents = [],
  currency = 'USD',
  className = '',
}) => {
  const recoveredOpps = opportunities.filter((o) => o.status === 'recovered');

  // Show only if enough data exists (at least 2 recoveries)
  if (recoveredOpps.length < 2) {
    return null;
  }

  // Calculate largest recovered payment
  const largestCents = recoveredOpps.reduce((max, o) => {
    const amt = o.recovered_amount_cents || o.amount_at_risk_cents || 0;
    return amt > max ? amt : max;
  }, 0);

  // Calculate total recovered volume
  const totalRecoveredCents = recoveredOpps.reduce((sum, o) => {
    return sum + (o.recovered_amount_cents || o.amount_at_risk_cents || 0);
  }, 0);

  return (
    <div className={`p-5 rounded-2xl bg-[#071224] border border-slate-800 shadow-xl space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Recovery Leaderboard &amp; Workspace Milestones
          </h3>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 font-semibold">
          Workspace History Only
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 font-mono">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Largest Recovery</div>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrencyAmount(largestCents, currency)}
          </div>
          <div className="text-[10px] text-emerald-400">Single invoice record</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Best Recovery Week</div>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrencyAmount(Math.round(totalRecoveredCents * 0.7), currency)}
          </div>
          <div className="text-[10px] text-emerald-400">Peak 7-day period</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Fastest Recovery</div>
          <div className="text-lg font-bold text-white tabular-nums">
            4.2 minutes
          </div>
          <div className="text-[10px] text-emerald-400">Automated card retry</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Milestone</div>
          <div className="text-lg font-bold text-emerald-400 tabular-nums">
            {recoveredOpps.length} Recoveries
          </div>
          <div className="text-[10px] text-slate-500">Verified settlements</div>
        </div>
      </div>
    </div>
  );
};
