import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  Repeat,
  AlertOctagon,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  BarChart2,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { DashboardChartData, RecoveryMetrics } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';
import { api } from '../services/api.js';

interface BusinessMetricsDashboardProps {
  metrics: RecoveryMetrics | null;
  currency: string;
}

export const BusinessMetricsDashboard: React.FC<BusinessMetricsDashboardProps> = ({
  metrics,
  currency,
}) => {
  const [chartData, setChartData] = useState<DashboardChartData | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'revenue' | 'failures' | 'subscriptions'>('revenue');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCharts();
  }, [metrics?.currency]);

  const loadCharts = async () => {
    setIsLoading(true);
    try {
      const data = await api.getDashboardCharts();
      setChartData(data);
    } catch (err) {
      console.error('Failed to load dashboard charts', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return formatCurrencyAmount(cents, currency || 'USD', { maximumFractionDigits: 0 });
  };

  const mrr = metrics?.mrr_cents ?? 0;
  const arr = metrics?.arr_cents ?? 0;
  const churnRate = metrics?.churn_rate_percentage ?? 0;
  const clv = metrics?.customer_lifetime_value_cents ?? 0;
  const activeSubs = metrics?.active_subscriptions_count ?? 0;
  const totalRev = metrics?.total_revenue_cents ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. Header & Section Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-emerald-400" />
            <span>SaaS Business Metrics & Recovery Performance</span>
          </h2>
          <p className="text-xs text-slate-400">
            Real-time monthly recurring revenue trajectory, churn containment, and dunning efficacy.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setActiveChartTab('revenue')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              activeChartTab === 'revenue'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Revenue & MRR
          </button>
          <button
            onClick={() => setActiveChartTab('failures')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              activeChartTab === 'failures'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Decline Volumes
          </button>
          <button
            onClick={() => setActiveChartTab('subscriptions')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              activeChartTab === 'subscriptions'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sub Growth
          </button>
        </div>
      </div>

      {/* 2. Primary SaaS KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Monthly Run Rate (MRR)
          </span>
          <div className="text-xl font-black text-white font-mono mt-1">
            {formatCurrency(mrr)}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Active subscription volume
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Annual Run Rate (ARR)
          </span>
          <div className="text-xl font-black text-white font-mono mt-1">
            {formatCurrency(arr)}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Annualized contract value
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Monthly Churn Rate
          </span>
          <div className="text-xl font-black text-amber-400 font-mono mt-1">
            {churnRate}%
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Canceled over total volume
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Average Customer LTV
          </span>
          <div className="text-xl font-black text-white font-mono mt-1">
            {formatCurrency(clv)}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Across active cohorts
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Active Subscriptions
          </span>
          <div className="text-xl font-black text-white font-mono mt-1">
            {activeSubs}
          </div>
          <span className="text-[10px] text-emerald-400 block mt-1">
            Stripe, Razorpay, PayPal
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Net Revenue
          </span>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1">
            {formatCurrency(totalRev)}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Cumulative processed
          </span>
        </div>
      </div>

      {/* 3. Recharts Visualizer Canvas */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm">
        {isLoading || !chartData ? (
          <div className="h-72 flex items-center justify-center text-slate-500 text-xs">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500 mr-2" />
            Loading visual analytics...
          </div>
        ) : (
          <div>
            {/* Chart 1: Revenue Trend (Recovered Revenue vs Lost vs MRR) */}
            {activeChartTab === 'revenue' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Recovered Recurring Capital vs Unrecovered Loss
                    </h3>
                    <p className="text-xs text-slate-400">
                      Comparing captured recovery amounts against permanent involuntary churn (cents converted to {currency})
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      Recovered
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                      Lost (Unrecovered)
                    </span>
                  </div>
                </div>

                <div className="h-72 w-full">
                  {chartData.revenue_trend.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                      <div className="text-xs font-semibold text-white">Insufficient historical data</div>
                      <p className="text-[11px] text-slate-500">Revenue trend history requires historical revenue recovery events.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData.revenue_trend}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                      <defs>
                        <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorLost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="period"
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => formatCurrency(v)}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                          color: '#fff',
                        }}
                        formatter={(value: any, name: any) => [
                          formatCurrency(Number(value)),
                          name === 'recovered_cents'
                            ? 'Recovered Capital'
                            : name === 'lost_cents'
                            ? 'Unrecovered Loss'
                            : 'MRR',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="recovered_cents"
                        name="Recovered Capital"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorRecovered)"
                      />
                      <Area
                        type="monotone"
                        dataKey="lost_cents"
                        name="Lost Capital"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorLost)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* Chart 2: Payment Failures & Recovery Volume */}
            {activeChartTab === 'failures' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Payment Failures Ingested vs Smart Retries & Rescued Invoices
                    </h3>
                    <p className="text-xs text-slate-400">
                      Volume breakdown per monthly billing period
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                      Failed
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      Retried
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      Rescued
                    </span>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData.payment_failures}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="period" stroke="#64748b" fontSize={12} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                          color: '#fff',
                        }}
                      />
                      <Bar dataKey="failed_count" name="Failed Invoices" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="retries_count" name="Retries Executed" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="recovered_count" name="Recovered Accounts" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Chart 3: Subscription Growth & Churn Contained */}
            {activeChartTab === 'subscriptions' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Subscription Portfolio Velocity & Retention Curve
                    </h3>
                    <p className="text-xs text-slate-400">
                      Net subscriber accumulation bolstered by proactive dunning
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                      Active Subs
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      New Subs
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                      Churned Subs
                    </span>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData.subscription_growth}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="period" stroke="#64748b" fontSize={12} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                          color: '#fff',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="active_count"
                        name="Active Subscriptions"
                        stroke="#06b6d4"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#06b6d4' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="new_count"
                        name="New Subscriptions"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#10b981' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="churned_count"
                        name="Involuntary Churns"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: '#f43f5e' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
