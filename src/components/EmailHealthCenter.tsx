import React, { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Server,
  Zap,
  ArrowRight,
  Eye,
  MousePointer,
  Clock,
  Layers,
  Settings,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
  Sliders,
  Sparkles,
  Info,
  UserCheck,
  BarChart3,
  Ban,
  Plus,
  Trash2,
  Wand2,
  DollarSign,
  Building2,
} from 'lucide-react';
import {
  EmailDeliveryLog,
  EmailHealthMetrics,
  EmailProviderConfig,
  EmailProviderType,
  EmailTemplateType,
  EmailSuppressionRecord,
} from '../types/index.js';

interface EmailHealthCenterProps {
  workspaceId: string;
}

export const EmailHealthCenter: React.FC<EmailHealthCenterProps> = ({ workspaceId }) => {
  const [activeTab, setActiveTab] = useState<
    'wizard' | 'analytics' | 'campaigns' | 'providers' | 'suppression' | 'logs' | 'templates'
  >('wizard');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<{
    metrics: EmailHealthMetrics;
    config: any;
  } | null>(null);
  const [logs, setLogs] = useState<EmailDeliveryLog[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [providerConfig, setProviderConfig] = useState<EmailProviderConfig | null>(null);
  const [suppressions, setSuppressions] = useState<EmailSuppressionRecord[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Panels
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [testEmail, setTestEmail] = useState<string>('');
  const [testTemplate, setTestTemplate] = useState<EmailTemplateType>('payment_failed');
  const [testProviderOverride, setTestProviderOverride] = useState<string>('');
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Template Preview
  const [previewTemplate, setPreviewTemplate] = useState<string>('payment_failed');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Detail Drawer for selected log
  const [selectedLog, setSelectedLog] = useState<EmailDeliveryLog | null>(null);

  // Provider config edit state
  const [editConfig, setEditConfig] = useState<Partial<EmailProviderConfig>>({});
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string>('');

  // Verification state
  const [verifyingSender, setVerifyingSender] = useState<boolean>(false);
  const [verifyResultMsg, setVerifyResultMsg] = useState<string>('');

  // Suppression form
  const [newSuppressionEmail, setNewSuppressionEmail] = useState<string>('');
  const [newSuppressionReason, setNewSuppressionReason] = useState<
    'manual' | 'unsubscribe' | 'hard_bounce' | 'complaint'
  >('manual');
  const [addingSuppression, setAddingSuppression] = useState<boolean>(false);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<number>(1);

  // Sequence test trigger state
  const [triggeringStep, setTriggeringStep] = useState<number | null>(null);
  const [stepTriggerResult, setStepTriggerResult] = useState<any | null>(null);

  const fetchHealthAndLogs = async () => {
    try {
      setRefreshing(true);
      const headers = { 'x-workspace-id': workspaceId };

      const [healthRes, logsRes, provRes, tmplRes, analRes, suppRes] = await Promise.all([
        fetch('/api/email/health', { headers }),
        fetch(
          `/api/email/logs?status=${statusFilter}&provider=${providerFilter}&search=${encodeURIComponent(
            searchQuery
          )}`,
          { headers }
        ),
        fetch('/api/email/provider', { headers }),
        fetch('/api/email/templates', { headers }),
        fetch('/api/email/analytics', { headers }),
        fetch('/api/email/suppressions', { headers }),
      ]);

      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealthData(data);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData);
      }

      if (provRes.ok) {
        const pData = await provRes.json();
        setProviderConfig(pData);
        setEditConfig(pData);
      }

      if (tmplRes.ok) {
        const tData = await tmplRes.json();
        setTemplates(tData);
      }

      if (analRes.ok) {
        const aData = await analRes.json();
        setAnalytics(aData);
      }

      if (suppRes.ok) {
        const sData = await suppRes.json();
        setSuppressions(sData);
      }
    } catch (err) {
      console.error('[EmailHealthCenter] Failed to fetch email telemetry:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthAndLogs();
  }, [workspaceId, statusFilter, providerFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHealthAndLogs();
  };

  const handleVerifySender = async () => {
    setVerifyingSender(true);
    setVerifyResultMsg('');
    try {
      const res = await fetch('/api/email/verify-sender', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
      });
      const data = await res.json();
      if (data.verified) {
        setVerifyResultMsg(`Sender identity "${data.details?.sender || editConfig.sender_address}" is fully verified!`);
      } else {
        setVerifyResultMsg(`Verification pending or failed: ${data.error || 'Please check DNS records'}`);
      }
      fetchHealthAndLogs();
    } catch (err: any) {
      setVerifyResultMsg(`Verification check error: ${err.message}`);
    } finally {
      setVerifyingSender(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;
    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          toEmail: testEmail,
          templateId: testTemplate,
          providerOverride: testProviderOverride || undefined,
        }),
      });

      const result = await res.json();
      setTestResult(result);
      fetchHealthAndLogs();
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to dispatch test email',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveProviderConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    setConfigSuccessMsg('');

    try {
      const res = await fetch('/api/email/provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify(editConfig),
      });

      if (res.ok) {
        setConfigSuccessMsg('Workspace email identity & provider routing saved securely.');
        fetchHealthAndLogs();
        setTimeout(() => setConfigSuccessMsg(''), 4000);
      }
    } catch (err) {
      console.error('[EmailHealthCenter] Error saving config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuppressionEmail) return;
    setAddingSuppression(true);

    try {
      const res = await fetch('/api/email/suppressions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          email: newSuppressionEmail,
          reason: newSuppressionReason,
          source: 'manual_admin',
        }),
      });

      if (res.ok) {
        setNewSuppressionEmail('');
        fetchHealthAndLogs();
      }
    } catch (err) {
      console.error('Failed to add suppression:', err);
    } finally {
      setAddingSuppression(false);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    try {
      const res = await fetch(`/api/email/suppressions/${id}`, {
        method: 'DELETE',
        headers: {
          'x-workspace-id': workspaceId,
        },
      });
      if (res.ok) {
        fetchHealthAndLogs();
      }
    } catch (err) {
      console.error('Failed to remove suppression:', err);
    }
  };

  const handleTriggerSequenceStep = async (stepIndex: number, opportunityId?: string) => {
    setTriggeringStep(stepIndex);
    setStepTriggerResult(null);

    try {
      // Find suitable opportunity
      const oppId = opportunityId || logs.find((l) => l.opportunity_id)?.opportunity_id || 'sample_opp';
      const res = await fetch('/api/email/sequence/step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          opportunityId: oppId,
          step: stepIndex,
          forceSend: true,
        }),
      });

      const data = await res.json();
      setStepTriggerResult(data);
      fetchHealthAndLogs();
    } catch (err: any) {
      setStepTriggerResult({ error: err.message });
    } finally {
      setTriggeringStep(null);
    }
  };

  const loadTemplatePreview = async (tmplId: string) => {
    setPreviewTemplate(tmplId);
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/email/render-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          templateId: tmplId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
      }
    } catch (err) {
      console.error('Failed to preview template:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'templates') {
      loadTemplatePreview(previewTemplate);
    }
  }, [activeTab]);

  const metrics = healthData?.metrics;
  const verificationStatus = providerConfig?.verification_status || 'connected';
  const merchantBusinessName =
    providerConfig?.business_name || healthData?.config?.merchant_identity?.businessName || 'Your Business';
  const merchantSenderAddress =
    providerConfig?.sender_address ||
    healthData?.config?.merchant_identity?.senderAddress ||
    'billing@yourdomain.com';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Production Email Recovery Infrastructure</h1>
              <p className="text-sm text-slate-400">
                Direct merchant-branded dunning sequences (no ReviveOS branding), automated delivery failover, and verified revenue attribution.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchHealthAndLogs()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setShowTestModal(true);
              setTestResult(null);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Send Test Email
          </button>
        </div>
      </div>

      {/* SENDER IDENTITY & VERIFICATION BANNER (CRITICAL RULE VISIBILITY) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
                  Merchant Sender Identity:
                </span>
                <span className="text-sm font-bold text-white">{merchantBusinessName}</span>
                <span className="text-xs text-indigo-300 font-mono bg-indigo-950/60 px-2.5 py-0.5 rounded-md border border-indigo-800/60">
                  {merchantSenderAddress}
                </span>

                {/* Verification Status Badge */}
                {verificationStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                )}
                {verificationStatus === 'pending_verification' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Clock className="w-3.5 h-3.5" /> Pending Verification
                  </span>
                )}
                {verificationStatus === 'failed' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <XCircle className="w-3.5 h-3.5" /> Verification Failed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Strict White-labeling Active: ReviveOS branding is completely suppressed. Communications appear directly from your domain.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleVerifySender}
              disabled={verifyingSender}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer"
            >
              <UserCheck className={`w-3.5 h-3.5 ${verifyingSender ? 'animate-spin text-indigo-400' : 'text-emerald-400'}`} />
              {verifyingSender ? 'Checking Ownership...' : 'Verify Sender Ownership'}
            </button>
            <button
              onClick={() => setActiveTab('wizard')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 text-xs font-semibold rounded-xl border border-indigo-500/30 transition cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              Setup Wizard
            </button>
          </div>
        </div>

        {verifyResultMsg && (
          <div className="mt-3 text-xs font-mono p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-slate-300">
            {verifyResultMsg}
          </div>
        )}
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Emails Sent</span>
            <Send className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {metrics ? metrics.total_sent.toLocaleString() : '0'}
          </div>
          <div className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {metrics?.delivery_rate ?? 100}% delivery rate
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {metrics ? metrics.total_delivered.toLocaleString() : '0'}
          </div>
          <div className="text-xs text-slate-400">Verified merchant domain</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Open Rate</span>
            <Eye className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {metrics ? `${metrics.open_rate}%` : '0%'}
          </div>
          <div className="text-xs text-sky-400">
            {metrics?.total_opened ?? 0} opens tracked
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Click Rate</span>
            <MousePointer className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {metrics ? `${metrics.click_rate}%` : '0%'}
          </div>
          <div className="text-xs text-violet-400">
            {metrics?.total_clicked ?? 0} recovery link clicks
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Revenue Recovered</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mb-1">
            ${analytics ? (analytics.revenue_recovered_cents / 100).toFixed(2) : '0.00'}
          </div>
          <div className="text-xs text-emerald-400">
            {analytics?.total_recovered ?? 0} invoices paid
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Suppressed</span>
            <Ban className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {suppressions.length}
          </div>
          <div className="text-xs text-amber-400">
            Auto-protecting reputation
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('wizard')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'wizard'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          Setup Wizard
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'analytics'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics & Attribution
        </button>

        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'campaigns'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Recovery Sequences (Day 0–10)
        </button>

        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'providers'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Provider Routing & Keys
        </button>

        <button
          onClick={() => setActiveTab('suppression')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'suppression'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Ban className="w-4 h-4" />
          Suppression List ({suppressions.length})
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'logs'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Delivery Audit Trail ({logs.length})
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'templates'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          Dynamic Templates ({templates.length || 7})
        </button>
      </div>

      {/* TAB: CONFIGURATION WIZARD */}
      {activeTab === 'wizard' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-indigo-400" />
                Email Infrastructure Configuration Wizard
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure your merchant identity, link your email delivery provider, and verify domain sender ownership in 3 simple steps.
              </p>
            </div>
            {/* Step Indicators */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  onClick={() => setWizardStep(step)}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                    wizardStep === step
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40'
                      : wizardStep > step
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {wizardStep > step ? '✓' : step}
                </button>
              ))}
            </div>
          </div>

          {/* Wizard Step 1: Business Identity */}
          {wizardStep === 1 && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                <strong>Critical Rule:</strong> ReviveOS never sends emails from ReviveOS branding. All recovery communications appear directly from your business domain (e.g. Acme Fitness / billing@acmefitness.com).
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Business Name
                  </label>
                  <input
                    type="text"
                    placeholder="Acme Fitness"
                    value={editConfig.business_name || ''}
                    onChange={(e) => setEditConfig({ ...editConfig, business_name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Legal or public brand name displayed in emails</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    From Name
                  </label>
                  <input
                    type="text"
                    placeholder="Acme Fitness Billing"
                    value={editConfig.from_name || ''}
                    onChange={(e) => setEditConfig({ ...editConfig, from_name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Sender name displayed in customer inboxes</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Sender Address (From Email)
                  </label>
                  <input
                    type="email"
                    placeholder="billing@acmefitness.com"
                    value={editConfig.sender_address || ''}
                    onChange={(e) => setEditConfig({ ...editConfig, sender_address: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Verified merchant address (must not contain reviveos)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Reply-To Address
                  </label>
                  <input
                    type="email"
                    placeholder="support@acmefitness.com"
                    value={editConfig.reply_to_address || ''}
                    onChange={(e) => setEditConfig({ ...editConfig, reply_to_address: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Where customers send responses or payment inquiries</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    handleSaveProviderConfig();
                    setWizardStep(2);
                  }}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
                >
                  Save & Continue to Providers <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Wizard Step 2: Email Provider Selection */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Primary Delivery Provider
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'resend', name: 'Resend', tag: 'Fast API' },
                    { id: 'smtp', name: 'SMTP Relay', tag: 'Universal' },
                    { id: 'sendgrid', name: 'SendGrid', tag: 'Scale' },
                    { id: 'ses', name: 'Amazon SES', tag: 'AWS Relay' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setEditConfig({ ...editConfig, primary_provider: p.id as any })}
                      className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                        editConfig.primary_provider === p.id
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold text-sm text-white">{p.name}</div>
                      <div className="text-[11px] text-indigo-400 mt-0.5">{p.tag}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Credential Fields Based on Selected Provider */}
              <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white capitalize">
                  {editConfig.primary_provider || 'resend'} Credentials
                </h4>

                {editConfig.primary_provider === 'resend' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Resend API Key</label>
                    <input
                      type="password"
                      placeholder="re_••••••••••••••••"
                      value={editConfig.resend?.api_key || ''}
                      onChange={(e) =>
                        setEditConfig({
                          ...editConfig,
                          resend: { ...editConfig.resend, api_key: e.target.value },
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {editConfig.primary_provider === 'smtp' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Host</label>
                      <input
                        type="text"
                        placeholder="smtp.mailgun.org"
                        value={editConfig.smtp?.host || ''}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            smtp: { ...editConfig.smtp, host: e.target.value },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Port</label>
                      <input
                        type="number"
                        placeholder="587"
                        value={editConfig.smtp?.port || 587}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            smtp: { ...editConfig.smtp, port: Number(e.target.value) },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Username</label>
                      <input
                        type="text"
                        placeholder="user@acmefitness.com"
                        value={editConfig.smtp?.username || ''}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            smtp: { ...editConfig.smtp, username: e.target.value },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Password</label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={editConfig.smtp?.password || ''}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            smtp: { ...editConfig.smtp, password: e.target.value },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {editConfig.primary_provider === 'sendgrid' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">SendGrid API Key</label>
                    <input
                      type="password"
                      placeholder="SG.••••••••••••••••"
                      value={editConfig.sendgrid?.api_key || ''}
                      onChange={(e) =>
                        setEditConfig({
                          ...editConfig,
                          sendgrid: { ...editConfig.sendgrid, api_key: e.target.value },
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {editConfig.primary_provider === 'ses' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">AWS Region</label>
                      <input
                        type="text"
                        placeholder="us-east-1"
                        value={editConfig.ses?.region || 'us-east-1'}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            ses: { ...editConfig.ses, region: e.target.value },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">SES SMTP Username</label>
                      <input
                        type="text"
                        placeholder="AKIA••••••••••••"
                        value={editConfig.ses?.smtp_username || ''}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            ses: { ...editConfig.ses, smtp_username: e.target.value },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">SES SMTP Password</label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={editConfig.ses?.smtp_password || ''}
                        onChange={(e) =>
                          setEditConfig({
                            ...editConfig,
                            ses: { ...editConfig.ses, smtp_password: e.target.value },
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition cursor-pointer"
                >
                  Back to Identity
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSaveProviderConfig();
                    setWizardStep(3);
                  }}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
                >
                  Save & Verify Ownership <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Wizard Step 3: Verification & Live Test */}
          {wizardStep === 3 && (
            <div className="space-y-6">
              <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  Sender Ownership Verification
                </h4>
                <p className="text-xs text-slate-400">
                  Verify that your business owns <span className="text-white font-mono">{editConfig.sender_address || 'your sender address'}</span> and is authorized to dispatch recovery communications.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleVerifySender}
                    disabled={verifyingSender}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${verifyingSender ? 'animate-spin' : ''}`} />
                    {verifyingSender ? 'Verifying with Provider...' : 'Run Verification Check'}
                  </button>

                  <span className="text-xs text-slate-400">
                    Status: <strong className="text-white uppercase">{verificationStatus}</strong>
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-400" />
                  Live Dispatch Test
                </h4>
                <p className="text-xs text-slate-400">
                  Send a live test payment failure notice to your email to verify template styling, currency formatting, and one-click recovery links.
                </p>

                <div className="flex gap-3">
                  <input
                    type="email"
                    placeholder="founder@acmefitness.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    onClick={handleSendTestEmail}
                    disabled={sendingTest || !testEmail}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {sendingTest ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send Test Notice
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-mono border ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    {testResult.success ? `✓ Dispatched via ${testResult.provider} (Message ID: ${testResult.messageId})` : `Failed: ${testResult.error}`}
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition cursor-pointer"
                >
                  Back to Providers
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer"
                >
                  Complete Setup & Open Analytics <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: ANALYTICS & ATTRIBUTION */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Recovery Email Analytics & Performance
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Authoritative conversion telemetry tracking delivery, customer open rates, recovery portal clicks, and exact recovered revenue.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-xs text-slate-400 uppercase font-semibold">Emails Sent</div>
                <div className="text-3xl font-bold text-white mt-1">
                  {analytics ? analytics.emails_sent : metrics?.total_sent || 0}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">100% tenant-isolated</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-xs text-slate-400 uppercase font-semibold">Open Rate</div>
                <div className="text-3xl font-bold text-purple-400 mt-1">
                  {analytics ? `${analytics.open_rate}%` : `${metrics?.open_rate || 0}%`}
                </div>
                <div className="text-[11px] text-purple-400/80 mt-1">
                  {analytics?.total_opened ?? metrics?.total_opened ?? 0} opens tracked via 1x1 pixel
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-xs text-slate-400 uppercase font-semibold">Click Rate</div>
                <div className="text-3xl font-bold text-indigo-400 mt-1">
                  {analytics ? `${analytics.click_rate}%` : `${metrics?.click_rate || 0}%`}
                </div>
                <div className="text-[11px] text-indigo-400/80 mt-1">
                  {analytics?.total_clicked ?? metrics?.total_clicked ?? 0} clicks on secure recovery link
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-xs text-slate-400 uppercase font-semibold">Revenue Recovered</div>
                <div className="text-3xl font-bold text-emerald-400 mt-1">
                  ${analytics ? (analytics.revenue_recovered_cents / 100).toFixed(2) : '0.00'}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">
                  Directly attributed to recovery emails
                </div>
              </div>
            </div>
          </div>

          {/* Recovery Attribution Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Recovery Attribution Audit Log
            </h4>
            <p className="text-xs text-slate-400">
              Precise record of which individual recovery email generated each recovered payment.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Recovery Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Sequence Step / Subject</th>
                    <th className="px-4 py-3">Email Provider</th>
                    <th className="px-4 py-3 text-right">Amount Recovered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.filter((l) => l.status === 'recovered' || Boolean(l.recovered_at)).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No email revenue attributions recorded yet. Dispatched emails that lead to successful payments will automatically populate here.
                      </td>
                    </tr>
                  ) : (
                    logs
                      .filter((l) => l.status === 'recovered' || Boolean(l.recovered_at))
                      .map((l) => (
                        <tr key={l.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-slate-400">
                            {l.recovered_at ? new Date(l.recovered_at).toLocaleDateString() : new Date(l.sent_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{l.customer_name || 'Customer'}</div>
                            <div className="text-[11px] text-slate-400">{l.to_email}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-indigo-400">
                              Day {l.sequence_step === 0 ? 0 : l.sequence_step === 1 ? 2 : l.sequence_step === 2 ? 4 : l.sequence_step === 3 ? 7 : 10}:
                            </span>{' '}
                            <span className="text-slate-200">{l.subject}</span>
                          </td>
                          <td className="px-4 py-3 font-mono uppercase text-indigo-300">
                            {l.provider}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-400">
                            ${l.recovered_amount_cents ? (l.recovered_amount_cents / 100).toFixed(2) : '0.00'}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: RECOVERY SEQUENCES */}
      {activeTab === 'campaigns' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Automated Recovery Sequences (5 Stages)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Automated 5-step dunning cadence triggered upon payment failure. Halts immediately when customer settles.
              </p>
            </div>

            {/* Business Safety Rules Pill */}
            <div className="flex items-center gap-2 text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Safety Rules: <strong>Zero Duplicates</strong> • <strong>Halts on Recovery</strong> • <strong>Respects Suppressions</strong>
              </span>
            </div>
          </div>

          {stepTriggerResult && (
            <div
              className={`p-4 rounded-xl text-xs font-mono border ${
                stepTriggerResult.executed
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : stepTriggerResult.skipped
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              <div className="font-bold mb-1">
                {stepTriggerResult.executed
                  ? '✓ Sequence Step Dispatched'
                  : stepTriggerResult.skipped
                  ? '⚠ Guard Triggered (Skipped)'
                  : '❌ Execution Failed'}
              </div>
              <div>Reason: {stepTriggerResult.reason || stepTriggerResult.error}</div>
              {stepTriggerResult.recipient && <div>Recipient: {stepTriggerResult.recipient}</div>}
              {stepTriggerResult.subject && <div>Subject: {stepTriggerResult.subject}</div>}
            </div>
          )}

          <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-indigo-500/40">
            {[
              {
                step: 0,
                day: 0,
                name: 'Payment Failed Notice',
                tag: 'Immediate',
                color: 'bg-indigo-600',
                textColor: 'text-indigo-400',
                badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                desc: 'Sent immediately when issuing bank declines the recurring charge. Explains exact card decline reason and provides 1-click tokenized payment retry link.',
                template: 'payment_failed',
              },
              {
                step: 1,
                day: 2,
                name: 'Friendly Reminder',
                tag: 'Day 2',
                color: 'bg-blue-600',
                textColor: 'text-blue-400',
                badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                desc: 'Polite reminder encouraging customer to update billing details on file before the grace period ends.',
                template: 'reminder_day2',
              },
              {
                step: 2,
                day: 4,
                name: 'Outstanding Balance Reminder',
                tag: 'Day 4',
                color: 'bg-violet-600',
                textColor: 'text-violet-400',
                badgeColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                desc: 'Highlights the outstanding invoice balance and details remaining access days under grace period.',
                template: 'reminder_day4',
              },
              {
                step: 3,
                day: 7,
                name: 'Urgent Suspension Warning',
                tag: 'Day 7',
                color: 'bg-amber-600',
                textColor: 'text-amber-400',
                badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                desc: 'Urgent notice warning of imminent service disruption and account suspension.',
                template: 'urgent_reminder_day7',
              },
              {
                step: 4,
                day: 10,
                name: 'Final Pre-Cancellation Attempt',
                tag: 'Day 10',
                color: 'bg-red-600',
                textColor: 'text-red-400',
                badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20',
                desc: 'Final opportunity notice before subscription termination and account downgrade. Includes emergency renewal button.',
                template: 'final_attempt_day10',
              },
            ].map((s) => (
              <div key={s.step} className="relative flex items-start gap-4">
                <div
                  className={`absolute -left-6 top-1 w-6 h-6 rounded-full ${s.color} text-white font-bold text-xs flex items-center justify-center shadow-lg`}
                >
                  {s.step + 1}
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex-1 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${s.textColor} uppercase tracking-wider`}>
                        Day {s.day} • {s.name}
                      </span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${s.badgeColor}`}>
                        {s.tag}
                      </span>
                    </div>

                    <button
                      onClick={() => handleTriggerSequenceStep(s.step)}
                      disabled={triggeringStep === s.step}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className={`w-3 h-3 ${triggeringStep === s.step ? 'animate-spin' : ''}`} />
                      {triggeringStep === s.step ? 'Dispatched...' : 'Trigger Test Step'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">{s.desc}</p>

                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex-wrap gap-2">
                    <div>
                      Template: <span className={s.textColor}>{s.template}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Dynamic Variables: Customer Name, Invoice Amount, Due Date, Recovery Link, Business Name
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: PROVIDERS ROUTING */}
      {activeTab === 'providers' && (
        <form onSubmit={handleSaveProviderConfig} className="space-y-6">
          {configSuccessMsg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {configSuccessMsg}
            </div>
          )}

          {/* Workspace Email Configuration Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Workspace Email Configuration (Merchant Identity)
            </h3>
            <p className="text-xs text-slate-400">
              Configure your exact business identity. ReviveOS never sends recovery emails under its own name.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Name</label>
                <input
                  type="text"
                  placeholder="Acme Fitness"
                  value={editConfig.business_name || ''}
                  onChange={(e) => setEditConfig({ ...editConfig, business_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">From Name</label>
                <input
                  type="text"
                  placeholder="Acme Fitness Billing"
                  value={editConfig.from_name || ''}
                  onChange={(e) => setEditConfig({ ...editConfig, from_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Sender Address (From Email)
                </label>
                <input
                  type="email"
                  placeholder="billing@acmefitness.com"
                  value={editConfig.sender_address || ''}
                  onChange={(e) => setEditConfig({ ...editConfig, sender_address: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Reply-To Address</label>
                <input
                  type="email"
                  placeholder="support@acmefitness.com"
                  value={editConfig.reply_to_address || ''}
                  onChange={(e) => setEditConfig({ ...editConfig, reply_to_address: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Primary Provider & Failover Order */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Multi-Provider Failover Routing
            </h3>
            <p className="text-xs text-slate-400">
              ReviveOS attempts providers in priority sequence. If primary experiences outages or rate limits, it automatically falls back to secondary and tertiary providers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Primary Provider</label>
                <select
                  value={editConfig.primary_provider || 'resend'}
                  onChange={(e) => setEditConfig({ ...editConfig, primary_provider: e.target.value as any })}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="resend">Resend (REST API)</option>
                  <option value="smtp">SMTP Relay (Nodemailer)</option>
                  <option value="sendgrid">SendGrid (REST API)</option>
                  <option value="ses">Amazon SES (AWS Relay)</option>
                  <option value="mock">Sandbox Test Provider</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Routing Failover Chain</label>
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-indigo-300 font-mono flex items-center gap-2 overflow-x-auto">
                  <span>1. {editConfig.primary_provider || 'resend'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>2. SMTP Relay</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>3. SendGrid</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>4. Amazon SES</span>
                </div>
              </div>
            </div>
          </div>

          {/* Amazon SES Settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-amber-400" />
                Amazon SES Settings
              </h3>
              <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                AWS High Volume
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">AWS Region</label>
                <input
                  type="text"
                  placeholder="us-east-1"
                  value={editConfig.ses?.region || 'us-east-1'}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      ses: { ...editConfig.ses, region: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">SES SMTP Username</label>
                <input
                  type="text"
                  placeholder="AKIA••••••••••••"
                  value={editConfig.ses?.smtp_username || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      ses: { ...editConfig.ses, smtp_username: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">SES SMTP Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={editConfig.ses?.smtp_password || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      ses: { ...editConfig.ses, smtp_password: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Resend Settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Resend Provider Settings</h3>
              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                High Speed REST API
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Resend API Key</label>
                <input
                  type="password"
                  placeholder="re_••••••••••••••••"
                  value={editConfig.resend?.api_key || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      resend: { ...editConfig.resend, api_key: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">From Address</label>
                <input
                  type="email"
                  placeholder="billing@yourdomain.com"
                  value={editConfig.resend?.from_email || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      resend: { ...editConfig.resend, from_email: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* SMTP Relay Settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">SMTP Relay Settings</h3>
              <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                Nodemailer TLS Relay
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.mailgun.org"
                  value={editConfig.smtp?.host || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      smtp: { ...editConfig.smtp, host: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Port</label>
                <input
                  type="number"
                  placeholder="587"
                  value={editConfig.smtp?.port || 587}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      smtp: { ...editConfig.smtp, port: Number(e.target.value) },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Username</label>
                <input
                  type="text"
                  placeholder="user@domain.com"
                  value={editConfig.smtp?.username || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      smtp: { ...editConfig.smtp, username: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">SMTP Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={editConfig.smtp?.password || ''}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      smtp: { ...editConfig.smtp, password: e.target.value },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Security</label>
                <select
                  value={editConfig.smtp?.secure ? 'true' : 'false'}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      smtp: { ...editConfig.smtp, secure: e.target.value === 'true' },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="false">STARTTLS / Port 587 (Standard)</option>
                  <option value="true">SSL/TLS / Port 465</option>
                </select>
              </div>
            </div>
          </div>

          {/* SendGrid Settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">SendGrid Provider Settings</h3>
              <span className="text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                High Volume IP Pools
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">SendGrid API Key</label>
              <input
                type="password"
                placeholder="SG.••••••••••••••••"
                value={editConfig.sendgrid?.api_key || ''}
                onChange={(e) =>
                  setEditConfig({
                    ...editConfig,
                    sendgrid: { ...editConfig.sendgrid, api_key: e.target.value },
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
            >
              {savingConfig ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Saving Configuration...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Save Provider Configuration
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB: SUPPRESSION LIST */}
      {activeTab === 'suppression' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-amber-400" />
                Suppression List & Reputation Guard
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Addresses on this list are permanently blocked from automated sequence dispatches to protect your domain reputation.
              </p>
            </div>
          </div>

          {/* Add Suppression Form */}
          <form onSubmit={handleAddSuppression} className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 w-full">
              <input
                type="email"
                required
                placeholder="suppressed.customer@domain.com"
                value={newSuppressionEmail}
                onChange={(e) => setNewSuppressionEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="w-full sm:w-48">
              <select
                value={newSuppressionReason}
                onChange={(e) => setNewSuppressionReason(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="manual">Manual Request</option>
                <option value="unsubscribe">Unsubscribed</option>
                <option value="hard_bounce">Hard Bounce</option>
                <option value="complaint">Spam Complaint</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={addingSuppression || !newSuppressionEmail}
              className="w-full sm:w-auto px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add Suppression
            </button>
          </form>

          {/* Suppression Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Suppressed Email</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Date Suppressed</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {suppressions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No emails currently suppressed. Your sender domain reputation is in optimal condition.
                    </td>
                  </tr>
                ) : (
                  suppressions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-bold text-white">{s.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {s.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(s.suppressed_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemoveSuppression(s.id)}
                          className="px-2.5 py-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: DELIVERY AUDIT TRAIL */}
      {activeTab === 'logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Filter Bar */}
          <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recipient, subject, or message ID..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </form>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="opened">Opened</option>
                  <option value="clicked">Clicked</option>
                  <option value="recovered">Recovered</option>
                  <option value="suppressed">Suppressed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Provider:</span>
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Providers</option>
                  <option value="resend">Resend</option>
                  <option value="smtp">SMTP</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="ses">Amazon SES</option>
                  <option value="mock">Sandbox / Mock</option>
                </select>
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Recipient & Customer</th>
                  <th className="px-6 py-4">Subject / Template</th>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <Mail className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-semibold text-slate-400">No email delivery records found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Send a test email or trigger a recovery workflow to generate authoritative delivery logs.
                      </p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                        {new Date(log.sent_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{log.to_email}</div>
                        {log.customer_name && (
                          <div className="text-xs text-slate-400">{log.customer_name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="truncate font-medium text-slate-200">{log.subject}</div>
                        <div className="text-[11px] font-mono text-indigo-400">{log.template_id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono uppercase px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded-md">
                          {log.provider}
                        </span>
                        {log.failover_count > 0 && (
                          <span className="ml-1.5 text-[10px] text-amber-400 font-bold">
                            ({log.failover_count} failovers)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            log.status === 'delivered'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : log.status === 'sent'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : log.status === 'opened'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : log.status === 'clicked'
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                              : log.status === 'recovered'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : log.status === 'suppressed'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {log.status === 'delivered' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {log.status === 'opened' && <Eye className="w-3.5 h-3.5" />}
                          {log.status === 'clicked' && <MousePointer className="w-3.5 h-3.5" />}
                          {log.status === 'recovered' && <DollarSign className="w-3.5 h-3.5" />}
                          {log.status === 'suppressed' && <Ban className="w-3.5 h-3.5" />}
                          {log.status === 'failed' && <AlertTriangle className="w-3.5 h-3.5" />}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
                        >
                          View Audit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: DYNAMIC TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Dynamic Recovery Templates</h3>
            <p className="text-xs text-slate-400">
              High-converting transactional email templates with automated variable interpolation.
            </p>

            <div className="space-y-2">
              {[
                { id: 'payment_failed', name: 'Day 0: Payment Failed Notice' },
                { id: 'reminder_day2', name: 'Day 2: Friendly Reminder' },
                { id: 'reminder_day4', name: 'Day 4: Outstanding Balance Notice' },
                { id: 'urgent_reminder_day7', name: 'Day 7: Urgent Suspension Warning' },
                { id: 'final_attempt_day10', name: 'Day 10: Final Pre-Cancellation Notice' },
                { id: 'update_payment_method', name: 'Update Payment Method' },
                { id: 'recovery_link', name: '1-Click Recovery Link' },
                { id: 'payment_recovered', name: 'Payment Recovered Receipt' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTemplatePreview(t.id)}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    previewTemplate === t.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold text-white">{t.name}</div>
                  <div className="text-[11px] font-mono text-indigo-400 mt-0.5">{t.id}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Live Email Preview</h3>
                <p className="text-xs text-slate-400">
                  Rendered with merchant branding and secure recovery link.
                </p>
              </div>
              <button
                onClick={() => {
                  setTestTemplate(previewTemplate as any);
                  setShowTestModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send Test of this Template
              </button>
            </div>

            {previewLoading ? (
              <div className="h-96 flex items-center justify-center text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
              </div>
            ) : (
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 overflow-hidden">
                <iframe
                  title="Template Preview"
                  srcDoc={previewHtml}
                  className="w-full h-[540px] rounded-lg border-0 bg-white"
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* SEND TEST EMAIL MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-indigo-400 font-bold">
                <Send className="w-5 h-5" />
                <span>Send Production Test Email</span>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Recipient Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="founder@company.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Recovery Template
                </label>
                <select
                  value={testTemplate}
                  onChange={(e) => setTestTemplate(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="payment_failed">Payment Failed Notice (Day 0)</option>
                  <option value="reminder_day2">Friendly Reminder (Day 2)</option>
                  <option value="reminder_day4">Outstanding Balance Notice (Day 4)</option>
                  <option value="urgent_reminder_day7">Urgent Suspension Warning (Day 7)</option>
                  <option value="final_attempt_day10">Final Pre-Cancellation Attempt (Day 10)</option>
                  <option value="update_payment_method">Update Payment Method</option>
                  <option value="recovery_link">1-Click Express Recovery Link</option>
                  <option value="payment_recovered">Payment Receipt Confirmation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Provider Override (Optional)
                </label>
                <select
                  value={testProviderOverride}
                  onChange={(e) => setTestProviderOverride(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Default Failover Routing</option>
                  <option value="resend">Force Resend Only</option>
                  <option value="smtp">Force SMTP Relay Only</option>
                  <option value="sendgrid">Force SendGrid Only</option>
                  <option value="ses">Force Amazon SES Only</option>
                  <option value="mock">Sandbox Simulator</option>
                </select>
              </div>

              {testResult && (
                <div
                  className={`p-4 rounded-xl text-xs font-mono border ${
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <div className="font-bold mb-1">
                    {testResult.success ? '✅ Test Email Delivered' : '❌ Delivery Attempt Failed'}
                  </div>
                  {testResult.messageId && <div>Message ID: {testResult.messageId}</div>}
                  {testResult.provider && <div>Provider Used: {testResult.provider}</div>}
                  {testResult.failoverCount > 0 && <div>Failovers Triggered: {testResult.failoverCount}</div>}
                  {testResult.error && <div className="mt-1 text-red-400">Error: {testResult.error}</div>}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
                >
                  {sendingTest ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Dispatching...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Dispatch Now
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER FOR EMAIL AUDIT RECORD */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-xl h-full p-6 overflow-y-auto space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Delivery Record Details</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/60 p-3 rounded-xl">
                  <div className="text-slate-400 font-semibold mb-1">Status</div>
                  <div className="text-sm font-bold text-white uppercase">{selectedLog.status}</div>
                </div>
                <div className="bg-slate-800/60 p-3 rounded-xl">
                  <div className="text-slate-400 font-semibold mb-1">Provider</div>
                  <div className="text-sm font-bold text-indigo-400 uppercase">{selectedLog.provider}</div>
                </div>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl space-y-1">
                <div className="text-slate-400 font-semibold">Recipient</div>
                <div className="text-white font-mono">{selectedLog.to_email}</div>
                {selectedLog.customer_name && (
                  <div className="text-slate-300">Customer: {selectedLog.customer_name}</div>
                )}
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl space-y-1">
                <div className="text-slate-400 font-semibold">Subject</div>
                <div className="text-white font-medium">{selectedLog.subject}</div>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl space-y-1">
                <div className="text-slate-400 font-semibold">Sequence & Step</div>
                <div className="text-indigo-300 font-mono">
                  {selectedLog.is_recovery_email ? `Recovery Step ${selectedLog.sequence_step ?? 'N/A'}` : 'Direct Transactional'}
                </div>
              </div>

              {selectedLog.recovered_at && (
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl space-y-1">
                  <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" /> Revenue Recovered
                  </div>
                  <div className="text-white font-bold text-sm">
                    ${selectedLog.recovered_amount_cents ? (selectedLog.recovered_amount_cents / 100).toFixed(2) : '0.00'}
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Recovered at: {new Date(selectedLog.recovered_at).toLocaleString()}
                  </div>
                </div>
              )}

              {selectedLog.message_id && (
                <div className="bg-slate-800/60 p-3 rounded-xl space-y-1">
                  <div className="text-slate-400 font-semibold">External Message ID</div>
                  <div className="text-slate-300 font-mono break-all">{selectedLog.message_id}</div>
                </div>
              )}

              {selectedLog.failover_history && selectedLog.failover_history.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-500/30 p-4 rounded-xl space-y-2">
                  <div className="text-amber-400 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Failover History
                  </div>
                  {selectedLog.failover_history.map((f, idx) => (
                    <div key={idx} className="text-slate-300 text-[11px] font-mono">
                      • {f.provider.toUpperCase()} failed: {f.error} ({new Date(f.timestamp).toLocaleTimeString()})
                    </div>
                  ))}
                </div>
              )}

              {selectedLog.body_html && (
                <div>
                  <div className="text-slate-400 font-semibold mb-2">Rendered HTML Payload</div>
                  <div className="bg-white text-slate-900 p-4 rounded-xl max-h-64 overflow-y-auto border border-slate-700">
                    <div dangerouslySetInnerHTML={{ __html: selectedLog.body_html }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
