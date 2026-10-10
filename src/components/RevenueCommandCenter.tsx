import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  Clock,
  Layers,
  Sparkles,
  Zap,
  Send,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { api } from '../services/api.js';
import { Workspace } from '../types/index.js';
import { ChurnPreventionCenter } from './ChurnPreventionCenter.js';
import { ExpansionPlaybookCenter } from './ExpansionPlaybookCenter.js';
import { RevenueAutomationTimeline } from './RevenueAutomationTimeline.js';
import { useAdvancedMode } from '../lib/AdvancedModeContext.js';

interface RevenueCommandCenterProps {
  workspace: Workspace | null;
  currency: string;
  onNavigateTab: (tab: any) => void;
  onSelectOpportunity?: (id: string) => void;
  onQuickRecover?: (id: string) => Promise<void>;
  onOpenScanner?: () => void;
}

export const RevenueCommandCenter: React.FC<RevenueCommandCenterProps> = ({
  workspace,
  currency,
  onNavigateTab,
  onSelectOpportunity,
  onQuickRecover,
  onOpenScanner,
}) => {
  const { isAdvancedMode } = useAdvancedMode();
  const [orchestratorState, setOrchestratorState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubView, setActiveSubView] = useState<'overview' | 'churn' | 'expansion' | 'timeline'>('overview');
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const isINR = currency.toUpperCase() === 'INR';
  const sym = isINR ? '₹' : '$';

  const loadState = async () => {
    try {
      setLoading(true);
      const data = await api.getRevenueOrchestratorState();
      setOrchestratorState(data);
    } catch (err: any) {
      console.error('Failed to load state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, [workspace?.id]);

  const handleExecuteAction = async (actionId: string) => {
    setExecutingActionId(actionId);
    try {
      const res = await api.executeOrchestratorAction(actionId);
      setActionFeedback(res.message || 'Action completed successfully.');
      setTimeout(() => setActionFeedback(null), 4000);
      await loadState();
    } catch (err: any) {
      setActionFeedback(`Action failed: ${err.message || 'Error'}`);
    } finally {
      setExecutingActionId(null);
    }
  };

  const summary = orchestratorState?.summary || {
    totalRecoveredCents: 0,
    totalAtRiskCents: 0,
    totalProtectedRevenueCents: 0,
    totalExpansionPotentialCents: 0,
  };

  const brief = orchestratorState?.ceoDailyBrief || {
    statement: 'Welcome back. We are automatically monitoring your payment systems for missed revenue.',
    recoveredTodayFormatted: `${sym}0`,
    revenueAtRiskFormatted: `${sym}0`,
    expansionARRPotentialFormatted: `${sym}0`,
    customersAtRiskCount: 0,
    approvalsRequiredCount: 0,
  };

  const prioritizedActions = orchestratorState?.prioritizedActions || [];

  return (
    <div className="space-y-8 pb-16">
      {/* 1. RECOVERY OVERVIEW */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <h2 className="text-xl font-bold text-white tracking-tight">Recovery Dashboard</h2>
          <p className="text-sm text-slate-400 max-w-2xl">{brief.statement}</p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {brief.approvalsRequiredCount > 0 && (
              <button
                onClick={() => {
                  const urgent = prioritizedActions.find((a: any) => a.actionType === 'approve_manual_review');
                  if (urgent) handleExecuteAction(urgent.id);
                }}
                disabled={loading || !!executingActionId}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all cursor-pointer"
              >
                <span>Review {brief.approvalsRequiredCount} Pending Action{brief.approvalsRequiredCount === 1 ? '' : 's'}</span>
              </button>
            )}
            {onOpenScanner && isAdvancedMode && (
              <button
                onClick={onOpenScanner}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-white/[0.08] cursor-pointer"
              >
                <span>Manual Scan</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. THE 4 REVENUE ANSWERS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-5 shadow-md">
          <div className="text-xs text-slate-400">Money Recovered</div>
          <div className="mt-2 text-2xl font-bold text-white">{sym}{(summary.totalRecoveredCents / 100).toLocaleString('en-US')}</div>
        </div>
        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-5 shadow-md">
          <div className="text-xs text-slate-400">Money At Risk</div>
          <div className="mt-2 text-2xl font-bold text-amber-300">{sym}{(summary.totalAtRiskCents / 100).toLocaleString('en-US')}</div>
        </div>
        <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-5 shadow-md">
          <div className="text-xs text-slate-400">Saved Yearly Revenue</div>
          <div className="mt-2 text-2xl font-bold text-blue-200">{sym}{(summary.totalProtectedRevenueCents / 100).toLocaleString('en-US')}</div>
        </div>
        <div className="bg-slate-900 border border-purple-500/20 rounded-2xl p-5 shadow-md">
          <div className="text-xs text-slate-400">More Revenue Opportunity</div>
          <div className="mt-2 text-2xl font-bold text-purple-200">{sym}{(summary.totalExpansionPotentialCents / 100).toLocaleString('en-US')}</div>
        </div>
      </section>

      {/* 3. NAVIGATION TABS (OUTCOME-FIRST) */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-1 overflow-x-auto text-xs font-mono">
        <button
          onClick={() => setActiveSubView('overview')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer ${
            activeSubView === 'overview'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          Priority Actions ({prioritizedActions.length})
        </button>

        <button
          onClick={() => setActiveSubView('churn')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubView === 'churn'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Churn Prevention Center</span>
          {brief.customersAtRiskCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeSubView === 'churn' ? 'bg-slate-950 text-white' : 'bg-rose-500/20 text-rose-300'}`}>
              {brief.customersAtRiskCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubView('expansion')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubView === 'expansion'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Expansion Playbooks</span>
          {brief.expansionCandidatesCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeSubView === 'expansion' ? 'bg-slate-950 text-white' : 'bg-emerald-500/20 text-emerald-300'}`}>
              {brief.expansionCandidatesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubView('timeline')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer ${
            activeSubView === 'timeline'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          Revenue Automation Timeline
        </button>
      </div>

      {/* 4. SUB-VIEW CONTENT */}
      {activeSubView === 'overview' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Prioritized Revenue Actions (What Should Happen Next)</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Deterministic priority: Urgent → High → Medium
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400 font-mono">
              Evaluating live revenue state across Recovery, Retention, and Expansion...
            </div>
          ) : prioritizedActions.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-white/[0.06] space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">All Clear — Zero Pending Interventions</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No active payment failures, no distressed subscriptions, and all expansion plays are up to date.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {prioritizedActions.map((action: any) => {
                const isUrgent = action.priority === 'urgent';
                const isHigh = action.priority === 'high';
                const pillarBadge =
                  action.pillar === 'recovery'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : action.pillar === 'retention'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

                return (
                  <div
                    key={action.id}
                    className="bg-slate-900/90 border border-white/[0.08] hover:border-slate-700 rounded-2xl p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${pillarBadge}`}>
                          {action.pillar}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            isUrgent ? 'bg-rose-500/20 text-rose-300' : isHigh ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {action.priority}
                        </span>
                        <h4 className="text-sm font-bold text-white">{action.title}</h4>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{action.description}</p>

                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 pt-0.5">
                        <span className="text-slate-500">Supporting Evidence:</span>
                        <span>{action.evidence?.[0] || 'Verified system record'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Revenue Impact</div>
                        <div className="text-sm font-bold text-emerald-400 font-mono">
                          {action.revenueImpactFormatted}
                        </div>
                      </div>

                      <button
                        onClick={() => handleExecuteAction(action.id)}
                        disabled={executingActionId === action.id}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-sm shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                      >
                        {executingActionId === action.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Executing...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Take Action</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeSubView === 'churn' && (
        <ChurnPreventionCenter currency={currency} onExecuteAction={async () => { await loadState(); }} />
      )}

      {activeSubView === 'expansion' && (
        <ExpansionPlaybookCenter currency={currency} />
      )}

      {activeSubView === 'timeline' && (
        <RevenueAutomationTimeline
          timelineEvents={orchestratorState?.timelineEvents || []}
          revenueEvents={orchestratorState?.revenueEvents || []}
          currency={currency}
        />
      )}
    </div>
  );
};
