import React, { useState } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Award,
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  Download,
  Printer,
  Sparkles,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Zap,
  Building,
  Target,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { RecoveryMetrics, RevenueEvent } from '../types/index.js';
import { formatCurrencyAmount } from '../utils/currency.js';

interface ExecutiveSummaryViewProps {
  metrics: RecoveryMetrics | null;
  revenueEvents: RevenueEvent[];
  currency: string;
  onNavigateTab?: (tab: any) => void;
  onShowToast: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const ExecutiveSummaryView: React.FC<ExecutiveSummaryViewProps> = ({
  metrics,
  revenueEvents,
  currency,
  onNavigateTab,
  onShowToast,
}) => {
  const [period, setPeriod] = useState<'cq' | 'lq' | 'ytd' | 'ttm'>('cq');

  // Baseline calculations from metrics
  const totalAtRiskCents = metrics?.revenue_at_risk_cents ?? 0;
  const recoveredCents = metrics?.revenue_recovered_cents ?? 0;
  const recoveryRate = metrics?.recovery_rate_percentage ?? null;
  const activeArrCents = metrics?.arr_cents ?? 0;
  const lostCents = Math.max(0, totalAtRiskCents - recoveredCents);
  const roiMultiple = metrics?.roi_multiple ?? 0;
  const activeOpportunitiesCount = metrics?.active_opportunities_count ?? 0;

  const formattedAtRisk = formatCurrencyAmount(totalAtRiskCents, currency);
  const formattedRecovered = formatCurrencyAmount(recoveredCents, currency);
  const formattedActiveArr = formatCurrencyAmount(activeArrCents, currency);
  const formattedLost = formatCurrencyAmount(lostCents, currency);

  // Dynamic period-specific aggregation from actual revenue events matching workspace primary currency
  const now = Date.now();
  const currentDate = new Date(now);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const currentQuarterIndex = Math.floor(currentMonth / 3);
  const currentQuarterStartMonth = currentQuarterIndex * 3;
  const currentQuarterStartTime = new Date(currentYear, currentQuarterStartMonth, 1).getTime();

  const priorQuarterIndex = currentQuarterIndex === 0 ? 3 : currentQuarterIndex - 1;
  const priorQuarterYear = currentQuarterIndex === 0 ? currentYear - 1 : currentYear;
  const priorQuarterStartMonth = priorQuarterIndex * 3;
  const priorQuarterStartTime = new Date(priorQuarterYear, priorQuarterStartMonth, 1).getTime();
  const priorQuarterEndTime = new Date(priorQuarterYear, priorQuarterStartMonth + 3, 1).getTime();

  const ytdStartTime = new Date(currentYear, 0, 1).getTime();
  const ttmStartTime = now - 365 * 86400000;

  const periodStartTime =
    period === 'cq'
      ? currentQuarterStartTime
      : period === 'lq'
      ? priorQuarterStartTime
      : period === 'ytd'
      ? ytdStartTime
      : ttmStartTime;

  const periodEndTime = period === 'lq' ? priorQuarterEndTime : now;

  const primaryRevenueEvents = revenueEvents.filter(
    (evt) =>
      evt.event_type === 'revenue_recovered' &&
      (evt.currency || currency).toUpperCase() === (currency || 'USD').toUpperCase()
  );

  const periodEvents = primaryRevenueEvents.filter((evt) => {
    const t = new Date(evt.recorded_at).getTime();
    if (isNaN(t)) return false;
    return t >= periodStartTime && t < periodEndTime;
  });

  const periodRecoveredCents = periodEvents.reduce((acc, evt) => acc + Number(evt.amount_cents || 0), 0);
  const periodRecoveredFormatted = formatCurrencyAmount(periodRecoveredCents, currency);
  const periodEventCount = periodEvents.length;

  const monthlyMap = new Map<string, { month: string; recoveredCents: number; count: number }>();
  periodEvents.forEach((evt) => {
    const d = new Date(evt.recorded_at);
    if (!isNaN(d.getTime())) {
      const key = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      const current = monthlyMap.get(key) || { month: key, recoveredCents: 0, count: 0 };
      current.recoveredCents += Number(evt.amount_cents || 0);
      current.count += 1;
      monthlyMap.set(key, current);
    }
  });

  const trendData = Array.from(monthlyMap.values());

  const handlePrint = () => {
    try {
      const isFramed = typeof window !== 'undefined' && window.self !== window.top;
      if (isFramed) {
        onShowToast(
          'Preparing Executive Report',
          'If browser print is restricted by the iframe sandbox, please open in a new tab or use the "Export Executive CSV" button.',
          'info'
        );
      }
      window.print();
    } catch (err: any) {
      onShowToast(
        'Print Restricted by Sandbox',
        'Please export the executive report as CSV or open this app in a separate browser tab to print PDF.',
        'info'
      );
    }
  };

  const handleExportSummary = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        'Revenue Recovery OS - Executive Summary Report',
        `Reporting Period: ${period.toUpperCase()}`,
        `Revenue At Risk: ${formattedAtRisk}`,
        `Recovered Revenue: ${formattedRecovered}`,
        `Recovery Rate: ${recoveryRate !== null ? `${recoveryRate}%` : 'Not yet measurable'}`,
        `Active Subscription ARR: ${formattedActiveArr}`,
        `ROI Multiple: ${roiMultiple > 0 ? `${roiMultiple}x` : 'Not configured'}`,
        `Recovered Opportunities Count: ${periodEventCount}`,
        `Active At-Risk Opportunities: ${activeOpportunitiesCount}`,
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `executive_recovery_summary_${period}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Report Exported', 'Executive summary CSV downloaded for board presentation');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Bar / Boardroom Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Executive Summary & Boardroom Review</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
              Workspace Overview
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Macro revenue retention performance, involuntary churn mitigation, and multi-year ARR preservation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            {[
              { id: 'cq', label: 'Current Qtr' },
              { id: 'lq', label: 'Prior Qtr' },
              { id: 'ytd', label: 'YTD' },
              { id: 'ttm', label: 'Trailing 12M' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  period === p.id ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
            title="Print / PDF View"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print</span>
          </button>

          <button
            onClick={handleExportSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-950" />
            <span>Download Board Pack</span>
          </button>
        </div>
      </div>

      {/* 1. EXECUTIVE KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Revenue At Risk */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="text-xs text-slate-400 font-medium">Revenue At Risk</div>
          <div className="text-xl font-extrabold text-white mt-1">{formattedAtRisk}</div>
          <div className="text-[11px] text-slate-500 mt-1">Current exposure</div>
        </div>

        {/* Selected Period Recovered */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border border-emerald-500/30 shadow-md">
          <div className="text-xs text-emerald-400 font-medium">Period Recovered</div>
          <div className="text-xl font-extrabold text-emerald-400 mt-1">{periodRecoveredFormatted}</div>
          <div className="text-[11px] text-emerald-300/80 font-semibold mt-1">Filtered by {period.toUpperCase()}</div>
        </div>

        {/* Period Recovery Events */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="text-xs text-slate-400 font-medium">Recovery Events</div>
          <div className="text-xl font-extrabold text-purple-400 mt-1">{periodEventCount}</div>
          <div className="text-[11px] text-purple-400/80 mt-1">Authoritative records</div>
        </div>

        {/* Active Subscription ARR */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="text-xs text-slate-400 font-medium">Active Subscription ARR</div>
          <div className="text-xl font-extrabold text-teal-400 mt-1">{formattedActiveArr}</div>
          <div className="text-[11px] text-teal-400/80 mt-1">Current run-rate</div>
        </div>

        {/* Recovered Opportunities */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="text-xs text-slate-400 font-medium">Recovered Opportunities</div>
          <div className="text-xl font-extrabold text-blue-400 mt-1">{periodEventCount}</div>
          <div className="text-[11px] text-blue-400/80 mt-1">Settled recovery records</div>
        </div>

        {/* ROI Multiple */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="text-xs text-slate-400 font-medium">Platform ROI Multiple</div>
          <div className="text-xl font-extrabold text-amber-400 mt-1">
            {roiMultiple > 0 ? `${roiMultiple}x` : '—'}
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1">
            {roiMultiple > 0 ? 'Net return ratio' : 'Requires billing plan'}
          </div>
        </div>
      </div>

      {/* 2. STRATEGIC INSIGHTS & RECOVERY STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Health Summary */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Billing Pipeline Health</h3>
                <p className="text-xs text-slate-400">Current workspace exposure</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              {totalAtRiskCents === 0 ? 'Optimal' : 'Active Exposure'}
            </span>
          </div>

          <div className="pt-2">
            <div className="text-2xl font-bold text-white">
              {activeOpportunitiesCount} Active {activeOpportunitiesCount === 1 ? 'Opportunity' : 'Opportunities'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {totalAtRiskCents > 0
                ? `${formattedAtRisk} current financial exposure under automated recovery or active dunning.`
                : 'No active payment failures or delinquent invoices detected in this workspace.'}
            </p>
          </div>

          <div className="space-y-2 pt-2 text-xs border-t border-slate-800">
            <div className="flex justify-between text-slate-400">
              <span>Settled Recoveries:</span>
              <span className="font-semibold text-emerald-400">{formattedRecovered}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Overall Recovery Rate:</span>
              <span className="font-semibold text-white">
                {recoveryRate !== null ? `${recoveryRate}%` : 'Not yet measurable'}
              </span>
            </div>
          </div>
        </div>

        {/* Strategic Alerts & Observations */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Recovery Architecture Observations</h3>
              <p className="text-xs text-slate-400">Automated revenue recovery plans</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Automated Smart Retries
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Transient issuer failures and network timeouts are scheduled for dynamic retries before manual dunning escalates.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Tokenized Self-Service
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Direct magic payment links allow customers to update expired or declined cards without entering account passwords.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Idempotent Ledger Settlement
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Inbound payment gateway webhooks are atomically reconciled, preventing double-counting and duplicate exposure.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <div className="font-bold text-purple-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Multi-Currency Segregation
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                All accounts and billing records preserve their native transactional currencies without lossy conversions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. REVENUE IMPACT TREND */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Recorded Recovery History Trend
            </h3>
            <p className="text-xs text-slate-400">Monthly breakdown of settled recovery revenue from transactional events</p>
          </div>
        </div>

        {trendData.length > 0 ? (
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="recoveredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrencyAmount(v, currency)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(val: any) => [formatCurrencyAmount(Number(val), currency), 'Recovered Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="recoveredCents"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#recoveredGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center bg-slate-950/40 rounded-xl border border-slate-800">
            <BarChart3 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-300">Insufficient Historical Trend Data</div>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Monthly recovery trajectory charts will render automatically once transaction events are recorded over multiple billing cycles.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

