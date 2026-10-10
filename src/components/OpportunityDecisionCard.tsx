import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Zap,
  CheckCircle2,
  RefreshCw,
  Clock,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  User,
  ShieldCheck,
  Ban,
  Activity,
} from 'lucide-react';
import {
  RecoveryOpportunity,
  PolicyEvaluationResult,
  PolicyAuditEntry,
  AutopilotDecision,
} from '../types/index.js';
import { api } from '../services/api.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface OpportunityDecisionCardProps {
  opportunity: RecoveryOpportunity;
  onDecisionUpdated?: (decision: PolicyEvaluationResult) => void;
  onShowToast?: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const OpportunityDecisionCard: React.FC<OpportunityDecisionCardProps> = ({
  opportunity,
  onDecisionUpdated,
  onShowToast,
}) => {
  const [decision, setDecision] = useState<PolicyEvaluationResult | null>(
    opportunity.policy_decision || null
  );
  const [loading, setLoading] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [auditLogs, setAuditLogs] = useState<PolicyAuditEntry[]>([]);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (opportunity.policy_decision) {
      setDecision(opportunity.policy_decision);
    } else {
      loadDecision();
    }
  }, [opportunity.id]);

  const loadDecision = async () => {
    try {
      setLoading(true);
      const res = await api.getPolicyDecision(opportunity.id);
      if (res) {
        setDecision(res);
        onDecisionUpdated?.(res);
      }
    } catch (err) {
      console.warn('Failed to load policy decision', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReEvaluate = async () => {
    try {
      setReEvaluating(true);
      const res = await api.evaluatePolicy(opportunity.id);
      setDecision(res);
      onDecisionUpdated?.(res);
      onShowToast?.(
        'Policy Re-evaluated',
        `Opportunity classified as ${res.decision}: ${res.reason}`,
        res.decision === 'AUTONOMOUS' ? 'success' : 'info'
      );
      if (showAuditLogs) {
        await loadAuditLogs();
      }
    } catch (err: any) {
      console.error('Failed to re-evaluate policy', err);
      onShowToast?.('Evaluation Failed', err.message || 'Error executing policy engine', 'info');
    } finally {
      setReEvaluating(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoadingLogs(true);
      const logs = await api.getPolicyAuditLogs(opportunity.id);
      setAuditLogs(logs || []);
    } catch (err) {
      console.warn('Failed to load policy audit logs', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const toggleAuditLogs = () => {
    if (!showAuditLogs && auditLogs.length === 0) {
      loadAuditLogs();
    }
    setShowAuditLogs(!showAuditLogs);
  };

  const getDecisionTheme = (dec: AutopilotDecision) => {
    switch (dec) {
      case 'AUTONOMOUS':
        return {
          bg: 'bg-emerald-950/30 border-emerald-500/30',
          badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          indicator: 'bg-emerald-500',
          text: 'text-emerald-400',
          icon: Zap,
          title: 'AUTONOMOUS',
          subtitle: 'Automatic recovery permitted without manual oversight.',
        };
      case 'MANUAL_REVIEW':
        return {
          bg: 'bg-amber-950/30 border-amber-500/30',
          badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          indicator: 'bg-amber-500',
          text: 'text-amber-400',
          icon: AlertTriangle,
          title: 'MANUAL REVIEW',
          subtitle: 'Requires human review before recovery actions can proceed.',
        };
      case 'BLOCKED':
        return {
          bg: 'bg-rose-950/30 border-rose-500/30',
          badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          indicator: 'bg-rose-500',
          text: 'text-rose-400',
          icon: ShieldAlert,
          title: 'BLOCKED',
          subtitle: 'Automated recovery strictly prohibited due to security, dispute, or fraud risk.',
        };
    }
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

  const currentTheme = decision ? getDecisionTheme(decision.decision) : null;
  const IconComponent = currentTheme ? currentTheme.icon : Activity;

  return (
    <div
      className={`p-6 rounded-2xl border transition-all shadow-lg ${
        currentTheme ? currentTheme.bg : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* 1. Header with Decision Badge and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              currentTheme ? currentTheme.badgeBg : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <IconComponent className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                POLICY DECISION
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                AUTOPILOT ENGINE
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {decision ? (
                <span
                  className={`text-base sm:text-lg font-black tracking-wide font-mono px-2.5 py-0.5 rounded-lg border ${currentTheme?.badgeBg}`}
                >
                  {currentTheme?.title}
                </span>
              ) : (
                <span className="text-sm font-semibold text-slate-400">
                  {loading ? 'Evaluating policy...' : 'Pending evaluation'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReEvaluate}
            disabled={reEvaluating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reEvaluating ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            <span>{reEvaluating ? 'Evaluating...' : 'Re-evaluate Policy'}</span>
          </button>

          <button
            onClick={toggleAuditLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-xs font-medium text-slate-300 border border-slate-700/80 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Audit Log</span>
            {showAuditLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Plain-English Reason Display */}
      <div className="py-4 space-y-2">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
          Arbitration Reason
        </div>
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-start gap-3">
          <Info className={`w-5 h-5 shrink-0 mt-0.5 ${currentTheme ? currentTheme.text : 'text-slate-400'}`} />
          <div className="space-y-1">
            <p className="text-sm sm:text-base font-semibold text-white leading-relaxed">
              {decision ? `"${decision.reason}"` : 'Evaluating deterministic recovery policies...'}
            </p>
            <p className="text-xs text-slate-400 leading-normal">
              {currentTheme?.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Rule Evaluation Details Breakdown */}
      {decision && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono pt-2">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Rule Evaluated</div>
            <div className="text-white font-bold truncate">{decision.rule_evaluated}</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Invoice Amount</div>
            <div className="text-white font-bold">
              {formatCurrencyAmount(opportunity.amount_at_risk_cents || 0, opportunity.currency)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Customer Classification</div>
            <div className="text-slate-200 font-bold capitalize">
              {opportunity.customer?.is_vip
                ? 'VIP Customer'
                : opportunity.customer?.is_enterprise
                ? 'Enterprise Account'
                : opportunity.customer?.is_high_risk
                ? 'High Risk Account'
                : 'Standard Customer'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Evaluation Timestamp</div>
            <div className="text-slate-300 font-mono text-[11px] truncate">
              {formatTimestamp(decision.timestamp)}
            </div>
          </div>
        </div>
      )}

      {/* 4. Policy Audit Log Drawer */}
      {showAuditLogs && (
        <div className="mt-5 pt-5 border-t border-slate-800 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Policy Audit History ({auditLogs.length})
              </h4>
            </div>
            <button
              onClick={loadAuditLogs}
              disabled={loadingLogs}
              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Log</span>
            </button>
          </div>

          {loadingLogs ? (
            <div className="py-4 text-center text-xs text-slate-400 font-mono">
              Loading policy audit records...
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-center text-xs text-slate-400 font-mono">
              No audit log entries recorded yet for this opportunity.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {auditLogs.map((log) => {
                const logTheme = getDecisionTheme(log.decision);
                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${logTheme.badgeBg}`}
                        >
                          {log.decision}
                        </span>
                        <span className="text-white font-bold">{log.rule_evaluated}</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs">{log.reason}</p>
                    </div>

                    <div className="text-[11px] text-slate-400 shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
