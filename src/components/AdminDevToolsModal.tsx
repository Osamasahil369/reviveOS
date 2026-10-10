import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Database,
  Lock,
  User,
  Users,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  RefreshCw,
  Eye,
  LogOut,
  Sparkles,
  X,
  Code,
} from 'lucide-react';
import { AuthSession, UserRole, RlsTestResult } from '../types/index.js';
import { supabaseAuth, isUsingPlaceholderCredentials } from '../lib/supabase.js';

interface AdminDevToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspaceId: string;
  isDemoWorkspace?: boolean;
  onSessionUpdated?: (session: AuthSession) => void;
}

export const AdminDevToolsModal: React.FC<AdminDevToolsModalProps> = ({
  isOpen,
  onClose,
  currentWorkspaceId,
  isDemoWorkspace = false,
  onSessionUpdated,
}) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // RLS Test State
  const [testTable, setTestTable] = useState('customers');
  const [testAction, setTestAction] = useState<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>('SELECT');
  const [testTargetWorkspace, setTestTargetWorkspace] = useState(currentWorkspaceId);
  const [rlsResult, setRlsResult] = useState<RlsTestResult | null>(null);
  const [isTestingRls, setIsTestingRls] = useState(false);
  const [statusAlert, setStatusAlert] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSessionAndUsers();
      setTestTargetWorkspace(currentWorkspaceId);
    }
  }, [isOpen, currentWorkspaceId]);

  if (!isOpen) return null;

  const loadSessionAndUsers = async () => {
    setIsLoading(true);
    try {
      const sess = await supabaseAuth.getSession();
      setSession(sess);
      if (onSessionUpdated) onSessionUpdated(sess);

      if (currentWorkspaceId) {
        const usersRes = await fetch(`/api/auth/users?workspaceId=${currentWorkspaceId}`);
        const usersData = await usersRes.json();
        setAllUsers(Array.isArray(usersData) ? usersData : []);
      } else {
        setAllUsers([]);
      }
    } catch (err) {
      console.error('Error fetching auth session', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchUser = async (userId: string) => {
    setStatusAlert(null);
    try {
      const updated = await supabaseAuth.switchUser(userId);
      setSession(updated);
      if (onSessionUpdated) onSessionUpdated(updated);
      setRlsResult(null);
      setStatusAlert({ message: `Switched active context to ${updated.user?.email} (${updated.role})`, isError: false });
    } catch (err: any) {
      setStatusAlert({ message: err.message || 'Failed to switch user', isError: true });
    }
  };

  const handleSwitchRole = async (role: UserRole) => {
    setStatusAlert(null);
    try {
      const updated = await supabaseAuth.switchRole(role);
      setSession(updated);
      if (onSessionUpdated) onSessionUpdated(updated);
      setRlsResult(null);
      setStatusAlert({ message: `Switched operational role to ${role.toUpperCase()}`, isError: false });
    } catch (err: any) {
      setStatusAlert({ message: err.message || 'Failed to switch role', isError: true });
    }
  };

  const handleRunRlsTest = async () => {
    setIsTestingRls(true);
    setRlsResult(null);
    try {
      const res = await supabaseAuth.testRlsPolicy(
        testTable,
        testAction,
        testTargetWorkspace || currentWorkspaceId
      );
      setRlsResult(res);
    } catch (err: any) {
      setRlsResult({
        table: testTable,
        action: testAction,
        role: session?.role || 'owner',
        workspace_id: testTargetWorkspace || currentWorkspaceId,
        allowed: false,
        policy_name: 'Evaluation Failed',
        reason: err.message || 'Network error during simulation',
      });
    } finally {
      setIsTestingRls(false);
    }
  };

  return (
    <div
      id="admin-devtools-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Internal Developer Diagnostics &amp; RLS Simulator
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  DEVELOPER TOOLS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative security verification, PostgreSQL RLS simulation, and multi-tenant isolation testing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close Developer Tools"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status Alert Banner */}
          {statusAlert && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between gap-3 border ${
                statusAlert.isError
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusAlert.isError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{statusAlert.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusAlert(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* User & Role Simulation Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                Active Session Context
              </h3>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="text-slate-200">{session?.user?.email || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">User ID:</span>
                  <span className="text-slate-400 truncate max-w-[180px]">{session?.user?.id || 'Unauthenticated'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Active Role:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] uppercase font-bold">
                    {session?.role || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Workspace:</span>
                  <span className="text-slate-400 truncate max-w-[180px]">{currentWorkspaceId || 'None'}</span>
                </div>
              </div>

              {/* Quick Role Switcher for Local/Simulated testing */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Simulate Role in Current Workspace
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['owner', 'admin', 'member', 'viewer'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleSwitchRole(r)}
                      className={`py-1.5 px-2 rounded-lg text-center text-xs font-semibold capitalize border transition-colors cursor-pointer ${
                        session?.role === r
                          ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Test RLS Execution Engine */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Live RLS Policy Evaluation Simulator
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Target Table</label>
                  <select
                    value={testTable}
                    onChange={(e) => setTestTable(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="customers">customers</option>
                    <option value="recovery_opportunities">recovery_opportunities</option>
                    <option value="invoices">invoices</option>
                    <option value="subscriptions">subscriptions</option>
                    <option value="audit_logs">audit_logs</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">SQL Action</label>
                  <select
                    value={testAction}
                    onChange={(e) => setTestAction(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="SELECT">SELECT (Read)</option>
                    <option value="INSERT">INSERT (Write)</option>
                    <option value="UPDATE">UPDATE (Modify)</option>
                    <option value="DELETE">DELETE (Remove)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Target Workspace ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testTargetWorkspace}
                    onChange={(e) => setTestTargetWorkspace(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => setTestTargetWorkspace('ws_adversarial_target')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    Cross-Tenant
                  </button>
                </div>
              </div>

              <button
                onClick={handleRunRlsTest}
                disabled={isTestingRls}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isTestingRls ? 'Evaluating Policy...' : 'Evaluate Policy in PostgreSQL'}</span>
              </button>
            </div>
          </div>

          {/* RLS Output Card */}
          {rlsResult && (
            <div
              className={`p-4 rounded-xl border text-xs ${
                rlsResult.allowed
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                  {rlsResult.allowed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  {rlsResult.allowed ? 'Access Granted' : 'Access Denied (RLS Blocked)'}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {rlsResult.action} ON {rlsResult.table}
                </span>
              </div>
              <p className="text-slate-300 font-sans">{rlsResult.reason}</p>
              <div className="mt-2 text-[10px] text-slate-400 font-mono">
                Policy Evaluated: {rlsResult.policy_name}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
