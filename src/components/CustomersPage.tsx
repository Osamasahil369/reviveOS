import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  Building,
  TrendingUp,
  X,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Customer, RecoveryOpportunity } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { AddCustomerModal } from './AddCustomerModal.js';
import { CustomerDetailModal } from './CustomerDetailModal.js';
import { api } from '../services/api.js';

interface CustomersPageProps {
  customers: Customer[];
  opportunities: RecoveryOpportunity[];
  currency: string;
  onSelectOpportunity: (id: string) => void;
  onQuickRecover: (id: string) => void;
  onRefresh?: () => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  opportunities,
  currency,
  onSelectOpportunity,
  onQuickRecover,
  onRefresh = () => {},
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'healthy' | 'at_risk' | 'critical'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Compute CRM-like customer metrics
  const getCustomerMetrics = (c: Customer) => {
    // MRR
    const mrrCents = (c as any).monthly_spend_cents || (c as any).plan_amount_cents || (c.lifetime_value_cents ? Math.round(c.lifetime_value_cents / 12) : 0);
    // LTV
    const ltvCents = c.lifetime_value_cents || (mrrCents * 12);
    // Health Score
    const rawScore = typeof c.health_score === 'number' ? c.health_score : (c.health_score as any)?.score;
    const score = rawScore !== undefined ? rawScore : c.current_risk_status === 'healthy' ? 94 : c.current_risk_status === 'at_risk' ? 52 : 30;

    // Risk Level
    let riskLevel: 'Healthy' | 'Watch' | 'At Risk' | 'Critical' = 'Healthy';
    let riskBadge = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

    if (score < 40 || (c.current_risk_status as any) === 'critical') {
      riskLevel = 'Critical';
      riskBadge = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    } else if (score < 60 || c.current_risk_status === 'at_risk') {
      riskLevel = 'At Risk';
      riskBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    } else if (score < 80) {
      riskLevel = 'Watch';
      riskBadge = 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    }

    // Last Payment info
    const customerOpp = opportunities.find((o) => o.customer_id === c.id || o.customer?.id === c.id);
    let lastPaymentText = 'Up to date';
    let isPendingDecline = false;

    if (customerOpp && customerOpp.status !== 'recovered') {
      lastPaymentText = `Declined (${formatCurrencyAmount(customerOpp.amount_at_risk_cents || 0, currency)})`;
      isPendingDecline = true;
    } else if (c.updated_at) {
      lastPaymentText = new Date(c.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Status
    const status = isPendingDecline ? 'In Recovery' : c.current_risk_status === 'churned' ? 'Churned' : 'Active';

    return { mrrCents, ltvCents, score, riskLevel, riskBadge, lastPaymentText, isPendingDecline, status };
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.country || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const { riskLevel } = getCustomerMetrics(c);
      if (riskFilter === 'healthy' && riskLevel !== 'Healthy') return false;
      if (riskFilter === 'at_risk' && (riskLevel !== 'At Risk' && riskLevel !== 'Watch')) return false;
      if (riskFilter === 'critical' && riskLevel !== 'Critical') return false;

      return true;
    });
  }, [customers, searchQuery, riskFilter, opportunities]);

  const handleAddCustomerSubmit = async (data: any) => {
    await api.createCustomer(data);
    setIsAddModalOpen(false);
    onRefresh();
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#4ADE80]" />
            <span className="text-[#4ADE80] font-semibold tracking-wide uppercase">CUSTOMER DIRECTORY</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">Account Health & Risk</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-display">
            Customer Directory
          </h1>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-xs transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-slate-950" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search customers by name, email, or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#071224] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#071224] border border-slate-800 rounded-lg text-xs text-slate-300 font-mono focus:outline-none cursor-pointer"
          >
            <option value="all">All Accounts ({customers.length})</option>
            <option value="healthy">Healthy Only</option>
            <option value="at_risk">At Risk / Watch</option>
            <option value="critical">Critical Only</option>
          </select>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* CRM-LIKE CUSTOMER TABLE (EXACT COLUMNS REQUIRED) */}
      {/* ----------------------------------------------------------------- */}
      {customers.length === 0 ? (
        <div className="py-16 text-center space-y-4 bg-[#071224] rounded-2xl border border-slate-800">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-[#4ADE80] flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-display">
              No Customer Accounts Found
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add customers manually or connect your billing gateway to import accounts automatically.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-500/20"
          >
            <Plus className="w-3.5 h-3.5 text-slate-950" />
            <span>Add Customer</span>
          </button>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="py-12 text-center space-y-2 bg-[#071224] rounded-2xl border border-slate-800">
          <p className="text-xs font-medium text-slate-300">No customers match the selected filter.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setRiskFilter('all');
            }}
            className="text-xs font-mono text-[#4ADE80] hover:underline cursor-pointer"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#071224] shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Customer</th>
                <th className="py-3.5 px-4 font-semibold">MRR</th>
                <th className="py-3.5 px-4 font-semibold">Lifetime Value</th>
                <th className="py-3.5 px-4 font-semibold">Health Score</th>
                <th className="py-3.5 px-4 font-semibold">Risk Level</th>
                <th className="py-3.5 px-4 font-semibold">Last Payment</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredCustomers.map((cust) => {
                const { mrrCents, ltvCents, score, riskLevel, riskBadge, lastPaymentText, isPendingDecline, status } =
                  getCustomerMetrics(cust);

                return (
                  <tr
                    key={cust.id}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    {/* 1. Customer */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-200 font-bold font-mono text-xs flex items-center justify-center shrink-0 border border-slate-700">
                          {cust.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white group-hover:text-[#4ADE80] transition-colors truncate">
                            {cust.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">{cust.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* 2. MRR */}
                    <td className="py-3.5 px-4 font-mono font-semibold text-white">
                      {formatCurrencyAmount(mrrCents, currency)}
                    </td>

                    {/* 3. Lifetime Value */}
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {formatCurrencyAmount(ltvCents, currency)}
                    </td>

                    {/* 4. Health Score */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              score >= 80 ? 'bg-[#4ADE80]' : score >= 60 ? 'bg-amber-400' : 'bg-rose-400'
                            }`}
                            style={{ width: `${Math.max(5, Math.min(100, score))}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-200">{score}/100</span>
                      </div>
                    </td>

                    {/* 5. Risk Level */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${riskBadge}`}>
                        {riskLevel}
                      </span>
                    </td>

                    {/* 6. Last Payment */}
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <span className={isPendingDecline ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                        {lastPaymentText}
                      </span>
                    </td>

                    {/* 7. Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold ${
                          status === 'Active'
                            ? 'text-emerald-400'
                            : status === 'In Recovery'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            status === 'Active' ? 'bg-[#4ADE80]' : status === 'In Recovery' ? 'bg-[#F59E0B]' : 'bg-slate-500'
                          }`}
                        />
                        <span>{status}</span>
                      </span>
                    </td>

                    {/* 8. Details Drawer trigger */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomerId(cust.id);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>Drawer</span>
                        <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-white transition-colors" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Drawer Modal */}
      {selectedCustomerId && (
        <CustomerDetailModal
          customerId={selectedCustomerId}
          currency={currency}
          onClose={() => setSelectedCustomerId(null)}
          onIngestFailure={() => onRefresh()}
          onRefresh={() => onRefresh()}
          onSelectOpportunity={onSelectOpportunity}
        />
      )}

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={isAddModalOpen}
        currency={currency}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddCustomerSubmit}
      />
    </div>
  );
};
