import React, { useState } from 'react';
import {
  Users,
  Search,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  CreditCard,
  CheckCircle2,
  UserPlus,
  Zap,
  DollarSign,
  PlusCircle,
  Coins,
  Activity,
} from 'lucide-react';
import { Customer, ProviderType, FailureCategory, BillingIntervalType, CustomIntervalUnit } from '../types/index.js';
import { AddCustomerModal } from './AddCustomerModal.js';
import { IngestPaymentFailureModal } from './IngestPaymentFailureModal.js';
import { CustomerDetailModal } from './CustomerDetailModal.js';
import { api } from '../services/api.js';
import { formatCurrencyAmount, getCurrencySymbol } from '../utils/currency.js';
import { extractHealthScoreNumber, getHealthGrade } from '../utils/healthScore.js';

interface CustomersViewProps {
  customers: Customer[];
  currency: string;
  onSelectCustomer?: (id: string) => void;
  onRefresh: () => void;
  onShowToast: (title: string, message: string) => void;
  onNavigateToTimeline?: (customerId?: string) => void;
  onSelectOpportunity?: (opportunityId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  currency,
  onSelectCustomer,
  onRefresh,
  onShowToast,
  onNavigateToTimeline,
  onSelectOpportunity,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gatewayFilter, setGatewayFilter] = useState('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [ingestTargetCustomerId, setIngestTargetCustomerId] = useState<string | undefined>(undefined);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);

  const formatCurrency = (cents: number, customerCurr?: string) => {
    return formatCurrencyAmount(cents, customerCurr || currency || 'USD');
  };

  const handleAddCustomerSubmit = async (data: {
    name: string;
    email: string;
    phone?: string;
    country?: string;
    currency?: string;
    provider_type: ProviderType;
    plan_name?: string;
    plan_amount_cents?: number;
    billing_interval?: BillingIntervalType;
    custom_interval_count?: number;
    custom_interval_unit?: CustomIntervalUnit;
    trial_days?: number;
    grace_period_days?: number;
  }) => {
    await api.createCustomer(data);
    onShowToast('Customer Provisioned', `Customer ${data.name} and subscription plan created.`);
    onRefresh();
  };

  const handleIngestFailureSubmit = async (data: {
    customerId: string;
    amountCents: number;
    currency?: string;
    providerFailureCode?: string;
    rawErrorMessage?: string;
    failureCategory?: FailureCategory;
    planName?: string;
  }) => {
    const res = await api.ingestFailedPayment(data);
    onShowToast(
      'Payment Failure Ingested',
      `Recovery Opportunity created for ${formatCurrency(data.amountCents, data.currency)} with live token URL.`
    );
    onRefresh();
  };

  const handleOpenIngestForCustomer = (custId: string) => {
    setIngestTargetCustomerId(custId);
    setIsIngestModalOpen(true);
  };

  const filtered = customers.filter((c) => {
    if (statusFilter !== 'all' && c.current_risk_status !== statusFilter) return false;
    if (gatewayFilter !== 'all' && c.provider_type !== gatewayFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchEmail = c.email.toLowerCase().includes(q);
      const matchId = c.provider_customer_id.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchId) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customer Directory & Subscriptions</h1>
          <p className="text-xs text-slate-400">
            Subscriber profiles, payment health histories, and cumulative recovered revenue.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIngestTargetCustomerId(undefined);
              setIsIngestModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Ingest Failed Payment</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, email, or customer ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Risk Statuses</option>
              <option value="healthy">Healthy (Current)</option>
              <option value="at_risk">At Risk (Active Payment Failure)</option>
              <option value="delinquent">Delinquent (Past Due)</option>
              <option value="churned">Churned</option>
            </select>
          </div>

          <div>
            <select
              value={gatewayFilter}
              onChange={(e) => setGatewayFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Payment Gateways</option>
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
              <option value="paypal">PayPal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Account Risk Status</th>
                <th className="py-3.5 px-4">Health Score</th>
                <th className="py-3.5 px-4">Gateway</th>
                <th className="py-3.5 px-4">Lifetime Revenue</th>
                <th className="py-3.5 px-4">Recovered To Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filtered.map((c) => {
                const healthScore = extractHealthScoreNumber(c.health_score);
                const healthGrade = c.health_grade || getHealthGrade(healthScore);

                return (
                <tr
                  key={c.id}
                  onClick={() => setDetailCustomerId(c.id)}
                  className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                >
                  <td className="py-4 px-4">
                    <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {c.name}
                    </div>
                    <div className="text-slate-400 text-[11px]">{c.email}</div>
                  </td>

                  <td className="py-4 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                        c.current_risk_status === 'healthy'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : c.current_risk_status === 'at_risk'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {c.current_risk_status === 'healthy' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {c.current_risk_status?.replace(/_/g, ' ') || 'healthy'}
                    </span>
                  </td>

                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-xs">
                        {healthScore}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          healthScore >= 80
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : healthScore >= 60
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {healthGrade}
                      </span>
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <span className="font-mono text-[11px] text-slate-300 uppercase px-2 py-0.5 rounded bg-slate-800">
                      {c.provider_type}
                    </span>
                  </td>

                  <td className="py-4 px-4 font-mono font-bold text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span>{formatCurrency(c.lifetime_value_cents, c.currency)}</span>
                      {c.currency && c.currency !== currency && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {c.currency}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-4 px-4 font-mono font-bold text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <span>{formatCurrency(c.total_recovered_cents, c.currency)}</span>
                      {c.currency && c.currency !== currency && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-emerald-500 font-mono">
                          {c.currency}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenIngestForCustomer(c.id)}
                        title="Simulate Failed Invoice"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDetailCustomerId(c.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        Manage
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No customers found matching the search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={isAddModalOpen}
        currency={currency}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddCustomerSubmit}
      />

      {/* Ingest Payment Failure Modal */}
      <IngestPaymentFailureModal
        isOpen={isIngestModalOpen}
        customers={customers}
        selectedCustomerId={ingestTargetCustomerId}
        currency={currency}
        onClose={() => setIsIngestModalOpen(false)}
        onSubmit={handleIngestFailureSubmit}
      />

      {/* Customer Detailed Management Modal */}
      <CustomerDetailModal
        customerId={detailCustomerId}
        currency={currency}
        onClose={() => setDetailCustomerId(null)}
        onIngestFailure={(id) => {
          setDetailCustomerId(null);
          handleOpenIngestForCustomer(id);
        }}
        onRefresh={onRefresh}
        onNavigateToTimeline={onNavigateToTimeline}
        onSelectOpportunity={onSelectOpportunity}
      />
    </div>
  );
};
