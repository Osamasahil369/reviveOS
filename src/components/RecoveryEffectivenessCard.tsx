import React, { useState, useEffect } from 'react';
import { Sparkles, Trophy, ArrowRight, ShieldCheck, Info, RefreshCw } from 'lucide-react';
import { api } from '../services/api.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RecoveryEffectivenessCardProps {
  workspaceId?: string;
  currency: string;
  className?: string;
}

export const RecoveryEffectivenessCard: React.FC<RecoveryEffectivenessCardProps> = ({
  workspaceId,
  currency,
  className = '',
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    api.getRecoveryEffectiveness()
      .then((res) => {
        if (!isMounted) return;
        setData(res);
      })
      .catch(() => {
        if (!isMounted) return;
        setData(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  if (loading) {
    return (
      <div className={`p-4 rounded-xl bg-[#071224] border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2 ${className}`}>
        <RefreshCw className="w-4 h-4 animate-spin text-[#4ADE80]" />
        <span>Evaluating recovery effectiveness lab...</span>
      </div>
    );
  }

  const categoryRows = data?.categoryEffectiveness || [];
  const topAction = data?.topPerformingAction;

  return (
    <div className={`p-4 rounded-xl bg-[#071224] border border-slate-800 space-y-3.5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Recovery Effectiveness Lab
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Which recovery action produces the highest success rate?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
          <Sparkles className="w-3 h-3 text-[#4ADE80]" />
          <span>Closed-Loop Optimized</span>
        </div>
      </div>

      {/* Primary Insight Headline */}
      <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs font-mono text-emerald-300 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#4ADE80] shrink-0" />
          <span>
            {data?.automatedRecommendationRule || 'ReviveOS automatically chooses the highest-performing action.'}
          </span>
        </div>
        {topAction && topAction.hasSufficientData && (
          <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-500/20 text-white font-bold text-[11px]">
            {topAction.actionName}: {topAction.recoveryRateFormatted}
          </span>
        )}
      </div>

      {/* Breakdown Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
              <th className="py-2 px-2">Failure Type</th>
              <th className="py-2 px-2">Top Action</th>
              <th className="py-2 px-2 text-right">Success Rate</th>
              <th className="py-2 px-2 text-right">Recovered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {categoryRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500 text-xs">
                  Not enough historical data to establish action rankings.
                </td>
              </tr>
            ) : (
              categoryRows.slice(0, 5).map((row: any, idx: number) => {
                const best = row.highestPerformingAction;
                return (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-2.5 px-2 font-medium text-white">{row.categoryLabel}</td>
                    <td className="py-2.5 px-2 text-slate-300">
                      {best ? best.actionName : 'Smart Retry / Link'}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      {best ? (
                        <span className="font-semibold text-[#4ADE80]">{best.successRateFormatted}</span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Not enough historical data.</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-200">
                      {best ? formatCurrencyAmount(best.revenueRecoveredCents, currency) : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
