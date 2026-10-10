import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Eye,
  Check,
  Pause,
  Play,
  Zap,
  ArrowRight,
  Shield,
  Layers,
  Building,
  Upload,
} from 'lucide-react';
import {
  RecoveryOpportunity,
  RecoveryMetrics,
  ProviderType,
  AutopilotDecision,
} from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { api } from '../services/api.js';

interface RevenuePageProps {
  opportunities: RecoveryOpportunity[];
  currency: string;
  metrics?: RecoveryMetrics | null;
  funnel?: any[];
  breakdown?: any[];
  campaigns?: any[];
  onToggleCampaign?: (id: string) => void;
  onCreateCampaign?: (campaign: any) => void;
  isScannerOpen?: boolean;
  onCloseScanner?: () => void;
  onSelectOpportunity: (id: string) => void;
  onRetry: (id: string) => void;
  onSettle: (id: string) => void;
  onOpenEmailModal: (opp: RecoveryOpportunity) => void;
  onOpenCsvModal: () => void;
  onRefresh?: () => void;
}

export const RevenuePage: React.FC<RevenuePageProps> = ({
  opportunities,
  currency,
  metrics = null,
  isScannerOpen = false,
  onCloseScanner,
  onSelectOpportunity,
  onRetry,
  onSettle,
  onOpenEmailModal,
  onOpenCsvModal,
  onRefresh = () => {},
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unrecovered' | 'recovered' | 'manual_review'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Canonical workspace metrics
  const canonicalRevenueAtRiskCents = metrics?.revenue_at_risk_cents ?? 0;

  // Filtered Opportunities List
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      const custName = opp.customer?.name || (opp as any).customer_name || '';
      const email = opp.customer?.email || '';
      const provider = opp.customer?.provider_type || opp.payment_failure?.provider_type || 'stripe';
      const isRecovered = opp.status === 'recovered';
      const isManual = opp.policy_decision?.decision === 'MANUAL_REVIEW';

      const matchesSearch =
        custName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.failure_category.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'recovered' && !isRecovered) return false;
      if (statusFilter === 'unrecovered' && isRecovered) return false;
      if (statusFilter === 'manual_review' && (!isManual || isRecovered)) return false;

      if (providerFilter !== 'all' && provider !== providerFilter) return false;

      return true;
    });
  }, [opportunities, searchQuery, statusFilter, providerFilter]);

  // Filtered Opportunity Value
  const filteredOpportunityValueCents = useMemo(() => {
    return filteredOpportunities.reduce(
      (sum, opp) => sum + (opp.status !== 'recovered' ? opp.amount_at_risk_cents || 0 : 0),
      0
    );
  }, [filteredOpportunities]);

  // Embedded Scanner State Machine
  const [isScanning, setIsScanning] = useState(isScannerOpen);
  const [scanStep, setScanStep] = useState<number>(0);
  const [scanStats, setScanStats] = useState<{ audited: number; atRisk: number } | null>(null);

  const startScan = async () => {
    setIsScanning(true);
    setScanStep(1);
    setScanStats(null);

    const stepTimers = [
      setTimeout(() => setScanStep(2), 350),
      setTimeout(() => setScanStep(3), 700),
      setTimeout(() => setScanStep(4), 1050),
    ];

    try {
      const res = await api.runRevenueScanner();
      stepTimers.forEach(clearTimeout);
      setScanStep(5);
      setScanStats({
        audited: res.totalRecordsAudited || opportunities.length,
        atRisk: res.totalAtRiskCents || 0,
      });
      setTimeout(() => {
        setIsScanning(false);
        setScanStep(0);
        onRefresh();
      }, 1200);
    } catch (err) {
      stepTimers.forEach(clearTimeout);
      setIsScanning(false);
      setScanStep(0);
      onRefresh();
    }
  };

  const handleActionRecover = async (opp: RecoveryOpportunity) => {
    setRecoveringId(opp.id);
    try {
      await onRetry(opp.id);
      setToastMessage(`Triggered recovery for ${opp.customer?.name || 'Customer'}.`);
    } catch (e) {
      console.error(e);
    } finally {
      setRecoveringId(null);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleActionApprove = async (opp: RecoveryOpportunity) => {
    setRecoveringId(opp.id);
    try {
      await api.recordOpportunityAction(opp.id, { actionType: 'approve_plan' }).catch(() => {});
      await onRetry(opp.id);
      setToastMessage(`Approved and launched recovery for ${opp.customer?.name || 'Customer'}.`);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setRecoveringId(null);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleActionPause = async (opp: RecoveryOpportunity) => {
    try {
      await api.pauseOpportunity(opp.id);
      setToastMessage(`Paused automation for ${opp.customer?.name || 'Customer'}.`);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Map Failure Reason to clean human label
  const formatFailureReason = (cat: string) => {
    switch (cat) {
      case 'insufficient_funds':
        return 'Insufficient Funds';
      case 'expired_card':
        return 'Expired Card';
      case 'bank_related_failure':
        return 'Bank Declined';
      case 'authentication_required':
        return '3D Secure Required';
      case 'fraud_risk':
        return 'Fraud Flag';
      default:
        return 'Card Declined';
    }
  };

  // Map Recommended Action
  const formatRecommendedAction = (opp: RecoveryOpportunity) => {
    if (opp.recommended_action) return opp.recommended_action;
    if (opp.failure_category === 'expired_card') return 'Update Card Link';
    if (opp.failure_category === 'insufficient_funds') return 'Smart Retry (Day 1, 3, 5)';
    return '1-Click Payment Link';
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-[#071224] border border-emerald-500/30 text-emerald-400 text-xs font-mono shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Fast Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#4ADE80]" />
            <span className="text-[#4ADE80] font-semibold tracking-wide uppercase">REVENUE COMMAND</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">Recovery Pipeline</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-display">
            Opportunity Queue
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenCsvModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={startScan}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-xs transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 text-slate-950 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Run Revenue Scan'}</span>
          </button>
        </div>
      </div>

      {/* Embedded Scanner Progress Notification */}
      {isScanning && (
        <div className="p-4 rounded-xl bg-[#071224] border border-emerald-500/30 text-xs text-slate-200 flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 animate-spin text-[#4ADE80]" />
            <div>
              <span className="font-semibold text-white">Scanning Payment Gateways: </span>
              <span className="text-slate-400">
                {scanStep === 1 && 'Auditing subscription renewal failures...'}
                {scanStep === 2 && 'Evaluating policy thresholds and risk scores...'}
                {scanStep === 3 && 'Generating recovery links and retry schedules...'}
                {scanStep >= 4 && 'Syncing authoritative queue...'}
              </span>
            </div>
          </div>
          {scanStats && (
            <span className="font-mono text-emerald-400">
              Found {scanStats.audited} records (${scanStats.atRisk / 100} at risk)
            </span>
          )}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by customer, email, or failure reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#071224] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#071224] border border-slate-800 rounded-lg text-xs text-slate-300 font-mono focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses ({opportunities.length})</option>
            <option value="unrecovered">Unrecovered Only</option>
            <option value="manual_review">Manual Review Required</option>
            <option value="recovered">Recovered</option>
          </select>

          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-2 bg-[#071224] border border-slate-800 rounded-lg text-xs text-slate-300 font-mono focus:outline-none cursor-pointer"
          >
            <option value="all">All Gateways</option>
            <option value="stripe">Stripe</option>
            <option value="razorpay">Razorpay</option>
            <option value="paddle">Paddle</option>
          </select>

          {filteredOpportunityValueCents > 0 && (
            <div className="px-3 py-2 bg-[#071224] border border-slate-800 rounded-lg text-xs font-mono text-slate-400">
              <span>Filtered Opportunity Value: </span>
              <span className="text-white font-bold">{formatCurrencyAmount(filteredOpportunityValueCents, currency)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TABLE VIEW (EXACT COLUMNS AS REQUIRED) */}
      {/* ----------------------------------------------------------------- */}
      {opportunities.length === 0 ? (
        <div className="py-16 text-center space-y-4 bg-[#071224] rounded-2xl border border-slate-800">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-[#4ADE80] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-display">
              All monitored revenue streams are healthy.
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No failed payments detected. ReviveOS is actively monitoring connected gateways.
            </p>
          </div>
          <button
            onClick={startScan}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-500/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>Run Revenue Scan</span>
          </button>
        </div>
      ) : filteredOpportunities.length === 0 ? (
        <div className="py-12 text-center space-y-2 bg-[#071224] rounded-2xl border border-slate-800">
          <p className="text-xs font-medium text-slate-300">No opportunities match the selected filter.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setProviderFilter('all');
            }}
            className="text-xs font-mono text-[#4ADE80] hover:underline cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#071224] shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Customer</th>
                <th className="py-3.5 px-4 font-semibold">Amount At Risk</th>
                <th className="py-3.5 px-4 font-semibold">Provider</th>
                <th className="py-3.5 px-4 font-semibold">Failure Reason</th>
                <th className="py-3.5 px-4 font-semibold">Policy Decision</th>
                <th className="py-3.5 px-4 font-semibold">Recommended Action</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredOpportunities.map((opp) => {
                const isRecovered = opp.status === 'recovered';
                const isRecovering = recoveringId === opp.id;
                const custName = opp.customer?.name || (opp as any).customer_name || 'Customer';
                const email = opp.customer?.email || '';
                const provider = (opp.customer?.provider_type || opp.payment_failure?.provider_type || 'stripe').toUpperCase();
                const decision = opp.policy_decision?.decision || (opp.amount_at_risk_cents > 50000 ? 'MANUAL_REVIEW' : 'AUTONOMOUS');
                const isManual = decision === 'MANUAL_REVIEW';
                const isBlocked = decision === 'BLOCKED';

                return (
                  <tr key={opp.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* 1. Customer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{custName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{email || 'No email on file'}</div>
                    </td>

                    {/* 2. Amount At Risk */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white font-mono text-sm">
                        {formatCurrencyAmount(opp.amount_at_risk_cents || 0, opp.currency || currency)}
                      </span>
                    </td>

                    {/* 3. Provider */}
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {provider}
                      </span>
                    </td>

                    {/* 4. Failure Reason */}
                    <td className="py-3.5 px-4 text-slate-300">
                      {formatFailureReason(opp.failure_category)}
                    </td>

                    {/* 5. Policy Decision */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          isBlocked
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : isManual
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {decision}
                      </span>
                    </td>

                    {/* 6. Recommended Action */}
                    <td className="py-3.5 px-4 text-slate-300 text-xs">
                      {formatRecommendedAction(opp)}
                    </td>

                    {/* 7. Status */}
                    <td className="py-3.5 px-4">
                      {isRecovered ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Recovered</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sky-400 font-mono text-xs capitalize">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{opp.status.replace(/_/g, ' ')}</span>
                        </span>
                      )}
                    </td>

                    {/* 8. Actions (View, Approve, Pause, Recover) */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-mono text-xs">
                        {/* Action: View */}
                        <button
                          onClick={() => onSelectOpportunity(opp.id)}
                          title="View Details"
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Action: Approve (if Manual Review) */}
                        {isManual && !isRecovered && (
                          <button
                            onClick={() => handleActionApprove(opp)}
                            disabled={isRecovering}
                            title="Approve Plan"
                            className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer font-bold"
                          >
                            Approve
                          </button>
                        )}

                        {/* Action: Pause */}
                        {!isRecovered && (
                          <button
                            onClick={() => handleActionPause(opp)}
                            title="Pause Automation"
                            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 transition-colors cursor-pointer"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Action: Recover */}
                        {!isRecovered && (
                          <button
                            onClick={() => handleActionRecover(opp)}
                            disabled={isRecovering}
                            title="Instant Recovery"
                            className="px-2.5 py-1 rounded bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <Zap className={`w-3 h-3 ${isRecovering ? 'animate-spin' : ''}`} />
                            <span>Recover</span>
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
  );
};
