import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Activity,
  CreditCard,
  Users,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatCurrencyAmount } from '../utils/currency.js';
import { RecoveryOpportunity, EnrichedRecoveryOpportunity } from '../types/index.js';

interface InteractiveScannerSequenceProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  currency: string;
  opportunities: RecoveryOpportunity[];
  onSelectOpportunity?: (id: string) => void;
  totalAtRiskCents?: number;
  recoverableRevenueCents?: number;
  riskSignalsCount?: number;
  expansionOpportunityCents?: number;
}

export const InteractiveScannerSequence: React.FC<InteractiveScannerSequenceProps> = ({
  isOpen,
  onClose,
  onComplete,
  currency,
  opportunities,
  onSelectOpportunity,
  totalAtRiskCents: propTotalAtRisk,
  recoverableRevenueCents,
  riskSignalsCount,
  expansionOpportunityCents,
}) => {
  const [stage, setStage] = useState<'intro' | 'scanning' | 'resolved'>('intro');
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [activeSignalLabel, setActiveSignalLabel] = useState('');

  const scanStages = [
    { label: 'Auditing billing activity', highlight: 'Checking payment gateway feeds and ledger records' },
    { label: 'Checking failed payments', highlight: 'Identifying card declines and payment errors' },
    { label: 'Checking overdue invoices', highlight: 'Tracing unpaid and past-due invoice balances' },
    { label: 'Evaluating customer risk', highlight: 'Auditing subscription health and churn signals' },
    { label: 'Finding recovery opportunities', highlight: 'Calculating verified recoverable revenue' },
  ];

  useEffect(() => {
    if (!isOpen) {
      setStage('intro');
      setScanStepIndex(0);
      setActiveSignalLabel('');
      return;
    }

    if (stage === 'scanning') {
      let currentStep = 0;

      const interval = setInterval(() => {
        if (currentStep < scanStages.length) {
          setActiveSignalLabel(scanStages[currentStep].label);
          setScanStepIndex(currentStep);
          currentStep++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            setStage('resolved');
          }, 800);
        }
      }, 700);

      return () => clearInterval(interval);
    }
  }, [isOpen, stage]);

  if (!isOpen) return null;

  // The canonical financial source is the Revenue Leak Scanner / metrics endpoint.
  // Never derive or fall back to summing opportunity rows as a financial ledger.
  const hasSuppliedCanonical = propTotalAtRisk !== undefined;
  const totalAtRiskCents = propTotalAtRisk ?? 0;

  const totalRecoverableCents = recoverableRevenueCents !== undefined
    ? recoverableRevenueCents
    : totalAtRiskCents;

  const topOpportunities: EnrichedRecoveryOpportunity[] = [...opportunities]
    .sort((a, b) => (b.amount_at_risk_cents || 0) - (a.amount_at_risk_cents || 0))
    .slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020403]/95 backdrop-blur-2xl text-white font-sans overflow-hidden animate-in fade-in duration-300">
      {/* Background Volumetric Scanner Light Filament */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-[350px] bg-gradient-to-b from-[#86efac]/80 via-[#86efac]/20 to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#86efac]/[0.04] rounded-full blur-[140px] pointer-events-none" />
      </div>

      {/* Top Bar Navigation */}
      <div className="absolute top-8 left-8 right-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#86efac] animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
            02 / REVENUE LEAK SCANNER
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/[0.08]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* STAGE 1: INTRO SEQUENCE (MATCHING IMAGE 1 LOOK & FEEL) */}
      {/* --------------------------------------------------------------------- */}
      {stage === 'intro' && (
        <div className="relative z-10 max-w-5xl w-full px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <h2 className="text-5xl sm:text-7xl font-bold tracking-tight text-white font-display leading-[0.95]">
              Look <br />
              closer.
            </h2>

            <p className="text-base text-slate-400 font-light leading-relaxed max-w-md">
              One scan across payments, customers, subscriptions, renewals and expansion signals. Then a ranked list of what deserves attention first.
            </p>

            <div className="pt-2">
              <button
                onClick={() => setStage('scanning')}
                className="px-7 py-3.5 rounded-xl bg-[#86efac] hover:bg-[#a3e635] text-black font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#86efac]/20 cursor-pointer inline-flex items-center gap-2 group"
              >
                <span>Run a sample scan</span>
                <Sparkles className="w-4 h-4 text-black group-hover:rotate-12 transition-transform" />
              </button>
            </div>
          </div>

          {/* Concentric Orbital Wireframe */}
          <div className="lg:col-span-6 relative h-[360px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 360" fill="none">
              <ellipse cx="250" cy="180" rx="190" ry="100" stroke="rgba(255,255,255,0.06)" strokeWidth="1" transform="rotate(-12 250 180)" />
              <ellipse cx="250" cy="180" rx="140" ry="75" stroke="rgba(134,239,172,0.15)" strokeWidth="1" transform="rotate(8 250 180)" />
              <ellipse cx="250" cy="180" rx="90" ry="50" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <path d="M 250 180 L 70 80" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
              <path d="M 250 180 L 420 120" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
              <path d="M 250 180 L 140 290" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            </svg>

            <div className="absolute left-2 top-10">
              <div className="text-[10px] font-mono text-slate-500 uppercase">PAYMENT FAILURES</div>
              <div className="text-sm font-semibold text-slate-300">Decline detection</div>
            </div>

            <div className="absolute right-4 top-14 text-right">
              <div className="text-[10px] font-mono text-slate-500 uppercase">OVERDUE INVOICES</div>
              <div className="text-sm font-semibold text-slate-300">Past-due balances</div>
            </div>

            <div className="absolute left-10 bottom-8">
              <div className="text-[10px] font-mono text-slate-500 uppercase">CUSTOMER RISK</div>
              <div className="text-sm font-semibold text-slate-300">Churn signals</div>
            </div>

            <div className="w-36 h-36 rounded-full bg-black border border-[#86efac]/50 flex flex-col items-center justify-center text-center shadow-xl shadow-[#86efac]/10">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">LEAK SCANNER</span>
              <span className="text-4xl font-black text-white font-display">5</span>
              <span className="text-[9px] font-semibold text-[#86efac] tracking-widest uppercase mt-1">AUDIT VECTORS</span>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* STAGE 2: LIVE SCANNING SEQUENCE */}
      {/* --------------------------------------------------------------------- */}
      {stage === 'scanning' && (
        <div className="relative z-10 max-w-2xl w-full text-center space-y-10 px-6">
          {/* Spatial Concentric Radar Rings */}
          <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-[#86efac]/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border border-[#86efac]/40 animate-spin" style={{ animationDuration: '5s' }} />
            <div className="w-28 h-28 rounded-full bg-[#86efac]/10 border border-[#86efac] flex flex-col items-center justify-center text-[#86efac] shadow-2xl shadow-[#86efac]/20">
              <Activity className="w-7 h-7 animate-pulse" />
              <span className="text-[9px] font-mono font-bold mt-1 uppercase tracking-wider">LIVE AUDIT</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-mono text-[#86efac] tracking-widest uppercase">
              AUDITING BILLING ACTIVITY
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white font-display">
              {activeSignalLabel || 'Auditing billing activity...'}
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              {scanStages[scanStepIndex]?.highlight || 'Scanning ledger records and payment gateway telemetry...'}
            </p>
          </div>

          {/* Sequential Step Progress */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-w-xl mx-auto pt-4">
            {scanStages.map((stageItem, idx) => (
              <div
                key={stageItem.label}
                className={`p-2.5 rounded-lg border text-[10px] font-mono transition-all ${
                  idx < scanStepIndex
                    ? 'bg-[#86efac]/10 border-[#86efac]/40 text-[#86efac] shadow-sm shadow-[#86efac]/15'
                    : idx === scanStepIndex
                    ? 'bg-[#86efac]/20 border-[#86efac] text-white shadow-md shadow-[#86efac]/20'
                    : 'bg-white/[0.02] border-white/[0.06] text-slate-600'
                }`}
              >
                <div>0{idx + 1}</div>
                <div className="font-bold truncate mt-0.5">
                  {idx < scanStepIndex ? 'CHECKED' : idx === scanStepIndex ? 'AUDITING' : 'QUEUED'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* STAGE 3: RESOLVED OPPORTUNITIES REVEAL */}
      {/* --------------------------------------------------------------------- */}
      {stage === 'resolved' && (
        <div className="relative z-10 max-w-4xl w-full space-y-6 px-6 py-6 animate-in zoom-in-95 duration-500">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#86efac] uppercase tracking-widest">
              <CheckCircle2 className="w-4 h-4" />
              <span>FINANCIAL AUDIT COMPLETE · WHERE REVENUE IS AT RISK</span>
            </div>

            <div className="text-4xl sm:text-6xl font-bold text-white font-display tabular-nums tracking-tight">
              {formatCurrencyAmount(totalAtRiskCents, currency)}
            </div>

            <p className="text-xs text-slate-400 font-light max-w-md mx-auto">
              {hasSuppliedCanonical
                ? 'Confirmed billing exposure across unpaid ledgers and declined payment attempts.'
                : 'Run a workspace scan to calculate confirmed financial exposure.'}
            </p>
          </div>

          {/* Canonical Category Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">REVENUE AT RISK</div>
              <div className="text-base font-bold text-amber-400 font-display">
                {formatCurrencyAmount(totalAtRiskCents, currency)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">RECOVERABLE</div>
              <div className="text-base font-bold text-[#86efac] font-display">
                {formatCurrencyAmount(totalRecoverableCents, currency)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">RISK SIGNALS</div>
              <div className="text-base font-bold text-sky-400 font-display">
                {riskSignalsCount ?? opportunities.length}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">EXPANSION UPSIDE</div>
              <div className="text-base font-bold text-purple-400 font-display">
                {formatCurrencyAmount(expansionOpportunityCents ?? 0, currency)}
              </div>
            </div>
          </div>

          {/* Opportunity Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {topOpportunities.length > 0 ? (
              topOpportunities.map((opp, idx) => {
                const rawScore = opp.recoveryLikelihoodScore;
                const probabilityLabel = typeof rawScore === 'number' && !isNaN(rawScore)
                  ? `${Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)}% Recovery Likelihood Score`
                  : 'Deterministic estimate';

                return (
                  <div
                    key={opp.id}
                    onClick={() => {
                      if (onSelectOpportunity) onSelectOpportunity(opp.id);
                      onComplete();
                    }}
                    className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-[#86efac]/50 hover:bg-white/[0.06] transition-all cursor-pointer space-y-3 group"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#86efac] font-bold">0{idx + 1} PRIORITY</span>
                      <span className="text-slate-400">{probabilityLabel}</span>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-[#86efac] transition-colors truncate">
                        {opp.customer?.name || opp.customer_name || 'Enterprise Account'}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {opp.failure_reason || opp.failure_category || 'Card soft decline'}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                      <span className="text-base font-bold text-white font-display tabular-nums">
                        {formatCurrencyAmount(opp.amount_at_risk_cents || 0, currency)}
                      </span>
                      <span className="text-xs text-[#86efac] group-hover:translate-x-0.5 transition-transform">
                        View ↗
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-[#86efac] mx-auto opacity-80" />
                <div className="text-sm font-semibold text-white">No Unresolved Recovery Opportunities</div>
                <div className="text-xs text-slate-400 max-w-sm mx-auto">
                  Audit completed. Monitored customer ledgers are clear with no confirmed payment failures or past-due balances.
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-center pt-4">
            <button
              onClick={onComplete}
              className="px-8 py-3.5 rounded-xl bg-[#86efac] hover:bg-[#a3e635] text-black font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#86efac]/20 cursor-pointer flex items-center gap-2"
            >
              <span>Open Revenue Workspace</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
