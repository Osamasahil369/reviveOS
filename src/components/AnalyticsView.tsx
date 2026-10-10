import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  ArrowRight,
  ShieldCheck,
  Zap,
  DollarSign,
  Layers,
  Sparkles,
  RefreshCw,
  Mail,
  ExternalLink,
  MessageSquare,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { FunnelStage, FailureCategoryBreakdown, RecoveryMetrics } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { BusinessMetricsDashboard } from './BusinessMetricsDashboard.js';

interface AnalyticsViewProps {
  funnel: FunnelStage[];
  breakdown: FailureCategoryBreakdown[];
  metrics: RecoveryMetrics | null;
  currency: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  funnel,
  breakdown,
  metrics,
  currency,
}) => {
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'funnel' | 'declines' | 'attribution' | 'nrr'>('funnel');

  const formatCurrency = (cents: number) => {
    return formatCurrencyAmount(cents, currency || 'USD', { maximumFractionDigits: 0 });
  };

  const revRec = metrics?.revenue_recovered_cents ?? 0;
  // Authoritative attribution and cohort empty state handling
  const hasAuthoritativeAttribution = revRec > 0;
  const hasCohortHistory = false; // Insufficient cohort history
  const hasOutcomeData = false; // Insufficient outcome data for win rates

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Recovery Performance & Deep Analytics</h1>
        <p className="text-xs text-slate-400">
          Conversion rates through each dunning step, soft vs hard decline mechanics, and channel attribution.
        </p>
      </div>

      {/* SaaS Business Metrics & Performance Visualizer */}
      <BusinessMetricsDashboard metrics={metrics} currency={currency} />

      {/* Analytics Sub-Nav */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveAnalysisTab('funnel')}
          className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
            activeAnalysisTab === 'funnel'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Lifecycle Funnel
        </button>
        <button
          onClick={() => setActiveAnalysisTab('declines')}
          className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
            activeAnalysisTab === 'declines'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Soft vs Hard Declines
        </button>
        <button
          onClick={() => setActiveAnalysisTab('attribution')}
          className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
            activeAnalysisTab === 'attribution'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Channel Attribution
        </button>
        <button
          onClick={() => setActiveAnalysisTab('nrr')}
          className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
            activeAnalysisTab === 'nrr'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Cohort NRR & LTV Lift
        </button>
      </div>

      {/* 1. Recovery Funnel Visualizer */}
      {activeAnalysisTab === 'funnel' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Dunning Funnel Progression</span>
              </h3>
              <p className="text-xs text-slate-400">Conversion across the end-to-end recovery lifecycle</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              {metrics?.recovery_rate_percentage ?? 0}% Overall Conversion
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {funnel.map((stage, idx) => (
              <div
                key={stage.stage}
                className="relative p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>STEP 0{idx + 1}</span>
                    <span className="font-bold text-emerald-400">{stage.conversion_rate}%</span>
                  </div>
                  <div className="font-bold text-xs text-white capitalize">{stage.stage.replace(/_/g, ' ')}</div>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black text-white font-mono">{stage.count}</div>
                  <div className="text-[11px] text-slate-400">{formatCurrency(stage.amount_cents)}</div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${stage.conversion_rate}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Soft vs Hard Declines Breakdown */}
      {activeAnalysisTab === 'declines' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Soft Declines (Algorithmic Recovery)
                </span>
                <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  Not enough outcome data
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Transient banking issues: Insufficient funds, network timeouts, daily card velocity limits, and system outages.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Hard Declines (Credential Updates)
                </span>
                <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  Not enough outcome data
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Card expired, reported lost/stolen, cardholder closed account, or 3DS authentication required.
              </p>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
            <div className="mb-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-amber-400" />
                <span>Decline Root Cause Taxonomy</span>
              </h3>
              <p className="text-xs text-slate-400">Distribution of gateway failure codes and automated remedies</p>
            </div>

            <div className="space-y-4">
              {breakdown.map((item) => (
                <div
                  key={item.category}
                  className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white capitalize">
                          {item.category.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                            item.category === 'insufficient_funds' || item.category === 'temporary_provider_failure'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {item.category === 'insufficient_funds' || item.category === 'temporary_provider_failure'
                            ? 'Soft Decline'
                            : 'Hard Decline'}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-300 font-bold">
                        {formatCurrency(item.amount_cents)} ({item.recovery_rate}%)
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.category === 'insufficient_funds'
                            ? 'bg-amber-400'
                            : item.category === 'expired_card'
                            ? 'bg-blue-400'
                            : item.category === 'authentication_required'
                            ? 'bg-purple-400'
                            : 'bg-rose-400'
                        }`}
                        style={{ width: `${item.recovery_rate}%` }}
                      ></div>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>{item.count} incidents</span>
                      <span className="text-emerald-400 font-medium">
                        {item.category === 'insufficient_funds'
                          ? 'Action: Smart retry timing at payday / off-peak banking hours'
                          : item.category === 'expired_card'
                          ? 'Action: One-click magic link card replacement & CAU sync'
                          : item.category === 'authentication_required'
                          ? 'Action: Customer self-serve 3DS authorization portal'
                          : 'Action: Multi-channel outreach & alternate payment methods'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Channel Attribution Visualizer */}
      {activeAnalysisTab === 'attribution' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center py-12">
          <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white">Insufficient attribution data</h3>
          <p className="text-xs text-slate-400 mt-1">Multi-channel recovery channel attribution requires authenticated recovery event logs.</p>
        </div>
      )}

      {/* 4. Cohort NRR Retention Lift */}
      {activeAnalysisTab === 'nrr' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center py-12">
          <TrendingUp className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white">Insufficient cohort history</h3>
          <p className="text-xs text-slate-400 mt-1">Cohort Net Revenue Retention (NRR) curves require historical multi-month subscriber retention data.</p>
        </div>
      )}
    </div>
  );
};
