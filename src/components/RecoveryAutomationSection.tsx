import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Search,
  Sliders,
  Shield,
  Clock,
  ArrowRight,
  Sparkles,
  Link,
  FileText,
  Activity,
  Check,
  XCircle,
  DollarSign,
  UserCheck,
  ShieldAlert,
  Scale,
} from 'lucide-react';
import {
  Workspace,
  AutopilotSettings,
  AutomationEventRecord,
  PolicyAuditEntry,
  AutopilotDecision,
} from '../types/index.js';
import { api } from '../services/api.js';
import { EmptyStateCard } from './EmptyStateCard.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RecoveryAutomationSectionProps {
  workspace: Workspace | null;
  onUpdateWorkspace?: (updates: Partial<Workspace>) => Promise<void>;
}

const DEFAULT_SETTINGS: AutopilotSettings = {
  auto_scans_enabled: true,
  auto_plans_enabled: true,
  auto_retry_scheduling_enabled: false,
  pause_all_automation: false,
  auto_recover_limit_cents: 50000,
  auto_recover_preset: '500',
  vip_customer_protection: true,
  enterprise_account_protection: true,
};

export const RecoveryAutomationSection: React.FC<RecoveryAutomationSectionProps> = ({
  workspace,
  onUpdateWorkspace,
}) => {
  const [settings, setSettings] = useState<AutopilotSettings>(
    workspace?.autopilot_settings || DEFAULT_SETTINGS
  );
  const [events, setEvents] = useState<AutomationEventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [policyLogs, setPolicyLogs] = useState<PolicyAuditEntry[]>([]);
  const [loadingPolicyLogs, setLoadingPolicyLogs] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'policy' | 'automation'>('policy');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'running' | 'paused' | 'failed'>('all');
  const [customAmountStr, setCustomAmountStr] = useState<string>(
    settings.auto_recover_limit_cents ? String(settings.auto_recover_limit_cents / 100) : '500'
  );

  // Load authoritative settings & events on mount
  useEffect(() => {
    loadSettings();
    loadEvents();
    loadPolicyLogs();
  }, [workspace?.id]);

  const loadSettings = async () => {
    try {
      const res = await api.getAutopilotSettings();
      if (res) {
        setSettings(res);
        if (res.auto_recover_limit_cents) {
          setCustomAmountStr(String(res.auto_recover_limit_cents / 100));
        }
      }
    } catch (err) {
      console.warn('Failed to load autopilot settings from server, using local defaults', err);
      if (workspace?.autopilot_settings) {
        setSettings(workspace.autopilot_settings);
      }
    }
  };

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await api.getAutomationEvents();
      if (Array.isArray(res)) {
        setEvents(res);
      }
    } catch (err) {
      console.warn('Failed to load automation events', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadPolicyLogs = async () => {
    setLoadingPolicyLogs(true);
    try {
      const res = await api.getPolicyAuditLogs();
      if (Array.isArray(res)) {
        setPolicyLogs(res);
      }
    } catch (err) {
      console.warn('Failed to load policy audit logs', err);
    } finally {
      setLoadingPolicyLogs(false);
    }
  };

  const handleToggle = (key: keyof AutopilotSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSaveSuccess(false);
  };

  const handleSelectThreshold = (preset: '100' | '500' | '1000' | 'custom', customVal?: number) => {
    let limitCents = 50000;
    if (preset === '100') limitCents = 10000;
    else if (preset === '500') limitCents = 50000;
    else if (preset === '1000') limitCents = 100000;
    else if (preset === 'custom') {
      const dollars = customVal !== undefined ? customVal : parseFloat(customAmountStr) || 500;
      limitCents = Math.round(dollars * 100);
    }

    setSettings((prev) => ({
      ...prev,
      auto_recover_preset: preset,
      auto_recover_limit_cents: limitCents,
    }));
    setSaveSuccess(false);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmountStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setSettings((prev) => ({
        ...prev,
        auto_recover_preset: 'custom',
        auto_recover_limit_cents: Math.round(parsed * 100),
      }));
    }
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await api.updateAutopilotSettings(settings);
      setSettings(updated);
      await onUpdateWorkspace?.({ autopilot_settings: updated });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await Promise.all([loadEvents(), loadPolicyLogs()]);
    } catch (err) {
      console.error('Failed to update autopilot settings', err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setCustomAmountStr('500');
    setSaveSuccess(false);
  };

  const filteredEvents = events.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.event.toLowerCase().includes(q) ||
      e.trigger.toLowerCase().includes(q) ||
      (e.status && e.status.toLowerCase().includes(q))
    );
  });

  const getEventIcon = (eventName: string) => {
    const lower = eventName.toLowerCase();
    if (lower.includes('scan')) return Sparkles;
    if (lower.includes('provider') || lower.includes('gateway')) return Zap;
    if (lower.includes('plan')) return FileText;
    if (lower.includes('link') || lower.includes('checkout')) return Link;
    if (lower.includes('retry')) return RefreshCw;
    return Activity;
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-slate-900 border border-blue-500/20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Recovery Automation</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  AUTOPILOT FOUNDATION
                </span>
                {settings.pause_all_automation && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Pause className="w-3 h-3" />
                    PAUSED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Autonomous background operations that detect revenue leaks, create 1-click recovery links, and generate action plans without manual intervention.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Settings Saved</span>
                </>
              ) : (
                <span>Save Automation Settings</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Autopilot Settings Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
            Automation Controls
          </div>
          <div className="text-[11px] text-slate-400">
            Default: Scans=ON • Plans=ON • Retries=OFF • Pause=OFF
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Setting 1: Automatic Revenue Scans */}
          <div
            onClick={() => handleToggle('auto_scans_enabled')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer select-none space-y-3 ${
              settings.auto_scans_enabled
                ? 'bg-slate-900/90 border-blue-500/40 shadow-lg shadow-blue-950/20'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold text-white">Automatic Revenue Scans</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Immediately trigger background revenue scan when payment provider status becomes CONNECTED. Runs automatically once after connection.
                </p>
              </div>

              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  settings.auto_scans_enabled ? 'bg-blue-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Status</span>
              <span className={`font-bold uppercase ${settings.auto_scans_enabled ? 'text-blue-400' : 'text-slate-500'}`}>
                {settings.auto_scans_enabled ? 'Enabled (ON)' : 'Disabled (OFF)'}
              </span>
            </div>
          </div>

          {/* Setting 2: Automatic Recovery Plans */}
          <div
            onClick={() => handleToggle('auto_plans_enabled')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer select-none space-y-3 ${
              settings.auto_plans_enabled
                ? 'bg-slate-900/90 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">Automatic Recovery Plans</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Whenever a failed payment enters the system, automatically generate, store, and attach an explainable Recovery Action Plan.
                </p>
              </div>

              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  settings.auto_plans_enabled ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Status</span>
              <span className={`font-bold uppercase ${settings.auto_plans_enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                {settings.auto_plans_enabled ? 'Enabled (ON)' : 'Disabled (OFF)'}
              </span>
            </div>
          </div>

          {/* Setting 3: Automatic Retry Scheduling */}
          <div
            onClick={() => handleToggle('auto_retry_scheduling_enabled')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer select-none space-y-3 ${
              settings.auto_retry_scheduling_enabled
                ? 'bg-slate-900/90 border-indigo-500/40 shadow-lg shadow-indigo-950/20'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-white">Automatic Retry Scheduling</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Automatically queue smart payment retries with card networks at optimized bank clearance intervals. (Disabled by default for human oversight).
                </p>
              </div>

              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  settings.auto_retry_scheduling_enabled ? 'bg-indigo-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Status</span>
              <span className={`font-bold uppercase ${settings.auto_retry_scheduling_enabled ? 'text-indigo-400' : 'text-slate-500'}`}>
                {settings.auto_retry_scheduling_enabled ? 'Enabled (ON)' : 'Disabled (OFF)'}
              </span>
            </div>
          </div>

          {/* Setting 4: Pause All Automation */}
          <div
            onClick={() => handleToggle('pause_all_automation')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer select-none space-y-3 ${
              settings.pause_all_automation
                ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-950/30'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${settings.pause_all_automation ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="text-sm font-bold text-white">Pause All Automation</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Emergency master kill-switch. Temporarily pause all autonomous scans, automatic plan generation, and background recovery triggers.
                </p>
              </div>

              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  settings.pause_all_automation ? 'bg-amber-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Kill-Switch State</span>
              <span className={`font-bold uppercase ${settings.pause_all_automation ? 'text-amber-400 font-extrabold' : 'text-emerald-400'}`}>
                {settings.pause_all_automation ? 'ALL AUTOMATION PAUSED' : 'NORMAL OPERATION'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Workspace Policy Settings (Deterministic Decision Engine) */}
      <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Workspace Policy Settings</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  ARBITRATION ENGINE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Deterministic policy rules determining whether opportunities are handled autonomously or routed to human review.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Active Limit:</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-emerald-400 font-mono">
              ${(settings.auto_recover_limit_cents / 100).toFixed(0)} USD
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Policy Setting 1: Auto Recover Up To */}
          <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">Auto Recover Up To</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">THRESHOLD</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Invoices above this threshold require human manual review. Invoices at or below this limit qualify for autonomous recovery.
            </p>

            <div className="grid grid-cols-4 gap-2 pt-1">
              {(['100', '500', '1000', 'custom'] as const).map((preset) => {
                const isSelected =
                  settings.auto_recover_preset === preset ||
                  (preset === '100' && settings.auto_recover_limit_cents === 10000 && settings.auto_recover_preset !== 'custom') ||
                  (preset === '500' && settings.auto_recover_limit_cents === 50000 && settings.auto_recover_preset !== 'custom') ||
                  (preset === '1000' && settings.auto_recover_limit_cents === 100000 && settings.auto_recover_preset !== 'custom');

                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectThreshold(preset)}
                    className={`py-2 px-2 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer text-center ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/30'
                        : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
                    }`}
                  >
                    {preset === 'custom' ? 'Custom' : `$${preset}`}
                  </button>
                );
              })}
            </div>

            {settings.auto_recover_preset === 'custom' && (
              <div className="pt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">$</span>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    placeholder="Enter limit in USD"
                    value={customAmountStr}
                    onChange={handleCustomAmountChange}
                    className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <span className="text-[11px] text-slate-400 font-mono">USD</span>
              </div>
            )}
          </div>

          {/* Policy Setting 2: VIP Customer Protection */}
          <div
            onClick={() => handleToggle('vip_customer_protection')}
            className={`p-5 rounded-xl border transition-all cursor-pointer select-none space-y-3 ${
              settings.vip_customer_protection
                ? 'bg-slate-950/90 border-indigo-500/40 shadow-lg shadow-indigo-950/20'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-white">VIP Customer Protection</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Route any high-value or VIP tagged customer accounts to manual review instead of autonomous execution.
                </p>
              </div>

              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  settings.vip_customer_protection ? 'bg-indigo-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Protection Status</span>
              <span className={`font-bold uppercase ${settings.vip_customer_protection ? 'text-indigo-400' : 'text-slate-500'}`}>
                {settings.vip_customer_protection ? 'ON (MANUAL REVIEW)' : 'OFF (AUTO-ELIGIBLE)'}
              </span>
            </div>
          </div>

          {/* Policy Setting 3: Enterprise Account Protection */}
          <div
            onClick={() => handleToggle('enterprise_account_protection')}
            className={`p-5 rounded-xl border transition-all cursor-pointer select-none space-y-3 ${
              settings.enterprise_account_protection
                ? 'bg-slate-950/90 border-purple-500/40 shadow-lg shadow-purple-950/20'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-white">Enterprise Account Protection</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Protect high-touch enterprise accounts by requiring operator manual sign-off on any recovery outreach.
                </p>
              </div>

              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  settings.enterprise_account_protection ? 'bg-purple-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] border-t border-slate-800/60 font-mono">
              <span className="text-slate-400">Protection Status</span>
              <span className={`font-bold uppercase ${settings.enterprise_account_protection ? 'text-purple-400' : 'text-slate-500'}`}>
                {settings.enterprise_account_protection ? 'ON (MANUAL REVIEW)' : 'OFF (AUTO-ELIGIBLE)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Unified Audit Logs & History (Policy Stream + Automation Events) */}
      <div className="space-y-4 pt-4 border-t border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs">
              <button
                type="button"
                onClick={() => setActiveLogTab('policy')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeLogTab === 'policy'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Policy Audit Log ({policyLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLogTab('automation')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeLogTab === 'automation'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Automation Events ({events.length})
              </button>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
              IMMUTABLE AUDIT
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder={activeLogTab === 'policy' ? 'Filter policy logs...' : 'Filter events...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-44"
              />
            </div>

            {activeLogTab === 'automation' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="running">Running</option>
                <option value="paused">Paused</option>
                <option value="failed">Failed</option>
              </select>
            )}

            <button
              onClick={() => {
                if (activeLogTab === 'policy') loadPolicyLogs();
                else loadEvents();
              }}
              disabled={loadingEvents || loadingPolicyLogs}
              title="Refresh Log"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents || loadingPolicyLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab 1: Policy Audit Log Table */}
        {activeLogTab === 'policy' ? (
          policyLogs.length === 0 ? (
            <div className="py-2">
              <EmptyStateCard
                title="No Policy Audit Entries Yet"
                whatItDoes="Stores deterministic audit records whenever an opportunity is evaluated by the Autopilot Policy Engine."
                whyItMatters="Guarantees full transparency on why an opportunity was marked AUTONOMOUS, MANUAL REVIEW, or BLOCKED."
                whatToClickNext="Ingest failed invoices or click 'Re-evaluate Policy' on any recovery case to populate the policy audit stream."
                actionLabel="View Opportunities"
                onAction={() => {}}
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Decision</th>
                    <th className="py-3 px-4">Rule Evaluated</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {policyLogs
                    .filter((log) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        log.decision.toLowerCase().includes(q) ||
                        log.rule_evaluated.toLowerCase().includes(q) ||
                        log.reason.toLowerCase().includes(q)
                      );
                    })
                    .map((log) => {
                      const isAutonomous = log.decision === 'AUTONOMOUS';
                      const isManual = log.decision === 'MANUAL_REVIEW';
                      const isBlocked = log.decision === 'BLOCKED';

                      return (
                        <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                isAutonomous
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : isManual
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {isAutonomous && <Zap className="w-3 h-3" />}
                              {isManual && <AlertTriangle className="w-3 h-3" />}
                              {isBlocked && <ShieldAlert className="w-3 h-3" />}
                              {log.decision}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-bold text-white">
                            {log.rule_evaluated}
                          </td>

                          <td className="py-3.5 px-4 font-sans text-slate-200">
                            {log.reason}
                          </td>

                          <td className="py-3.5 px-4 text-right text-slate-400 whitespace-nowrap">
                            {formatTimestamp(log.timestamp)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredEvents.length === 0 ? (
          <div className="py-2">
            <EmptyStateCard
              title="No Automation Events Recorded"
              whatItDoes="This read-only log captures autonomous actions taken by ReviveOS: provider scans, recovery links, and action plan generation."
              whyItMatters="Provides an immutable SOC 2 audit trail proving how and when automated interventions were generated for failed payments."
              whatToClickNext="Connect a payment processor (Stripe, Razorpay, Paddle) or ingest a failed payment to watch the autopilot engine create links and plans automatically."
              actionLabel="View Payment Gateways"
              onAction={() => {}}
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Trigger</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredEvents.map((evt) => {
                  const Icon = getEventIcon(evt.event);
                  const isSuccess = evt.status === 'completed';
                  const isPaused = evt.status === 'paused';
                  const isFailed = evt.status === 'failed';
                  const isRunning = evt.status === 'running';

                  return (
                    <tr key={evt.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-900 text-blue-400 border border-slate-800 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-semibold text-white">{evt.event}</div>
                            {evt.details && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {evt.details.opportunity_id && `opp: ${evt.details.opportunity_id} • `}
                                {evt.details.provider && `provider: ${evt.details.provider} • `}
                                {evt.details.payment_link_url && `link: ${evt.details.payment_link_url}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-sans text-slate-300">
                        {evt.trigger}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {formatTimestamp(evt.timestamp)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase ${
                            isSuccess
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : isPaused
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : isFailed
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : isRunning
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {isSuccess && <CheckCircle2 className="w-3 h-3" />}
                          {isPaused && <Pause className="w-3 h-3" />}
                          {isFailed && <XCircle className="w-3 h-3" />}
                          {evt.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
