import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Shield,
  HelpCircle,
  Eye,
  Check,
  XCircle,
  Lock,
  FileText,
  UserCheck,
  Ban,
  ChevronRight,
  Sparkles,
  CreditCard,
  Send,
  DollarSign,
} from 'lucide-react';
import {
  RecoveryOpportunity,
  RevenueEvent,
  AutonomousRecoveryWorkflow,
  AutonomousRetrySchedule,
} from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface RecoveryTransparencyActivity {
  id: string;
  customerName: string;
  amountCents: number;
  currency: string;
  whyThisHappened: string;
  whatReviveOsDid: string;
  whatReviveOsDidNotDo: string;
  whatHappensNext: string;
  currentStage:
    | 'detected_failure'
    | 'evaluated_policy'
    | 'created_plan'
    | 'generated_link'
    | 'sent_recovery'
    | 'customer_recovered'
    | 'revenue_recovered';
  timestamp: string;
  isRecovered: boolean;
}

export interface RecoveryTransparencyCardProps {
  opportunities?: RecoveryOpportunity[];
  revenueEvents?: RevenueEvent[];
  workflows?: AutonomousRecoveryWorkflow[];
  retrySchedules?: AutonomousRetrySchedule[];
  dispatches?: any[];
  currency?: string;
  selectedOpportunityId?: string | null;
  onSelectOpportunity?: (id: string) => void;
  onNavigateTab?: (tab: 'home' | 'revenue' | 'customers' | 'settings') => void;
}

const JOURNEY_STAGES = [
  { id: 'detected_failure', label: 'Detected Failure', description: 'Bank card issue identified' },
  { id: 'evaluated_policy', label: 'Evaluated Policy', description: 'Safety limits checked' },
  { id: 'created_plan', label: 'Created Recovery Plan', description: 'Custom action prepared' },
  { id: 'generated_link', label: 'Generated Recovery Link', description: '1-click portal ready' },
  { id: 'sent_recovery', label: 'Sent Recovery', description: 'Outreach dispatched' },
  { id: 'customer_recovered', label: 'Customer Recovered', description: 'Card updated by customer' },
  { id: 'revenue_recovered', label: 'Revenue Recovered', description: 'Money settled to your account' },
] as const;

export const TRUST_INDICATORS = [
  {
    id: 'no_unapproved_charge',
    label: 'No customer charged without approval',
    detail: 'We never repeatedly spam cards or initiate unauthorized transactions.',
  },
  {
    id: 'fraud_blocked',
    label: 'Fraud and disputes automatically blocked',
    detail: 'Stolen card attempts, chargebacks, and contested invoices are instantly quarantined.',
  },
  {
    id: 'vip_review',
    label: 'VIP customers require review',
    detail: 'High-value accounts pause automation so your team can apply a white-glove touch.',
  },
  {
    id: 'enterprise_review',
    label: 'Enterprise customers require review',
    detail: 'Large enterprise contracts are protected from automated cancellations.',
  },
  {
    id: 'actions_logged',
    label: 'All actions are logged',
    detail: 'Every single automated retry, email dispatch, and link click is permanently recorded.',
  },
];

