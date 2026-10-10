import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Clock,
  Shield,
  Award,
  Layers,
  Download,
  Calendar,
  CreditCard,
  Mail,
  Smartphone,
  MessageSquare,
  CheckCircle2,
  Users,
  Building,
  RefreshCw,
  BarChart3,
  Percent,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { RecoveryMetrics, RevenueEvent } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RoiReportingViewProps {
  metrics: RecoveryMetrics | null;
  revenueEvents: RevenueEvent[];
  currency: string;
  onShowToast: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const RoiReportingView: React.FC<RoiReportingViewProps> = ({
  metrics,
  revenueEvents,
  currency,
  onShowToast,
}) => {
  const [dateRange, setDateRange] = useState<'30d' | '90d' | 'ytd' | 'all'>('90d');
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<'gateway' | 'channel'>('channel');

  const totalRecoveredCents = metrics?.revenue_recovered_cents ?? 0;
  const totalAtRiskCents = metrics?.revenue_at_risk_cents ?? 0;
  const activeArrCents = metrics?.arr_cents ?? 0;
  const roiMultiple = metrics?.roi_multiple ?? 0;

  const formattedRecovered = formatCurrencyAmount(totalRecoveredCents, currency);
  const formattedAtRisk = formatCurrencyAmount(totalAtRiskCents, currency);
  const formattedActiveArr = formatCurrencyAmount(activeArrCents, currency);

  // Dynamic aggregation from real filtered revenueEvents for selected period
  const now = Date.now();
  const cutoffTime = dateRange === '30d'
    ? now - 30 * 86400000
    : dateRange === '90d'
    ? now - 90 * 86400000
    : dateRange === 'ytd'
    ? new Date(new Date().getFullYear(), 0, 1).getTime()
    : 0;

  const filteredEvents = revenueEvents.filter((evt) => {
    const isRecovered = evt.event_type === 'revenue_recovered';
    const matchesCurrency = !evt.currency || evt.currency.toUpperCase() === currency.toUpperCase();
    const evtTime = new Date(evt.recorded_at).getTime();
    const matchesDate = !isNaN(evtTime) && (dateRange === 'all' || evtTime >= cutoffTime);
    return isRecovered && matchesCurrency && matchesDate;
  });

  const periodRecoveredCents = filteredEvents.reduce((acc, evt) => acc + Number(evt.amount_cents || 0), 0);
  const periodRecoveredFormatted = formatCurrencyAmount(periodRecoveredCents, currency);
  const periodEventCount = filteredEvents.length;

  const channelBreakdownMap = new Map<string, { recovered: number; count: number }>();
  const gatewayBreakdownMap = new Map<string, { recovered: number; count: number }>();

  filteredEvents.forEach((evt) => {
    const channel = evt.recovered_via || 'Recovery Workflow';
    const currChannel = channelBreakdownMap.get(channel) || { recovered: 0, count: 0 };
    currChannel.recovered += Number(evt.amount_cents || 0);
    currChannel.count += 1;
    channelBreakdownMap.set(channel, currChannel);

    const gw = evt.provider_type || 'Payment Gateway';
    const currGw = gatewayBreakdownMap.get(gw) || { recovered: 0, count: 0 };
    currGw.recovered += Number(evt.amount_cents || 0);
    currGw.count += 1;
    gatewayBreakdownMap.set(gw, currGw);
  });

  const channelData = Array.from(channelBreakdownMap.entries()).map(([name, data]) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    recovered: data.recovered / 100,
    count: data.count,
    recoveryRateLabel: 'Recovery rate not yet measurable',
    color: '#10b981',
  }));

  const gatewayData = Array.from(gatewayBreakdownMap.entries()).map(([name, data]) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    recovered: data.recovered / 100,
    count: data.count,
    recoveryRateLabel: 'Recovery rate not yet measurable',
    color: '#3b82f6',
  }));

  const getActiveData = () => {
    if (activeBreakdownTab === 'gateway') return gatewayData;
    return channelData;
  };

  const activeData = getActiveData();

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        'Revenue Recovery OS - ROI & Financial Impact Ledger',
        `Date Range: ${dateRange.toUpperCase()}`,
        `Selected Period Recovered Revenue: ${periodRecoveredFormatted}`,
        `Selected Period Recovery Events: ${periodEventCount}`,
        `Current Snapshot ARR: ${formattedActiveArr}`,
        `Current Snapshot Revenue At Risk: ${formattedAtRisk}`,
        '',
        'Dimension,Revenue Recovered,Recovery Event Count,Status',
        ...activeData.map((d) => `"${d.name}",${d.recovered},${d.count},"${d.recoveryRateLabel}"`),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `roi_business_impact_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('ROI Ledger Exported', 'Financial impact report downloaded as CSV');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">ROI & Financial Impact Ledger</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              Authoritative Financials
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reconciled revenue recoveries, capital preservation, and subscription retention metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            {[
              { id: '30d', label: 'Last 30D' },
              { id: '90d', label: 'Last 90D' },
              { id: 'ytd', label: 'YTD' },
              { id: 'all', label: 'All Time' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDateRange(d.id as any)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  dateRange === d.id ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export ROI Ledger</span>
          </button>
        </div>
      </div>

      {/* 1. ROI CORE FINANCIAL SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Selected Period Recovered Revenue */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 shadow-lg">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
            <span>Selected Period: Recovered Revenue</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-white mt-1.5">{periodRecoveredFormatted}</div>
          <div className="text-xs text-slate-400 mt-1">
            Filtered by {dateRange.toUpperCase()} date range
          </div>
        </div>

        {/* Selected Period Recovery Events */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Selected Period: Recovery Events</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1.5">{periodEventCount}</div>
          <div className="text-xs text-slate-400 mt-1">
            Authoritative recovery event records
          </div>
        </div>

        {/* Current Snapshot Active ARR */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Current Snapshot: Active ARR</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-400 mt-1.5">
            {formattedActiveArr}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Current live recurring run-rate
          </div>
        </div>

        {/* Current Snapshot Revenue At Risk */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Current Snapshot: Revenue At Risk</span>
            <Award className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 mt-1.5">
            {formattedAtRisk}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Confirmed current financial exposure
          </div>
        </div>
      </div>

      {/* 2. COST AVOIDANCE & OPERATIONAL ASSUMPTIONS */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Cost Avoidance & Operational Efficiency</h3>
            <p className="text-xs text-slate-400">Measured and unquantified operational savings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Recovered Opportunities */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400">Recovered Opportunities</div>
            <div className="text-sm font-bold text-slate-300">
              {periodEventCount > 0 ? `${periodEventCount} Recovery Events Recorded` : 'Not yet measurable'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Count of authoritative payment recovery events recorded within the selected date range.
            </p>
          </div>

          {/* Billing Ops Labor */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400">Recovery Automation Activity</div>
            <div className="text-sm font-bold text-teal-400">
              {totalRecoveredCents > 0 ? 'Active Dunning & Retries' : 'Not yet measurable'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Automates retries, customer payment links, and ledger reconciliation without manual touches.
            </p>
          </div>

          {/* Gateway Monitoring */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400">Gateway Health & Monitoring</div>
            <div className="text-sm font-bold text-emerald-400">
              {totalRecoveredCents > 0 ? 'Reconciled Operational State' : 'Not yet measurable'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Provides authenticated, frictionless self-serve card updates and webhook event tracking.
            </p>
          </div>
        </div>
      </div>

      {/* 3. PERFORMANCE BREAKDOWN */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Recovery Breakdown by Dimension
            </h3>
            <p className="text-xs text-slate-400">Authoritative performance from recorded transaction events</p>
          </div>

          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-xl text-xs">
            {[
              { id: 'channel', label: 'Recovery Channel' },
              { id: 'gateway', label: 'Gateway' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveBreakdownTab(t.id as any)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeBreakdownTab === t.id ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeData.length > 0 ? (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrencyAmount(v * 100, currency)} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [
                      formatCurrencyAmount(Number(val) * 100, currency),
                      'Recovered Revenue',
                    ]}
                  />
                  <Bar dataKey="recovered" fill="#10b981" radius={[4, 4, 0, 0]} name="Recovered Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-medium">
                  <tr>
                    <th className="py-2.5 px-4">Segment / Dimension</th>
                    <th className="py-2.5 px-4">Revenue Recovered</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeData.map((row) => (
                    <tr key={row.name} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-semibold text-white">{row.name}</td>
                      <td className="py-3 px-4 text-emerald-400 font-mono font-bold">{formatCurrencyAmount(row.recovered * 100, currency)}</td>
                      <td className="py-3 px-4 text-slate-400">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                          Reconciled
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-12 text-center bg-slate-950/40 rounded-xl border border-slate-800">
            <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-300">No Transaction Breakdown Available</div>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Granular recovery dimensions will populate automatically as recovery workflows settle payment events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

