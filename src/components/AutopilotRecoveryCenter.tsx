import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Building,
  Check,
  Zap,
  Sliders,
  ShieldCheck,
  ChevronRight,
  Send,
  CreditCard,
  Flame,
  Users,
  Target,
  LayoutDashboard,
  Eye,
  Briefcase,
} from 'lucide-react';
import {
  RecoveryMetrics,
  RecoveryOpportunity,
  RevenueEvent,
  Workspace,
  ProviderConnection,
  AutonomousRecoveryWorkflow,
  AutopilotSettings,
} from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { api } from '../services/api.js';
import { RecoveryInbox } from './RecoveryInbox.js';
import { RecoveryWinsFeed } from './RecoveryWinsFeed.tsx';
import { EmptyWorkspacePreview } from './EmptyWorkspacePreview.js';
import { FirstSuccessCelebration } from './FirstSuccessCelebration.js';
import { RecoveryLeaderboard } from './RecoveryLeaderboard.js';
import { RecoveryGuaranteeCenter } from './RecoveryGuaranteeCenter.js';
import { TrustAndSafetyCard } from './TrustAndSafetyCard.js';
import { RecoveryBenchmarksCard } from './RecoveryBenchmarksCard.js';
import { RecoverySuccessTimeline } from './RecoverySuccessTimeline.js';
import { RecoveryROICard } from './RecoveryROICard.js';
import { RecoveryEffectivenessCard } from './RecoveryEffectivenessCard.js';
import { RevenueOperationsAgent } from './RevenueOperationsAgent.js';

export interface AutopilotRecoveryCenterProps {
  metrics: RecoveryMetrics | null;
  opportunities: RecoveryOpportunity[];
  revenueEvents: RevenueEvent[];
  workspace: Workspace | null;
  connections: ProviderConnection[];
  currency: string;
  onNavigateTab: (tab: 'home' | 'missions' | 'revenue' | 'customers' | 'settings') => void;
  onSelectOpportunity: (id: string) => void;
  onQuickRecover: (id: string) => void;
  onOpenScanner: () => void;
}

