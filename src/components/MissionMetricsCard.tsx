import React from 'react';
import { Target, CheckCircle2, XCircle, TrendingUp, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import { RevenueMissionMetrics } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface MissionMetricsCardProps {
  metrics: RevenueMissionMetrics | null;
  currency?: string;
  className?: string;
}

export const MissionMetricsCard: React.FC<MissionMetricsCardProps> = ({
  metrics,
  currency = 'USD',
  className = '',
}) => {
  const totalMissions = metrics?.totalMissions ?? 0;
  const completedMissions = metrics?.completedMissions ?? 0;
  const failedMissions = metrics?.failedMissions ?? 0;
  const hasSufficientData = metrics?.hasSufficientData ?? false;
  const successRateFormatted = hasSufficientData
    ? `${metrics?.successRate ?? 0}%`
    : 'More mission history required.';

  const revenueRecovered = metrics?.revenueRecovered ?? 0;
  const revenueProtected = metrics?.revenueProtected ?? 0;
  const revenueExpanded = metrics?.revenueExpanded ?? 0;

  return (
    <div
      className={`p-5 rounded-2xl bg-[#071224] border border-slate-800 shadow-xl space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <BarChart3 className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Mission Performance Analytics
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Empirical mission execution outcomes · Minimum sample threshold enforced
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
          {totalMissions} Total Missions
        </span>
      </div>

      {/* Primary 4 Analytics Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
        {/* Total Missions */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Total Missions</span>
            <Target className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-white tabular-nums">{totalMissions}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tracked objectives</div>
        </div>

        {/* Completed Missions */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{completedMissions}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Successfully settled</div>
        </div>

        {/* Failed Missions */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Failed</span>
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400 tabular-nums">{failedMissions}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Exhausted cycles</div>
        </div>

        {/* Success Rate */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Success Rate</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#4ADE80]" />
          </div>
          <div className={`text-base font-bold tabular-nums ${hasSufficientData ? 'text-white' : 'text-slate-400 text-xs'}`}>
            {successRateFormatted}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {hasSufficientData ? 'Historical resolution' : 'n < 5 samples'}
          </div>
        </div>
      </div>

      {/* Revenue Impact Tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono">
        {/* Revenue Recovered */}
        <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Revenue Recovered</span>
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrencyAmount(revenueRecovered, currency)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Cash recaptured into bank</div>
        </div>

        {/* Revenue Protected */}
        <div className="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/20">
          <div className="text-[10px] text-sky-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <ShieldCheck className="w-3 h-3 text-sky-400" />
            <span>Revenue Protected</span>
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrencyAmount(revenueProtected, currency)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">At-risk ARR retained</div>
        </div>

        {/* Revenue Expanded */}
        <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20">
          <div className="text-[10px] text-purple-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-purple-400" />
            <span>Revenue Expanded</span>
          </div>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrencyAmount(revenueExpanded, currency)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Upsell & plan expansion</div>
        </div>
      </div>
    </div>
  );
};
