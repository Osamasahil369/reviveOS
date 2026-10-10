import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  ChevronDown,
  Plus,
  RefreshCw,
  Zap,
  RotateCcw,
  CheckCircle2,
  Lock,
  User as UserIcon,
  LogOut,
  Code,
  Sparkles,
  Shield,
  FileSpreadsheet,
  Activity,
  Sliders,
  Search,
  ArrowUpRight,
  Mail,
  Layers,
} from 'lucide-react';
import { Workspace, User, UserRole } from '../types/index.js';
import { formatCurrencyAmount, CURRENCY_LIST, getCurrencySymbol } from '../utils/currency.js';
import { useAdvancedMode } from '../lib/AdvancedModeContext.js';

interface HeaderProps {
  activeTab: 'command' | 'home' | 'retention' | 'expansion' | 'timeline' | 'import' | 'ingestion' | 'customers' | 'settings' | 'missions' | 'revenue' | 'email_health' | 'system_health';
  onNavigateTab: (tab: any) => void;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, type: string, currency: string) => void;
  onOpenScanner?: () => void;
  onOpenCsvModal: () => void;
  onOpenSimulatorModal: () => void;
  onResetDemo: () => void;
  recoveredRevenueCents: number;
  currency: string;
  user?: User | null;
  userRole?: UserRole;
  workspaceMode?: 'production' | 'demo' | 'all';
  onModeChange?: (mode: 'production' | 'demo' | 'all') => void;
  onOpenDevTools?: () => void;
  onSignOut?: () => void;
  onLoadDemoWorkspace?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onNavigateTab,
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  onOpenScanner,
  onOpenCsvModal,
  onOpenSimulatorModal,
  onResetDemo,
  recoveredRevenueCents,
  currency,
  user,
  userRole = 'owner',
  workspaceMode = 'all',
  onModeChange,
  onOpenDevTools,
  onSignOut,
  onLoadDemoWorkspace,
}) => {
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNewWsModal, setShowNewWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsType, setNewWsType] = useState('saas');
  const [newWsCurrency, setNewWsCurrency] = useState('INR');
  const [isResetting, setIsResetting] = useState(false);
  
  const { isAdvancedMode, toggleAdvancedMode } = useAdvancedMode();

  const wsMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) {
        setShowWsMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    onCreateWorkspace(newWsName.trim(), newWsType, newWsCurrency);
    setNewWsName('');
    setShowNewWsModal(false);
    setShowWsMenu(false);
  };

  const handleResetClick = async () => {
    setIsResetting(true);
    await onResetDemo();
    setTimeout(() => setIsResetting(false), 600);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#030504]/90 border-b border-white/[0.08] backdrop-blur-xl text-white">
      <div className="max-w-7xl mx-auto px-6 sm:px-10">
        <div className="flex items-center justify-between h-18">
          {/* Zone 1: Wordmark Brand */}
          <div className="flex items-center gap-10">
            <button
              onClick={() => onNavigateTab('home')}
              className="text-lg font-bold tracking-tight text-white font-display hover:text-[#86efac] transition-colors cursor-pointer"
            >
              ReviveOS
            </button>

            {/* Zone 2: Primary Outcome-Focused Navigation */}
            <nav className="hidden md:flex items-center gap-1 text-xs font-mono tracking-wider">
              {/* Home */}
              <button
                onClick={() => onNavigateTab('command')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'command'
                    ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span>Home</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
              </button>

              {/* Customers */}
              <button
                onClick={() => onNavigateTab('customers')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'customers'
                    ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Customers
              </button>

              {/* Recovery */}
              <button
                onClick={() => onNavigateTab('revenue')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'revenue'
                    ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Recovery
              </button>

              {/* Advanced Mode Hidden Tabs */}
              {isAdvancedMode && (
                <>
                  <button
                    onClick={() => onNavigateTab('home')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'home' || activeTab === 'missions'
                        ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    Automatic Recovery
                  </button>

                  <button
                    onClick={() => onNavigateTab('retention')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'retention'
                        ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    Cancellation Risk
                  </button>
                  
                  <button
                    onClick={() => onNavigateTab('import')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'import'
                        ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <span>Import Customers</span>
                  </button>

                  <button
                    onClick={() => onNavigateTab('ingestion')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'ingestion'
                        ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Universal Ingestion</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">30</span>
                  </button>

                  <button
                    onClick={() => onNavigateTab('email_health')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'email_health'
                        ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <span>Email Performance</span>
                  </button>

                  <button
                    onClick={() => onNavigateTab('system_health')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'system_health'
                        ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <span>System Status</span>
                  </button>
                </>
              )}

              {/* Settings */}
              <button
                onClick={() => onNavigateTab('settings')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'text-[#4ADE80] bg-[#4ADE80]/10 font-bold border border-[#4ADE80]/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>

          {/* Zone 3: Primary Scan Action + Workspace Selector + Profile */}
          <div className="flex items-center gap-3">
            {/* Primary Signature Scan Button */}
            {onOpenScanner && (
              <button
                onClick={onOpenScanner}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-xs transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                <span>Run Revenue Scan</span>
              </button>
            )}

            {/* Workspace Selector */}
            <div className="relative" ref={wsMenuRef}>
              <button
                onClick={() => setShowWsMenu(!showWsMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#071224] hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-200 transition-colors cursor-pointer"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                <span className="max-w-[120px] truncate">{currentWorkspace?.name || 'Workspace'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showWsMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#071224] border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in duration-150">
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-mono text-slate-500">
                    Active Workspaces
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 mb-2">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => {
                          onSelectWorkspace(ws.id);
                          setShowWsMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                          ws.id === currentWorkspace?.id
                            ? 'bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/20 font-semibold'
                            : 'text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="truncate">{ws.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {ws.currency}
                          {ws.is_demo ? ' · demo' : ''}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    {onLoadDemoWorkspace && (
                      <button
                        onClick={() => {
                          setShowWsMenu(false);
                          onLoadDemoWorkspace();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 font-bold">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Load Demo Workspace</span>
                        </span>
                        <span className="text-[10px] text-amber-400/80 font-mono">1,000 accs</span>
                      </button>
                    )}

                    <button
                      onClick={() => setShowNewWsModal(true)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#4ADE80] hover:bg-[#4ADE80]/10 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Workspace</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-800 text-slate-300 transition-colors cursor-pointer"
                title={user?.email || 'User Menu'}
              >
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-[#4ADE80]">
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#071224] border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in duration-150">
                  <div className="px-3 py-2 border-b border-slate-800 mb-1">
                    <div className="text-xs font-semibold text-white truncate">
                      {user?.full_name || 'Staff User'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
                    <div className="mt-1 text-[10px] text-[#4ADE80] font-mono uppercase tracking-wider">
                      Role: {userRole}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigateTab('ingestion');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Universal Ingestion (30 Sources)</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenCsvModal();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>Ingest Failed CSV</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenSimulatorModal();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-slate-400" />
                      <span>Webhook Simulator</span>
                    </button>

                    {onOpenDevTools && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenDevTools();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                      >
                        <Code className="w-3.5 h-3.5 text-slate-400" />
                        <span>Database Diagnostics</span>
                      </button>
                    )}

                    <button
                      onClick={handleResetClick}
                      disabled={isResetting}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-slate-400 ${isResetting ? 'animate-spin' : ''}`} />
                      <span>Reset Demo Scenarios</span>
                    </button>

                    <div className="py-1.5 border-t border-white/[0.08] mt-1 space-y-1">
                      <button
                        onClick={() => {
                          toggleAdvancedMode();
                          window.location.reload();
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-colors cursor-pointer"
                        title="Toggle high-fidelity developer diagnostics and full dashboard tabs"
                      >
                        <span className="flex items-center gap-2">
                          <Sliders className="w-3.5 h-3.5 text-amber-400" />
                          <span>Advanced Mode</span>
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20">
                          {isAdvancedMode ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </div>

                    {onSignOut && (
                      <div className="pt-1 mt-1 border-t border-white/[0.08]">
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onSignOut();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Row */}
      <div className="md:hidden border-t border-white/[0.06] bg-[#020403] px-4 py-2 flex items-center justify-around text-xs">
        <button
          onClick={() => onNavigateTab('home')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'home' ? 'text-[#86efac] bg-[#86efac]/10' : 'text-slate-400'
          }`}
        >
          Home
        </button>
        <button
          onClick={() => onNavigateTab('missions')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'missions' ? 'text-[#86efac] bg-[#86efac]/10' : 'text-slate-400'
          }`}
        >
          Missions
        </button>
        <button
          onClick={() => onNavigateTab('revenue')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'revenue' ? 'text-[#86efac] bg-[#86efac]/10' : 'text-slate-400'
          }`}
        >
          Revenue
        </button>
        <button
          onClick={() => onNavigateTab('customers')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'customers' ? 'text-[#86efac] bg-[#86efac]/10' : 'text-slate-400'
          }`}
        >
          Customers
        </button>
        <button
          onClick={() => onNavigateTab('settings')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'settings' ? 'text-[#86efac] bg-[#86efac]/10' : 'text-slate-400'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Modal: Create Workspace */}
      {showNewWsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-[#050706] border border-white/[0.12] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white font-display mb-1">Create New Workspace</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed font-light">
              Create an isolated revenue environment with independent gateway credentials and currencies.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Workspace Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Acme Cloud Operations"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#86efac]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Model</label>
                  <select
                    value={newWsType}
                    onChange={(e) => setNewWsType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-[#86efac]"
                  >
                    <option value="saas">SaaS / Subscription</option>
                    <option value="ecommerce">E-Commerce</option>
                    <option value="coaching">Services / Agency</option>
                    <option value="membership">Membership</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Base Currency</label>
                  <select
                    value={newWsCurrency}
                    onChange={(e) => setNewWsCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-[#86efac]"
                  >
                    {CURRENCY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowNewWsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#86efac] hover:bg-[#a3e635] text-black transition-colors cursor-pointer"
                >
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
