import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw,
  Search,
  DollarSign,
  Calendar,
  User,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Ban,
  FileText,
  Send,
  Layers,
  Sparkles,
  TrendingUp,
  BarChart3,
  Mail,
  MessageSquare,
  Check,
  Play,
  ArrowUpRight,
} from 'lucide-react';
import {
  AutonomousRecoveryWorkflow,
  AutonomousRetrySchedule,
  AutonomousRecoveryMetrics,
  AutonomousWorkflowState,
  AutonomousRecoveryOutcome,
  Workspace,
} from '../types/index.js';
import { api } from '../services/api.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { EmptyStateCard } from './EmptyStateCard.js';

interface AutonomousRecoveryDashboardProps {
  workspace: Workspace | null;
  onNavigateToOpportunity?: (oppId: string) => void;
  onShowToast?: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const AutonomousRecoveryDashboard: React.FC<AutonomousRecoveryDashboardProps> = ({
  workspace,
  onNavigateToOpportunity,
  onShowToast,
}) => {
  const [workflows, setWorkflows] = useState<AutonomousRecoveryWorkflow[]>([]);
  const [retrySchedules, setRetrySchedules] = useState<AutonomousRetrySchedule[]>([]);
  const [metrics, setMetrics] = useState<AutonomousRecoveryMetrics | null>(null);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [attributions, setAttributions] = useState<any[]>([]);
  const [dispatchMetrics, setDispatchMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedWorkflow, setSelectedWorkflow] = useState<AutonomousRecoveryWorkflow | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workflows' | 'retries' | 'dispatches' | 'performance' | 'timeline' | 'outcomes'>('workflows');
  const [outreachChannel, setOutreachChannel] = useState<'email' | 'sms' | 'hosted_link'>('email');
  const [sendingOutreachId, setSendingOutreachId] = useState<string | null>(null);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [wfRes, retRes, metRes, dispRes, attrRes, dispMetRes] = await Promise.all([
        api.getAutonomousWorkflows(),
        api.getAutonomousRetrySchedules(),
        api.getAutonomousRecoveryMetrics(),
        api.getRecoveryDispatches(),
        api.getRecoveryAttributions(),
        api.getDispatchMetrics(),
      ]);
      setWorkflows(wfRes || []);
      setRetrySchedules(retRes || []);
      setMetrics(metRes || null);
      setDispatches(dispRes || []);
      setAttributions(attrRes || []);
      setDispatchMetrics(dispMetRes || null);
    } catch (err) {
      console.warn('Failed to load autonomous recovery dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspace?.id]);

  const handleCancelWorkflow = async (workflowId: string) => {
    try {
      setCancellingId(workflowId);
      const res = await api.cancelAutonomousWorkflow(workflowId, 'Cancelled by operator from Autonomous Dashboard');
      onShowToast?.('Workflow Cancelled', 'Autonomous recovery and upcoming retry attempts were stopped.', 'info');
      await loadData(true);
      if (selectedWorkflow?.id === workflowId) {
        setSelectedWorkflow(res);
      }
    } catch (err: any) {
      console.error('Failed to cancel workflow', err);
      onShowToast?.('Action Failed', err.message || 'Could not cancel workflow', 'info');
    } finally {
      setCancellingId(null);
    }
  };

  const handleTriggerDispatch = async (workflowId: string, channel: 'email' | 'sms' | 'hosted_link') => {
    try {
      setSendingOutreachId(workflowId);
      const res = await api.dispatchAutonomousRecovery({ workflowId, channel });
      if (res.executed) {
        onShowToast?.('Recovery Outreach Sent', `Secure recovery link successfully dispatched via ${channel.toUpperCase()}.`, 'success');
      } else {
        onShowToast?.('Dispatch Bypassed', res.reason || 'Safety criteria not met', 'info');
      }
      await loadData(true);
    } catch (err: any) {
      onShowToast?.('Dispatch Failed', err.message || 'Error occurred during dispatch', 'info');
    } finally {
      setSendingOutreachId(null);
    }
  };

  const handleSimulateResponse = async (dispatchId: string, response: 'opened' | 'clicked') => {
    try {
      await api.simulateDispatchResponse(dispatchId, response);
      onShowToast?.('Simulated Response Tracked', `Successfully recorded customer outreach "${response}" engagement state.`, 'success');
      await loadData(true);
    } catch (err: any) {
      onShowToast?.('Action Failed', err.message || 'Simulation error', 'info');
    }
  };

  const getPlainEnglishState = (state: AutonomousWorkflowState) => {
    switch (state) {
      case 'scheduled':
        return {
          label: 'Scheduled for Automated Retries',
          badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
          icon: Clock,
        };
      case 'queued':
        return {
          label: 'Waiting in Queue',
          badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
          icon: Clock,
        };
      case 'running':
        return {
          label: 'Processing Recovery',
          badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 animate-pulse',
          icon: RefreshCw,
        };
      case 'completed':
        return {
          label: 'Payment Successfully Recovered',
          badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
          icon: CheckCircle2,
        };
      case 'failed':
        return {
          label: 'Retries Completed — Needs Human Review',
          badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
          icon: AlertCircle,
        };
      case 'cancelled':
        return {
          label: 'Cancelled by Team',
          badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
          icon: Ban,
        };
    }
  };

  const getPlainEnglishOutcome = (outcome: AutonomousRecoveryOutcome) => {
    switch (outcome) {
      case 'recovered':
        return {
          label: 'Money Recovered',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        };
      case 'pending':
        return {
          label: 'Recovery in Progress',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        };
      case 'failed':
        return {
          label: 'Unable to Recover',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        };
      case 'expired':
        return {
          label: 'Grace Period Ended',
          badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
        };
    }
  };

  const getPlainEnglishRetryStatus = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Upcoming Bank Retry', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' };
      case 'completed':
        return { label: 'Payment Settled', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
      case 'failed':
        return { label: 'Card Declined', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-800 border-slate-700' };
      case 'skipped':
        return { label: 'Skipped (Already Paid)', color: 'text-slate-400', bg: 'bg-slate-800 border-slate-700' };
      default:
        return { label: status, color: 'text-slate-300', bg: 'bg-slate-800 border-slate-700' };
    }
  };

  const getPlainEnglishDispatchStatus = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Queued for outreach', bg: 'bg-slate-800 text-slate-400 border-slate-700' };
      case 'scheduled':
        return { label: 'Scheduled for sending', bg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' };
      case 'sent':
        return { label: 'Dispatched to Customer', bg: 'bg-blue-500/10 text-blue-300 border-blue-500/30' };
      case 'delivered':
        return { label: 'Outreach Delivered', bg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' };
      case 'opened':
        return { label: 'Outreach Opened by Customer', bg: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
      case 'clicked':
        return { label: 'Recovery Link Clicked', bg: 'bg-orange-500/10 text-orange-300 border-orange-500/30 font-bold animate-pulse' };
      case 'paid':
        return { label: 'Paid via Outreach Link', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-extrabold' };
      case 'failed':
        return { label: 'Delivery Failed', bg: 'bg-rose-500/10 text-rose-300 border-rose-500/30' };
      case 'expired':
        return { label: 'Outreach link expired', bg: 'bg-slate-800 text-slate-500 border-slate-700' };
      case 'cancelled':
        return { label: 'Cancelled by administrator', bg: 'bg-slate-800 text-slate-400 border-slate-700' };
      default:
        return { label: status, bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return Mail;
      case 'sms':
        return MessageSquare;
      default:
        return ExternalLink;
    }
  };

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  const formatDateOnly = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  const filteredWorkflows = workflows.filter((w) => {
    if (statusFilter !== 'all' && w.state !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (w.customer_name && w.customer_name.toLowerCase().includes(q)) ||
      (w.customer_email && w.customer_email.toLowerCase().includes(q)) ||
      w.opportunity_id.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-indigo-950/20 to-slate-900 border border-emerald-500/20 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Autonomous Recovery Command</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  MONEY EXECUTION ENGINE
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Real-time autonomous money recovery execution. Tracks secure link deliveries, customer interactions, retry timelines, and attributes recovered revenue automatically.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh Activity'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Command Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Card 1: Queued Recoveries */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-md">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Queued Recoveries</span>
            <Clock className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {metrics?.queued_recoveries_count ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">Waiting for automated launch</div>
        </div>

        {/* Card 2: Scheduled Retries */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-md">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Scheduled Retries</span>
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-400">
            {metrics?.scheduled_retries_count ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">Day 1, 3, 5 bank attempts</div>
        </div>

        {/* Card 3: Recovered Revenue */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-md">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Recovered Revenue</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 animate-in fade-in">
            {formatCurrencyAmount(dispatchMetrics?.recovered_revenue_cents ?? metrics?.recovered_revenue_cents ?? 0, workspace?.currency || 'USD')}
          </div>
          <div className="text-[11px] text-slate-500">Successfully recovered on autopilot</div>
        </div>

        {/* Card 4: Pending Revenue */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-md">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Pending Revenue</span>
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400">
            {formatCurrencyAmount(metrics?.pending_revenue_cents ?? 0, workspace?.currency || 'USD')}
          </div>
          <div className="text-[11px] text-slate-500">In active recovery outreach</div>
        </div>

        {/* Card 5: Recovery Success Rate */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-md col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Recovery Rate</span>
            <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
          </div>
          <div className="text-2xl font-extrabold text-pink-400">
            {dispatchMetrics?.recovery_rate ?? 0}%
          </div>
          <div className="text-[11px] text-slate-500">Average: {dispatchMetrics?.average_recovery_time_formatted || 'N/A'} to recover</div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('workflows')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'workflows'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Active Recovery Workflows ({workflows.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('retries')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'retries'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Retry Cadence ({retrySchedules.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dispatches')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dispatches'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Dispatch & Engagement History ({dispatches.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'performance'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Channel Performance & Funnel
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Recent Recoveries
          </button>
        </div>

        {activeTab === 'workflows' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search customer or case..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-48"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono focus:outline-none cursor-pointer"
            >
              <option value="all">All States</option>
              <option value="scheduled">Scheduled</option>
              <option value="queued">Queued</option>
              <option value="running">Processing</option>
              <option value="completed">Recovered</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {/* 4. Tab Content Views */}

      {/* TAB 1: WORKFLOWS LIST */}
      {activeTab === 'workflows' && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
              Loading autonomous recovery cases...
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <EmptyStateCard
              title="No Active Recovery Plans"
              whatItDoes="When payment failures are categorized as safe by policy rules, ReviveOS creates automated recovery plans here."
              whyItMatters="Enforces strict safety guardrails: Manual Review and Blocked cases remain untouched, while safe recoveries are handled automatically."
              whatToClickNext="Connect your payment gateway or trigger a payment failure under $500 to watch safe recoveries execute on autopilot."
              actionLabel="Go to Pipeline"
              onAction={() => {}}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Customer & Case</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Workflow State</th>
                    <th className="py-3 px-4">Delivery Payload</th>
                    <th className="py-3 px-4">Smart Outreach Dispatch</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredWorkflows.map((wf) => {
                    const stateMeta = getPlainEnglishState(wf.state);
                    const outcomeMeta = getPlainEnglishOutcome(wf.outcome);
                    const isCancelled = wf.state === 'cancelled';
                    const isCompleted = wf.state === 'completed';

                    return (
                      <tr key={wf.id} className="hover:bg-slate-900/40 transition-colors">
                        {/* Customer & Case */}
                        <td className="py-3.5 px-4 font-sans">
                          <div className="font-bold text-white text-sm">
                            {wf.customer_name || 'Customer Account'}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {wf.customer_email || 'No email on record'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Case ID: {wf.opportunity_id}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="font-extrabold text-white text-sm">
                            {formatCurrencyAmount(wf.amount_at_risk_cents, wf.currency)}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase font-mono">
                            {wf.currency}
                          </div>
                        </td>

                        {/* Plain-English Workflow State */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${stateMeta.badgeClass}`}
                          >
                            <stateMeta.icon className="w-3.5 h-3.5" />
                            <span>{stateMeta.label}</span>
                          </span>
                          <div className="mt-1">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border ${outcomeMeta.badgeClass}`}
                            >
                              Outcome: {outcomeMeta.label}
                            </span>
                          </div>
                        </td>

                        {/* Delivery Payload */}
                        <td className="py-3.5 px-4 max-w-xs font-sans">
                          <div className="text-[11px] text-white font-semibold line-clamp-1">
                            {wf.delivery_preparation?.message_subject}
                          </div>
                          <div className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                            {wf.delivery_preparation?.message_preview}
                          </div>
                          <div className="text-[9px] text-blue-400 font-mono line-clamp-1 mt-1 break-all">
                            {wf.delivery_preparation?.recovery_link_url}
                          </div>
                        </td>

                        {/* Direct Outreach Dispatch Tool */}
                        <td className="py-3.5 px-4">
                          {!isCompleted && !isCancelled ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={outreachChannel}
                                onChange={(e) => setOutreachChannel(e.target.value as any)}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono outline-none"
                              >
                                <option value="email">Email Link</option>
                                <option value="sms">SMS Text</option>
                                <option value="hosted_link">Hosted Link</option>
                              </select>
                              <button
                                onClick={() => handleTriggerDispatch(wf.id, outreachChannel)}
                                disabled={sendingOutreachId === wf.id}
                                className="p-1 px-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold inline-flex items-center gap-1 font-sans cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>{sendingOutreachId === wf.id ? 'Sending...' : 'Dispatch'}</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs italic font-sans">Sequence finished</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedWorkflow(wf)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
                            >
                              Details
                            </button>
                            {!isCompleted && !isCancelled && (
                              <button
                                onClick={() => handleCancelWorkflow(wf.id)}
                                className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-medium border border-rose-900/30 cursor-pointer"
                              >
                                Stop
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RETRY CALENDAR TIMELINE */}
      {activeTab === 'retries' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
            <h4 className="text-sm font-bold text-white mb-1">Smart Payment Retry Schedules</h4>
            ReviveOS schedules card retry attempts on a safe cadence of Day 1, Day 3, and Day 5. This prevents immediate retry spamming which flags merchant accounts, respecting policy decisions completely.
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Case / Workflow ID</th>
                  <th className="py-3 px-4">Attempt Number</th>
                  <th className="py-3 px-4">Scheduled For</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Retry Status</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {retrySchedules.map((ret) => {
                  const retStatus = getPlainEnglishRetryStatus(ret.status);
                  return (
                    <tr key={ret.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4 text-slate-200">
                        <div className="font-bold text-xs">{ret.workflow_id}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Opportunity: {ret.opportunity_id}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-white text-xs">
                        Attempt #{ret.attempt_number} of 3
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-xs">
                        {formatDateTime(ret.scheduled_for)}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {formatCurrencyAmount(ret.amount_cents, ret.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${retStatus.bg} ${retStatus.color}`}>
                          {retStatus.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {ret.status === 'pending' && (
                          <button
                            onClick={async () => {
                              try {
                                await api.triggerSmartRetry(ret.opportunity_id);
                                onShowToast?.('Retry Executed', 'Manual smart retry execution triggered.', 'success');
                                await loadData(true);
                              } catch (err: any) {
                                onShowToast?.('Retry Failed', err.message || 'Error occurred', 'info');
                              }
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer font-sans"
                          >
                            <Play className="w-3 h-3 text-indigo-400" />
                            <span>Run Now</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DISPATCH & ENGAGEMENT HISTORY */}
      {activeTab === 'dispatches' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans flex flex-col md:flex-row justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white mb-1">Outreach Dispatch & Customer Engagement</h4>
              Tracks transactional outreach attempts and real-time delivery confirmations. Use the simulation utilities to test customer clicks and email opens in the development sandbox!
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Customer & Outreach Recipient</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Delivery State</th>
                  <th className="py-3 px-4">Sent At</th>
                  <th className="py-3 px-4">Simulation Sandbox Tools</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dispatches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 font-sans italic">
                      No outreach dispatches recorded. Dispatch a recovery link above to generate activity logs.
                    </td>
                  </tr>
                ) : (
                  dispatches.map((disp) => {
                    const statusMeta = getPlainEnglishDispatchStatus(disp.status);
                    const ChannelIcon = getChannelIcon(disp.channel);
                    const isPending = ['sent', 'delivered', 'opened', 'clicked'].includes(disp.status);

                    return (
                      <tr key={disp.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-sans">
                          <div className="font-bold text-white text-xs">{disp.customer_name || 'Customer Account'}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{disp.recipient}</div>
                          <div className="text-[9px] text-slate-500 mt-0.5 font-mono">ID: {disp.id}</div>
                        </td>
                        <td className="py-3.5 px-4 font-sans">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-semibold text-slate-300 capitalize">
                            <ChannelIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>{disp.channel}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded border text-[11px] font-bold ${statusMeta.bg}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-xs font-mono">
                          {formatDateTime(disp.sent_at || disp.created_at)}
                        </td>
                        <td className="py-3.5 px-4">
                          {isPending ? (
                            <div className="flex items-center gap-1.5 font-sans">
                              {disp.status !== 'opened' && disp.status !== 'clicked' && (
                                <button
                                  onClick={() => handleSimulateResponse(disp.id, 'opened')}
                                  className="px-2 py-0.5 rounded bg-amber-950/50 hover:bg-amber-900 text-amber-300 text-[10px] font-semibold border border-amber-900/30 cursor-pointer"
                                >
                                  Open Email
                                </button>
                              )}
                              {disp.status !== 'clicked' && (
                                <button
                                  onClick={() => handleSimulateResponse(disp.id, 'clicked')}
                                  className="px-2 py-0.5 rounded bg-orange-950/50 hover:bg-orange-900 text-orange-300 text-[10px] font-semibold border border-orange-900/30 cursor-pointer animate-pulse"
                                >
                                  Click Link
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  try {
                                    await api.settleRecoveryPayment(disp.opportunity_id);
                                    onShowToast?.('Payment Settled', 'Simulated complete sandbox payment success.', 'success');
                                    await loadData(true);
                                  } catch (err: any) {
                                    onShowToast?.('Settle Failed', err.message || 'Error occurred', 'info');
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-950/50 hover:bg-emerald-900 text-emerald-300 text-[10px] font-semibold border border-emerald-900/30 cursor-pointer"
                              >
                                Settle Payment
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs italic font-sans">Simulation complete</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {disp.status !== 'paid' && disp.status !== 'cancelled' && disp.status !== 'failed' && (
                            <button
                              onClick={async () => {
                                try {
                                  await api.cancelRecoveryDispatch(disp.id, 'Cancelled by operator');
                                  onShowToast?.('Outreach Stopped', 'Outreach attempt has been cancelled.', 'info');
                                  await loadData(true);
                                } catch (err: any) {
                                  onShowToast?.('Action Failed', err.message || 'Error occurred', 'info');
                                }
                              }}
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-rose-400 text-xs border border-slate-800 cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CHANNEL PERFORMANCE & FUNNEL */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* Recovery Funnel Card */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Outreach Conversion Funnel</h4>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-semibold uppercase text-[10px]">1. Sent</span>
                <div className="text-xl font-extrabold text-white">{dispatchMetrics?.funnel?.sent ?? 0}</div>
                <div className="text-[10px] text-slate-500">Outreach Dispatched</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-semibold uppercase text-[10px]">2. Delivered</span>
                <div className="text-xl font-extrabold text-cyan-400">{dispatchMetrics?.funnel?.delivered ?? 0}</div>
                <div className="text-[10px] text-slate-500">
                  {dispatchMetrics?.total_dispatches > 0 ? Math.round((dispatchMetrics?.funnel?.delivered / dispatchMetrics?.total_dispatches) * 100) : 0}% delivery rate
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-semibold uppercase text-[10px]">3. Opened</span>
                <div className="text-xl font-extrabold text-amber-400">{dispatchMetrics?.funnel?.opened ?? 0}</div>
                <div className="text-[10px] text-slate-500">
                  {dispatchMetrics?.funnel?.delivered > 0 ? Math.round((dispatchMetrics?.funnel?.opened / dispatchMetrics?.funnel?.delivered) * 100) : 0}% open rate
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-semibold uppercase text-[10px]">4. Clicked</span>
                <div className="text-xl font-extrabold text-orange-400">{dispatchMetrics?.funnel?.clicked ?? 0}</div>
                <div className="text-[10px] text-slate-500">
                  {dispatchMetrics?.funnel?.opened > 0 ? Math.round((dispatchMetrics?.funnel?.clicked / dispatchMetrics?.funnel?.opened) * 100) : 0}% click rate
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-semibold uppercase text-[10px]">5. Paid</span>
                <div className="text-xl font-extrabold text-emerald-400">{dispatchMetrics?.funnel?.paid ?? 0}</div>
                <div className="text-[10px] text-slate-500">
                  {dispatchMetrics?.total_dispatches > 0 ? Math.round((dispatchMetrics?.funnel?.paid / dispatchMetrics?.total_dispatches) * 100) : 0}% paid conversion
                </div>
              </div>
            </div>
          </div>

          {/* Channels Comparison */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Outreach Delivery Channel</th>
                  <th className="py-3 px-4 text-center">Dispatched</th>
                  <th className="py-3 px-4 text-center">Delivered</th>
                  <th className="py-3 px-4 text-center">Open Rate</th>
                  <th className="py-3 px-4 text-center">Click-Through Rate</th>
                  <th className="py-3 px-4 text-center">Paid Conversion Rate</th>
                  <th className="py-3 px-4 text-right">Revenue Recovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-center">
                {dispatchMetrics?.channel_performance && Object.keys(dispatchMetrics.channel_performance).map((key) => {
                  const perf = dispatchMetrics.channel_performance[key];
                  return (
                    <tr key={key} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-sans text-left font-bold text-white capitalize">
                        {perf.channel_name}
                      </td>
                      <td className="py-3.5 px-4">{perf.dispatched_count}</td>
                      <td className="py-3.5 px-4">{perf.delivered_count}</td>
                      <td className="py-3.5 px-4 font-bold text-amber-400">{perf.open_rate}%</td>
                      <td className="py-3.5 px-4 font-bold text-orange-400">{perf.click_rate}%</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">{perf.paid_conversion_rate}%</td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-white">
                        {formatCurrencyAmount(perf.recovered_amount_cents, workspace?.currency || 'USD')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: RECENT RECOVERIES & TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
            <h4 className="text-sm font-bold text-white mb-1">Outcome Attribution Log</h4>
            Autonomous recoveries settled in the ledger are attributed back to the original outreach dispatch and workflow to track precise performance analytics and ROI calculations.
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Recovered Customer</th>
                  <th className="py-3 px-4">Recovered Revenue</th>
                  <th className="py-3 px-4">Delivery Channel</th>
                  <th className="py-3 px-4">Recovery Time</th>
                  <th className="py-3 px-4">Attributed Dispatch ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {attributions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans italic">
                      No attributed recoveries recorded yet. Run a payment simulator or settle a case above.
                    </td>
                  </tr>
                ) : (
                  attributions.map((attr) => (
                    <tr key={attr.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-sans font-bold text-white">
                        {attr.customer_name || 'Customer Account'}
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">Workflow ID: {attr.workflow_id}</div>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-emerald-400">
                        {formatCurrencyAmount(attr.recovered_amount_cents, attr.currency)}
                      </td>
                      <td className="py-3.5 px-4 font-sans capitalize text-slate-200">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-xs">
                          {attr.recovery_channel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {formatDateTime(attr.recovery_time)}
                        <div className="text-[9px] text-slate-500 mt-0.5">Time to Settle: {attr.time_to_recovery_seconds ? `${(attr.time_to_recovery_seconds / 60).toFixed(1)}m` : 'Immediate'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">
                        {attr.dispatch_id || 'System smart retry'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER / MODAL */}
      {selectedWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Recovery Plan #{selectedWorkflow.id}</h3>
                  <p className="text-xs text-slate-400">
                    Policy Arbitration Decision: {selectedWorkflow.policy_decision}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedWorkflow(null)}
                className="text-slate-400 hover:text-white font-mono text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Workflow General Info */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-sans">Customer</span>
                <div className="font-bold text-white font-sans text-sm">{selectedWorkflow.customer_name}</div>
                <div className="text-slate-500 text-[10px] font-mono">{selectedWorkflow.customer_email}</div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-sans">Amount At Risk</span>
                <div className="font-extrabold text-emerald-400 text-sm">
                  {formatCurrencyAmount(selectedWorkflow.amount_at_risk_cents, selectedWorkflow.currency)}
                </div>
                <div className="text-slate-500 text-[10px]">Currency: {selectedWorkflow.currency.toUpperCase()}</div>
              </div>
            </div>

            {/* Outreach Prep */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-white">Prepared Recovery Message Payload</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Ready for Delivery
                </span>
              </div>

              <div className="space-y-2 font-mono">
                <div>
                  <span className="text-slate-400 font-sans">Subject Line: </span>
                  <span className="text-white font-semibold">
                    {selectedWorkflow.delivery_preparation?.message_subject}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans">Message Body Preview: </span>
                  <p className="text-slate-300 font-sans mt-0.5 leading-relaxed">
                    {selectedWorkflow.delivery_preparation?.message_preview}
                  </p>
                </div>
                <div className="pt-2">
                  <span className="text-slate-400 font-sans">1-Click Portal Link: </span>
                  <span className="text-blue-400 font-mono break-all text-[11px]">
                    {selectedWorkflow.delivery_preparation?.recovery_link_url}
                  </span>
                </div>
              </div>
            </div>

            {/* Scheduled Retries */}
            <div className="space-y-3 font-mono">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Planned Retry Attempts (Days 1, 3, 5)
              </h4>
              <div className="space-y-2">
                {(selectedWorkflow.retry_schedules || []).map((ret) => {
                  const retStatus = getPlainEnglishRetryStatus(ret.status);
                  return (
                    <div
                      key={ret.id}
                      className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">Attempt #{ret.attempt_number}</span>
                        <span className="text-slate-400 font-sans">
                          Scheduled for {formatDateTime(ret.scheduled_for)}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${retStatus.bg} ${retStatus.color}`}>
                        {retStatus.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3 font-sans">
              <h4 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
                Autonomous Recovery Timeline
              </h4>
              <div className="space-y-3 border-l border-slate-800 pl-4 ml-1 relative">
                {(selectedWorkflow.timeline || []).map((step, idx) => (
                  <div key={step.id || idx} className="relative space-y-1">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-slate-900 shadow" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">{step.action}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{formatDateTime(step.timestamp)}</span>
                    </div>
                    {step.details && <p className="text-[11px] text-slate-400 leading-relaxed">{step.details}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedWorkflow(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Close Details
              </button>

              {selectedWorkflow.state !== 'cancelled' && selectedWorkflow.state !== 'completed' && (
                <button
                  onClick={() => handleCancelWorkflow(selectedWorkflow.id)}
                  disabled={cancellingId === selectedWorkflow.id}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {cancellingId === selectedWorkflow.id ? 'Cancelling...' : 'Cancel Autonomous Recovery'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
