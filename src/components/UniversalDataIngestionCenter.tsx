import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  CreditCard,
  ShoppingCart,
  BookOpen,
  Users,
  FileSpreadsheet,
  Database,
  Globe,
  Sliders,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Shield,
  Activity,
  ChevronRight,
  Upload,
  Play,
  FileText,
  Clock,
  Search,
} from 'lucide-react';
import {
  ConnectorMeta,
  IngestionJob,
  IngestionSummary,
  RevenueSourceCategory,
  Workspace,
} from '../types/index.js';
import { api } from '../services/api.js';

interface UniversalDataIngestionCenterProps {
  workspace: Workspace | null;
  onNavigateToCommandCenter?: () => void;
  onNavigateToRecovery?: () => void;
  onShowToast?: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const UniversalDataIngestionCenter: React.FC<UniversalDataIngestionCenterProps> = ({
  workspace,
  onNavigateToCommandCenter,
  onNavigateToRecovery,
  onShowToast,
}) => {
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [summary, setSummary] = useState<IngestionSummary | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<RevenueSourceCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingConnectorId, setSyncingConnectorId] = useState<string | null>(null);
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string; latency?: number } | null>(null);

  // Modal State
  const [activeModalConnector, setActiveModalConnector] = useState<ConnectorMeta | null>(null);
  const [modalFormData, setModalFormData] = useState<Record<string, any>>({});
  const [modalDedupeMode, setModalDedupeMode] = useState<'merge' | 'skip'>('merge');
  const [modalIsSubmitting, setModalIsSubmitting] = useState(false);
  const [modalResult, setModalResult] = useState<any | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [connRes, jobsRes, sumRes] = await Promise.all([
        api.getIngestionConnectors().catch(() => ({ connectors: [] })),
        api.getIngestionJobs().catch(() => ({ jobs: [] })),
        api.getIngestionSummary().catch(() => null),
      ]);
      setConnectors(connRes.connectors || []);
      setJobs(jobsRes.jobs || []);
      setSummary(sumRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspace?.id]);

  const handleTestConnection = async (connector: ConnectorMeta) => {
    setTestingConnectorId(connector.id);
    setTestResult(null);
    try {
      const res = await api.testIngestionConnector(connector.id, modalFormData[connector.id] || {});
      setTestResult({
        id: connector.id,
        success: res.connected,
        message: res.message || (res.connected ? 'Connection successful' : 'Connection failed'),
        latency: res.latencyMs,
      });
      if (res.connected) {
        onShowToast?.('Connection Verified', `${connector.name} is ready for canonical data ingestion.`, 'success');
      }
    } catch (err: any) {
      setTestResult({
        id: connector.id,
        success: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setTestingConnectorId(null);
    }
  };

  const handleQuickSampleIngest = async (connector: ConnectorMeta) => {
    setSyncingConnectorId(connector.id);
    try {
      const res = await api.injectSampleData(connector.id);
      onShowToast?.(
        'Ingestion Complete!',
        `Ingested from ${connector.name}: Generated ${res.opportunitiesGenerated || 0} canonical recovery opportunities.`,
        'success'
      );
      await loadData();
    } catch (err: any) {
      onShowToast?.('Ingestion Failed', err.message || 'Failed to ingest data', 'info');
    } finally {
      setSyncingConnectorId(null);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalConnector) return;

    setModalIsSubmitting(true);
    setModalResult(null);
    try {
      const res = await api.executeIngestion(
        activeModalConnector.id,
        modalFormData,
        undefined
      );
      setModalResult(res);
      onShowToast?.(
        'Data Normalized & Ingested',
        `Extracted and mapped records to Canonical Schema. ${res.opportunitiesGenerated || 0} opportunities created.`,
        'success'
      );
      await loadData();
    } catch (err: any) {
      setModalResult({ error: err.message || 'Ingestion execution error' });
    } finally {
      setModalIsSubmitting(false);
    }
  };

  const getCategoryIcon = (cat: RevenueSourceCategory) => {
    switch (cat) {
      case 'payments':
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
      case 'ecommerce':
        return <ShoppingCart className="w-4 h-4 text-blue-400" />;
      case 'accounting':
        return <BookOpen className="w-4 h-4 text-amber-400" />;
      case 'crm':
        return <Users className="w-4 h-4 text-purple-400" />;
      case 'files':
        return <FileSpreadsheet className="w-4 h-4 text-rose-400" />;
      case 'databases':
        return <Database className="w-4 h-4 text-cyan-400" />;
      case 'universal_api':
        return <Globe className="w-4 h-4 text-indigo-400" />;
    }
  };

  const filteredConnectors = connectors.filter((c) => {
    const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const categories: Array<{ id: RevenueSourceCategory | 'all'; label: string; count: number }> = [
    { id: 'all', label: 'All Sources', count: connectors.length },
    { id: 'payments', label: 'Payments', count: connectors.filter((c) => c.category === 'payments').length },
    { id: 'ecommerce', label: 'E-Commerce', count: connectors.filter((c) => c.category === 'ecommerce').length },
    { id: 'accounting', label: 'Accounting', count: connectors.filter((c) => c.category === 'accounting').length },
    { id: 'crm', label: 'CRM', count: connectors.filter((c) => c.category === 'crm').length },
    { id: 'files', label: 'Files', count: connectors.filter((c) => c.category === 'files').length },
    { id: 'databases', label: 'Databases', count: connectors.filter((c) => c.category === 'databases').length },
    { id: 'universal_api', label: 'Universal API', count: connectors.filter((c) => c.category === 'universal_api').length },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner / Framework Identity */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 border border-emerald-500/20 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium">
              <Layers className="w-3.5 h-3.5 animate-pulse" />
              <span>Universal Revenue Ingestion Framework</span>
              <span className="text-slate-400">·</span>
              <span className="text-white font-bold">30 Immediate Sources Supported</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display">
              Universal Revenue Data Ingestion
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every payment provider, e-commerce platform, accounting ledger, CRM, file export, SQL database, and custom API automatically normalizes into a single <strong className="text-emerald-400">Canonical Revenue Schema</strong>. Recovery Scanner, Revenue Missions, Recovery Autopilot, and Revenue Brain operate with 100% uniformity across all sources.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-slate-950/70 border border-white/10 rounded-xl p-3 px-4 font-mono text-xs">
              <div className="text-slate-400">Canonical Architecture</div>
              <div className="text-emerald-400 font-bold flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zero System Rewrites for Source #50</span>
              </div>
            </div>
            {onNavigateToRecovery && (
              <button
                onClick={onNavigateToRecovery}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-colors shadow-lg shadow-emerald-500/10 cursor-pointer"
              >
                <span>View Recovery Pipeline</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 text-xs font-mono">
          <div>
            <div className="text-slate-400">Supported Connectors</div>
            <div className="text-xl font-bold text-white mt-1">{summary?.totalConnectorsAvailable || 30} Sources</div>
            <div className="text-[11px] text-emerald-400 mt-0.5">7 Categories Pre-Built</div>
          </div>
          <div>
            <div className="text-slate-400">Active Ingested Sources</div>
            <div className="text-xl font-bold text-white mt-1">{summary?.totalSourcesConnected || jobs.length} Connected</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{jobs.length} Ingestion Jobs Completed</div>
          </div>
          <div>
            <div className="text-slate-400">Total Ingested Customers</div>
            <div className="text-xl font-bold text-white mt-1">{(summary?.totalCustomersUnified || 0).toLocaleString()} Unified</div>
            <div className="text-[11px] text-emerald-400 mt-0.5">Canonical De-duplicated</div>
          </div>
          <div>
            <div className="text-slate-400">At-Risk Revenue Normalization</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">
              {workspace?.currency || 'USD'} {((summary?.totalAtRiskRevenueCents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Auto-feeding Recovery Scanner</div>
          </div>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-white/5'
              }`}
            >
              {cat.id !== 'all' && getCategoryIcon(cat.id as RevenueSourceCategory)}
              <span>{cat.label}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-slate-400 font-normal">
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search connectors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredConnectors.map((c) => {
          const isSyncing = syncingConnectorId === c.id;
          const isTesting = testingConnectorId === c.id;
          const currentTest = testResult?.id === c.id ? testResult : null;

          return (
            <div
              key={c.id}
              className="group relative bg-[#071224] border border-white/10 hover:border-emerald-500/40 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/5"
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center">
                      {getCategoryIcon(c.category)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                        {c.name}
                      </h3>
                      <div className="text-[10px] text-slate-400 font-mono capitalize flex items-center gap-1.5">
                        <span>{c.category.replace('_', ' ')}</span>
                        <span>·</span>
                        <span>v{c.version}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Ready
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">
                  {c.description}
                </p>

                {/* Capabilities pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-white/5 text-slate-300">
                    Mode: {c.capabilities.syncMode}
                  </span>
                  {c.capabilities.supportsDirectRetry && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-white/5 text-slate-300">
                      Direct Retry
                    </span>
                  )}
                  {c.capabilities.supportedEntities.slice(0, 3).map((e) => (
                    <span key={e} className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.03] text-slate-400">
                      {e}
                    </span>
                  ))}
                </div>

                {/* Inline test result */}
                {currentTest && (
                  <div
                    className={`mb-3 p-2 rounded-lg text-xs font-mono flex items-center gap-2 ${
                      currentTest.success
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}
                  >
                    {currentTest.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{currentTest.message}</span>
                    {currentTest.latency && <span className="text-[10px] text-slate-400">({currentTest.latency}ms)</span>}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/5 flex items-center gap-2">
                <button
                  onClick={() => {
                    setActiveModalConnector(c);
                    setModalFormData({});
                    setModalResult(null);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sliders className="w-3 h-3 text-slate-400" />
                  <span>Configure</span>
                </button>

                <button
                  onClick={() => handleQuickSampleIngest(c)}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="1-Click Ingest Sample Dataset to test canonical recovery pipeline"
                >
                  {isSyncing ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  <span>Sample Sync</span>
                </button>

                <button
                  onClick={() => handleTestConnection(c)}
                  disabled={isTesting}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
                  title="Test Connection"
                >
                  <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-pulse text-emerald-400' : ''}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ingestion Telemetry & Pipeline Integration Info */}
      <div className="rounded-xl bg-[#071224] border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Real-Time Canonical Revenue Normalization Architecture</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              How data flows across all 30 sources into downstream engines without code changes:
            </p>
          </div>
        </div>

        {/* Pipeline Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-xs font-mono">
          <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Step 1</div>
            <div className="text-white font-semibold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Source Pull</span>
            </div>
            <div className="text-[11px] text-slate-400">Payments, Ecom, Accounting, CRM, Files, DB, API</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-emerald-500/20 space-y-1">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Step 2</div>
            <div className="text-emerald-300 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Canonical Schema</span>
            </div>
            <div className="text-[11px] text-slate-400">Uniform Customers, Subscriptions, Invoices & Failures</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Step 3</div>
            <div className="text-white font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Recovery Scanner</span>
            </div>
            <div className="text-[11px] text-slate-400">Identifies at-risk revenue & calculates single exposure</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Step 4</div>
            <div className="text-white font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>Autopilot Engine</span>
            </div>
            <div className="text-[11px] text-slate-400">Applies dunning rules, retries & multi-channel routing</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Step 5</div>
            <div className="text-white font-semibold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>Email Recovery</span>
            </div>
            <div className="text-[11px] text-slate-400">Merchant branded checkout recovery links dispatched</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Step 6</div>
            <div className="text-white font-semibold flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span>Revenue Brain</span>
            </div>
            <div className="text-[11px] text-slate-400">Unified health scores, churn prediction & expansion</div>
          </div>
        </div>
      </div>

      {/* Recent Ingestion Jobs Table */}
      <div className="rounded-xl bg-[#071224] border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Recent Ingestion Jobs & Downstream Telemetry</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">{jobs.length} jobs on record</span>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs font-mono">
            No ingestion jobs run yet in this workspace. Click &ldquo;Sample Sync&rdquo; on any source above to verify canonical normalization!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left text-slate-300">
              <thead className="text-[10px] text-slate-400 uppercase bg-slate-900/60 border-b border-white/5">
                <tr>
                  <th className="py-2.5 px-3">Job ID</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Extracted Records</th>
                  <th className="py-2.5 px-3">Failures Ingested</th>
                  <th className="py-2.5 px-3">Opportunities</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Downstream Engines</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {jobs.slice(0, 8).map((j) => (
                  <tr key={j.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-slate-400">{j.id.substring(0, 14)}...</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{j.connectorName}</td>
                    <td className="py-2.5 px-3 capitalize text-slate-400">{j.category}</td>
                    <td className="py-2.5 px-3">{j.recordsExtracted}</td>
                    <td className="py-2.5 px-3 text-amber-400">{j.failuresIngested}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{j.opportunitiesGenerated}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {j.downstreamPipelineSummary?.scannerExecuted && (
                          <span className="text-emerald-400">Scanner ✓</span>
                        )}
                        {j.downstreamPipelineSummary?.autopilotTriggered && (
                          <span className="text-purple-400">Autopilot ✓</span>
                        )}
                        {j.downstreamPipelineSummary?.revenueBrainRefreshed && (
                          <span className="text-indigo-400">Brain ✓</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configuration & Ingestion Modal */}
      {activeModalConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-[#071224] border border-white/15 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center">
                  {getCategoryIcon(activeModalConnector.category)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Configure {activeModalConnector.name}
                  </h3>
                  <div className="text-xs text-slate-400 font-mono capitalize">
                    {activeModalConnector.category.replace('_', ' ')} · v{activeModalConnector.version}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveModalConnector(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleModalSubmit} className="space-y-4">
              {activeModalConnector.configSchema.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-300 flex items-center justify-between">
                    <span>
                      {field.label} {field.required && <span className="text-rose-400">*</span>}
                    </span>
                    {field.description && (
                      <span className="text-[10px] text-slate-500">{field.description}</span>
                    )}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      rows={field.name.includes('rules') || field.name.includes('content') ? 4 : 3}
                      placeholder={field.placeholder}
                      value={modalFormData[field.name] || ''}
                      onChange={(e) =>
                        setModalFormData({ ...modalFormData, [field.name]: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={modalFormData[field.name] || field.defaultValue || ''}
                      onChange={(e) =>
                        setModalFormData({ ...modalFormData, [field.name]: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/50"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={modalFormData[field.name] || ''}
                      onChange={(e) =>
                        setModalFormData({ ...modalFormData, [field.name]: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                    />
                  )}
                </div>
              ))}

              {/* Deduplication Mode */}
              <div className="pt-2">
                <label className="text-xs font-mono text-slate-300 block mb-1.5">
                  Customer Deduplication Mode
                </label>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setModalDedupeMode('merge')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      modalDedupeMode === 'merge'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">Merge & Update</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Update existing customer balances</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalDedupeMode('skip')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      modalDedupeMode === 'skip'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">Skip Existing</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Ingest only new unseen records</div>
                  </button>
                </div>
              </div>

              {/* Result display */}
              {modalResult && (
                <div
                  className={`p-4 rounded-xl text-xs font-mono space-y-1.5 ${
                    modalResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    {modalResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{modalResult.message || modalResult.error}</span>
                  </div>
                  {modalResult.success && (
                    <div className="text-[11px] text-slate-300 pt-1 space-y-0.5">
                      <div>• Ingested Customers: {modalResult.customersIngested}</div>
                      <div>• Opportunities Created: {modalResult.opportunitiesGenerated}</div>
                      <div>• At-Risk Revenue: ${(modalResult.totalAtRiskCents / 100).toFixed(2)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModalConnector(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="submit"
                  disabled={modalIsSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {modalIsSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting & Normalizing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Ingestion Job</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
