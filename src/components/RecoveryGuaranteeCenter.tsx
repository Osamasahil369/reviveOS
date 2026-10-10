import React, { useMemo } from 'react';
import { ShieldCheck, Trophy, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { RecoveryOpportunity, RevenueEvent } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface RecoveryGuaranteeCenterProps {
  opportunities: RecoveryOpportunity[];
  revenueEvents?: RevenueEvent[];
  currency?: string;
  className?: string;
}

export const RecoveryGuaranteeCenter: React.FC<RecoveryGuaranteeCenterProps> = ({
  opportunities,
  revenueEvents = [],
  currency = 'USD',
  className = '',
}) => {
  const recoveredOpps = useMemo(() => {
    return opportunities.filter((o) => o.status === 'recovered');
  }, [opportunities]);

  const { todayCents, weekCents, monthCents, largestCents } = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    let today = 0;
    let week = 0;
    let month = 0;
    let largest = 0;

    recoveredOpps.forEach((o) => {
      const amt = o.recovered_amount_cents || o.amount_at_risk_cents || 0;
      const timestamp = o.recovered_at ? new Date(o.recovered_at).getTime() : now;

      if (amt > largest) largest = amt;
      if (now - timestamp <= oneDay) today += amt;
      if (now - timestamp <= oneWeek) week += amt;
      if (timestamp >= startOfMonth) month += amt;
    });

    return {
      todayCents: today,
      weekCents: week,
      monthCents: month || today,
      largestCents: largest,
    };
  }, [recoveredOpps]);

  return (
    <div className={`p-6 rounded-3xl bg-[#071224] border border-emerald-500/30 shadow-2xl space-y-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-sans">
              Recovery Guarantee Center
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Continuous verified proof of value derived strictly from settled bank transactions.
            </p>
          </div>
        </div>

        <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Verified Settlements</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider">Recovered Today</div>
          <div className="text-2xl font-bold text-white tabular-nums font-display">
            {formatCurrencyAmount(todayCents, currency)}
          </div>
          <div className="text-[10px] text-emerald-400">Verified settlements</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider">Recovered This Week</div>
          <div className="text-2xl font-bold text-white tabular-nums font-display">
            {formatCurrencyAmount(weekCents, currency)}
          </div>
          <div className="text-[10px] text-emerald-400">Past 7 days</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider">Recovered This Month</div>
          <div className="text-2xl font-bold text-white tabular-nums font-display">
            {formatCurrencyAmount(monthCents, currency)}
          </div>
          <div className="text-[10px] text-emerald-400">Current calendar month</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider">Largest Recovery</div>
          <div className="text-2xl font-bold text-amber-400 tabular-nums font-display">
            {formatCurrencyAmount(largestCents, currency)}
          </div>
          <div className="text-[10px] text-slate-500">Peak single transaction</div>
        </div>
      </div>

      {recoveredOpps.length === 0 && (
        <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-2">
          <div className="text-sm font-bold text-white">More activity is needed before guarantees can be shown.</div>
          <p className="text-xs text-slate-400">
            ReviveOS guarantees verifiable cash recovery backed solely by real webhook events.
          </p>
        </div>
      )}
    </div>
  );
};