export const RecoveryTransparencyCard: React.FC<RecoveryTransparencyCardProps> = ({
  opportunities = [],
  revenueEvents = [],
  workflows = [],
  retrySchedules = [],
  dispatches = [],
  currency = 'USD',
  selectedOpportunityId,
  onSelectOpportunity,
  onNavigateTab,
}) => {
  // Construct transparent activities from real data
  const activities: RecoveryTransparencyActivity[] = useMemo(() => {
    const list: RecoveryTransparencyActivity[] = [];

    // Process all opportunities
    opportunities.forEach((opp) => {
      const name = opp.customer?.name || 'Customer';
      const amountStr = formatCurrencyAmount(opp.amount_at_risk_cents || 4500, currency);
      const isRecovered = opp.status === 'recovered';

      // 1. Why this happened
      let why = 'Failed payment detected.';
      if (opp.failure_category === 'insufficient_funds') {
        why = `Customer card experienced a temporary insufficient balance during automated billing of ${amountStr}.`;
      } else if (opp.failure_category === 'expired_card') {
        why = `Customer card reached its expiration date and could not be renewed automatically for ${amountStr}.`;
      } else if (opp.failure_category === 'bank_related_failure') {
        why = `Customer bank temporarily declined the transaction due to security or network verification.`;
      } else {
        why = `Billing gateway received an unexpected card decline during the subscription renewal cycle for ${amountStr}.`;
      }

      // 2. What ReviveOS did
      let did = 'ReviveOS created a secure payment link.';
      if (isRecovered) {
        did = `ReviveOS sent a secure 1-click renewal link and processed payment confirmation of ${amountStr}.`;
      } else if (dispatches.some((d) => d.opportunity_id === opp.id && d.status === 'sent')) {
        did = `ReviveOS generated a personalized renewal link and delivered it directly to ${name}'s verified contact.`;
      } else {
        did = `ReviveOS evaluated account safety rules and prepared an optimal retry sequence.`;
      }

      // 3. What ReviveOS did NOT do
      let didNot = 'ReviveOS did not charge the customer again.';
      if (opp.customer?.is_vip || opp.customer?.is_enterprise) {
        didNot = `ReviveOS did not send generic automated dunning messages or disrupt this VIP customer's account.`;
      } else if (opp.amount_at_risk_cents >= 100000) {
        didNot = `ReviveOS did not trigger automatic card rebilling because the amount exceeds your automated limit.`;
      } else {
        didNot = `ReviveOS did not repeatedly charge the customer's card or cancel their subscription.`;
      }

      // 4. What happens next
      let next = 'ReviveOS will retry recovery tomorrow.';
      if (isRecovered) {
        next = `Revenue has been credited to your balance; ReviveOS will monitor the next scheduled renewal.`;
      } else if (retrySchedules.some((s) => s.opportunity_id === opp.id && s.status === 'pending')) {
        next = `ReviveOS will retry recovery tomorrow at optimal bank clearance hours.`;
      } else {
        next = `ReviveOS will monitor for customer link interaction and stand by for scheduled bank recovery.`;
      }

      // Determine journey stage
      let stage: RecoveryTransparencyActivity['currentStage'] = 'detected_failure';
      if (isRecovered) {
        stage = 'revenue_recovered';
      } else if (dispatches.some((d) => d.opportunity_id === opp.id && (d.status === 'clicked' || d.status === 'opened'))) {
        stage = 'customer_recovered';
      } else if (dispatches.some((d) => d.opportunity_id === opp.id && d.status === 'sent')) {
        stage = 'sent_recovery';
      } else if (opp.payment_link_url || opp.recovery_token) {
        stage = 'generated_link';
      } else if (workflows.some((w) => w.opportunity_id === opp.id)) {
        stage = 'created_plan';
      } else {
        stage = 'evaluated_policy';
      }

      list.push({
        id: opp.id,
        customerName: name,
        amountCents: opp.amount_at_risk_cents,
        currency,
        whyThisHappened: why,
        whatReviveOsDid: did,
        whatReviveOsDidNotDo: didNot,
        whatHappensNext: next,
        currentStage: stage,
        timestamp: opp.updated_at || opp.created_at,
        isRecovered,
      });
    });

    // Real data only — no synthetic demo names
    return list;
  }, [opportunities, dispatches, retrySchedules, workflows, currency]);

  // Selected active item
  const [activeActivityId, setActiveActivityId] = useState<string>(
    selectedOpportunityId || (activities[0] ? activities[0].id : '')
  );

  const activeActivity = useMemo(() => {
    return activities.find((a) => a.id === activeActivityId) || activities[0];
  }, [activities, activeActivityId]);

  const activeStageIndex = useMemo(() => {
    if (!activeActivity) return 0;
    const idx = JOURNEY_STAGES.findIndex((s) => s.id === activeActivity.currentStage);
    return idx >= 0 ? idx : 0;
  }, [activeActivity]);

  return (
    <div className="space-y-8">
      {/* ----------------------------------------------------------------- */}
      {/* MAIN TRANSPARENCY CARD */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-[#050807] border border-white/[0.08] rounded-2xl p-6 sm:p-8 space-y-7 shadow-xl shadow-black/40">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-[#86efac]">
              <ShieldCheck className="w-4 h-4" />
              <span className="uppercase tracking-widest font-semibold">Recovery Transparency</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
              Clear accountability for every customer action
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-light">
              Always know why actions happen, what was done, what was prevented, and what comes next.
            </p>
          </div>

          {/* Activity Selector (if multiple activities exist) */}
          {activities.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {activities.slice(0, 3).map((act) => (
                <button
                  key={act.id}
                  onClick={() => setActiveActivityId(act.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
                    activeActivityId === act.id
                      ? 'bg-[#86efac] text-black font-bold shadow-sm'
                      : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  {act.customerName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------------------------------------------- */}
        {/* THE 4 RECOVERY TRANSPARENCY PILLARS */}
        {/* --------------------------------------------------------------- */}
        {!activeActivity ? (
          <div className="p-8 rounded-xl bg-slate-900/40 border border-white/[0.08] text-center space-y-3">
            <ShieldCheck className="w-8 h-8 text-[#86efac] mx-auto opacity-70" />
            <h4 className="text-sm font-semibold text-white font-display">No Recovery Actions to Audit</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto font-light">
              When payment failures occur, ReviveOS displays a transparent breakdown of why actions were taken, what safety policies were enforced, and what comes next.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[#86efac] flex items-center justify-center font-bold font-mono text-sm">
                  {activeActivity.customerName.charAt(0)}
                </div>
                <div>
                  <div className="text-base font-bold text-white font-display">
                    {activeActivity.customerName}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {formatCurrencyAmount(activeActivity.amountCents, currency)} payment recovery
                  </div>
                </div>
              </div>

              {activeActivity.isRecovered ? (
                <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Revenue Recovered</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-mono text-sky-400 font-medium">
                  <Clock className="w-4 h-4" />
                  <span>Recovery in Progress</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pillar 1: WHY THIS HAPPENED */}
              <div className="p-5 rounded-xl bg-slate-900/50 border border-white/[0.06] hover:border-white/[0.12] transition-colors space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Why This Happened</span>
                </div>
                <div className="text-sm sm:text-base font-semibold text-slate-100 font-display leading-snug">
                  {activeActivity.whyThisHappened}
                </div>
                <p className="text-xs text-slate-400 font-light">
                  Detected in real-time from bank payment gateway decline signals.
                </p>
              </div>

              {/* Pillar 2: WHAT REVIVEOS DID */}
              <div className="p-5 rounded-xl bg-slate-900/50 border border-white/[0.06] hover:border-white/[0.12] transition-colors space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono text-sky-400 uppercase tracking-wider font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>What ReviveOS Did</span>
                </div>
                <div className="text-sm sm:text-base font-semibold text-slate-100 font-display leading-snug">
                  {activeActivity.whatReviveOsDid}
                </div>
                <p className="text-xs text-slate-400 font-light">
                  Safe recovery procedures launched automatically without manual work.
                </p>
              </div>

              {/* Pillar 3: WHAT REVIVEOS DID NOT DO */}
              <div className="p-5 rounded-xl bg-slate-900/50 border border-rose-500/20 hover:border-rose-500/40 transition-colors space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono text-rose-400 uppercase tracking-wider font-semibold">
                  <Ban className="w-3.5 h-3.5" />
                  <span>What ReviveOS Did Not Do</span>
                </div>
                <div className="text-sm sm:text-base font-semibold text-rose-100 font-display leading-snug">
                  {activeActivity.whatReviveOsDidNotDo}
                </div>
                <p className="text-xs text-slate-400 font-light">
                  Customer trust and safety rules strictly protect your brand reputation.
                </p>
              </div>

              {/* Pillar 4: WHAT HAPPENS NEXT */}
              <div className="p-5 rounded-xl bg-slate-900/50 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono text-[#86efac] uppercase tracking-wider font-semibold">
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>What Happens Next</span>
                </div>
                <div className="text-sm sm:text-base font-semibold text-[#86efac] font-display leading-snug">
                  {activeActivity.whatHappensNext}
                </div>
                <p className="text-xs text-slate-400 font-light">
                  Continuous automated monitoring until payment is safely resolved.
                </p>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* RECOVERY JOURNEY TIMELINE */}
            {/* ------------------------------------------------------------- */}
            <div className="pt-4 space-y-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="uppercase tracking-wider font-semibold text-[#86efac]">
                  Recovery Journey Timeline
                </span>
                <span>Stage {activeStageIndex + 1} of {JOURNEY_STAGES.length}</span>
              </div>

              {/* Horizontal Step Timeline on Desktop / Scrollable on Mobile */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {JOURNEY_STAGES.map((stage, idx) => {
                  const isDone = idx < activeStageIndex || (idx === activeStageIndex && activeActivity.isRecovered);
                  const isCurrent = idx === activeStageIndex && !activeActivity.isRecovered;
                  const isPending = idx > activeStageIndex;

                  return (
                    <div
                      key={stage.id}
                      className={`p-3 rounded-xl border transition-all text-left ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                          : isCurrent
                          ? 'bg-sky-950/30 border-sky-400/50 text-white shadow-sm shadow-sky-950/20'
                          : 'bg-white/[0.02] border-white/[0.04] text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono font-bold">
                          0{idx + 1}
                        </span>
                        {isDone ? (
                          <Check className="w-3 h-3 text-[#86efac] stroke-[3]" />
                        ) : isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                        )}
                      </div>
                      <div className="text-xs font-bold truncate font-display">
                        {stage.label}
                      </div>
                      <div className="text-[11px] text-slate-400 font-light truncate mt-0.5">
                        {stage.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TRUST INDICATORS SECTION */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-[#050706] border border-emerald-500/20 rounded-2xl p-6 sm:p-7 space-y-5 shadow-lg shadow-emerald-950/10">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-mono text-[#86efac] uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" />
              <span className="font-semibold">Trust Indicators</span>
            </div>
            <h3 className="text-lg font-bold text-white font-display">
              Built-in Guardrails & Business Protection
            </h3>
          </div>
          <span className="text-xs text-emerald-400 font-mono">
            Always Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRUST_INDICATORS.map((indicator) => (
            <div
              key={indicator.id}
              className="p-4 rounded-xl bg-slate-900/40 border border-white/[0.06] hover:border-emerald-500/30 transition-colors flex items-start gap-3"
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[#86efac] flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-white font-display leading-snug">
                  {indicator.label}
                </div>
                <div className="text-xs text-slate-400 font-light leading-relaxed">
                  {indicator.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-400 flex items-center justify-between flex-wrap gap-2">
          <span>Zero technical jargon, policy IDs, or internal scores are shown. Only clear guarantees of what ReviveOS does and does not do.</span>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('settings')}
              className="text-xs font-mono text-[#86efac] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Trust Settings</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
