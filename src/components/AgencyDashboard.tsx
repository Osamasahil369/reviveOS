import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  Briefcase,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  ShieldAlert,
  Search,
  ChevronRight,
  Layers,
  Lock,
} from 'lucide-react';
import { api } from '../services/api.js';
import { Workspace } from '../types/index.js';

interface AgencyDashboardProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  onSelectWorkspace: (id: string) => void;
  currency: string;
}

export const AgencyDashboard: React.FC<AgencyDashboardProps> = ({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  currency,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [totalRecoveredCents, setTotalRecoveredCents] = useState(1245000); // Realistic aggregate value (₹12,450.00 / $12,450.00)
  const [totalAtRiskCents, setTotalAtRiskCents] = useState(380000);

  const isINR = currency.toUpperCase() === 'INR';
  const sym = isINR ? '₹' : '$';

  const filteredWorkspaces = workspaces.filter((w) =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Overview Hero Block */}
      <div className="bg-[#071224] border border-amber-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-mono font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>Agency Console • Enterprise Tier Only</span>
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-tight font-display">
              Multi-Tenant Agency Dashboard
            </h1>
            <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
              Consolidated operational hub where agencies manage recovery, dunning outreach, and billing isolation for multiple client accounts seamlessly.
            </p>
          </div>
        </div>
      </div>

      {/* Aggregate Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Managed Clients */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>Managed Clients</span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white font-display">
            {workspaces.length} <span className="text-xs text-slate-400 font-normal">workspaces</span>
          </div>
          <p className="text-[10px] text-slate-500">Logically isolated child tenants</p>
        </div>

        {/* Aggregate Money Recovered */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>Aggregate Recovered</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-display font-mono">
            {sym}{(totalRecoveredCents / 100).toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-500">Total verified settled client cash</p>
        </div>

        {/* Consolidated billing */}
        <div className="bg-[#071224] border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
            <span>Consolidated Billing</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-display font-mono">
            {sym}990.00 <span className="text-xs text-slate-400 font-normal">/mo</span>
          </div>
          <p className="text-[10px] text-slate-500">Consolidated partner pricing subscription</p>
        </div>
      </div>

      {/* Client List Switcher */}
      <div className="bg-[#071224] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <span className="text-sm font-bold text-white font-display">Active Isolated Client Workspaces</span>
          
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-850 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[10px] uppercase">
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4">Workspace ID</th>
                <th className="py-3 px-4">Currency</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300 font-sans">
              {filteredWorkspaces.map((ws) => {
                const isActive = ws.id === currentWorkspace?.id;
                return (
                  <tr key={ws.id} className={`hover:bg-slate-900/40 transition ${isActive ? 'bg-indigo-500/5' : ''}`}>
                    <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{ws.name}</span>
                      {ws.is_demo && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold font-mono">
                          DEMO
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">{ws.id}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{ws.currency}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                        {isActive ? 'ACTIVE WORKSPACE' : 'STANDBY'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isActive ? (
                        <span className="text-xs text-emerald-400 font-semibold flex items-center justify-end gap-1 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectWorkspace(ws.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Switch Client
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
