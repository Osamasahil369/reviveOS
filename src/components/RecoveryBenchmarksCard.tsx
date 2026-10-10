import React, { useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Info, ShieldCheck } from 'lucide-react';
import { RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RecoveryBenchmarksCardProps {
  opportunities: RecoveryOpportunity[];
  currency: string;
  className?: string;
  minSampleThreshold?: number;
}

export const RecoveryBenchmarksCard: React.FC<RecoveryBenchmarksCardProps> = ({
  opportunities,
  currency,
  className = '',
  minSampleThreshold = 5,
}) => {
  const benchmarkData = useMemo(() => {
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 86400000;

    // Partition opportunities into current window (last 30 days) and historical baseline (> 30 days ago)
    const currentWindowOpps = opportunities.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return now - t <= THIRTY_DAYS_MS;
    });

    const historicalBaselineOpps = opportunities.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return now - t > THIRTY_DAYS_MS;
    });

    const calcRate = (opps: RecoveryOpportunity[]) => {
      const resolved = opps.filter((o) =>
        ['recovered', 'lost', 'failed', 'abandoned', 'closed'].includes(o.status) || o.status === 'recovered'
      );
      if (resolved.length === 0) return null;
      const recovered = resolved.filter((o) => o.status === 'recovered').length;
      return {
        rate: Math.round((recovered / resolved.length) * 1000) / 10,
        recoveredCount: recovered,
        totalResolved: resolved.length,
        totalRecoveredCents: resolved
          .filter((o) => o.status === 'recovered')
          .reduce((sum, o) => sum + (o.recovered_amount_cents || o.amount_at_risk_cents || 0), 0),
      };
    };

    const currentStats = calcRate(currentWindowOpps);
    const historicalStats = calcRate(historicalBaselineOpps);

    // If historical baseline is empty or small, fallback to comparing first half vs second half if total >= minSampleThreshold * 2
    let baselineStats = historicalStats;
    if ((!baselineStats || baselineStats.totalResolved < minSampleThreshold) && opportunities.length >= minSampleThreshold * 2) {
      const sorted = [...opportunities].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const mid = Math.floor(sorted.length / 2);
      baselineStats = calcRate(sorted.slice(0, mid));
    }

    const hasSufficientCurrent = (currentStats?.totalResolved || 0) >= minSampleThreshold;
    const hasSufficientBaseline = (baselineStats?.totalResolved || 0) >= minSampleThreshold;
    const hasSufficientData = hasSufficientCurrent && hasSufficientBaseline;

    if (!hasSufficientData || !currentStats || !baselineStats) {
      return {
        hasSufficientData: false,
        message: 'More recovery history required.',
        currentRate: currentStats?.rate ?? null,
        baselineRate: baselineStats?.rate ?? null,
      };
    }

    const diff = Math.round((currentStats.rate - baselineStats.rate) * 10) / 10;
    // Additional revenue recovered vs baseline rate
    const expectedAtBaselineCents = Math.round(currentStats.totalRecoveredCents * (baselineStats.rate / 100));
    const additionalRecoveredCents = Math.max(0, currentStats.totalRecoveredCents - expectedAtBaselineCents);

    return {
      hasSufficientData: true,
      currentRate: currentStats.rate,
      baselineRate: baselineStats.rate,
      diff,
      isPositive: diff >= 0,
      additionalRecoveredCents,
      currentWindowCount: currentStats.totalResolved,
      baselineCount: baselineStats.totalResolved,
    };
  }, [opportunities, minSampleThreshold]);

  return (
    <div
      className={`p-4 rounded-xl bg-[#071224] border border-slate-800 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Revenue Recovery Benchmarks
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Authoritative workspace performance vs. historical baseline
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-slate-500">Real Data Only</span>
      </div>

      {!benchmarkData.hasSufficientData ? (
        <div className="py-6 text-center space-y-2">
          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Info className="w-4 h-4" />
          </div>
          <div className="text-xs font-mono font-semibold text-slate-300">
            More recovery history required.
          </div>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto font-light">
            ReviveOS requires a minimum verified sample of historical recovery outcomes to establish a statistical benchmark. External synthetic benchmarks are never fabricated.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            {/* Current Window Rate */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Current Recovery Rate
              </span>
              <div className="text-2xl font-bold text-white font-display tabular-nums tracking-tight">
                {benchmarkData.currentRate}%
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                Recent 30-day cohort ({benchmarkData.currentWindowCount} resolved)
              </span>
            </div>

            {/* Historical Baseline */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Workspace Historical Average
              </span>
              <div className="text-2xl font-bold text-slate-300 font-display tabular-nums tracking-tight">
                {benchmarkData.baselineRate}%
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                Prior baseline cohort ({benchmarkData.baselineCount} resolved)
              </span>
            </div>
          </div>

          {/* Variance & Additional Revenue */}
          <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              {benchmarkData.isPositive ? (
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="text-slate-300">
                {benchmarkData.isPositive ? '+' : ''}
                {benchmarkData.diff}% vs historical baseline
              </span>
            </div>

            {benchmarkData.additionalRecoveredCents !== undefined && benchmarkData.additionalRecoveredCents > 0 && (
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Additional Revenue:</span>
                <span className="text-emerald-400 font-bold">
                  +{formatCurrencyAmount(benchmarkData.additionalRecoveredCents, currency)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
