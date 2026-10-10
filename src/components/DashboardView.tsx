import React from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Users,
  Clock,
  ArrowRight,
  CreditCard,
  Building2,
} from 'lucide-react';
import { RecoveryMetrics, RecoveryOpportunity, RevenueEvent, Workspace, ProviderConnection } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { BusinessMetricsDashboard } from './BusinessMetricsDashboard.js';
import { OnboardingChecklist } from './OnboardingChecklist.js';

interface DashboardViewProps {
  metrics: RecoveryMetrics | null;
  recentOpportunities: RecoveryOpportunity[];
  revenueEvents: RevenueEvent[];
  workspace?: Workspace | null;
  connections?: ProviderConnection[];
  onNavigateTab: (tab: string, subTab?: string) => void;
  onSelectOpportunity: (id: string) => void;
  onQuickRetry: (id: string) => void;
  onOpenSimulator?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  recentOpportunities,
  revenueEvents,
  workspace,
  connections = [],
  onNavigateTab,
  onSelectOpportunity,
  onQuickRetry,
  onOpenSimulator,
}) => {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const formatCurrency = (cents: number, curr?: string) => {
    return formatCurrencyAmount(cents, curr || metrics.currency || 'USD');
  };

  const recoveredRevenue = formatCurrency(metrics.revenue_recovered_cents);
  const revenueAtRisk = formatCurrency(metrics.revenue_at_risk_cents);
  const recoveredThisMonth = formatCurrency(metrics.recovered_this_month_cents);

  return (
    <div className="space-y-8 pb-12">
      {/* 1. HERO ROI STATEMENT (The single most important outcome) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 p-6 md:p-8 shadow-xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <ShieldCheck className="w-4 h-4" /> Proven Revenue Engine
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {recoveredRevenue} <span className="text-emerald-400">Recovered Automatically</span>
            </h1>
            <p className="mt-2 text-slate-300 text-sm sm:text-base leading-relaxed">
              Revenue Recovery OS continuously rescues subscription revenue from card declines, expired credentials,
              and banking glitches before accounts churn into permanent loss.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-300">
              <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Recovered Opportunities Recorded</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>Avg. Recovery Window: {metrics.average_recovery_time_hours} Hours</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1.5 font-medium text-amber-300">
                <Zap className="w-4 h-4" />
                <span>{metrics.roi_multiple}x Software ROI Multiple</span>
              </div>
            </div>
          </div>

          {/* Quick CTA to review high-risk accounts */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[220px]">
            <button
              onClick={() => onNavigateTab('opportunities')}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
            >
              <span>Work At-Risk Invoices</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigateTab('campaigns')}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition-colors cursor-pointer"
            >
              <span>View Dunning Workflows</span>
            </button>
          </div>
        </div>
      </div>

      {/* ENTERPRISE LAUNCH READINESS CHECKLIST */}
      <OnboardingChecklist
        workspace={workspace || null}
        connections={connections}
        onNavigateTab={onNavigateTab}
        onOpenSimulator={onOpenSimulator || (() => {})}
      />

      {/* 2. CORE FINANCIAL METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Recovered */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Recovered</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{recoveredRevenue}</div>
          <div className="mt-2 flex items-center text-xs text-emerald-400 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            <span>{recoveredThisMonth} recovered in last 30d</span>
          </div>
        </div>

        {/* Metric 2: Revenue Currently At Risk */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Revenue At Risk</span>
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-rose-400 tracking-tight">{revenueAtRisk}</div>
          <div className="mt-2 text-xs text-slate-400">
            Across <span className="text-white font-semibold">{metrics.customers_at_risk_count} customers</span> currently in recovery
          </div>
        </div>

        {/* Metric 3: Recovery Rate % */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Recovery Success Rate</span>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{metrics.recovery_rate_percentage}%</div>
          <div className="mt-2 text-xs text-slate-400">
            Benchmarked against SaaS standard of 28%
          </div>
        </div>

        {/* Metric 4: Active Recovery Opportunities */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Opportunities</span>
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{metrics.active_opportunities_count}</div>
          <div className="mt-2 text-xs text-slate-400">
            {metrics.active_campaigns_count} automated campaigns active
          </div>
        </div>
      </div>

      {/* 2.5. SAAS BUSINESS METRICS & RECOVERY CHARTS */}
      <BusinessMetricsDashboard metrics={metrics} currency={metrics.currency} />

      {/* 3. TWO COLUMN SECTION: Active Opportunities vs Proof of Recovered Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Central Recovery Queue */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white">Active Recovery Pipeline</h2>
              <p className="text-xs text-slate-400">Failed payments prioritized by revenue amount & recommended recovery action</p>
            </div>
            <button
              onClick={() => onNavigateTab('opportunities')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentOpportunities.slice(0, 5).map((opp) => {
              const amount = formatCurrency(opp.amount_at_risk_cents, opp.currency);
              const isRecovered = opp.status === 'recovered';

              return (
                <div
                  key={opp.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/60 transition-colors"
                >
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onSelectOpportunity(opp.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white truncate">{opp.customer.name}</span>
                      <span className="text-xs text-slate-400 truncate">({opp.customer.email})</span>
                      <span className="text-[11px] uppercase font-mono px-2 py-0.5 rounded-md bg-slate-700 text-slate-300">
                        {opp.customer.provider_type}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-200">{amount}</span>
                      <span className="text-slate-600">•</span>
                      <span className="capitalize text-amber-300 font-medium">
                        {opp.failure_category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400 truncate max-w-[280px]">
                        {opp.recommended_action}
                      </span>
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${
                        isRecovered
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : opp.status === 'contacted'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : opp.status === 'payment_retry_pending'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {opp.status.replace(/_/g, ' ')}
                    </span>

                    {!isRecovered && (
                      <button
                        onClick={() => onQuickRetry(opp.id)}
                        title="Trigger Smart Retry via Provider"
                        className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
                      >
                        Retry Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {recentOpportunities.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">
                No active payment failures. All subscriptions are in good standing!
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Live Proof of Recovered Revenue */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Recovered Revenue Feed</span>
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                Verified
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Every event below represents real capital captured after payment failure.
            </p>

            <div className="space-y-3">
              {revenueEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{event.customer_name}</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      +{formatCurrency(event.amount_cents, event.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="capitalize">{event.recovered_via.replace(/_/g, ' ')}</span>
                    <span>{new Date(event.recorded_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}

              {revenueEvents.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No recovered events recorded yet. Run a retry or simulated payment!
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <div className="rounded-lg bg-slate-800/40 p-3 text-xs text-slate-300">
              <div className="font-semibold text-white mb-1">What constitutes "Recovered Revenue"?</div>
              An invoice or payment that initially failed and was subsequent successfully captured via automated dunning, customer portal, or smart retry.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
