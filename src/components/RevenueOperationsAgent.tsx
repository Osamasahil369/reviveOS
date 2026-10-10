import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  RefreshCw,
  Target,
} from 'lucide-react';
import { RevenueOperationsSummary } from '../types/index.js';
import { api } from '../services/api.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface RevenueOperationsAgentProps {
  workspaceId?: string;
  currency?: string;
  onFocusMission?: (missionId: string) => void;
  className?: string;
}

export const RevenueOperationsAgent: React.FC<RevenueOperationsAgentProps> = ({
  workspaceId,
  currency = 'USD',
  onFocusMission,
  className = '',
}) => {
  const [summary, setSummary] = useState<RevenueOperationsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api
      .getRevenueOperationsSummary()
      .then((res) => {
        if (isMounted) {
          setSummary(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load revenue operations summary', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  if (isLoading && !summary) {
    return (
      <div className={`p-4 rounded-xl bg-[#071224] border border-slate-800 text-slate-400 font-mono text-xs flex items-center gap-2 ${className}`}>
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
        <span>Synthesizing revenue operations outcomes...</span>
      </div>
    );
  }

  const todayAmountFormatted = formatCurrencyAmount(summary?.todayRecoveredCents || 0, currency);
  const updatedCount = summary?.paymentMethodsUpdatedCount || 0;
  const recoveredCount = summary?.failedPaymentsRecoveredCount || 0;
  const atRiskCount = summary?.customersAtRiskCount || 0;
  const nextFocus = summary?.nextRecommendedFocus;

  return (
    <div
      className={`p-5 rounded-2xl bg-gradient-to-br from-[#071224] to-slate-950 border border-slate-800 shadow-xl space-y-4 ${className}`}
    >
      {/* Header with live operational status */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Revenue Operations Agent
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Real-time recovery results · Verified bank settlements
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
          Live System State
        </span>
      </div>

      {/* Primary Fact Ledger Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 font-mono">
        {/* Fact 1: Today Recovered */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <TrendingUp className="w-3 h-3 text-[#4ADE80]" />
            <span>Today's Recapture</span>
          </div>
          <div className="text-sm font-bold text-white tabular-nums">
            Today ReviveOS recovered {todayAmountFormatted}.
          </div>
        </div>

        {/* Fact 2: Payment Methods Updated */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <CreditCard className="w-3 h-3 text-sky-400" />
            <span>Payment Methods</span>
          </div>
          <div className="text-sm font-bold text-white tabular-nums">
            {updatedCount} {updatedCount === 1 ? 'customer' : 'customers'} updated payment methods.
          </div>
        </div>

        {/* Fact 3: Invoices Recovered */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Successful Recoveries</span>
          </div>
          <div className="text-sm font-bold text-white tabular-nums">
            {recoveredCount} {recoveredCount === 1 ? 'failed payment was' : 'failed payments were'} recovered.
          </div>
        </div>

        {/* Fact 4: Customers at Risk */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>Active Exposure</span>
          </div>
          <div className="text-sm font-bold text-white tabular-nums">
            {atRiskCount} {atRiskCount === 1 ? 'customer remains at risk.' : 'customers remain at risk.'}
          </div>
        </div>
      </div>

      {/* Next Recommended Focus Action Callout */}
      {nextFocus && (
        <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              <span>Next recommended focus:</span>
              <span className="text-white font-bold">{nextFocus.title}</span>
            </div>
            <p className="text-xs text-slate-300 font-sans">
              {nextFocus.reason}
            </p>
          </div>

          {onFocusMission && nextFocus.missionId && (
            <button
              onClick={() => onFocusMission(nextFocus.missionId!)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-xs font-mono transition-all shadow-xs cursor-pointer shrink-0"
            >
              <span>{nextFocus.actionLabel}</span>
              <ArrowRight className="w-3 h-3 text-slate-950" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
