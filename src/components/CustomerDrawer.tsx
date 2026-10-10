import React, { useState } from 'react';
import {
  X,
  CreditCard,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  ExternalLink,
  Shield,
  Copy,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { RecoveryOpportunity, RecoveryEvent } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface CustomerDrawerProps {
  opportunity: (RecoveryOpportunity & { events?: RecoveryEvent[] }) | null;
  currency: string;
  onClose: () => void;
  onRetry: (id: string) => void;
  onSettle: (id: string) => void;
  onOpenEmailModal: (opp: RecoveryOpportunity) => void;
  onViewFullDetails?: (opportunityId: string) => void;
}

export const CustomerDrawer: React.FC<CustomerDrawerProps> = ({
  opportunity,
  currency,
  onClose,
  onRetry,
  onSettle,
  onOpenEmailModal,
  onViewFullDetails,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!opportunity) return null;

  const formatCurrency = (cents: number, curr?: string) => {
    return formatCurrencyAmount(cents, curr || currency || 'USD');
  };

  const isRecovered = opportunity.status === 'recovered';
  const formattedAmount = formatCurrency(opportunity.amount_at_risk_cents, opportunity.currency);
  const recoveryUrl = `${window.location.origin}/pay/${opportunity.recovery_token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(recoveryUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col justify-between shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{opportunity.customer.name}</h2>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${
                  isRecovered
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}
              >
                {opportunity.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-400">{opportunity.customer.email}</p>
          </div>

          <div className="flex items-center gap-2">
            {onViewFullDetails && (
              <button
                onClick={() => {
                  onViewFullDetails(opportunity.id);
                  onClose();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                title="Open Full Recovery Command Center"
              >
                <span>Full Details</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6 flex-1">
          {/* Amount Card */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">At Risk Involuntarily</span>
              <div className="text-2xl font-black text-white font-mono">{formattedAmount}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Invoice #{opportunity.invoice?.provider_invoice_id} • Plan: {opportunity.subscription?.plan_name}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Gateway</span>
              <div className="font-mono text-xs font-bold text-slate-200 uppercase mt-0.5">
                {opportunity.customer.provider_type}
              </div>
            </div>
          </div>

          {/* Failure Diagnostics */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Failure Diagnostics</h3>
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Category:</span>
                <span className="font-bold text-amber-300 capitalize">
                  {opportunity.failure_category.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Provider Error Code:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {opportunity.payment_failure.provider_failure_code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Raw Message:</span>
                <span className="text-slate-300 text-right truncate max-w-[240px]">
                  {opportunity.payment_failure.raw_error_message}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-700">
                <span className="text-slate-400">Recommended Action:</span>
                <span className="text-emerald-400 font-semibold text-right max-w-[240px]">
                  {opportunity.recommended_action}
                </span>
              </div>
            </div>
          </div>

          {/* Recovery Link */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 uppercase tracking-wider">Hosted Customer Recovery Link</span>
              <button
                onClick={handleCopyLink}
                className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied Link' : 'Copy Link'}</span>
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 font-mono text-[11px] text-slate-300 truncate">
              {recoveryUrl}
            </div>
            <p className="text-[11px] text-slate-500">
              Direct single-use secured page allowing the subscriber to update payment information or settle.
            </p>
          </div>

          {/* Activity / Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Recovery Timeline & Events</span>
            </h3>

            <div className="space-y-2">
              {opportunity.events && opportunity.events.length > 0 ? (
                opportunity.events.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-white capitalize">
                        {evt.event_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Via {evt.channel} • Status: <span className="text-emerald-400">{evt.status}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(evt.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 p-3 bg-slate-800/30 rounded-lg text-center">
                  First recovery action scheduled in current workflow.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3">
          {!isRecovered ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRetry(opportunity.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Smart Retry Gateway</span>
                </button>

                <button
                  onClick={() => onOpenEmailModal(opportunity)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-blue-400" />
                  <span>Send Dunning Email</span>
                </button>
              </div>

              <button
                onClick={() => onSettle(opportunity.id)}
                className="text-xs text-slate-400 hover:text-emerald-400 font-medium cursor-pointer"
              >
                Mark Manually Paid
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold w-full justify-center py-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Recovered and fully captured</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
