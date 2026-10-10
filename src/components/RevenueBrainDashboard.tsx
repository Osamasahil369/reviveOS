import React, { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Zap,
  Shield,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Filter,
  DollarSign,
  Layers,
  Activity,
  Info,
} from 'lucide-react';
import {
  RevenueBrainResponse,
  UnifiedRevenueOpportunity,
  RevenueBrainCategory,
} from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { api } from '../services/api.js';
import { EmptyStateCard } from './EmptyStateCard.js';

interface RevenueBrainDashboardProps {
  currency: string;
  onSelectOpportunity?: (opportunityId: string) => void;
  onNavigateTab?: (tab: 'home' | 'revenue' | 'customers' | 'settings') => void;
  compact?: boolean;
}

export const RevenueBrainDashboard: React.FC<RevenueBrainDashboardProps> = ({
  currency,
  onSelectOpportunity,
  onNavigateTab,
  compact = false,
}) => {
  const [brainData, setBrainData] = useState<RevenueBrainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | RevenueBrainCategory>('ALL');

  const loadBrainData = async () => {
    try {
      setLoading(true);
      const res = await api.getRevenueBrain({
        category: categoryFilter === 'ALL' ? undefined : categoryFilter,
        limit: compact ? 5 : 50,
      });
      setBrainData(res);
    } catch (err) {
      console.warn('Failed to load Revenue Brain data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrainData();
  }, [categoryFilter, compact]);

  if (loading && !brainData) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 font-mono bg-slate-900/60 rounded-2xl border border-slate-800">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
        Evaluating Revenue Brain command layer...
      </div>
    );
  }

  const opportunities = brainData?.opportunities || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ------------------------------------------------------------------- */}
      {/* Header & Controls */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <Brain className="w-4 h-4 text-emerald-400" />
            <span className="tracking-widest uppercase font-bold">REVENUE DASHBOARD</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white font-display">
            Revenue Opportunities
          </h2>
          <p className="text-xs text-slate-400 font-light max-w-2xl">
            Prioritized view of payment recoveries, customers at risk, and growth opportunities.
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto p-1 bg-black/60 rounded-xl border border-white/[0.08] shrink-0">
          <button
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              categoryFilter === 'ALL' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Items ({brainData?.totalOpportunities || 0})
          </button>
          <button
            onClick={() => setCategoryFilter('RECOVERY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              categoryFilter === 'RECOVERY' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Recoveries ({brainData?.summary.recoveryCount || 0})
          </button>
          <button
            onClick={() => setCategoryFilter('CHURN_PREVENTION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              categoryFilter === 'CHURN_PREVENTION' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            At Risk ({brainData?.summary.churnCount || 0})
          </button>
          <button
            onClick={() => setCategoryFilter('EXPANSION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              categoryFilter === 'EXPANSION' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Growth ({brainData?.summary.expansionCount || 0})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Summary KPI Bar */}
      {/* ------------------------------------------------------------------- */}
      {brainData && !compact && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400">Total Revenue At Risk</div>
            <div className="text-xl font-bold text-white font-display tabular-nums">
              {formatCurrencyAmount(brainData.totalAtRiskCents, currency)}
            </div>
            <div className="text-[10px] text-slate-500">Failed payments + risk value</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400">Expected Recovery</div>
            <div className="text-xl font-bold text-emerald-400 font-display tabular-nums">
              {formatCurrencyAmount(brainData.totalRecoverableCents, currency)}
            </div>
            <div className="text-[10px] text-slate-500">Estimated recoverable amount</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400">Growth Opportunities</div>
            <div className="text-xl font-bold text-cyan-300 font-display tabular-nums">
              +{formatCurrencyAmount(brainData.totalExpansionValueCents, currency)}
            </div>
            <div className="text-[10px] text-slate-500">Potential expansion value</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400">Priority Items</div>
            <div className="text-xl font-bold text-white font-display tabular-nums flex items-center gap-2">
              <span>{brainData.totalOpportunities}</span>
              <span className="text-xs text-rose-400 font-mono">({brainData.summary.p1Count} Critical)</span>
            </div>
            <div className="text-[10px] text-slate-500">Automated analysis</div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Opportunities List */}
      {/* ------------------------------------------------------------------- */}
      <div className="space-y-3">
        {opportunities.length === 0 ? (
          <div className="py-4">
            <EmptyStateCard
              title="No Revenue Brain Opportunities Found"
              whatItDoes="Revenue Brain is your unified command layer aggregating Recovery Opportunities, Churn Risks, and Expansion Candidates into a single prioritized list."
              whyItMatters="Eliminates manual triage by prioritizing every revenue event deterministically by financial impact and confidence."
              whatToClickNext="Click 'Go to Providers' to connect Stripe/Razorpay or 'Run Scanner' to populate your revenue queue."
              actionLabel="Go to Providers"
              onAction={() => onNavigateTab && onNavigateTab('settings')}
              secondaryActionLabel="View Customers"
              onSecondaryAction={() => onNavigateTab && onNavigateTab('customers')}
              icon={Brain}
            />
          </div>
        ) : (
          opportunities.map((opp, idx) => {
            const isRecovery = opp.category === 'RECOVERY';
            const isChurn = opp.category === 'CHURN_PREVENTION';
            const isExpansion = opp.category === 'EXPANSION';

            return (
              <div
                key={opp.id}
                className="p-5 sm:p-6 rounded-2xl bg-[#050706] border border-white/[0.08] hover:border-emerald-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-5 group"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      #{idx + 1}
                    </span>

                    {/* Category Badge */}
                    <span
                      className={`text-[10px] font-mono px-2.5 py-0.5 rounded uppercase font-bold ${
                        isRecovery
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : isChurn
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                      }`}
                    >
                      {isRecovery ? 'PAYMENT RECOVERY' : isChurn ? 'CUSTOMER AT RISK' : 'GROWTH OPPORTUNITY'}
                    </span>

                    {/* Priority Tier Badge */}
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                        opp.priorityTier === 'P1_CRITICAL'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : opp.priorityTier === 'P2_HIGH'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : opp.priorityTier === 'P3_MEDIUM'
                          ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {opp.priorityTier === 'P1_CRITICAL'
                        ? 'CRITICAL'
                        : opp.priorityTier === 'P2_HIGH'
                        ? 'HIGH'
                        : opp.priorityTier === 'P3_MEDIUM'
                        ? 'MEDIUM'
                        : 'LOW'}
                    </span>

                    <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors font-display truncate">
                      {opp.customerName}
                    </h3>
                    {opp.customerEmail && (
                      <span className="text-xs font-mono text-slate-500 truncate">
                        · {opp.customerEmail}
                      </span>
                    )}
                  </div>

                  {/* Impact & Explanation */}
                  <div className="space-y-1">
                    <div className="text-xs text-slate-300 leading-relaxed font-sans">
                      {opp.rankingExplanation}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span className="text-emerald-400 font-semibold">
                        Revenue Impact: {opp.impactScore}/100
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span>Likelihood of Success: <strong className="text-slate-200 capitalize">{opp.confidence}</strong></span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span>Recommended Action: <strong className="text-indigo-300">{opp.recommendedAction}</strong></span>
                    </div>
                  </div>

                  {/* Verifiable Evidence */}
                  {opp.evidence && opp.evidence.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-400">
                      {opp.evidence.slice(0, 3).map((ev, eIdx) => (
                        <span key={eIdx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          • {ev}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Side: Financial Figure & Navigation */}
                <div className="flex items-center gap-5 shrink-0 justify-between md:justify-end border-t md:border-t-0 border-white/[0.06] pt-3 md:pt-0">
                  <div className="text-right">
                    <div className={`text-2xl font-bold font-display tabular-nums ${isExpansion ? 'text-cyan-300' : 'text-white'}`}>
                      {isExpansion ? '+' : ''}
                      {formatCurrencyAmount(opp.financialAmountCents, opp.currency || currency)}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">
                      {isRecovery ? 'AT-RISK VALUE' : isChurn ? 'ANNUAL ARR AT RISK' : 'EXPANSION POTENTIAL'}
                    </div>
                  </div>

                  {isRecovery && onSelectOpportunity ? (
                    <button
                      onClick={() => onSelectOpportunity(opp.sourceId)}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Review Case</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onNavigateTab && onNavigateTab('customers')}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>View Profile</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
