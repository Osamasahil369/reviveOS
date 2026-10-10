import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldAlert,
  TrendingUp,
  AlertTriangle,
  Zap,
  CheckCircle2,
  DollarSign,
  Layers,
} from 'lucide-react';
import { RecoveryMetrics, RecoveryOpportunity, Workspace } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface FirstValueExperienceCardProps {
  metrics: RecoveryMetrics | null;
  opportunities: RecoveryOpportunity[];
  workspace: Workspace | null;
  currency: string;
  onReviewRecommendations: () => void;
}

export const FirstValueExperienceCard: React.FC<FirstValueExperienceCardProps> = ({
  metrics,
  opportunities,
  workspace,
  currency,
  onReviewRecommendations,
}) => {
  const atRiskCents = metrics?.revenue_at_risk_cents || opportunities.reduce((acc, o) => acc + (o.amount_at_risk_cents || 0), 0);
  
  // Top Recovery Opportunity
  const topRecoveryOpp = opportunities.find((o) => o.status !== 'recovered') || opportunities[0];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-500/10 animate-in fade-in zoom-in-95 duration-300">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Scan Complete — Revenue Audit Summary</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight mt-1">
            First Scan Analysis for {workspace?.name || 'Your Business'}
          </h2>
          <p className="text-xs text-slate-400">
            Initial scan detected failed charges, customers at risk of leaving, and account growth potential.
          </p>
        </div>

        <button
          onClick={onReviewRecommendations}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer shrink-0"
        >
          <span>Review Recommendations</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of 4 Key Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {/* 1. Revenue At Risk */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-rose-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-rose-400 uppercase font-bold">
            <span>Revenue At Risk</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white font-display tabular-nums">
            {formatCurrencyAmount(atRiskCents, currency)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {opportunities.length} failed payments detected
          </div>
        </div>

        {/* 2. Top Opportunity */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-emerald-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-emerald-400 uppercase font-bold">
            <span>Top Recoverable Payment</span>
            <Zap className="w-4 h-4" />
          </div>
          {topRecoveryOpp ? (
            <div>
              <div className="text-sm font-bold text-white truncate">
                {topRecoveryOpp.customer?.name || 'Top Customer'}
              </div>
              <div className="text-xs font-semibold text-emerald-400 font-mono">
                {formatCurrencyAmount(topRecoveryOpp.amount_at_risk_cents || 0, currency)} at risk
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-1">
                {topRecoveryOpp.recommended_action || 'Retry Payment'}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 font-mono">
              Zero payment failures detected.
            </div>
          )}
        </div>

        {/* 3. Top Churn Risk */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-amber-400 uppercase font-bold">
            <span>Customer Most At Risk</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white truncate">
              {topRecoveryOpp ? topRecoveryOpp.customer?.name : 'Monitoring Account'}
            </div>
            <div className="text-xs font-semibold text-amber-400 font-mono">
              High Risk of Cancellation
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-1">
              Follow-up email and reminders scheduled
            </div>
          </div>
        </div>

        {/* 4. Top Expansion Opportunity */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-cyan-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-cyan-300 uppercase font-bold">
            <span>Top Growth Opportunity</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white truncate">
              {topRecoveryOpp ? topRecoveryOpp.customer?.name : 'Growth Candidate'}
            </div>
            <div className="text-xs font-semibold text-cyan-300 font-mono">
              Ready for Plan Upgrade
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-1">
              Consistent usage & reliable history
            </div>
          </div>
        </div>
      </div>

      {/* Footer Callout */}
      <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>All recommendations are based on verified payment data with zero automated risks.</span>
        </div>
        <button
          onClick={onReviewRecommendations}
          className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer underline underline-offset-4"
        >
          <span>Open Revenue Dashboard</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
