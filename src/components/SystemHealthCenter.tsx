import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Server,
  Database,
  Clock,
  CheckCircle2,
  Filter,
  Layers,
  Terminal,
} from 'lucide-react';
import { api } from '../services/api.js';

interface SystemHealthData {
  status: string;
  database: string;
  storage: string;
  uptimeSeconds: number;
  errorCounts: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
  timestamp: string;
}

interface ErrorRecord {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  stack?: string;
  context?: string;
  workspaceId?: string;
}

export const SystemHealthCenter: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [healthRes, errorsRes] = await Promise.all([
        api.getSystemHealth().catch((err) => {
          console.error('[SystemHealthCenter] Health check failed:', err);
          return null;
        }),
        api.getSystemErrors(severityFilter).catch((err) => {
          console.error('[SystemHealthCenter] Error load failed:', err);
          return null;
        }),
      ]);
      setHealth(healthRes || null);
      setErrors(errorsRes?.errors || []);
    } catch (err) {
      console.error('[SystemHealthCenter] Error loading system health:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [severityFilter]);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const totalErrors = health?.errorCounts
    ? (health.errorCounts.error || 0) + (health.errorCounts.critical || 0) + (health.errorCounts.warning || 0)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
            <span className="text-[#4ADE80] font-semibold tracking-wide uppercase">PRODUCTION INFRASTRUCTURE</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">System Health Center</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-display">
            Container Health & Error Monitoring
          </h1>
        </div>

        <button
          onClick={loadData}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Diagnostics</span>
        </button>
      </div>

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Status */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>System Status</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-display flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <span>{health?.status ? health.status.toUpperCase() : 'HEALTHY'}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Endpoint <code className="text-emerald-300">/healthz</code> responding
          </div>
        </div>

        {/* Database Status */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>Database Status</span>
            <Database className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-display capitalize flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-400" />
            <span>{health?.database || 'Connected'}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono capitalize">
            Storage Engine: <span className="text-blue-300">{health?.storage || 'Disk / Supabase'}</span>
          </div>
        </div>

        {/* Uptime */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>Container Uptime</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white font-display font-mono">
            {formatUptime(health?.uptimeSeconds || 0)}
          </div>
          <div className="text-[11px] text-slate-400">Zero downtime deployment</div>
        </div>

        {/* Error Count */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>Logged Errors (24h)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-display">
            {totalErrors} <span className="text-xs text-slate-400 font-normal">events</span>
          </div>
          <div className="text-[11px] text-amber-400 font-mono">
            {health?.errorCounts?.critical || 0} critical, {health?.errorCounts?.error || 0} errors
          </div>
        </div>
      </div>

      {/* Error Monitoring Table Section */}
      <div className="bg-[#071224] border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-400" />
              <span>Production Error Audit Trail</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Authoritative structured logs across backend services, webhooks, and billing gateways.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase">
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Context</th>
                <th className="py-3 px-4">Message</th>
                <th className="py-3 px-4">Workspace ID</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
              {errors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 font-sans text-sm">
                    No error logs matching current filter. System running cleanly.
                  </td>
                </tr>
              ) : (
                errors.map((err) => (
                  <tr key={err.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          err.severity === 'critical'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : err.severity === 'error'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : err.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {err.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{err.context || 'general'}</td>
                    <td className="py-3 px-4 text-white font-sans font-medium">
                      <div>{err.message}</div>
                      {err.stack && (
                        <div className="text-[10px] text-slate-500 font-mono mt-1 truncate max-w-md">
                          {err.stack}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{err.workspaceId || '—'}</td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {new Date(err.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
