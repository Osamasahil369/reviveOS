import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Calculator,
  Shield,
  CheckCircle2,
  Copy,
  DollarSign,
  TrendingUp,
  Lock,
  Building2,
  Globe,
  Save,
  Mail,
  MessageSquare,
  Webhook,
  Sliders,
  AlertCircle,
  ExternalLink,
  Layers,
  Key,
  Palette,
  CreditCard as CardIcon,
  ShieldCheck as SecurityIcon,
} from 'lucide-react';
import { Workspace, RecoveryRulesConfig, EmailSenderConfig, SmsProviderConfig, PortalBrandingConfig } from '../types/index.js';
import { formatCurrencyAmount, CURRENCY_LIST } from '../utils/currency.js';
import { HostedPortalSettingsTab } from './HostedPortalSettingsTab.js';
import { SubscriptionBillingTab } from './SubscriptionBillingTab.js';
import { EnterpriseSecurityTab } from './EnterpriseSecurityTab.js';

interface SettingsViewProps {
  workspace: Workspace | null;
  onUpdateWorkspace?: (updates: Partial<Workspace>) => Promise<void>;
  initialSubTab?: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ workspace, onUpdateWorkspace, initialSubTab }) => {
  const [activeTab, setActiveTab] = useState<
    | 'general'
    | 'recovery_rules'
    | 'portal_branding'
    | 'subscription_billing'
    | 'security_rbac'
    | 'email_sender'
    | 'sms_dunning'
    | 'webhooks'
    | 'roi_calc'
    | 'architecture'
  >((initialSubTab as any) || 'general');

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab as any);
    }
  }, [initialSubTab]);

  // Workspace General State
  const [wsName, setWsName] = useState(workspace?.name || '');
  const [wsCurrency, setWsCurrency] = useState(workspace?.currency || 'USD');
  const [wsType, setWsType] = useState<any>(workspace?.business_type || 'saas');
  const [wsTimezone, setWsTimezone] = useState(workspace?.timezone || 'UTC');

  // Recovery Rules Config State
  const [smartRetries, setSmartRetries] = useState(workspace?.recovery_rules?.smart_retries_enabled ?? true);
  const [maxRetries, setMaxRetries] = useState(workspace?.recovery_rules?.max_retry_attempts ?? 4);
  const [retryDelaysStr, setRetryDelaysStr] = useState(
    (workspace?.recovery_rules?.retry_delays_days || [1, 3, 5, 7]).join(', ')
  );
  const [gracePeriodDays, setGracePeriodDays] = useState(workspace?.recovery_rules?.default_grace_period_days ?? 7);
  const [autoCancel, setAutoCancel] = useState(
    workspace?.recovery_rules?.auto_cancel_subscription_on_exhaustion ?? true
  );
  const [notifyOnRetry, setNotifyOnRetry] = useState(
    workspace?.recovery_rules?.notify_customer_on_each_retry ?? true
  );

  // Email Sender Config State
  const [emailProvider, setEmailProvider] = useState<any>(workspace?.email_config?.provider || 'resend');
  const [senderName, setSenderName] = useState(workspace?.email_config?.sender_name || 'Billing Team');
  const [fromEmail, setFromEmail] = useState(workspace?.email_config?.from_email || 'billing@acme.com');
  const [replyToEmail, setReplyToEmail] = useState(workspace?.email_config?.reply_to_email || 'support@acme.com');
  const [domainVerified, setDomainVerified] = useState(
    workspace?.email_config?.custom_domain_verified ?? true
  );

  // SMS Provider Config State
  const [smsEnabled, setSmsEnabled] = useState(workspace?.sms_config?.enabled ?? false);
  const [smsProvider, setSmsProvider] = useState<any>(workspace?.sms_config?.provider || 'twilio');
  const [smsAccountSid, setSmsAccountSid] = useState(workspace?.sms_config?.account_sid || '');
  const [smsSenderId, setSmsSenderId] = useState(workspace?.sms_config?.sender_id || 'ACMEBILL');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync with workspace prop
  useEffect(() => {
    if (workspace) {
      setWsName(workspace.name || '');
      setWsCurrency(workspace.currency || 'USD');
      setWsType(workspace.business_type || 'saas');
      setWsTimezone(workspace.timezone || 'UTC');

      if (workspace.recovery_rules) {
        setSmartRetries(workspace.recovery_rules.smart_retries_enabled ?? true);
        setMaxRetries(workspace.recovery_rules.max_retry_attempts ?? 4);
        setRetryDelaysStr((workspace.recovery_rules.retry_delays_days || [1, 3, 5, 7]).join(', '));
        setGracePeriodDays(workspace.recovery_rules.default_grace_period_days ?? 7);
        setAutoCancel(workspace.recovery_rules.auto_cancel_subscription_on_exhaustion ?? true);
        setNotifyOnRetry(workspace.recovery_rules.notify_customer_on_each_retry ?? true);
      }

      if (workspace.email_config) {
        setEmailProvider(workspace.email_config.provider || 'resend');
        setSenderName(workspace.email_config.sender_name || '');
        setFromEmail(workspace.email_config.from_email || '');
        setReplyToEmail(workspace.email_config.reply_to_email || '');
        setDomainVerified(workspace.email_config.custom_domain_verified ?? true);
      }

      if (workspace.sms_config) {
        setSmsEnabled(workspace.sms_config.enabled ?? false);
        setSmsProvider(workspace.sms_config.provider || 'twilio');
        setSmsAccountSid(workspace.sms_config.account_sid || '');
        setSmsSenderId(workspace.sms_config.sender_id || 'ACMEBILL');
      }
    }
  }, [workspace]);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateWorkspace || !wsName.trim()) return;

    // Parse retry delays
    const parsedDelays = retryDelaysStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    const recovery_rules: RecoveryRulesConfig = {
      smart_retries_enabled: smartRetries,
      max_retry_attempts: Number(maxRetries),
      retry_delays_days: parsedDelays.length > 0 ? parsedDelays : [1, 3, 5, 7],
      default_grace_period_days: Number(gracePeriodDays),
      auto_cancel_subscription_on_exhaustion: autoCancel,
      notify_customer_on_each_retry: notifyOnRetry,
    };

    const email_config: EmailSenderConfig = {
      provider: emailProvider,
      sender_name: senderName.trim(),
      from_email: fromEmail.trim(),
      reply_to_email: replyToEmail.trim(),
      custom_domain_verified: domainVerified,
    };

    const sms_config: SmsProviderConfig = {
      enabled: smsEnabled,
      provider: smsProvider,
      account_sid: smsAccountSid.trim() || undefined,
      sender_id: smsSenderId.trim() || undefined,
    };

    setIsSaving(true);
    try {
      await onUpdateWorkspace({
        name: wsName.trim(),
        currency: wsCurrency,
        business_type: wsType,
        timezone: wsTimezone,
        recovery_rules,
        email_config,
        sms_config,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save workspace settings', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Pricing & ROI Calculator state
  const [mrr, setMrr] = useState(85000);
  const [failureRate, setFailureRate] = useState(8);
  const [recoveryRate, setRecoveryRate] = useState(65);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  const monthlyAtRisk = mrr * (failureRate / 100);
  const monthlyRecovered = monthlyAtRisk * (recoveryRate / 100);
  const annualRecovered = monthlyRecovered * 12;
  const monthlyPlatformFee = 299 + monthlyRecovered * 0.05;
  const netRecoveredBenefit = monthlyRecovered - monthlyPlatformFee;
  const roiMultiple = (monthlyRecovered / monthlyPlatformFee).toFixed(1);

  const formatCurrency = (val: number) => {
    return formatCurrencyAmount(Math.round(val * 100), wsCurrency || workspace?.currency || 'USD');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    if (id === 'sql') {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } else {
      setCopiedWebhook(id);
      setTimeout(() => setCopiedWebhook(null), 2000);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Settings & Controls</h1>
          <p className="text-xs text-slate-400">
            Tenant configuration, automated dunning rules, multi-provider webhooks, and compliance architecture.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold animate-pulse">
              <CheckCircle2 className="w-4 h-4" /> All Settings Saved!
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/20"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save All Settings'}</span>
          </button>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'general'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span>General & Currency</span>
        </button>

        <button
          onClick={() => setActiveTab('recovery_rules')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'recovery_rules'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span>Automated Reminders & Recovery</span>
        </button>

        <button
          onClick={() => setActiveTab('portal_branding')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'portal_branding'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Palette className="w-4 h-4 text-pink-400" />
          <span>Hosted Pay Portal</span>
        </button>

        <button
          onClick={() => setActiveTab('subscription_billing')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'subscription_billing'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <CardIcon className="w-4 h-4 text-emerald-400" />
          <span>Platform Billing & Tier</span>
        </button>

        <button
          onClick={() => setActiveTab('security_rbac')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'security_rbac'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <SecurityIcon className="w-4 h-4 text-indigo-400" />
          <span>Enterprise RBAC & Security</span>
        </button>

        <button
          onClick={() => setActiveTab('email_sender')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'email_sender'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Mail className="w-4 h-4 text-blue-400" />
          <span>Email Reminder Sender</span>
        </button>

        <button
          onClick={() => setActiveTab('sms_dunning')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'sms_dunning'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-purple-400" />
          <span>SMS & WhatsApp</span>
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'webhooks'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Webhook className="w-4 h-4 text-amber-400" />
          <span>Webhooks & Keys</span>
        </button>

        <button
          onClick={() => setActiveTab('roi_calc')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'roi_calc'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calculator className="w-4 h-4 text-emerald-400" />
          <span>ROI Model</span>
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'architecture'
              ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>Security & RLS</span>
        </button>
      </div>

      {/* TAB 1: GENERAL & CURRENCY */}
      {activeTab === 'general' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Tenant Identity & Multi-Currency Engine</h3>
                <p className="text-xs text-slate-400">
                  Business profile, reporting timezone, and primary ledger currency across 27 global currencies.
                </p>
              </div>
            </div>
            {workspace?.is_demo ? (
              <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                Demo Sandbox Workspace
              </span>
            ) : (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Production Tenant
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Business Legal Name
              </label>
              <input
                type="text"
                required
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="e.g. Acme Corporation"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Primary Workspace Currency (27 Global Currencies Supported)
              </label>
              <select
                value={wsCurrency}
                onChange={(e) => setWsCurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {CURRENCY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} - {c.symbol} ({c.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Business Model & Industry
              </label>
              <select
                value={wsType}
                onChange={(e) => setWsType(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="saas">SaaS Software</option>
                <option value="subscription">Subscription Commerce / Box</option>
                <option value="coaching">Digital Coaching & Education</option>
                <option value="membership">Membership Club / Community</option>
                <option value="gym">Gym / Recurring In-Person Service</option>
                <option value="ecommerce">Recurring E-Commerce</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Billing Reporting Timezone
              </label>
              <select
                value={wsTimezone}
                onChange={(e) => setWsTimezone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs">
            <div className="text-slate-400 font-mono">
              Workspace Identifier: <span className="text-emerald-400 font-bold">{workspace?.id}</span>
            </div>
            <div className="text-slate-400">
              Created: <span className="text-slate-300">{workspace?.created_at ? new Date(workspace.created_at).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECOVERY & DUNNING RULES */}
      {activeTab === 'recovery_rules' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-400" />
              <span>Recovery Cadence & Smart Retries Configuration</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure timing algorithms, retry back-off sequences, and grace periods to maximize recoverability without customer friction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Smart Retries Toggle */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">AI-Powered Smart Retries</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Dynamically retries cards during optimal banking window hours based on card issuer decline codes.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={smartRetries}
                  onChange={(e) => setSmartRetries(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Max Retry Attempts */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Maximum Retry Attempts (1 - 8 retries)
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="font-mono text-sm font-bold text-white px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                  {maxRetries}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Recommended industry standard: 4 attempts</div>
            </div>

            {/* Retry Delays Schedule */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Retry Delay Cadence (Days between retries, comma separated)
              </label>
              <input
                type="text"
                value={retryDelaysStr}
                onChange={(e) => setRetryDelaysStr(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                placeholder="1, 3, 5, 7"
              />
              <div className="text-[11px] text-slate-400 mt-1">
                E.g. "1, 3, 5, 7" executes retry on Day 1, Day 3, Day 5, and Day 7
              </div>
            </div>

            {/* Default Grace Period */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Default Account Grace Period (Days before locking access)
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="font-mono text-sm font-bold text-white px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                  {gracePeriodDays}d
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Customer continues software access during grace period</div>
            </div>

            {/* Auto Cancel Toggle */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Auto-Cancel on Exhaustion</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Automatically marks subscription as canceled and revokes license if all retries fail.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCancel}
                  onChange={(e) => setAutoCancel(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Notify on Retry Toggle */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Notify Customer on Each Retry</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Sends courtesy receipt notification if background retry succeeds.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnRetry}
                  onChange={(e) => setNotifyOnRetry(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB: HOSTED PAY PORTAL BRANDING */}
      {activeTab === 'portal_branding' && (
        <HostedPortalSettingsTab
          workspace={workspace}
          onSave={async (config) => {
            if (onUpdateWorkspace) {
              await onUpdateWorkspace({ portal_config: config });
            }
          }}
        />
      )}

      {/* TAB: PLATFORM SUBSCRIPTION & BILLING */}
      {activeTab === 'subscription_billing' && (
        <SubscriptionBillingTab workspace={workspace} />
      )}

      {/* TAB: ENTERPRISE SECURITY & RBAC */}
      {activeTab === 'security_rbac' && (
        <EnterpriseSecurityTab workspace={workspace} />
      )}

      {/* TAB 3: EMAIL SENDER CONFIG */}
      {activeTab === 'email_sender' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                <span>Outbound Recovery Email System</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure your verified sender identity, reply-to routing, and transactional email provider.
              </p>
            </div>
            {domainVerified ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> DKIM / SPF Verified
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> DNS Verification Pending
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Transactional Email Service Provider
              </label>
              <select
                value={emailProvider}
                onChange={(e) => setEmailProvider(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="resend">Resend (Modern Developer API)</option>
                <option value="sendgrid">Twilio SendGrid</option>
                <option value="postmark">Postmark (ActiveCampaign)</option>
                <option value="ses">Amazon SES</option>
                <option value="mock">Sandbox Simulator Engine</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Sender Display Name
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g. Acme Billing Team"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                From Email Address
              </label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                placeholder="billing@yourdomain.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Reply-To Email Address
              </label>
              <input
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                placeholder="support@yourdomain.com"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs text-slate-400 space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Customer Self-Service Payment Links Included</span>
            </div>
            <p>
              All recovery emails automatically inject one-click encrypted tokens allowing customers to securely update credit cards via the hosted portal without logging into your app.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: SMS & WHATSAPP DUNNING */}
      {activeTab === 'sms_dunning' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                <span>Multi-Channel SMS & WhatsApp Reminders</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Reach subscribers via direct mobile notification when high-value enterprise cards decline.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Telecom Gateway Provider
              </label>
              <select
                value={smsProvider}
                onChange={(e) => setSmsProvider(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="twilio">Twilio Messaging Service</option>
                <option value="gupshup">Gupshup (WhatsApp Business)</option>
                <option value="msg91">MSG91</option>
                <option value="aws_sns">Amazon SNS</option>
                <option value="mock">Simulated Test Gateway</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Account SID / Client Key
              </label>
              <input
                type="text"
                value={smsAccountSid}
                onChange={(e) => setSmsAccountSid(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                placeholder="ACXXXXXXXXXXXXXXXXX"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Alphanumeric Sender ID
              </label>
              <input
                type="text"
                value={smsSenderId}
                onChange={(e) => setSmsSenderId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                placeholder="ACMEBILL"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: WEBHOOK ENDPOINTS & KEYS */}
      {activeTab === 'webhooks' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Webhook className="w-5 h-5 text-amber-400" />
              <span>Multi-Provider Ingress Webhooks & Signature Verification</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure these webhook endpoints in your payment gateway developer dashboards to receive real-time failure events.
            </p>
          </div>

          <div className="space-y-4">
            {/* Stripe Webhook */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Stripe Webhook Listener</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Events: invoice.payment_failed, customer.subscription.deleted
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  /api/webhooks/stripe
                </div>
              </div>

              <button
                onClick={() => handleCopy(`${window.location.origin}/api/webhooks/stripe`, 'stripe')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                {copiedWebhook === 'stripe' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook === 'stripe' ? 'Copied URL' : 'Copy Endpoint'}</span>
              </button>
            </div>

            {/* Razorpay Webhook */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Razorpay Webhook Listener</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Events: payment.failed, subscription.halted
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  /api/webhooks/razorpay
                </div>
              </div>

              <button
                onClick={() => handleCopy(`${window.location.origin}/api/webhooks/razorpay`, 'razorpay')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                {copiedWebhook === 'razorpay' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook === 'razorpay' ? 'Copied URL' : 'Copy Endpoint'}</span>
              </button>
            </div>

            {/* PayPal Webhook */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">PayPal Webhook Listener</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Events: BILLING.SUBSCRIPTION.PAYMENT.FAILED
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  /api/webhooks/paypal
                </div>
              </div>

              <button
                onClick={() => handleCopy(`${window.location.origin}/api/webhooks/paypal`, 'paypal')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                {copiedWebhook === 'paypal' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook === 'paypal' ? 'Copied URL' : 'Copy Endpoint'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: ROI & PLATFORM VALUE CALCULATOR */}
      {activeTab === 'roi_calc' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Value & ROI Model</h3>
                <p className="text-xs text-slate-400">
                  Transparent calculation of money rescued vs software cost
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              {roiMultiple}x Value Multiple
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Controls */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Monthly Recurring Revenue (MRR): {formatCurrency(mrr)}
                </label>
                <input
                  type="range"
                  min="10000"
                  max="500000"
                  step="5000"
                  value={mrr}
                  onChange={(e) => setMrr(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Typical Failure Rate: {failureRate}%
                </label>
                <input
                  type="range"
                  min="3"
                  max="20"
                  step="1"
                  value={failureRate}
                  onChange={(e) => setFailureRate(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Expected Recovery Success Rate: {recoveryRate}%
                </label>
                <input
                  type="range"
                  min="30"
                  max="90"
                  step="5"
                  value={recoveryRate}
                  onChange={(e) => setRecoveryRate(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Outputs */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <span className="text-xs text-slate-400 uppercase font-semibold">Monthly Revenue At Risk</span>
                <div className="text-2xl font-black text-rose-400 font-mono mt-1">
                  {formatCurrency(monthlyAtRisk)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Lost each month without recovery automation</div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60">
                <span className="text-xs text-emerald-400 uppercase font-bold">Monthly Recovered Capital</span>
                <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
                  {formatCurrency(monthlyRecovered)}
                </div>
                <div className="text-[11px] text-emerald-400/80 mt-1">
                  {formatCurrency(annualRecovered)} captured annualized
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <span className="text-xs text-slate-400 uppercase font-semibold">Estimated Platform Cost</span>
                <div className="text-xl font-bold text-slate-200 font-mono mt-1">
                  {formatCurrency(monthlyPlatformFee)} / mo
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Base plan + 5% performance incentive</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <span className="text-xs text-slate-400 uppercase font-semibold">Net Customer Gain</span>
                <div className="text-xl font-black text-white font-mono mt-1">
                  +{formatCurrency(netRecoveredBenefit)} / mo
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                  Pure bottom-line profit recovered
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: SECURITY & COMPLIANCE */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Multi-Tenant Database Architecture</h3>
                  <p className="text-xs text-slate-400">
                    PostgreSQL schema with Row Level Security (RLS) and cryptographic isolation
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleCopy(`-- ====================================================================
-- REVENUE RECOVERY OS: MULTI-TENANT PRODUCTION POSTGRESQL SCHEMA
-- Built with Row Level Security (RLS) & Tenant Cryptographic Isolation
-- ====================================================================

-- 1. Tenants / Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  business_type VARCHAR(64) NOT NULL DEFAULT 'saas',
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  plan_tier VARCHAR(64) NOT NULL DEFAULT 'scale',
  billing_interval VARCHAR(32) NOT NULL DEFAULT 'monthly',
  recovery_rules JSONB DEFAULT '{}'::jsonb,
  portal_config JSONB DEFAULT '{}'::jsonb,
  email_config JSONB DEFAULT '{}'::jsonb,
  sms_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tenant Workspace Members & RBAC
CREATE TABLE IF NOT EXISTS workspace_members (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_members_workspace ON workspace_members(workspace_id);

-- 3. Gateway Provider Connections
CREATE TABLE IF NOT EXISTS provider_connections (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_type VARCHAR(64) NOT NULL,
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  livemode BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_secret_ciphertext TEXT,
  secondary_webhook_secret_ciphertext TEXT,
  api_key_ciphertext TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider_type)
);
CREATE INDEX IF NOT EXISTS idx_providers_workspace ON provider_connections(workspace_id);

-- 4. Customer Directory
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_type VARCHAR(64) NOT NULL,
  provider_customer_id VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
  country VARCHAR(10) DEFAULT 'US',
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  current_risk_status VARCHAR(64) NOT NULL DEFAULT 'healthy',
  health_score INTEGER NOT NULL DEFAULT 85,
  health_grade VARCHAR(10) NOT NULL DEFAULT 'B+',
  health_reasons JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(workspace_id, email);

-- 5. Subscriptions Ledger
CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider_subscription_id VARCHAR(128) NOT NULL,
  plan_name VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  billing_interval VARCHAR(32) NOT NULL DEFAULT 'monthly',
  next_billing_date TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);

-- 6. Recovery Opportunities State Machine
CREATE TABLE IF NOT EXISTS recovery_opportunities (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id VARCHAR(64) REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_id VARCHAR(128) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(64) NOT NULL DEFAULT 'detected',
  failure_category VARCHAR(64) NOT NULL DEFAULT 'insufficient_funds',
  failure_reason TEXT NOT NULL,
  gateway_error_code VARCHAR(64),
  recovery_token VARCHAR(128) NOT NULL UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opps_workspace ON recovery_opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_opps_token ON recovery_opportunities(recovery_token);

-- 7. Audit & Immutable Security Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id VARCHAR(64) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id, created_at DESC);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) ENFORCEMENT
-- ====================================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_workspaces ON workspaces
  FOR ALL USING (id = current_setting('app.current_workspace_id', true));

CREATE POLICY tenant_isolation_customers ON customers
  FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

CREATE POLICY tenant_isolation_opportunities ON recovery_opportunities
  FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true));

CREATE POLICY tenant_isolation_audit ON audit_logs
  FOR SELECT USING (workspace_id = current_setting('app.current_workspace_id', true));`, 'sql')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                {copiedSql ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copied' : 'Copy Migration SQL'}</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
              <div className="text-emerald-400 font-bold">-- Core Tables Provisioned in Production PostgreSQL Layer:</div>
              <div>• <code className="text-white">workspaces</code> (Tenant boundary, base currency, recovery rules, email/sms configs)</div>
              <div>• <code className="text-white">provider_connections</code> (Stripe, Razorpay, PayPal encrypted keys)</div>
              <div>• <code className="text-white">customers</code> (Subscriber profiles, health scores, churn probability)</div>
              <div>• <code className="text-white">subscriptions</code> (Flexible cadence, trials, grace periods)</div>
              <div>• <code className="text-white">recovery_opportunities</code> (Operational lifecycle state machine)</div>
              <div>• <code className="text-white">recovery_campaigns & steps</code> (Multi-channel dunning engine)</div>
              <div>• <code className="text-white">webhook_events</code> (Idempotent event deduping & auditing)</div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Security & Regulatory Compliance</h3>
                <p className="text-xs text-slate-400">Enterprise safeguard standards for financial software</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Direct Provider Tokenization</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  No raw card numbers ever touch server disks or memory. All card submissions are tokenized directly
                  against Stripe, Razorpay, or PayPal Level 1 infrastructure.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Idempotent Webhooks</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Webhook listeners enforce cryptographic HMAC-SHA256 signatures and deduping keys to prevent duplicate
                  dunning charges or retries.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Client-Side Secret Shielding</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Secret API keys, webhook secrets, and provider tokens reside strictly server-side in protected environment
                  contexts.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
