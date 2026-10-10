import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Plus,
  Loader2,
  LogOut,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { Workspace, AuthSession } from '../types/index.js';

interface WorkspaceSelectionViewProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  authSession: AuthSession | null;
  isCreating: boolean;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, type: string, currency: string) => Promise<void>;
  onSignOut: () => void;
  onLoadDemoWorkspace?: () => void;
}

export const WorkspaceSelectionView: React.FC<WorkspaceSelectionViewProps> = ({
  workspaces,
  currentWorkspace,
  authSession,
  isCreating,
  onSelectWorkspace,
  onCreateWorkspace,
  onSignOut,
  onLoadDemoWorkspace,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(workspaces.length === 0);
  const [wsName, setWsName] = useState('');
  const [businessType, setBusinessType] = useState('saas');
  const [currency, setCurrency] = useState('USD');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaces.length === 0) {
      setShowCreateForm(true);
    }
  }, [workspaces.length]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const trimmed = wsName.trim();
    if (!trimmed || trimmed.length < 2) {
      setValidationError('Workspace name must be at least 2 characters long.');
      return;
    }

    try {
      await onCreateWorkspace(trimmed, businessType, currency);
    } catch (err: any) {
      setValidationError(err.message || 'Failed to create workspace.');
    }
  };

  return (
    <main
      id="workspace-selection-container"
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-emerald-500/30 selection:text-emerald-200"
    >
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <header className="text-center mb-8">
          <div
            id="workspace-brand-logo"
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 font-bold mb-4 shadow-lg shadow-emerald-500/20"
          >
            <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Revenue Recovery OS
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {workspaces.length > 0
              ? 'Select an active workspace to access your recovery pipelines'
              : 'Create your first workspace to start recovering failed payments'}
          </p>
        </header>

        {/* Card */}
        <div
          id="workspace-card"
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm"
        >
          {/* User badge + signout button */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-800 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-semibold text-xs">
                {authSession?.user?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white">
                  {authSession?.user?.full_name || 'Active User'}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {authSession?.user?.email}
                </div>
              </div>
            </div>
            <button
              onClick={onSignOut}
              id="btn-workspace-signout"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-900/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* If workspaces exist and create form is hidden: Show Workspace Selector */}
          {!showCreateForm && workspaces.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Your Authorized Workspaces ({workspaces.length})
                </h2>
                <button
                  onClick={() => {
                    setShowCreateForm(true);
                    setValidationError(null);
                  }}
                  id="btn-show-create-workspace"
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Workspace</span>
                </button>
              </div>

              <div id="workspace-list" className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {workspaces.map((ws) => {
                  const isSelected = currentWorkspace?.id === ws.id;
                  return (
                    <button
                      key={ws.id}
                      id={`btn-select-workspace-${ws.id}`}
                      onClick={() => onSelectWorkspace(ws.id)}
                      className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            isSelected
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            <span>{ws.name}</span>
                            {ws.is_demo && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase font-bold">
                                Demo
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 capitalize mt-0.5">
                            {ws.business_type} • {ws.currency}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        {isSelected ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Create Workspace Form */
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Create Workspace</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure your business profile &amp; billing currency
                  </p>
                </div>
                {workspaces.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setValidationError(null);
                    }}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {validationError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
                  {validationError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Business / Workspace Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    minLength={2}
                    placeholder="e.g. Acme Cloud Corp"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Business Model
                  </label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="saas">SaaS / Subscription</option>
                    <option value="restaurant">Restaurant / Hospitality</option>
                    <option value="gym">Gym / Fitness Center</option>
                    <option value="dentist">Dental / Medical Practice</option>
                    <option value="hotel">Hotel / Lodging</option>
                    <option value="ecommerce">E-Commerce / Retail</option>
                    <option value="service">Professional Services / Agency</option>
                    <option value="marketplace">Marketplace</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Operating Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="INR">INR (₹)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                id="btn-submit-create-workspace"
                disabled={isCreating}
                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg shadow-emerald-500/10 mt-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Provisioning Workspace...</span>
                  </>
                ) : (
                  <>
                    <span>Create &amp; Enter Workspace</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {onLoadDemoWorkspace && (
                <div className="pt-3 border-t border-slate-800 text-center">
                  <button
                    type="button"
                    onClick={onLoadDemoWorkspace}
                    className="text-xs font-mono text-amber-400 hover:text-amber-300 hover:underline transition-colors cursor-pointer"
                  >
                    ⚡ Or load live demo workspace (1,000 accounts &amp; 2,000 failures)
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
};
