import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Shield,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  Copy,
  ExternalLink,
  Pause,
  Play,
  Flame,
  MessageSquare,
  DollarSign,
  TrendingUp,
  User,
  Calendar,
  Building,
  Sparkles,
  Mail,
  Smartphone,
  ChevronRight,
  Info,
  Check,
  Zap,
} from 'lucide-react';
import {
  RecoveryOpportunity,
  RecoveryEvent,
  CustomerTimelineEvent,
  OpportunityIntelligenceRecord,
  OpportunityEvidenceItem,
  CopilotRecoveryPlan,
  CopilotExecutionLog,
  CopilotStep,
  ExpansionOpportunityRecord,
} from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { calculateAnnualEquivalent } from '../utils/subscription.js';
import { api } from '../services/api.js';
import { OpportunityDecisionCard } from './OpportunityDecisionCard.js';

interface OpportunityDetailsViewProps {
  opportunityId: string;
  currency: string;
  onBack: () => void;
  onNavigateToTimeline?: (customerId?: string) => void;
  onOpenEmailModal?: (opp: RecoveryOpportunity) => void;
  onShowToast: (title: string, desc: string, type?: 'success' | 'info') => void;
  onRefreshData?: () => void;
  onUpdate?: () => void;
}

export const OpportunityDetailsView: React.FC<OpportunityDetailsViewProps> = ({
  opportunityId,
  currency,
  onBack,
  onNavigateToTimeline,
  onOpenEmailModal,
  onShowToast,
  onRefreshData,
  onUpdate,
}) => {
  const triggerRefresh = () => {
    onRefreshData?.();
    onUpdate?.();
  };
  const [opportunity, setOpportunity] = useState<(RecoveryOpportunity & { events?: RecoveryEvent[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notes, setNotes] = useState<CustomerTimelineEvent[]>([]);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [retryPaymentLinkUrl, setRetryPaymentLinkUrl] = useState<string | null>(null);
  const [retryProviderCheckoutId, setRetryProviderCheckoutId] = useState<string | null>(null);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('High-value Enterprise account at risk of involuntary churn.');
  const [magicLinkChannel, setMagicLinkChannel] = useState<'email' | 'sms'>('email');
  const [copilotPlan, setCopilotPlan] = useState<CopilotRecoveryPlan | null>(null);
  const [copilotLogs, setCopilotLogs] = useState<CopilotExecutionLog[]>([]);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [workflowExecuting, setWorkflowExecuting] = useState(false);
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [intelligence, setIntelligence] = useState<OpportunityIntelligenceRecord | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [expansionRecord, setExpansionRecord] = useState<ExpansionOpportunityRecord | null>(null);

  const loadExpansionData = async (customerId?: string) => {
    if (!customerId) return;
    try {
      const res = await api.getExpansionQueue();
      if (res && Array.isArray(res.queue)) {
        const rec = res.queue.find((r: any) => r.customerId === customerId);
        setExpansionRecord(rec || null);
      }
    } catch (e) {
      console.warn('Failed to load expansion intelligence', e);
    }
  };

  const loadIntelligenceData = async () => {
    try {
      setIntelligenceLoading(true);
      const data = await api.getOpportunityIntelligence(opportunityId);
      setIntelligence(data);
    } catch (err) {
      console.warn('Failed to load opportunity intelligence', err);
      setIntelligence(null);
    } finally {
      setIntelligenceLoading(false);
    }
  };

  const loadCopilotData = async () => {
    try {
      setCopilotLoading(true);
      const [plan, logs] = await Promise.all([
        api.getCopilotPlan(opportunityId),
        api.getCopilotLogs(opportunityId),
      ]);
      setCopilotPlan(plan);
      setCopilotLogs(logs);
    } catch (err) {
      console.warn('Failed to load copilot plan', err);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleExecuteCopilotStep = async (stepId: string) => {
    try {
      setExecutingStepId(stepId);
      const res = await api.executeCopilotStep(opportunityId, stepId);
      onShowToast(res.success ? 'Copilot Step Succeeded' : 'Step Execution Notice', res.message);
      await loadCopilotData();
      await loadOpportunityData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Execution Error', err.message || 'Failed to execute copilot step', 'info');
    } finally {
      setExecutingStepId(null);
    }
  };

  const handleApproveCopilotPlan = async () => {
    try {
      setCopilotLoading(true);
      const updated = await api.approveCopilotPlan(opportunityId);
      setCopilotPlan(updated);
      onShowToast('Plan Approved', 'Recovery plan successfully approved for execution.');
      await loadCopilotData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Approval Error', err.message || 'Failed to approve plan', 'info');
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleRejectCopilotPlan = async () => {
    try {
      setCopilotLoading(true);
      const updated = await api.rejectCopilotPlan(opportunityId, 'Rejected by operator in console');
      setCopilotPlan(updated);
      onShowToast('Plan Rejected', 'Recovery plan has been rejected.');
      await loadCopilotData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Rejection Error', err.message || 'Failed to reject plan', 'info');
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleExecuteWorkflow = async () => {
    try {
      setWorkflowExecuting(true);
      const res = await api.executeCopilotWorkflow(opportunityId);
      onShowToast('Workflow Finished', res.message);
      await loadCopilotData();
      await loadOpportunityData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Workflow Error', err.message || 'Failed to execute workflow', 'info');
    } finally {
      setWorkflowExecuting(false);
    }
  };

  const loadOpportunityData = async () => {
    try {
      setLoading(true);
      const data = await api.getOpportunity(opportunityId);
      setOpportunity(data);
      if (data.customer_id) {
        const timeline = await api.getCustomerTimeline(data.customer_id);
        const noteEvents = timeline.filter((e) => e.event_type === 'note_added' || e.title.includes('Note'));
        setNotes(noteEvents);
        loadExpansionData(data.customer_id);
      }
    } catch (err: any) {
      console.error('Failed to load opportunity details', err);
      onShowToast('Error', err.message || 'Failed to load case details', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opportunityId) {
      loadOpportunityData();
      loadCopilotData();
      loadIntelligenceData();
    }
  }, [opportunityId]);

  if (loading || !opportunity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400 space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-sm font-medium">Loading Recovery Command Center...</p>
      </div>
    );
  }

  const customer = opportunity.customer;
  const failure = opportunity.payment_failure;
  const subscription = opportunity.subscription;
  const invoice = opportunity.invoice;

  const isRecovered = opportunity.status === 'recovered';
  const isPaused = opportunity.status === 'paused';
  const isEscalated = opportunity.status === 'escalated';

  const amountFormatted = formatCurrencyAmount(opportunity.amount_at_risk_cents, opportunity.currency || currency);
  const arrPreservedFormatted = subscription && subscription.amount_cents != null
    ? formatCurrencyAmount(calculateAnnualEquivalent(subscription.amount_cents, subscription.billing_interval, subscription.custom_interval_count, subscription.custom_interval_unit), subscription.currency || opportunity.currency || currency)
    : 'Not available';
  const ltvFormatted = customer?.lifetime_value_cents != null
    ? formatCurrencyAmount(customer.lifetime_value_cents, customer.currency || opportunity.currency || currency)
    : 'Not available';
  const recoveredAmountFormatted = formatCurrencyAmount(opportunity.recovered_amount_cents || 0, opportunity.currency || currency);

  const recoveryUrl = `${window.location.origin}/pay/${opportunity.recovery_token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(recoveryUrl);
    setCopiedLink(true);
    onShowToast('Payment Link Copied', 'Tokenized 1-click recovery URL copied to clipboard');
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleRetry = async () => {
    try {
      setActionLoading('retry');
      const res: any = await api.retryPayment(opportunity.id);
      if (res.paymentLinkUrl) {
        setRetryPaymentLinkUrl(res.paymentLinkUrl);
        setRetryProviderCheckoutId(res.providerCheckoutId || null);
        onShowToast('Razorpay Payment Link Ready', 'Real Razorpay Payment Link generated successfully.');
      } else {
        onShowToast(res.success ? 'Smart Retry Executed' : 'Retry Notice', res.message || 'Retry completed');
      }
      await loadOpportunityData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Retry Failed', err.message || 'Provider communication error', 'info');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSettle = async () => {
    try {
      setActionLoading('settle');
      const res = await api.settlePayment(opportunity.id, 'manual_staff_intervention');
      onShowToast('Revenue Recovered', res.message);
      await loadOpportunityData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Settlement Error', err.message || 'Failed to settle payment', 'info');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async () => {
    try {
      setActionLoading('pause');
      const res = await api.pauseOpportunity(opportunity.id);
      onShowToast('Recovery Paused', res.message);
      await loadOpportunityData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Action Error', err.message || 'Failed to pause recovery', 'info');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEscalate = async () => {
    try {
      setActionLoading('escalate');
      const res = await api.escalateOpportunity(opportunity.id, escalateReason);
      onShowToast('Case Escalated', res.message);
      setShowEscalateModal(false);
      await loadOpportunityData();
      triggerRefresh();
    } catch (err: any) {
      onShowToast('Escalation Error', err.message || 'Failed to escalate case', 'info');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendMagicLink = async () => {
    try {
      setActionLoading('magic-link');
      const res = await api.sendMagicLink(opportunity.id, magicLinkChannel);
      onShowToast('Magic Link Dispatched', res.message);
      await loadOpportunityData();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      onShowToast('Dispatch Error', err.message || 'Failed to dispatch magic link', 'info');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !customer) return;

    try {
      setSubmittingNote(true);
      const noteEvent = await api.addCustomerNote(customer.id, newNote.trim());
      setNotes((prev) => [noteEvent, ...prev]);
      setNewNote('');
      onShowToast('Note Added', 'Internal operator note logged to audit trail');
    } catch (err: any) {
      onShowToast('Note Error', err.message || 'Failed to log note', 'info');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Authoritative Opportunity Intelligence from Backend Endpoint
  const getProbabilityScore = () => {
    if (isRecovered) return null;
    if (intelligence && typeof intelligence.recoveryLikelihoodScore === 'number') {
      const score = intelligence.recoveryLikelihoodScore;
      return score <= 1 ? Math.round(score * 100) : Math.round(score);
    }
    return null;
  };

  const probabilityScore = getProbabilityScore();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'recovered':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Recovered & Settled
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Pause className="w-3.5 h-3.5" />
            Recovery Paused
          </span>
        );
      case 'escalated':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <Flame className="w-3.5 h-3.5" />
            VIP Concierge Escalated
          </span>
        );
      case 'contacted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Send className="w-3.5 h-3.5" />
            Customer Contacted (Step {opportunity.current_step_number} of 4)
          </span>
        );
      case 'payment_retry_pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Clock className="w-3.5 h-3.5" />
            Smart Retry Scheduled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Active Grace Period
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Navigation & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Recovery Pipeline</span>
        </button>

        <div className="flex items-center gap-2">
          {onNavigateToTimeline && (
            <button
              onClick={() => onNavigateToTimeline(customer?.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>View Customer Activity Timeline</span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Pay Portal Link'}</span>
          </button>
        </div>
      </div>

      {/* 1. OPPORTUNITY HEADER COMMAND CENTER */}
      <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-900/80 border border-slate-800 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {getStatusBadge(opportunity.status)}
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                Case ID: {opportunity.id}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 capitalize flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-emerald-400" />
                {customer?.provider_type || 'Stripe'}
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{customer?.name || 'Enterprise Customer'}</h1>
              <span className="text-sm text-slate-400">{customer?.email}</span>
            </div>

            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>{customer?.phone ? `Phone: ${customer.phone}` : 'No phone registered'}</span>
              <span>•</span>
              <span>Next action: {opportunity.next_action_due_at ? new Date(opportunity.next_action_due_at).toLocaleDateString() : 'Automated'}</span>
            </p>
          </div>

          {/* Amount & Key Metrics */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Amount At Risk</div>
              <div className="text-2xl font-extrabold text-rose-400">{amountFormatted}</div>
              <div className="text-[11px] text-slate-500 font-mono">{opportunity.currency}</div>
            </div>
            <div className="w-px h-10 bg-slate-800" />
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Preserved ARR</div>
              <div className="text-lg font-bold text-emerald-400">{arrPreservedFormatted}</div>
              <div className="text-[11px] text-slate-400">12-mo run-rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* AUTOPILOT POLICY ENGINE DECISION CARD */}
          <OpportunityDecisionCard
            opportunity={opportunity}
            onDecisionUpdated={(newDecision) => {
              setOpportunity((prev) => (prev ? { ...prev, policy_decision: newDecision } : prev));
            }}
            onShowToast={onShowToast}
          />

          {/* INTELLIGENCE SECTION */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">RECOVERY CASE ANALYSIS</h3>
                  <p className="text-xs text-slate-400">Verifiable analysis & recommended recovery actions</p>
                </div>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Analysis: Verifiable Math
              </span>
            </div>

            {intelligence ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Priority Level & Score</div>
                  <div className="text-sm font-bold text-white">{intelligence.priority} (Score: {intelligence.priorityScore}/100)</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Likelihood of Success</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {isRecovered ? 'Recovered & Settled' : `${Math.round((intelligence.recoveryLikelihoodScore || 0) * 100)}% (Estimated chance)`}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Expected Recovery Value</div>
                  <div className="text-sm font-bold text-white">
                    {formatCurrencyAmount(intelligence.expectedValueCents || 0, intelligence.currency)}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Recommended Action & Timing</div>
                  <div className="text-sm font-semibold text-indigo-300">{intelligence.recommendedActionLabel}</div>
                  <div className="text-[11px] text-slate-400">{intelligence.recommendedTiming}</div>
                </div>
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Why This Ranks Here</div>
                  <div className="text-slate-200 leading-relaxed font-sans text-xs">{intelligence.rankingExplanation}</div>
                </div>
                {intelligence.evidence && intelligence.evidence.length > 0 && (
                  <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Verifiable Evidence Factors</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {intelligence.evidence.map((ev: OpportunityEvidenceItem, idx: number) => (
                        <div key={idx} className="p-2 rounded bg-black/40 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-300">{ev.label}</span>
                          <span className="font-bold text-white">{ev.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                {intelligenceLoading ? 'Loading verified analysis...' : 'Analysis currently unavailable'}
              </div>
            )}
          </div>

          {/* EXPANSION INTELLIGENCE SECTION */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">GROWTH OPPORTUNITIES</h3>
                  <p className="text-xs text-slate-400">Customer account growth signals & expansion opportunity scoring</p>
                </div>
              </div>
              {expansionRecord && (
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full uppercase font-bold border ${
                  expansionRecord.expansionTier === 'EXPANSION_READY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  expansionRecord.expansionTier === 'GROWTH_SIGNAL' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                  expansionRecord.expansionTier === 'WATCH' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {expansionRecord.expansionTier}
                </span>
              )}
            </div>

            {expansionRecord ? (
              <div className="space-y-4 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="text-slate-400">Expansion Tier</div>
                    <div className="text-sm font-bold text-white">{expansionRecord.expansionTier}</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="text-slate-400">Estimated Potential Value</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {expansionRecord.estimatedValueCents !== null && expansionRecord.estimatedValueCents > 0
                        ? `+${formatCurrencyAmount(expansionRecord.estimatedValueCents, expansionRecord.currency)}`
                        : expansionRecord.estimatedValueLabel}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="text-slate-400">Evidence Status</div>
                    <div className="text-sm font-bold text-slate-200 capitalize">
                      {expansionRecord.evidenceStatus === 'confirmed_evidence' ? 'Confirmed Telemetry' : 'Insufficient Telemetry'}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Expansion Signal</div>
                  <div className="text-slate-200 leading-relaxed font-sans text-xs">{expansionRecord.expansionSignal}</div>
                </div>

                {expansionRecord.explainableDrivers?.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Explainable Drivers</div>
                    <div className="flex flex-wrap gap-2">
                      {expansionRecord.explainableDrivers.map((driver, idx) => (
                        <div key={idx} className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-sans">
                          • {driver}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {expansionRecord.evidenceDetails?.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Verifiable Evidence Factors</div>
                    <ul className="space-y-1 text-slate-300 font-sans text-xs">
                      {expansionRecord.evidenceDetails.map((detail, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Recommended Expansion Strategy</div>
                  <div className="text-slate-200 leading-relaxed font-sans text-xs">{expansionRecord.recommendedAction}</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                Expansion intelligence evaluation pending or no customer record linked.
              </div>
            )}
          </div>

          {/* AI ENRICHMENT SECTION */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">CUSTOMER INSIGHTS</h3>
                  <p className="text-xs text-slate-400">Automated account summaries & customer communication recommendations</p>
                </div>
              </div>
              <span className={`text-xs font-mono px-2.5 py-1 rounded-full border uppercase ${
                intelligence?.aiEnrichment?.aiStatus === 'generated'
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                  : intelligence?.aiEnrichment?.aiStatus === 'fallback'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {intelligence?.aiEnrichment?.aiStatus === 'generated' ? 'Analysis Ready' :
                 intelligence?.aiEnrichment?.aiStatus === 'fallback' ? 'Verified Rule' :
                 'Verified explanation shown'}
              </span>
            </div>

            {intelligence?.aiEnrichment ? (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">AI Status & Provenance</div>
                  <div className="text-white font-bold uppercase">{intelligence.aiEnrichment.aiStatus}</div>
                  {intelligence.aiEnrichment.failureReason && (
                    <div className="text-[11px] text-amber-400">Note: {intelligence.aiEnrichment.failureReason}</div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Operator Summary</div>
                  <div className="text-slate-200 leading-relaxed font-sans text-xs">{intelligence.aiEnrichment.operatorSummary}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-slate-400">Contextual Reasoning</div>
                  <div className="text-slate-200 leading-relaxed font-sans text-xs">{intelligence.aiEnrichment.contextualReasoning}</div>
                </div>

                {intelligence.aiEnrichment.communicationStrategy && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Communication Strategy</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                      <div>Recommended Channel: <strong className="text-white">{intelligence.aiEnrichment.communicationStrategy.recommendedChannel}</strong></div>
                      <div>Suggested Tone: <strong className="text-white">{intelligence.aiEnrichment.communicationStrategy.suggestedTone}</strong></div>
                      {intelligence.aiEnrichment.communicationStrategy.suggestedSubject && (
                        <div className="sm:col-span-2">Suggested Subject: <strong className="text-white">{intelligence.aiEnrichment.communicationStrategy.suggestedSubject}</strong></div>
                      )}
                    </div>
                    {intelligence.aiEnrichment.communicationStrategy.keyTalkingPoints?.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Key Talking Points</div>
                        <ul className="list-disc list-inside space-y-1 text-slate-300">
                          {intelligence.aiEnrichment.communicationStrategy.keyTalkingPoints.map((tp: string, idx: number) => (
                            <li key={idx}>{tp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                AI enrichment stream not loaded.
              </div>
            )}
          </div>

          {/* RECOVERY COPILOT ACTION ORCHESTRATION */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Recommended Recovery Action Plan</h3>
                  <p className="text-xs text-slate-400">Step-by-step automated recovery actions and execution plan</p>
                </div>
              </div>

              {copilotPlan && (
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                  Strategy: {copilotPlan.strategyType}
                </span>
              )}
            </div>

            {copilotLoading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-mono">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                Generating Copilot recovery orchestration plan...
              </div>
            ) : copilotPlan ? (
              <div className="space-y-4 text-xs">
                {/* Approval Workflow & History */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Plan Approval Status:</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded font-mono uppercase font-bold ${
                        copilotPlan.approvalStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        copilotPlan.approvalStatus === 'rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                        copilotPlan.approvalStatus === 'completed' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                        copilotPlan.approvalStatus === 'executing' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}>
                        {copilotPlan.approvalStatus || 'pending_approval'}
                      </span>
                    </div>
                    {copilotPlan.approvedBy && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Approved by <span className="text-slate-200">{copilotPlan.approvedBy}</span> on {new Date(copilotPlan.approvedAt || '').toLocaleString()} (v{copilotPlan.planVersion || '1.0'})
                      </div>
                    )}
                    {copilotPlan.rejectedReason && (
                      <div className="text-[10px] text-rose-400 font-mono">
                        Reason: {copilotPlan.rejectedReason}
                      </div>
                    )}
                  </div>

                  {(!copilotPlan.approvalStatus || copilotPlan.approvalStatus === 'pending_approval') && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleApproveCopilotPlan}
                        disabled={copilotLoading}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve Plan</span>
                      </button>
                      <button
                        onClick={handleRejectCopilotPlan}
                        disabled={copilotLoading}
                        className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-400 border border-rose-500/30 font-bold text-xs shadow transition-all cursor-pointer"
                      >
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Workflow Progress & Sequential Execution */}
                {copilotPlan.approvalStatus === 'approved' && (
                  <div className="p-4 rounded-xl bg-slate-950/85 border border-emerald-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Sequential Workflow Engine</span>
                      </div>
                      <button
                        onClick={handleExecuteWorkflow}
                        disabled={workflowExecuting || copilotPlan.workflowStatus === 'executing' || copilotPlan.workflowStatus === 'success'}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {workflowExecuting || copilotPlan.workflowStatus === 'executing' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5" />
                        )}
                        <span>{copilotPlan.workflowStatus === 'success' ? 'Workflow Completed' : workflowExecuting ? 'Executing Workflow...' : 'Execute Approved Workflow'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Workflow Status</div>
                        <div className="text-xs font-bold text-emerald-400 uppercase mt-0.5">{copilotPlan.workflowStatus || 'not_started'}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Completed Steps</div>
                        <div className="text-xs font-bold text-white mt-0.5">{copilotPlan.recommendedSteps?.filter(s => s.state === 'completed' || s.state === 'succeeded').length || 0}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Failed Steps</div>
                        <div className="text-xs font-bold text-rose-400 mt-0.5">{copilotPlan.recommendedSteps?.filter(s => s.state === 'failed').length || 0}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Final Outcome</div>
                        <div className="text-xs font-bold text-blue-400 uppercase mt-0.5">{copilotPlan.workflowOutcome || 'pending'}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Recovery Summary</div>
                  <div className="text-sm font-semibold text-white">{copilotPlan.recoverySummary || copilotPlan.goal}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed mt-1">{copilotPlan.expectedResult}</div>
                </div>

                {/* Why This Matters / Why This Plan Was Selected */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Why This Matters</div>
                  <ul className="space-y-1 text-slate-300">
                    {(copilotPlan.whyThisMatters || copilotPlan.why)?.map((reason: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Action */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Recommended Action</div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{copilotPlan.recommendedActionSummary || 'Prioritizing primary recovery action based on customer health and failure classification.'}</p>
                </div>

                {/* Alternative Actions Considered */}
                {copilotPlan.alternativeActionsConsidered && copilotPlan.alternativeActionsConsidered.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Alternative Actions Considered</div>
                    <div className="space-y-2">
                      {copilotPlan.alternativeActionsConsidered.map((alt, idx) => (
                        <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800 text-[11px]">
                          <div className="font-bold text-white">{alt.actionLabel}</div>
                          <div className="text-slate-400 mt-0.5">Not selected: {alt.reasonNotSelected}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timing Recommendation */}
                {copilotPlan.timingRecommendation && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Timing Recommendation</div>
                    <div className="font-bold text-emerald-400">{copilotPlan.timingRecommendation.timing}</div>
                    <div className="text-slate-400 text-[11px]">{copilotPlan.timingRecommendation.explanation}</div>
                  </div>
                )}

                {/* Risk Assessment */}
                {copilotPlan.riskAssessment && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Risk Assessment</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        copilotPlan.riskAssessment.level === 'High' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                        copilotPlan.riskAssessment.level === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {copilotPlan.riskAssessment.level} Risk
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">{copilotPlan.riskAssessment.explanation}</div>
                  </div>
                )}

                {/* Confidence Explanation */}
                {copilotPlan.confidenceExplanation && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Confidence Explanation</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        copilotPlan.confidenceExplanation.level === 'High' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        copilotPlan.confidenceExplanation.level === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                        'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {copilotPlan.confidenceExplanation.level} Confidence
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">{copilotPlan.confidenceExplanation.explanation}</div>
                  </div>
                )}

                {/* Relevant Historical Outcomes */}
                {copilotPlan.relevantHistoricalOutcomes && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Relevant Historical Outcomes</div>
                    <div className="space-y-1 text-slate-300">
                      {copilotPlan.relevantHistoricalOutcomes.successPatterns?.map((pat, idx) => (
                        <div key={idx} className="text-[11px] text-emerald-300">• {pat}</div>
                      ))}
                      {copilotPlan.relevantHistoricalOutcomes.failurePatterns?.map((pat, idx) => (
                        <div key={idx} className="text-[11px] text-rose-350 text-rose-400">• {pat}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historical Evidence (Outcome Learning Engine) */}
                {copilotPlan.historicalEvidence && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Historical Evidence</div>
                      <span className={`text-[9px] px-2.5 py-0.5 rounded font-mono uppercase font-bold ${
                        copilotPlan.historicalEvidence.hasSufficientSample ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {copilotPlan.historicalEvidence.hasSufficientSample ? 'Empirical Sample Verified' : 'Limited Sample'}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      {copilotPlan.historicalEvidence.evidenceStatements?.map((stmt, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-slate-300">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{stmt}</span>
                        </div>
                      ))}
                    </div>

                    {copilotPlan.historicalEvidence.hasSufficientSample && copilotPlan.historicalEvidence.actionSuccessRates?.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {copilotPlan.historicalEvidence.actionSuccessRates.map((act, idx) => (
                          <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-[10px]">
                            <span className="text-slate-300 font-medium">{act.actionLabel}</span>
                            <span className="font-mono font-bold text-emerald-400">{act.successRatePercentage}% ({act.successfulAttempts}/{act.totalAttempts})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Recommended Steps */}
                <div className="space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Recommended Action Sequence</div>
                  <div className="space-y-3">
                    {copilotPlan.recommendedSteps?.map((step: CopilotStep) => {
                      const isExecuting = executingStepId === step.id;
                      const isSucceeded = step.state === 'succeeded';
                      const isFailed = step.state === 'failed';

                      return (
                        <div
                          key={step.id}
                          className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center font-mono">
                                {step.stepNumber}
                              </span>
                              <span className="font-bold text-white text-xs">{step.actionLabel}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                                  isSucceeded
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : isFailed
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {step.state}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px] leading-relaxed">{step.reason}</p>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Timing: <span className="text-slate-300">{step.timing}</span> • Purpose: <span className="text-slate-300">{step.expectedPurpose}</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            <button
                              onClick={() => handleExecuteCopilotStep(step.id)}
                              disabled={copilotPlan?.approvalStatus !== 'approved' || isExecuting || isSucceeded}
                              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              {isExecuting ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : isSucceeded ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Zap className="w-3.5 h-3.5" />
                              )}
                              <span>{isSucceeded ? 'Completed' : isExecuting ? 'Executing...' : 'Execute Step'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Execution History Logs */}
                {copilotLogs.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Copilot Execution Logs</div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {copilotLogs.map((log: CopilotExecutionLog) => (
                        <div key={log.id} className="p-2 rounded bg-slate-955 border border-slate-800 text-[11px] flex items-center justify-between font-mono">
                          <div>
                            <span className="text-emerald-400 font-bold">{log.actionType}</span>
                            <span className="text-slate-400 ml-2">({log.resultStatus})</span>
                          </div>
                          <span className="text-slate-500">{new Date(log.executedAt).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">No recovery orchestration plan available for this case.</div>
            )}
          </div>

          {/* SUBSCRIPTION & CUSTOMER PROFILE */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Subscription & Account Overview</h3>
                  <p className="text-xs text-slate-400">Commercial contract parameters and retention health</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <div className="text-slate-400 mb-1">Plan Tier</div>
                <div className="font-semibold text-white">{subscription?.plan_name || 'Not available'}</div>
                <div className="text-slate-500 mt-0.5 capitalize">{subscription?.billing_interval || 'Not available'}</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <div className="text-slate-400 mb-1">Invoice ID</div>
                <div className="font-mono font-semibold text-slate-200 truncate">
                  {invoice?.provider_invoice_id || 'Not available'}
                </div>
                <div className="text-slate-500 mt-0.5">Cycle Billing</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <div className="text-slate-400 mb-1">Customer LTV</div>
                <div className="font-semibold text-emerald-400">{ltvFormatted}</div>
                <div className="text-slate-500 mt-0.5">Historical Value</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                <div className="text-slate-400 mb-1">Grace Period</div>
                <div className="font-semibold text-amber-400">
                  {subscription?.grace_period_days != null ? `${subscription.grace_period_days} Days` : 'Not configured'}
                </div>
                <div className="text-slate-500 mt-0.5">Active Protection</div>
              </div>
            </div>
          </div>

          {/* RECOVERY TIMELINE & TOUCHPOINTS */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Recovery Touchpoints</h3>
                  <p className="text-xs text-slate-400">Audit trail of dunning attempts and gateway webhooks</p>
                </div>
              </div>

              <span className="text-xs text-slate-400">
                {(opportunity.events?.length || 0) + 2} events recorded
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {opportunity.events && opportunity.events.length > 0 ? (
                opportunity.events.map((ev, idx) => (
                  <div
                    key={ev.id || idx}
                    className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-start gap-3 text-xs"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 capitalize">
                          {ev.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Channel: <span className="text-slate-300 capitalize">{ev.channel}</span> • Status:{' '}
                        <span className="text-emerald-400 font-semibold">{ev.status}</span>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/40 text-center text-xs text-slate-400">
                  Automated dunning sequence initiated upon webhook receipt.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: ACTIONS & CUSTOMER NOTES */}
        <div className="space-y-6">
          {/* RECOVERY ACTIONS COMMAND PANEL */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Recovery Actions
            </h3>

            <div className="space-y-2.5">
              {/* Smart Retry Button */}
              <button
                onClick={handleRetry}
                disabled={isRecovered || actionLoading === 'retry'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'retry' ? 'animate-spin' : ''}`} />
                <span>Smart Retry Now</span>
              </button>

              {(retryPaymentLinkUrl || opportunity.checkout_url) && (
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2.5">
                  <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                    <span>Razorpay Payment Link</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded">Live Link</span>
                  </div>
                  <div className="text-[11px] text-slate-300 break-all bg-slate-950 p-2 rounded border border-emerald-900/50">
                    {retryPaymentLinkUrl || opportunity.checkout_url}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(retryPaymentLinkUrl || opportunity.checkout_url, '_blank')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Payment Link</span>
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(retryPaymentLinkUrl || opportunity.checkout_url || '');
                        onShowToast('Link Copied', 'Payment link copied to clipboard');
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Send Manual Email */}
              <button
                onClick={() => {
                  if (onOpenEmailModal) {
                    onOpenEmailModal(opportunity);
                  } else {
                    onShowToast('Email Dunning', `Preparing direct dunning sequence to ${opportunity.customer.email}`);
                  }
                }}
                disabled={isRecovered}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span>Send Custom Dunning Email</span>
              </button>

              {/* 1-Click Magic Link Dispatch */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Dispatch 1-Click Magic Link</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setMagicLinkChannel('email')}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        magicLinkChannel === 'email' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Email
                    </button>
                    <button
                      onClick={() => setMagicLinkChannel('sms')}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        magicLinkChannel === 'sms' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      SMS
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSendMagicLink}
                  disabled={isRecovered || actionLoading === 'magic-link'}
                  className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors cursor-pointer"
                >
                  Send to {magicLinkChannel === 'email' ? customer?.email : customer?.phone || 'Customer'}
                </button>
              </div>

              {/* Mark as Settled / Recovered */}
              <button
                onClick={handleSettle}
                disabled={isRecovered || actionLoading === 'settle'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-300 disabled:opacity-50 text-slate-300 font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mark Recovered / Reconciled</span>
              </button>

              {/* Pause / Resume & Escalate */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handlePause}
                  disabled={isRecovered || actionLoading === 'pause'}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-all cursor-pointer"
                >
                  <Pause className="w-3 h-3 text-amber-400" />
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  onClick={() => setShowEscalateModal(true)}
                  disabled={isRecovered || isEscalated}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs border border-slate-700 transition-all cursor-pointer"
                >
                  <Flame className="w-3 h-3 text-rose-400" />
                  <span>Escalate</span>
                </button>
              </div>
            </div>
          </div>

          {/* REVENUE IMPACT CALCULATOR */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-3 text-xs">
            <h4 className="font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Preservation Impact
            </h4>

            <div className="space-y-2 text-slate-400">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span>Immediate Cash Value:</span>
                <span className="font-semibold text-white">{amountFormatted}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span>12-Month Preserved ARR:</span>
                <span className="font-semibold text-emerald-400">{arrPreservedFormatted}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Gateway Dispute Prevention:</span>
                <span className="font-semibold text-emerald-400">Active</span>
              </div>
            </div>
          </div>

          {/* CUSTOMER NOTES & OPERATOR LOG */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              Internal Customer Notes
            </h4>

            {/* Note Input */}
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log internal note, phone call summary, or payment agreement..."
                rows={2}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 resize-none"
              />
              <button
                type="submit"
                disabled={submittingNote || !newNote.trim()}
                className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                {submittingNote ? 'Saving Note...' : 'Add Note to Audit Trail'}
              </button>
            </form>

            {/* Notes List */}
            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {notes.length > 0 ? (
                notes.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">{n.actor || 'Operator'}</span>
                      <span className="text-slate-500">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-200 text-xs">{n.description}</p>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-slate-500 text-center py-2">No internal notes logged yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ESCALATION MODAL */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Escalate to VIP Concierge</h3>
                <p className="text-xs text-slate-400">Elevates priority and flags for executive intervention</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Escalation Justification</label>
              <textarea
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-hidden focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowEscalateModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleEscalate}
                disabled={actionLoading === 'escalate'}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition-colors cursor-pointer"
              >
                {actionLoading === 'escalate' ? 'Escalating...' : 'Confirm Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
