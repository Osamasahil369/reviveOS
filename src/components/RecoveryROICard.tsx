import React from 'react';
import { TrendingUp, Clock, Zap, DollarSign, AlertTriangle } from 'lucide-react';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RecoveryROICardProps {
  revenueRecoveredCents: number;
  revenueAtRiskCents: number;
  recoveryRate: number;
  actionsExecuted: number;
  currency: string;
  className?: string;
}

export const RecoveryROICard: React.FC<RecoveryROICardProps> = ({
  revenueRecoveredCents,
  revenueAtRiskCents,
  recoveryRate,
  actionsExecuted,
  currency,
  className = '',
}) => {
  // Deterministic calculation: 15 minutes (0.25 hours) of manual dunning/customer support administrative effort saved per automated action
  const minutesPerAction = 15;
  const totalMinutesSaved = actionsExecuted * minutesPerAction;
  const hoursSaved = Math.round((totalMinutesSaved / 60) * 10) / 10;
  const formattedTimeSaved =
    hoursSaved >= 1 ? `${hoursSaved} hours` : `${totalMinutesSaved} mins`;

  return (
    <div
      className={`p-4 rounded-xl bg-[#071224] border border-slate-800 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <Zap className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Recovery ROI &amp; Impact
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Verified return on investment metrics
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 font-semibold">
          Recovery Results
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
        {/* 1. Revenue Recovered */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Recovered</span>
            <DollarSign className="w-3.5 h-3.5 text-[#4ADE80]" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {formatCurrencyAmount(revenueRecoveredCents, currency)}
          </div>
          <span className="text-[10px] font-mono text-emerald-400">Preserved cash</span>
        </div>

        {/* 2. Revenue At Risk */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>At Risk</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {formatCurrencyAmount(revenueAtRiskCents, currency)}
          </div>
          <span className="text-[10px] font-mono text-amber-400">In dunning</span>
        </div>

        {/* 3. Recovery Rate */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Success Rate</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {recoveryRate}%
          </div>
          <span className="text-[10px] font-mono text-slate-400">Cohort rate</span>
        </div>

        {/* 4. Actions Executed */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Actions</span>
            <Zap className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {actionsExecuted}
          </div>
          <span className="text-[10px] font-mono text-sky-400">Autonomous</span>
        </div>

        {/* 5. Estimated Time Saved */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Time Saved</span>
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {formattedTimeSaved}
          </div>
          <span className="text-[10px] font-mono text-slate-400">15m / action</span>
        </div>
      </div>
    </div>
  );
};
