import React from 'react';
import { Sparkles, CheckCircle2, Trophy, ArrowRight } from 'lucide-react';
import { RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

export interface FirstSuccessCelebrationProps {
  opportunities: RecoveryOpportunity[];
  currency?: string;
  className?: string;
}

export const FirstSuccessCelebration: React.FC<FirstSuccessCelebrationProps> = ({
  opportunities,
  currency = 'USD',
  className = '',
}) => {
  const recoveredOpps = opportunities.filter((o) => o.status === 'recovered');

  // Only show if exactly or at least one recovery has occurred and it's a recent celebration
  if (recoveredOpps.length === 0) return null;

  const firstRecovery = recoveredOpps[0];
  const amountCents = firstRecovery.recovered_amount_cents || firstRecovery.amount_at_risk_cents || 0;
  const amountFormatted = formatCurrencyAmount(amountCents, currency);
  const customerName = firstRecovery.customer?.name || (firstRecovery as any).customer_name || 'Customer';

  let method = 'Payment Retry';
  if (firstRecovery.payment_link_url || firstRecovery.recovery_token) {
    method = 'Recovery Payment Link';
  } else if (firstRecovery.recommended_action === 'customer_outreach') {
    method = 'Customer Updated Card';
  }

  return (
    <div
      className={`p-6 rounded-3xl bg-gradient-to-br from-emerald-500/20 via-[#071224] to-slate-950 border border-emerald-500/50 shadow-2xl relative overflow-hidden ${className}`}
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-[#4ADE80] flex items-center justify-center shrink-0 mt-0.5">
            <Trophy className="w-6 h-6 stroke-[2.5]" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                First Recovery Achieved
              </h3>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-white font-display tabular-nums">
              Recovered {amountFormatted}
            </div>

            <div className="text-xs text-slate-300 font-sans flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              <span>
                <strong className="text-slate-200">Customer:</strong> {customerName}
              </span>
              <span className="text-slate-600">•</span>
              <span>
                <strong className="text-slate-200">Method:</strong> {method}
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Success Unlocked</span>
          </div>
        </div>
      </div>
    </div>
  );
};
