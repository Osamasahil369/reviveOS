import React, { useState } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Clock,
  ChevronRight,
  CreditCard,
  Building,
} from 'lucide-react';
import { RecoveryOpportunity, FailureCategory, ProviderType } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { EmptyStateCard } from './EmptyStateCard.js';

interface OpportunitiesViewProps {
  opportunities: RecoveryOpportunity[];
  currency: string;
  onRefresh: () => void;
  onSelectOpportunity: (id: string) => void;
  onRetry: (id: string) => void;
  onSettle: (id: string) => void;
  onOpenEmailModal: (opp: RecoveryOpportunity) => void;
}

export const OpportunitiesView: React.FC<OpportunitiesViewProps> = ({
  opportunities,
  currency,
  onRefresh,
  onSelectOpportunity,
  onRetry,
  onSettle,
  onOpenEmailModal,
}) => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const formatCurrency = (cents: number, curr?: string) => {
    return formatCurrencyAmount(cents, curr || currency || 'USD');
  };

  const filteredOpps = opportunities.filter((opp) => {
    if (statusFilter !== 'all' && opp.status !== statusFilter) return false;
    if (providerFilter !== 'all' && opp.customer.provider_type !== providerFilter) return false;
    if (categoryFilter !== 'all' && opp.failure_category !== categoryFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = opp.customer.name.toLowerCase().includes(q);
      const matchEmail = opp.customer.email.toLowerCase().includes(q);
      const matchInv = opp.invoice?.provider_invoice_id.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchInv) return false;
    }
    return true;
  });

  const handleCopyLink = (token: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}/pay/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payment Recoveries</h1>
          <p className="text-xs text-slate-400">
            Failed customer payments ready for automatic card retry or customer email reminder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search customer, email, invoice..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Recovery Statuses</option>
              <option value="active">Active In Progress</option>
              <option value="contacted">Customer Contacted</option>
              <option value="payment_retry_pending">Retry Pending</option>
              <option value="recovered">Recovered (Paid)</option>
              <option value="new">New Failure</option>
            </select>
          </div>

          {/* Provider Filter */}
          <div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Payment Providers</option>
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Failure Categories</option>
              <option value="insufficient_funds">Insufficient Funds</option>
              <option value="expired_card">Expired Card</option>
              <option value="authentication_required">Bank Approval Required</option>
              <option value="payment_method_declined">Card Declined</option>
              <option value="bank_related_failure">Bank Related Error</option>
            </select>
          </div>
        </div>
      </div>

      {/* Opportunities Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Customer & Plan</th>
                <th className="py-3.5 px-4">Amount At Risk</th>
                <th className="py-3.5 px-4">Failure Reason</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Recommended Action</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredOpps.map((opp) => {
                const isRecovered = opp.status === 'recovered';
                const formattedAmount = formatCurrency(opp.amount_at_risk_cents, opp.currency);

                return (
                  <tr
                    key={opp.id}
                    onClick={() => onSelectOpportunity(opp.id)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    {/* Customer */}
                    <td className="py-4 px-4">
                      <div className="font-semibold text-white">{opp.customer.name}</div>
                      <div className="text-slate-400 truncate max-w-[200px]">{opp.customer.email}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {opp.subscription?.plan_name || 'Recurring Invoice'} •{' '}
                        <span className="font-mono text-slate-400 uppercase">{opp.customer.provider_type}</span>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-4 font-mono font-bold text-white">
                      <div>{formattedAmount}</div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        Inv: {opp.invoice?.provider_invoice_id || 'N/A'}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-4 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 capitalize">
                        {opp.failure_category.replace(/_/g, ' ')}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[180px]">
                        {opp.payment_failure.raw_error_message}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                          isRecovered
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : opp.status === 'contacted'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : opp.status === 'payment_retry_pending'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {isRecovered && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {opp.status.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Recommended Action */}
                    <td className="py-4 px-4 text-slate-300 max-w-[240px]">
                      <div className="line-clamp-2">{opp.recommended_action}</div>
                      <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Step {opp.current_step_number} in workflow</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {!isRecovered ? (
                          <>
                            <button
                              onClick={() => onRetry(opp.id)}
                              title="Smart Retry with Gateway"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                            >
                              Retry
                            </button>

                            <button
                              onClick={() => onOpenEmailModal(opp)}
                              title="Send Recovery Email"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => handleCopyLink(opp.recovery_token, e)}
                              title="Copy Customer Payment Recovery Link"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                            >
                              {copiedToken === opp.recovery_token ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-emerald-400 font-semibold px-2 py-1 bg-emerald-500/10 rounded-md">
                            Recovered
                          </span>
                        )}

                        <button
                          onClick={() => onSelectOpportunity(opp.id)}
                          className="p-1.5 text-slate-400 hover:text-white"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOpps.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8">
                    <EmptyStateCard
                      title="No Recovery Opportunities Found"
                      whatItDoes="Lists all active payment failure opportunities detected by your payment gateway or scanner."
                      whyItMatters="Enables smart retries and automated outreach to recover failed customer payments immediately."
                      whatToClickNext="Click 'Run Scanner' to scan your connected provider for hidden revenue leaks."
                      actionLabel="Run Scanner"
                      onAction={onRefresh}
                      icon={CreditCard}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