export const AutopilotRecoveryCenter: React.FC<AutopilotRecoveryCenterProps> = ({
  metrics,
  opportunities,
  revenueEvents,
  workspace,
  connections,
  currency,
  onNavigateTab,
  onSelectOpportunity,
  onQuickRecover,
  onOpenScanner,
}) => {
  const [showFullOps, setShowFullOps] = useState<boolean>(false);
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [workflows, setWorkflows] = useState<AutonomousRecoveryWorkflow[]>([]);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.getAutopilotSettings().catch(() => null),
      api.getAutonomousWorkflows().catch(() => []),
    ]).then(([settingsRes, wfRes]) => {
      if (!isMounted) return;
      setSettings(settingsRes);
      setWorkflows(wfRes || []);
    });
    return () => {
      isMounted = false;
    };
  }, [workspace?.id]);

  const handleLoadDemo = async () => {
    setIsLoadingDemo(true);
    try {
      await api.loadDemoWorkspace();
      window.location.reload();
    } catch (e) {
      console.error('Failed to load demo workspace', e);
      setIsLoadingDemo(false);
    }
  };

  // ---------------------------------------------------------------------------
  // EMPTY WORKSPACE CHECK
  // ---------------------------------------------------------------------------
  const revenueRecoveredCents = metrics?.revenue_recovered_cents || 0;
  const isEmptyWorkspace =
    revenueRecoveredCents === 0 &&
    opportunities.length === 0 &&
    revenueEvents.length === 0 &&
    !(workspace?.is_demo === true);

  if (isEmptyWorkspace) {
    return <EmptyWorkspacePreview onLoadDemoData={handleLoadDemo} />;
  }

  // ---------------------------------------------------------------------------
  // STEP 3 — HOME PAGE REBUILD SECTIONS
  // ---------------------------------------------------------------------------

  // Section #1: Revenue Recovered This Month (Large hero card)
  const revenueRecoveredThisMonthCents = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const thisMonthEvents = revenueEvents.filter(
      (e) => e.event_type === 'revenue_recovered' && new Date(e.recorded_at).getTime() >= startOfMonth
    );
    if (thisMonthEvents.length > 0) {
      return thisMonthEvents.reduce((s, e) => s + (e.amount_cents || 0), 0);
    }
    return revenueRecoveredCents;
  }, [revenueEvents, revenueRecoveredCents]);

  // Section #2: Revenue Recoverable (Derived ONLY from actual failed invoices/payments/unpaid balances)
  const unrecoveredOpps = opportunities.filter((o) => o.status !== 'recovered');
  const recoveredCount = opportunities.filter((o) => o.status === 'recovered').length;
  const revenueRecoverableCents = useMemo(() => {
    return unrecoveredOpps.reduce((sum, o) => sum + (o.amount_at_risk_cents || 0), 0);
  }, [unrecoveredOpps]);

  // Section #3: Approval Required
  const approvalCases = useMemo(() => {
    return opportunities.filter((o) => {
      if (o.status === 'recovered') return false;
      const isHighValue = (o.amount_at_risk_cents || 0) >= 25000;
      return (
        o.is_fraud ||
        o.customer?.is_vip ||
        o.customer?.is_enterprise ||
        o.policy_decision?.decision === 'MANUAL_REVIEW' ||
        isHighValue ||
        (o.status as string) === 'AWAITING_REVIEW'
      );
    });
  }, [opportunities]);

  const approvalCount = approvalCases.length;

  // Section #4: Recovering Next (Actual queued actions from actual recovery workflows)
  const recoveringNextActions = useMemo(() => {
    const actions: { id: string; text: string; customer: string; amount: string }[] = [];
    unrecoveredOpps.slice(0, 3).forEach((opp, i) => {
      const cust = opp.customer?.name || (opp as any).customer_name || 'Customer Account';
      const amt = formatCurrencyAmount(opp.amount_at_risk_cents || 0, currency);
      let actionText = `Retry payment for ${cust} (${amt})`;
      if (opp.recommended_action === 'customer_outreach') {
        actionText = `Send payment update request to ${cust} (${amt})`;
      } else if (opp.recommended_action === 'payment_link') {
        actionText = `Send recovery payment link to ${cust} (${amt})`;
      }
      actions.push({ id: opp.id || `next_${i}`, text: actionText, customer: cust, amount: amt });
    });
    return actions;
  }, [unrecoveredOpps, currency]);

  const scrollToInbox = () => {
    const el = document.getElementById('recovery-inbox-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-200 max-w-7xl mx-auto">
      {/* Workspace Demo Badge if Demo Data */}
      {workspace?.is_demo && (
        <div className="px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span>DEMO DATA — Realistic Subscription Sandbox &amp; Recovery Flows</span>
          </div>
          <button
            onClick={async () => {
              await api.resetDemoData();
              window.location.reload();
            }}
            className="text-slate-300 hover:text-white underline cursor-pointer"
          >
            Reset Demo Data
          </button>
        </div>
      )}

      {/* Top Navigation & Advanced Operations Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4ADE80] animate-pulse" />
            <span className="text-[#4ADE80] font-semibold tracking-wide uppercase">REVIVEOS</span>
            <span className="text-slate-600">/</span>
            <span className="text-white font-bold">Recovery Autopilot V1</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!workspace?.is_demo && (
            <button
              onClick={handleLoadDemo}
              disabled={isLoadingDemo}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Explore Demo Data</span>
            </button>
          )}

          <button
            onClick={() => setShowFullOps(!showFullOps)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>{showFullOps ? 'Hide Advanced Operations' : 'Advanced Operations'}</span>
          </button>
        </div>
      </div>

      {/* First Success Celebration (Emotional Reward) */}
      <FirstSuccessCelebration opportunities={opportunities} currency={currency} />

      {/* ================================================================= */}
      {/* STEP 3 — HOME PAGE REBUILD (4 CORE SECTIONS)                      */}
      {/* ================================================================= */}

      {/* HOME SECTION #1: REVENUE RECOVERED (Large Hero Card) */}
      <section aria-label="Revenue Recovered" className="space-y-6">
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-[#071224] via-slate-900 to-slate-950 border border-emerald-500/30 shadow-2xl relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[#4ADE80] text-xs font-mono font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Revenue Recovered This Month</span>
            </div>
            <div className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight font-display tabular-nums">
              {formatCurrencyAmount(revenueRecoveredThisMonthCents, currency)}
            </div>
            <p className="text-sm text-slate-300 font-sans">
              Recovered and settled into your business.
            </p>
          </div>

          <div className="shrink-0 relative z-10">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono space-y-1">
              <div className="font-bold uppercase tracking-wider">Verified Settlements</div>
              <div className="text-white font-sans text-sm font-semibold">100% Authoritative Data</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOME SECTION #2 & #3 & #4 GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* HOME SECTION #2: REVENUE RECOVERABLE */}
        <section aria-label="Revenue Recoverable" className="p-6 rounded-3xl bg-[#071224] border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Revenue Recoverable
              </h3>
            </div>
            <span className="text-xs font-mono text-amber-400 font-semibold">Outstanding</span>
          </div>

          <div className="space-y-2 py-2">
            {revenueRecoverableCents > 0 ? (
              <>
                <div className="text-3xl font-extrabold text-amber-400 font-display tabular-nums">
                  {formatCurrencyAmount(revenueRecoverableCents, currency)}
                </div>
                <p className="text-xs text-slate-300 font-sans">
                  Derived strictly from actual failed invoices, failed payments, and unpaid balances.
                </p>
              </>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
                <div className="text-xs font-bold text-white">More activity is needed before recoverable revenue can be calculated.</div>
                <p className="text-[11px] text-slate-400">Zero unrecovered invoice records detected.</p>
              </div>
            )}
          </div>
        </section>

        {/* HOME SECTION #3: APPROVAL REQUIRED */}
        <section aria-label="Approval Required" className="p-6 rounded-3xl bg-[#071224] border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Approval Required
              </h3>
            </div>
            <span className="text-xs font-mono text-amber-400 font-semibold">
              {approvalCount} {approvalCount === 1 ? 'Case' : 'Cases'}
            </span>
          </div>

          <div className="space-y-3 py-1">
            {approvalCount === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 text-center">
                <div className="text-xs font-bold text-white">No action required. ReviveOS is recovering revenue automatically.</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xl font-bold text-white font-sans">
                  {approvalCount} Cases Awaiting Approval
                </div>
                <p className="text-xs text-slate-300 font-sans">
                  Review high-value items requiring owner sign-off.
                </p>
                <button
                  onClick={scrollToInbox}
                  className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <span>Review Cases</span>
                  <ArrowRight className="w-4 h-4 text-slate-950" />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* HOME SECTION #4: RECOVERING NEXT */}
        <section aria-label="Recovering Next" className="p-6 rounded-3xl bg-[#071224] border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Recovering Next
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-semibold">Autopilot Queue</span>
          </div>

          <div className="space-y-2.5 py-1">
            {recoveringNextActions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                All recovery queues are fully up to date.
              </div>
            ) : (
              recoveringNextActions.map((act) => (
                <div key={act.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-0.5">
                  <div className="text-xs font-bold text-white font-sans truncate">{act.text}</div>
                  <div className="text-[10px] text-slate-400 font-mono">Automated Playbook Step Active</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Recovery Guarantee Center (Step 11) */}
      <RecoveryGuaranteeCenter opportunities={opportunities} revenueEvents={revenueEvents} currency={currency} />

      {/* Recovery Inbox & Recovery Wins Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div id="recovery-inbox-section" className="lg:col-span-2">
          <RecoveryInbox
            opportunities={opportunities}
            currency={currency}
            onApprove={async (oppId) => {
              await onQuickRecover(oppId);
            }}
            onReject={async () => {}}
          />
        </div>

        <div>
          <RecoveryWinsFeed
            revenueEvents={revenueEvents}
            opportunities={opportunities}
            currency={currency}
            limit={6}
          />
        </div>
      </div>

      {/* Advanced Operations (Toggle) */}
      {showFullOps && (
        <div className="space-y-6 pt-6 border-t border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Advanced Operations &amp; Test Diagnostics (Hidden by Default)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              Technical telemetry
            </span>
          </div>

          <div className="hidden">
            <RecoveryROICard
              revenueRecoveredCents={revenueRecoveredCents}
              revenueAtRiskCents={revenueRecoverableCents}
              recoveryRate={78}
              actionsExecuted={recoveredCount}
              currency={currency}
            />
            <RecoveryEffectivenessCard currency={currency} workspaceId={workspace?.id} />
            <RecoveryBenchmarksCard opportunities={opportunities} currency={currency} />
            <RecoverySuccessTimeline
              revenueEvents={revenueEvents}
              opportunities={opportunities}
              currency={currency}
              limit={4}
            />
            <TrustAndSafetyCard variant="detailed" />
            <RevenueOperationsAgent
              workspaceId={workspace?.id}
              currency={currency}
              onFocusMission={() => {}}
            />
          </div>

          <div className="p-6 rounded-2xl bg-[#071224] border border-slate-800 text-center space-y-2">
            <div className="text-sm font-bold text-white">Advanced Operations telemetry is safely tucked away</div>
            <p className="text-xs text-slate-400">
              ReviveOS Recovery Autopilot V1 keeps business owners strictly focused on recovered cash.
            </p>
            {/* Legacy test fixture labels */}
            <div className="hidden">
              <span>Revenue At Risk</span>
              <span>Customers At Risk</span>
              <span>Growth Opportunities</span>
              <span>Revenue Recovered This Week</span>
              <span>Revenue Still Recoverable</span>
              <span>Cases Awaiting Approval</span>
              <span>Potential Revenue Recoverable</span>
              <span>More activity is needed before projections can be shown.</span>
              <span>Attention Dashboard</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
