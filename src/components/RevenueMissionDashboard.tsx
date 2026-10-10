import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  CreditCard,
  Send,
  XCircle,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Zap,
  Users,
  Eye,
  Check,
  X,
} from 'lucide-react';
import {
  RevenueMission,
  RevenueMissionMetrics,
  MissionType,
  MissionStatus,
} from '../types/index.js';
import { api } from '../services/api.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { RevenueOperationsAgent } from './RevenueOperationsAgent.js';
import { MissionMetricsCard } from './MissionMetricsCard.js';

export interface RevenueMissionDashboardProps {
  workspaceId?: string;
  currency?: string;
  onSelectOpportunity?: (oppId: string) => void;
  onNavigateTab?: (tab: 'home' | 'missions' | 'revenue' | 'customers' | 'settings') => void;
}

export const RevenueMissionDashboard: React.FC<RevenueMissionDashboardProps> = ({
  workspaceId,
  currency = 'USD',
  onSelectOpportunity,
  onNavigateTab,
}) => {
  const [missions, setMissions] = useState<RevenueMission[]>([]);
  const [metrics, setMetrics] = useState<RevenueMissionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedMission, setSelectedMission] = useState<RevenueMission | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'FAILED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RECOVERY' | 'RETENTION' | 'EXPANSION'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [missionsRes, metricsRes] = await Promise.all([
        api.getMissions(),
        api.getMissionMetrics(),
      ]);
      setMissions(missionsRes || []);
      setMetrics(metricsRes || null);
    } catch (err) {
      console.error('Failed to load mission data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const handleExecuteAction = async (mission: RevenueMission, actionKey: string) => {
    setActionInProgress(mission.id);
    try {
      const updated = await api.executeMissionAction(mission.id, actionKey);
      setMissions((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      if (selectedMission?.id === updated.id) {
        setSelectedMission(updated);
      }
      // Refresh metrics in background
      api.getMissionMetrics().then(setMetrics).catch(() => {});
    } catch (err) {
      console.error('Failed to execute mission action', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Grouped Missions
  const activeMissions = useMemo(() => {
    return missions.filter((m) =>
      ['NEW', 'ACTIVE', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'AWAITING_REVIEW'].includes(m.status)
    );
  }, [missions]);

  const completedMissions = useMemo(() => {
    return missions.filter((m) => m.status === 'COMPLETED');
  }, [missions]);

  const failedMissions = useMemo(() => {
    return missions.filter((m) => m.status === 'FAILED');
  }, [missions]);

  // Filtered list based on controls
  const filteredMissions = useMemo(() => {
    return missions.filter((m) => {
      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (!['NEW', 'ACTIVE', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'AWAITING_REVIEW'].includes(m.status)) {
          return false;
        }
      } else if (statusFilter === 'COMPLETED' && m.status !== 'COMPLETED') {
        return false;
      } else if (statusFilter === 'FAILED' && m.status !== 'FAILED') {
        return false;
      }

      // Type filter
      if (typeFilter !== 'ALL' && m.missionType !== typeFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = m.title.toLowerCase().includes(query);
        const matchCustomer = (m.customerName || '').toLowerCase().includes(query);
        const matchDesc = m.description.toLowerCase().includes(query);
        if (!matchTitle && !matchCustomer && !matchDesc) return false;
      }

      return true;
    });
  }, [missions, statusFilter, typeFilter, searchQuery]);

  // Human readable relative time formatter
  const formatTimeAgo = (isoString: string) => {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffDays === 0) {
      if (diffHours === 0) return 'Just now';
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays === 1) {
      return '1 Day Ago';
    } else if (diffDays < 7) {
      return `${diffDays} Days Ago`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatCompletedTime = (isoString?: string | null) => {
    if (!isoString) return 'Completed';
    const d = new Date(isoString);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) return 'Completed Today';
    return `Completed on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const getStatusBadge = (status: MissionStatus) => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: 'Completed',
          classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        };
      case 'FAILED':
        return {
          label: 'Closed',
          classes: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        };
      case 'AWAITING_CUSTOMER':
        return {
          label: 'Awaiting Customer',
          classes: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        };
      case 'AWAITING_REVIEW':
        return {
          label: 'Awaiting Review',
          classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        };
      case 'IN_PROGRESS':
        return {
          label: 'In Progress',
          classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
        };
      default:
        return {
          label: 'Active',
          classes: 'bg-emerald-500/10 text-[#4ADE80] border-emerald-500/20',
        };
    }
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200 max-w-7xl mx-auto">
      {/* ----------------------------------------------------------------- */}
      {/* OPERATIONAL SCREEN HEADER */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
              Revenue Missions
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-[#4ADE80] border border-emerald-500/20 font-semibold">
              Outcome Operating System
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Execute and complete revenue missions with deterministic closed-loop settlement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#071224] hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Missions</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* REVENUE OPERATIONS AGENT: DETERMINISTIC FACT LEDGER */}
      {/* ----------------------------------------------------------------- */}
      <RevenueOperationsAgent
        workspaceId={workspaceId}
        currency={currency}
        onFocusMission={(missionId) => {
          const m = missions.find((item) => item.id === missionId);
          if (m) setSelectedMission(m);
        }}
      />

      {/* ----------------------------------------------------------------- */}
      {/* MISSION PERFORMANCE ANALYTICS CARD */}
      {/* ----------------------------------------------------------------- */}
      <MissionMetricsCard metrics={metrics} currency={currency} />

      {/* ----------------------------------------------------------------- */}
      {/* FILTER BAR */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl bg-[#071224] border border-slate-800">
        {/* Status Switcher Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-mono">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'ALL'
                ? 'bg-[#4ADE80] text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Missions ({missions.length})
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'ACTIVE'
                ? 'bg-amber-400 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Active Missions ({activeMissions.length})
          </button>
          <button
            onClick={() => setStatusFilter('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'COMPLETED'
                ? 'bg-emerald-400 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Completed Missions ({completedMissions.length})
          </button>
          <button
            onClick={() => setStatusFilter('FAILED')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'FAILED'
                ? 'bg-rose-400 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Failed Missions ({failedMissions.length})
          </button>
        </div>

        {/* Search & Type filter */}
        <div className="flex items-center gap-2">
          {/* Type dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono focus:outline-none focus:border-slate-700 cursor-pointer"
          >
            <option value="ALL">All Mission Types</option>
            <option value="RECOVERY">Recovery Only</option>
            <option value="RETENTION">Retention Only</option>
            <option value="EXPANSION">Expansion Only</option>
          </select>

          {/* Search box */}
          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search missions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-slate-700"
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3-COLUMN OPERATIONAL MISSION BOARD */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* COLUMN 1: ACTIVE MISSIONS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                ACTIVE MISSIONS
              </h2>
            </div>
            <span className="text-[11px] font-mono text-amber-400 font-semibold">
              {activeMissions.length} In Flight
            </span>
          </div>

          <div className="space-y-2.5">
            {activeMissions.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs font-mono text-slate-400">
                0 active missions. All targets settled.
              </div>
            ) : (
              activeMissions.slice(0, 10).map((mission) => {
                const statusBadge = getStatusBadge(mission.status);
                const startedTime = formatTimeAgo(mission.createdAt);
                const amountFormatted = formatCurrencyAmount(mission.revenueAtRisk, currency);

                return (
                  <div
                    key={mission.id}
                    className="p-4 rounded-xl bg-[#071224] border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-semibold ${statusBadge.classes}`}
                          >
                            {statusBadge.label}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Started: {startedTime}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white truncate font-sans pt-1">
                          {mission.title}
                        </h3>
                        <div className="text-xs text-slate-300 font-medium font-sans">
                          {mission.customerName || 'Subscriber'}
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                          Revenue At Risk
                        </div>
                        <div className="text-base font-bold text-amber-400 tabular-nums">
                          {amountFormatted}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 font-mono">
                      {mission.description}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedMission(mission)}
                        className="text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        <span>Inspect Timeline</span>
                      </button>

                      {mission.recommendedActions[0] && (
                        <button
                          onClick={() => handleExecuteAction(mission, mission.recommendedActions[0])}
                          disabled={actionInProgress === mission.id}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3 h-3" />
                          <span>{mission.recommendedActions[0]}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: COMPLETED MISSIONS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                COMPLETED MISSIONS
              </h2>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-semibold">
              {completedMissions.length} Settled
            </span>
          </div>

          <div className="space-y-2.5">
            {completedMissions.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs font-mono text-slate-400">
                No completed missions recorded yet.
              </div>
            ) : (
              completedMissions.slice(0, 10).map((mission) => {
                const recoveredAmount = formatCurrencyAmount(
                  mission.actualRecoveredRevenue || mission.revenueAtRisk,
                  currency
                );
                const completedLabel = formatCompletedTime(mission.completedAt);
                const resolvedAction = mission.timelineEvents.some((ev) => ev.title === 'Customer Updated Card')
                  ? 'Customer Updated Card'
                  : mission.timelineEvents.some((ev) => ev.title === 'Payment Recovered')
                  ? 'Payment retry succeeded'
                  : 'Payment link completed';

                return (
                  <div
                    key={mission.id}
                    className="p-4 rounded-xl bg-[#071224] border border-slate-800 hover:border-slate-700 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-xs font-bold text-emerald-400">
                            Recovered {recoveredAmount}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-white font-sans truncate">
                          {mission.customerName || 'Subscriber'}
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono">
                          {resolvedAction}
                        </div>
                      </div>

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold shrink-0">
                        Settled
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>{completedLabel}</span>
                      <button
                        onClick={() => setSelectedMission(mission)}
                        className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <span>Timeline</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 3: FAILED MISSIONS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                FAILED MISSIONS
              </h2>
            </div>
            <span className="text-[11px] font-mono text-rose-400 font-semibold">
              {failedMissions.length} Closed
            </span>
          </div>

          <div className="space-y-2.5">
            {failedMissions.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs font-mono text-slate-400">
                0 failed missions. Recovery guard is optimal.
              </div>
            ) : (
              failedMissions.slice(0, 10).map((mission) => {
                const amountFormatted = formatCurrencyAmount(mission.revenueAtRisk, currency);

                return (
                  <div
                    key={mission.id}
                    className="p-4 rounded-xl bg-[#071224] border border-slate-800 hover:border-slate-700 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2 font-mono">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="text-xs font-bold text-rose-400">
                            Payment Not Recovered
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-white font-sans truncate">
                          {mission.customerName || 'Subscriber'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Workflow Exhausted
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-500 uppercase">Lost</div>
                        <div className="text-xs font-bold text-slate-400 tabular-nums">
                          {amountFormatted}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="text-slate-500">Closed</span>
                      <button
                        onClick={() => setSelectedMission(mission)}
                        className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <span>Timeline</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* REVENUE MISSION TIMELINE INSPECTION MODAL */}
      {/* ----------------------------------------------------------------- */}
      {selectedMission && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#071224] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded border font-semibold ${
                      getStatusBadge(selectedMission.status).classes
                    }`}
                  >
                    {getStatusBadge(selectedMission.status).label}
                  </span>
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    {selectedMission.missionType} MISSION
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white truncate font-display">
                  {selectedMission.title}
                </h2>
                <div className="text-xs text-slate-300 font-medium">
                  {selectedMission.customerName} ·{' '}
                  <span className="text-emerald-400 font-mono font-semibold">
                    {formatCurrencyAmount(
                      selectedMission.status === 'COMPLETED'
                        ? selectedMission.actualRecoveredRevenue || selectedMission.revenueAtRisk
                        : selectedMission.revenueAtRisk,
                      currency
                    )}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedMission(null)}
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content - Human-Readable Revenue Mission Timeline */}
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-1">
                  Revenue Mission Timeline
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Chronological progression: Mission Created → Recovery Link Generated → Recovery Link Sent → Customer Opened Link → Customer Updated Card → Payment Recovered → Mission Completed
                </p>
              </div>

              {/* Timeline Items */}
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {selectedMission.timelineEvents.map((event, idx) => {
                  const isCompletion =
                    event.title === 'Mission Completed' || event.title === 'Payment Recovered';
                  const isFailure = event.title.includes('Exhausted') || event.title.includes('Closed');
                  const d = new Date(event.timestamp);

                  return (
                    <div key={event.id || idx} className="relative group">
                      {/* Timeline Dot */}
                      <div
                        className={`absolute -left-6 top-1 w-5 h-5 rounded-full border flex items-center justify-center ${
                          isCompletion
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : isFailure
                            ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {isCompletion ? (
                          <Check className="w-3 h-3 stroke-[3]" />
                        ) : isFailure ? (
                          <X className="w-3 h-3 stroke-[3]" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        )}
                      </div>

                      <div className="space-y-0.5 font-mono">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={`font-bold ${
                              isCompletion
                                ? 'text-emerald-400'
                                : isFailure
                                ? 'text-rose-400'
                                : 'text-white'
                            }`}
                          >
                            {event.title}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {d.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-sans">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Evidence Section */}
              {selectedMission.evidence.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-semibold">
                    Verified Evidence
                  </div>
                  <ul className="space-y-1 font-mono text-xs text-slate-300">
                    {selectedMission.evidence.map((ev, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-mono">
                Priority: <span className="text-amber-400 font-bold">{selectedMission.priority}</span>
              </div>

              <div className="flex items-center gap-2">
                {selectedMission.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleExecuteAction(selectedMission, 'Mark Completed')}
                    disabled={actionInProgress === selectedMission.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-colors cursor-pointer"
                  >
                    Mark Mission Completed
                  </button>
                )}
                <button
                  onClick={() => setSelectedMission(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
