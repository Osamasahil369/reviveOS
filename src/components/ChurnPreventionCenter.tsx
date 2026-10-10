import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Send,
  CreditCard,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api } from '../services/api.js';

interface ChurnCustomer {
  customerId: string;
  customerName: string;
  customerEmail: string;
  currency: string;
  status: 'HEALTHY' | 'WATCH' | 'AT RISK' | 'CRITICAL';
  cancellationRisk: 'low' | 'moderate' | 'high' | 'imminent';
  evidence: string[];
  recommendedAction: string;
  revenueAtRiskCents: number;
  lifetimeValueCents: number;
  subscriptionPlanName?: string;
}

interface ChurnPreventionCenterProps {
  currency: string;
  onExecuteAction?: (customerId: string, actionType: string) => Promise<void>;
}

export const ChurnPreventionCenter: React.FC<ChurnPreventionCenterProps> = ({
  currency,
  onExecuteAction,
}) => {
  const [profiles, setProfiles] = useState<ChurnCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isINR = currency.toUpperCase() === 'INR';
  const sym = isINR ? '₹' : '$';

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getCustomerHealth();
      if (res && Array.isArray(res.profiles)) {
        // Filter strictly to customers requiring churn intervention (CRITICAL, AT RISK, WATCH)
        const atRisk = res.profiles.filter(
          (p: any) => p.status === 'CRITICAL' || p.status === 'AT RISK' || p.status === 'WATCH'
        );
        // Sort by risk priority: CRITICAL -> AT RISK -> WATCH
        const rank: Record<string, number> = { CRITICAL: 3, 'AT RISK': 2, WATCH: 1, HEALTHY: 0 };
        atRisk.sort((a: any, b: any) => rank[b.status] - rank[a.status]);
        setProfiles(atRisk);
      }
    } catch (err: any) {
      console.error('Failed to load churn health data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAction = async (customer: ChurnCustomer) => {
    setExecutingId(customer.customerId);
    try {
      if (onExecuteAction) {
        await onExecuteAction(customer.customerId, 'prevent_churn');
      } else {
        await api.executeOrchestratorAction(`act_ret_${customer.customerId}`);
      }
      setActionNotice(`Intervention dispatched to ${customer.customerName}. Payment update link sent.`);
      setTimeout(() => setActionNotice(null), 4000);
      await loadData();
    } catch (err: any) {
      setActionNotice(`Failed to dispatch action: ${err.message || 'Error'}`);
    } finally {
      setExecutingId(null);
    }
  };

  // Compute total ARR / revenue protected
  const totalProtectedCents = profiles.reduce(
    (sum, p) => sum + (p.revenueAtRiskCents || p.lifetimeValueCents || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Churn Prevention Center</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Accounts exhibiting active billing distress, expiring cards, or disengagement. Verified evidence only — zero fabricated projections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-right">
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Revenue At Risk Protected</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">
              {sym}{(totalProtectedCents / 100).toLocaleString('en-US')}
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/[0.08] text-slate-300 transition-colors cursor-pointer"
            title="Refresh Churn Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">
          Scanning customer health indicators and billing records...
        </div>
      ) : profiles.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-white/[0.06] space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">Zero Accounts at Churn Risk</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            All active subscribers are in healthy standing with on-time recurring clearance and valid payment credentials.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {profiles.map((cust) => {
            const isCritical = cust.status === 'CRITICAL';
            const isAtRisk = cust.status === 'AT RISK';
            const revenueVal = cust.revenueAtRiskCents || cust.lifetimeValueCents;

            return (
              <div
                key={cust.customerId}
                className="bg-slate-900/90 border border-white/[0.08] hover:border-slate-700 rounded-2xl p-5 transition-all space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${
                          isCritical
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : isAtRisk
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        }`}
                      >
                        {cust.status} RISK
                      </span>
                      <h3 className="text-sm font-bold text-white">{cust.customerName}</h3>
                      <span className="text-xs text-slate-500 font-mono">({cust.customerEmail})</span>
                    </div>

                    <div className="text-xs text-slate-400 mt-1 font-mono">
                      Plan: <span className="text-slate-200">{cust.subscriptionPlanName || 'Recurring Subscription'}</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-xs text-slate-400 font-mono">Revenue Protected:</div>
                    <div className="text-base font-bold text-emerald-400 font-mono">
                      {sym}{(revenueVal / 100).toLocaleString('en-US')}
                    </div>
                  </div>
                </div>

                {/* Evidence Box */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/[0.04] space-y-2">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Why At Risk? (Concrete Evidence)</span>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-300 pl-4 list-disc marker:text-slate-500">
                    {cust.evidence.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                {/* Action Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-white/[0.04]">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Recommended Action:</div>
                    <div className="text-xs font-semibold text-slate-200">{cust.recommendedAction}</div>
                  </div>

                  <button
                    onClick={() => handleAction(cust)}
                    disabled={executingId === cust.customerId}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-sm shadow-emerald-500/20 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {executingId === cust.customerId ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Dispatching...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Execute Retention Intervention</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
