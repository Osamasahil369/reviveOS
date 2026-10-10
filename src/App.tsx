import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  AlertCircle,
  Layers,
  CreditCard,
  BarChart3,
  Users,
  ShieldCheck,
  Settings as SettingsIcon,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Lock,
  Shield,
  Sparkles,
  History,
  TrendingUp,
  Award,
  Activity,
  Briefcase,
  Info,
  Plus,
  Copy,
  X,
  Clock,
} from 'lucide-react';
import { api, setGlobalWorkspaceId, registerUnauthorizedHandler, setActiveAuthToken } from './services/api.js';
import {
  Workspace,
  RecoveryMetrics,
  FunnelStage,
  FailureCategoryBreakdown,
  RecoveryOpportunity,
  Customer,
  RecoveryCampaign,
  ProviderConnection,
  ProviderType,
  AuditLog,
  WebhookEventRecord,
  RevenueEvent,
  EmailMessage,
  AuthSession,
} from './types/index.js';
import { supabaseAuth, supabase } from './lib/supabase.js';
import { Header } from './components/Header.js';
import { RevenueCommandCenter } from './components/RevenueCommandCenter.js';
import { ChurnPreventionCenter } from './components/ChurnPreventionCenter.js';
import { ExpansionPlaybookCenter } from './components/ExpansionPlaybookCenter.js';
import { RevenueAutomationTimeline } from './components/RevenueAutomationTimeline.js';
import { AutopilotRecoveryCenter } from './components/AutopilotRecoveryCenter.js';
import { RevenuePage } from './components/RevenuePage.js';
import { CustomersPage } from './components/CustomersPage.js';
import { SettingsPage } from './components/SettingsPage.js';
import { RevenueMissionDashboard } from './components/RevenueMissionDashboard.js';
import { OpportunityDetailsView } from './components/OpportunityDetailsView.js';
import { CustomerPaymentPortal } from './components/CustomerPaymentPortal.js';
import { CustomerDrawer } from './components/CustomerDrawer.js';
import { SendEmailModal } from './components/SendEmailModal.js';
import { CsvImportModal } from './components/CsvImportModal.js';
import { CustomerImportWizard } from './components/CustomerImportWizard.js';
import { UniversalDataIngestionCenter } from './components/UniversalDataIngestionCenter.js';
import { EmailHealthCenter } from './components/EmailHealthCenter.js';
import { SystemHealthCenter } from './components/SystemHealthCenter.js';
import { WebhookSimulatorModal } from './components/WebhookSimulatorModal.js';
import { AuthPage } from './components/AuthPage.js';
import { LandingPage } from './components/LandingPage.js';
import { WorkspaceSelectionView } from './components/WorkspaceSelectionView.js';
import { AdminDevToolsModal } from './components/AdminDevToolsModal.js';

export function App() {
  // Check if hosted pay portal route is requested in browser URL
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const isPayRoute = path.startsWith('/pay/');
  const payTokenFromUrl = isPayRoute ? path.split('/pay/')[1] : null;

  // Explicit Authentication & Bootstrap State Machine
  const [authStatus, setAuthStatus] = useState<'loading' | 'unauthenticated' | 'authenticated' | 'no_workspace' | 'error'>('loading');

  // Production / authoritative initial state (empty until authenticated or explicit demo sandbox)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [activeTab, setActiveTab] = useState<'command' | 'home' | 'retention' | 'expansion' | 'timeline' | 'import' | 'ingestion' | 'customers' | 'settings' | 'missions' | 'revenue' | 'opportunity_detail' | 'portal_preview' | 'email_health' | 'system_health'>('command');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [timelineCustomerId, setTimelineCustomerId] = useState<string | undefined>(undefined);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);

  // Operational state starts empty in production
  const [metrics, setMetrics] = useState<RecoveryMetrics | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [breakdown, setBreakdown] = useState<FailureCategoryBreakdown[]>([]);
  const [revenueEvents, setRevenueEvents] = useState<RevenueEvent[]>([]);
  const [opportunities, setOpportunities] = useState<RecoveryOpportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [campaigns, setCampaigns] = useState<RecoveryCampaign[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [supportedProviders, setSupportedProviders] = useState<ProviderType[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEventRecord[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);

  // Modals and Drawers
  const [selectedOpportunity, setSelectedOpportunity] = useState<(RecoveryOpportunity & { events?: any[] }) | null>(null);
  const [emailModalOpp, setEmailModalOpp] = useState<RecoveryOpportunity | null>(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showSimulatorModal, setShowSimulatorModal] = useState(false);
  const [showDevToolsModal, setShowDevToolsModal] = useState(false);
  const [paymentLinkDialog, setPaymentLinkDialog] = useState<{
    url: string;
    providerCheckoutId?: string;
    opportunityId: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type?: 'success' | 'info' | 'error' } | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'production' | 'demo' | 'all'>('all');

  // Startup Authentication & Bootstrap State Machine
  useEffect(() => {
    if (isPayRoute) return;

    let isMounted = true;

    // Register 401 callback from api client
    registerUnauthorizedHandler(() => {
      if (isMounted) {
        setAuthSession(null);
        setCurrentWorkspace(null);
        setWorkspaces([]);
        setGlobalWorkspaceId(null);
        setAuthStatus('unauthenticated');
      }
    });

    const initAuth = async () => {
      try {
        // 1. Wait for Supabase auth resolution
        const sess = await supabaseAuth.getSession();
        if (!isMounted) return;

        if (sess && sess.is_authenticated) {
          setAuthSession(sess);
          const list = await api.getWorkspaces({ mode: workspaceMode });
          if (!isMounted) return;

          if (Array.isArray(list) && list.length > 0) {
            setWorkspaces(list);
            const savedWsId = typeof localStorage !== 'undefined' ? localStorage.getItem('recovery_os_workspace_id') : null;
            const targetWs = list.find((w) => w.id === savedWsId) || list[0];
            setCurrentWorkspace(targetWs);
            setGlobalWorkspaceId(targetWs.id);
            setAuthStatus('authenticated');
          } else {
            setWorkspaces([]);
            setCurrentWorkspace(null);
            setGlobalWorkspaceId(null);
            setAuthStatus('no_workspace');
          }
        } else {
          setAuthSession(null);
          setCurrentWorkspace(null);
          setWorkspaces([]);
          setAuthStatus('unauthenticated');
        }
      } catch (err: any) {
        console.warn('Auth startup error:', err?.message || err);
        if (isMounted) {
          setAuthSession(null);
          setAuthStatus('unauthenticated');
        }
      }
    };

    initAuth();

    // Listen to Supabase auth events (TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setAuthSession(null);
        setCurrentWorkspace(null);
        setWorkspaces([]);
        setGlobalWorkspaceId(null);
        setAuthStatus('unauthenticated');
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        const sess = await supabaseAuth.getSession();
        if (!isMounted) return;
        if (sess && sess.is_authenticated) {
          setAuthSession(sess);
          loadWorkspaces(workspaceMode);
        }
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      registerUnauthorizedHandler(null);
    };
  }, []);

  const handleAuthSuccess = (sess: AuthSession) => {
    if (sess?.token) {
      setActiveAuthToken(sess.token);
    }
    setAuthSession(sess);
    setAuthStatus('authenticated');
    loadWorkspaces(workspaceMode, sess?.token);
    showToast('Signed In', `Welcome back, ${sess.user?.full_name || sess.user?.email || 'User'}!`);
  };

  const handleSignOut = async () => {
    await supabaseAuth.signOut();
    setActiveAuthToken(null);
    setGlobalWorkspaceId(null);
    setAuthSession(null);
    setCurrentWorkspace(null);
    setWorkspaces([]);
    setAuthStatus('unauthenticated');
    showToast('Signed Out', 'You have been signed out successfully.', 'info');
  };

  useEffect(() => {
    if (currentWorkspace) {
      loadWorkspaceData();
    }
  }, [currentWorkspace?.id]);

  const showToast = (title: string, desc: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ title, desc, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const loadWorkspaces = async (mode: 'production' | 'demo' | 'all' = workspaceMode, explicitToken?: string) => {
    try {
      const headers = explicitToken ? { Authorization: `Bearer ${explicitToken}` } : undefined;
      const list = await api.getWorkspaces({ mode, headers });
      if (Array.isArray(list)) {
        const unique = Array.from(new Map(list.map((w: Workspace) => [w.id, w])).values());
        setWorkspaces(unique);
        if (unique.length > 0) {
          const exists = unique.some((w) => w.id === currentWorkspace?.id);
          if (!exists) {
            setCurrentWorkspace(unique[0]);
            setGlobalWorkspaceId(unique[0].id);
          }
          setAuthStatus('authenticated');
        } else {
          setCurrentWorkspace(null);
          setAuthStatus('no_workspace');
        }
      }
    } catch (err: any) {
      console.warn('Unable to load workspaces:', err?.message || err);
      const isAuthError =
        err?.message?.includes('401') ||
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('Authoritative production mode requires valid Supabase JWT') ||
        err?.message?.includes('Authentication required');

      if (isAuthError) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('recovery_os_token');
          localStorage.removeItem('recovery_os_workspace_id');
        }
        setAuthSession(null);
        setCurrentWorkspace(null);
        setWorkspaces([]);
        setAuthStatus('unauthenticated');
      } else {
        showToast('Error', err?.message || 'Failed to load workspaces', 'error');
      }
    }
  };

  const handleModeChange = (mode: 'production' | 'demo' | 'all') => {
    setWorkspaceMode(mode);
    loadWorkspaces(mode);
  };

  const handleUpdateWorkspace = async (updates: Partial<Workspace>) => {
    if (!currentWorkspace) return;
    const updated = await api.updateWorkspace(currentWorkspace.id, updates);
    setCurrentWorkspace(updated);
    setWorkspaces((prev) => Array.from(new Map(prev.map((w: Workspace) => [w.id, w])).values()).map((w: Workspace) => (w.id === updated.id ? updated : w)));
    showToast('Settings Saved', 'Workspace details & currency updated successfully.');
  };

  const loadWorkspaceData = async () => {
    if (!currentWorkspace) return;
    try {
      const results = await Promise.allSettled([
        api.getMetrics(),
        api.getFunnel(),
        api.getFailureBreakdown(),
        api.getRevenueEvents(),
        api.getOpportunities(),
        api.getCustomers(),
        api.getCampaigns(),
        api.getProviders(),
        api.getAuditLogs(),
        api.getWebhookLogs(),
        api.getEmailLogs(),
      ]);

      for (const res of results) {
        if (res.status === 'rejected') {
          const errMsg = res.reason?.message || '';
          if (
            errMsg.includes('401') ||
            errMsg.includes('Authentication required') ||
            errMsg.includes('Unauthorized') ||
            errMsg.includes('Authoritative production mode requires valid Supabase JWT')
          ) {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('recovery_os_token');
              localStorage.removeItem('recovery_os_workspace_id');
            }
            setAuthSession(null);
            setCurrentWorkspace(null);
            setWorkspaces([]);
            setAuthStatus('unauthenticated');
            return;
          }
        }
      }

      if (results[0].status === 'fulfilled') setMetrics(results[0].value);
      if (results[1].status === 'fulfilled') setFunnel(results[1].value);
      if (results[2].status === 'fulfilled') setBreakdown(results[2].value);
      if (results[3].status === 'fulfilled') setRevenueEvents(results[3].value);
      if (results[4].status === 'fulfilled') setOpportunities(results[4].value);
      if (results[5].status === 'fulfilled') setCustomers(results[5].value);
      if (results[6].status === 'fulfilled') setCampaigns(results[6].value);
      if (results[7].status === 'fulfilled') {
        const provs = results[7].value;
        setConnections(provs.connections || []);
        setSupportedProviders(provs.supported || []);
      }
      if (results[8].status === 'fulfilled') setAuditLogs(results[8].value);
      if (results[9].status === 'fulfilled') setWebhooks(results[9].value);
      if (results[10].status === 'fulfilled') setEmails(results[10].value);
    } catch (err: any) {
      console.warn('Failed to fetch workspace data:', err?.message || err);
      const isAuthError =
        err?.message?.includes('401') ||
        err?.message?.includes('Authentication required') ||
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('Authoritative production mode requires valid Supabase JWT');
      if (isAuthError) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('recovery_os_token');
          localStorage.removeItem('recovery_os_workspace_id');
        }
        setAuthSession(null);
        setCurrentWorkspace(null);
        setWorkspaces([]);
        setAuthStatus('unauthenticated');
      }
    }
  };

  const handleSelectWorkspace = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (ws) {
      setCurrentWorkspace(ws);
      setGlobalWorkspaceId(ws.id);
      setAuthStatus('authenticated');
    }
  };

  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const handleCreateWorkspace = async (name: string, type: string, currency: string) => {
    if (isCreatingWorkspace) return;
    setIsCreatingWorkspace(true);
    try {
      const isDemo = workspaceMode === 'demo';
      const newWs = await api.createWorkspace(name, type, currency, isDemo);
      setWorkspaces((prev) => Array.from(new Map([...prev, newWs].map((w) => [w.id, w])).values()));
      setCurrentWorkspace(newWs);
      setGlobalWorkspaceId(newWs.id);
      setAuthStatus('authenticated');
      showToast('Workspace Created', `Switched to new workspace: ${newWs.name} (${newWs.currency})`);
    } catch (err: any) {
      showToast('Workspace Creation Failed', err.message || 'Failed to create workspace', 'error');
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  // Opportunity Actions
  const handleSelectOpportunity = async (id: string) => {
    try {
      const opp = await api.getOpportunity(id);
      setSelectedOpportunity(opp);
    } catch (err: any) {
      console.error('Failed to fetch opportunity detail', err);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      const res = await api.retryPayment(id);
      if (res.paymentLinkUrl) {
        setPaymentLinkDialog({
          url: res.paymentLinkUrl,
          providerCheckoutId: res.providerCheckoutId,
          opportunityId: id,
        });
        showToast('Razorpay Payment Link Created', 'Recovery payment link created. Customer payment is pending.', 'info');
      } else if (res.isRecovered) {
        showToast('Payment Recovered', res.message || 'Payment successfully recovered!', 'success');
      } else if (res.success) {
        showToast('Smart Retry Executed', res.message || 'Retry attempt recorded with payment provider.', 'info');
      } else {
        showToast('Smart Retry Notice', res.failureMessage || res.message || 'Retry declined by payment gateway.', 'error');
      }
      await loadWorkspaceData();
      if (selectedOpportunity?.id === id) {
        const opp = await api.getOpportunity(id);
        setSelectedOpportunity(opp);
      }
    } catch (err: any) {
      showToast('Smart Retry Failed', err.message || 'Retry attempt failed', 'error');
    }
  };

  const handleSettle = async (id: string) => {
    try {
      const res = await api.settlePayment(id, 'manual_staff_intervention');
      showToast('Payment Settled', 'Opportunity marked as recovered and captured!');
      await loadWorkspaceData();
      if (selectedOpportunity?.id === id) {
        const opp = await api.getOpportunity(id);
        setSelectedOpportunity(opp);
      }
    } catch (err: any) {
      showToast('Settlement Failed', err.message || 'Failed to settle', 'error');
    }
  };

  const handleSendRecoveryEmail = async (oppId: string, subject: string, body: string) => {
    try {
      const res = await api.sendRecoveryEmail(oppId, subject, body);
      showToast('Email Delivered', res.message || 'Recovery email delivered to customer inbox.');
      await loadWorkspaceData();
      if (selectedOpportunity?.id === oppId) {
        const opp = await api.getOpportunity(oppId);
        setSelectedOpportunity(opp);
      }
    } catch (err: any) {
      showToast('Email Delivery Failed', err.message || 'Email delivery failed', 'error');
    }
  };

  // Campaign Actions
  const handleToggleCampaign = async (id: string) => {
    try {
      const updated = await api.toggleCampaign(id);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? updated : c)));
      showToast('Campaign Updated', `${updated.name} is now ${updated.is_active ? 'Active' : 'Paused'}`);
    } catch (err: any) {
      showToast('Campaign Update Failed', err.message || 'Failed to toggle campaign', 'error');
    }
  };

  const handleCreateCampaign = async (camp: Partial<RecoveryCampaign>) => {
    try {
      const created = await api.createCampaign(camp);
      setCampaigns((prev) => [created, ...prev]);
      showToast('Workflow Created', `Dunning workflow ${created.name} initialized.`);
    } catch (err: any) {
      showToast('Workflow Creation Failed', err.message || 'Failed to create campaign', 'error');
    }
  };

  // Provider Actions
  const handleConnectProvider = async (type: ProviderType, config: any) => {
    try {
      const conn = await api.connectProvider(type, config);
      setConnections((prev) => {
        const filtered = prev.filter((c) => c.provider_type !== type);
        return [...filtered, conn];
      });

      showToast('Connection Successful', `Connected ${type.toUpperCase()}. Analyzing lost revenue...`, 'info');
      await api.runRevenueScanner();
      await loadWorkspaceData();
      showToast('Analysis Complete', `Audited ${type.toUpperCase()} for lost revenue.`);
    } catch (err: any) {
      showToast('Gateway Connection Failed', err.message || 'Failed to connect gateway', 'error');
    }
  };

  const handleDisconnectProvider = async (type: ProviderType) => {
    try {
      await api.disconnectProvider(type);
      setConnections((prev) =>
        prev.map((c) => (c.provider_type === type ? { ...c, is_connected: false } : c))
      );
      showToast('Gateway Disconnected', `${type.toUpperCase()} integration disabled.`);
    } catch (err: any) {
      showToast('Gateway Disconnection Failed', err.message || 'Failed to disconnect', 'error');
    }
  };

  const handleSyncProvider = async (type: ProviderType) => {
    try {
      const res = await api.syncProvider(type);
      if (res.partial) {
        showToast('Sync Completed with Warnings', res.message || `${type.toUpperCase()} sync completed with warnings.`, 'info');
      } else {
        showToast('Data Synced', res.message || `${type.toUpperCase()} sync completed.`);
      }
      await loadWorkspaceData();
    } catch (err: any) {
      showToast('Gateway Sync Failed', err.message || 'Sync failed', 'error');
    }
  };

  // Ingestion & Webhooks
  const handleImportCsv = async (rows: any[], defaultCountry?: string, mappings?: any) => {
    try {
      const res = await api.importCsv(rows, defaultCountry, mappings);
      showToast(
        'CSV Ingested',
        `Imported ${res.importedCount} valid records. (${res.failedCount || 0} failed, ${res.duplicateCount || 0} duplicates skipped)`
      );
      await loadWorkspaceData();
      return res;
    } catch (err: any) {
      showToast('CSV Import Failed', err.message || 'CSV Import failed', 'error');
      throw err;
    }
  };

  const handleSimulateWebhook = async (payload: {
    provider: string;
    eventType: string;
    amount?: number;
    email?: string;
  }) => {
    try {
      const res = await api.simulateWebhook(payload);
      showToast('Webhook Received & Verified', res.message);
      await loadWorkspaceData();
    } catch (err: any) {
      showToast('Webhook Simulation Failed', err.message || 'Webhook simulation failed', 'error');
    }
  };

  const handleLoadDemoWorkspace = async () => {
    try {
      const res = await api.loadDemoWorkspace();
      if (res.workspace) {
        setWorkspaces((prev) => {
          const exists = prev.some((w) => w.id === res.workspace.id);
          if (exists) return prev.map((w) => (w.id === res.workspace.id ? res.workspace : w));
          return [res.workspace, ...prev];
        });
        setCurrentWorkspace(res.workspace);
        setGlobalWorkspaceId(res.workspace.id);
        localStorage.setItem('reviveos_last_workspace_id', res.workspace.id);
        await loadWorkspaceData();
        showToast(
          'Live Demo Workspace Loaded',
          `Generated ${res.totalCustomers} customers, ${res.totalFailures} failures, and ${res.totalRecoveries} recovered transactions.`
        );
      }
    } catch (err: any) {
      showToast('Failed to load demo workspace', err.message || 'Error loading demo workspace', 'error');
    }
  };

  const handleResetDemoData = async () => {
    try {
      await api.resetDemoData();
      await loadWorkspaceData();
      showToast('Demo Data Reset', 'Fresh scenarios and failed payment cases restored.');
    } catch (err: any) {
      showToast('Reset Failed', err.message || 'Reset failed', 'error');
    }
  };

  // Dedicated UI acknowledgement for Razorpay Payment Link callback redirect
  if (path === '/pay/callback') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Confirmation Pending
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Payment Submitted</h1>
            <p className="text-sm text-slate-300 font-medium">
              Payment submitted. Confirmation pending.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              Your transaction was received by the payment processor and is awaiting authoritative webhook confirmation. Revenue recovery and your subscription status will update automatically upon verification.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If customer is navigating directly to a hosted payment portal URL
  if (isPayRoute && payTokenFromUrl) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased py-8 px-4">
        <CustomerPaymentPortal
          token={payTokenFromUrl}
          onPaymentSuccess={() => {
            showToast('Payment Completed', 'Your subscription payment has been received.');
            loadWorkspaceData();
          }}
          onBackToApp={() => {
            window.location.href = '/';
          }}
        />
      </div>
    );
  }

  if (authStatus === 'loading') {
    return (
      <div id="auth-loading-screen" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
          <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
        </div>
        <div className="text-sm font-semibold text-slate-300">Loading Revenue Recovery OS...</div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated' || !authSession?.is_authenticated) {
    return <LandingPage onSuccess={handleAuthSuccess} />;
  }

  if (workspaces.length === 0 || !currentWorkspace) {
    return (
      <WorkspaceSelectionView
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        authSession={authSession}
        isCreating={isCreatingWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onSignOut={handleSignOut}
        onLoadDemoWorkspace={handleLoadDemoWorkspace}
      />
    );
  }

  const currency = currentWorkspace?.currency || 'USD';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-xs backdrop-blur-md border ${
            toastMessage.type === 'error'
              ? 'bg-slate-900/95 border-rose-500/50 text-rose-100'
              : toastMessage.type === 'info'
              ? 'bg-slate-900/95 border-blue-500/50 text-blue-100'
              : 'bg-slate-900/95 border-emerald-500/50 text-emerald-100'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
              toastMessage.type === 'error'
                ? 'bg-rose-500/20 text-rose-400'
                : toastMessage.type === 'info'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4" />
            ) : toastMessage.type === 'info' ? (
              <Info className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="font-bold text-white">{toastMessage.title}</div>
            <div className="text-slate-300">{toastMessage.desc}</div>
          </div>
        </div>
      )}

      {/* Primary Global Header */}
      <Header
        activeTab={activeTab === 'opportunity_detail' || activeTab === 'portal_preview' ? 'home' : activeTab}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'revenue') setIsScannerOpen(false);
        }}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onOpenScanner={() => {
          setActiveTab('revenue');
          setIsScannerOpen(true);
        }}
        onOpenCsvModal={() => setShowCsvModal(true)}
        onOpenSimulatorModal={() => setShowSimulatorModal(true)}
        onResetDemo={handleResetDemoData}
        onLoadDemoWorkspace={handleLoadDemoWorkspace}
        recoveredRevenueCents={metrics?.revenue_recovered_cents || 0}
        currency={currency}
        user={authSession?.user}
        userRole={authSession?.role}
        workspaceMode={workspaceMode}
        onModeChange={handleModeChange}
        onOpenDevTools={() => setShowDevToolsModal(true)}
        onSignOut={handleSignOut}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {activeTab === 'command' && (
          <RevenueCommandCenter
            workspace={currentWorkspace}
            currency={currency}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              if (tab !== 'revenue') setIsScannerOpen(false);
            }}
            onSelectOpportunity={(id) => {
              setSelectedOpportunityId(id);
              handleSelectOpportunity(id);
            }}
            onQuickRecover={async (id) => {
              await handleRetry(id);
            }}
            onOpenScanner={() => {
              setActiveTab('revenue');
              setIsScannerOpen(true);
            }}
          />
        )}

        {activeTab === 'retention' && (
          <ChurnPreventionCenter
            currency={currency}
            onExecuteAction={async (customerId, actionType) => {
              await loadWorkspaceData();
            }}
          />
        )}

        {activeTab === 'expansion' && (
          <ExpansionPlaybookCenter
            currency={currency}
          />
        )}

        {activeTab === 'timeline' && (
          <RevenueAutomationTimeline
            timelineEvents={customers.flatMap((c) => (c as any).timeline || [])}
            revenueEvents={revenueEvents}
            currency={currency}
          />
        )}

        {activeTab === 'home' && (
          <AutopilotRecoveryCenter
            metrics={metrics}
            opportunities={opportunities}
            revenueEvents={revenueEvents}
            workspace={currentWorkspace}
            connections={connections}
            currency={currency}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              if (tab !== 'revenue') setIsScannerOpen(false);
            }}
            onSelectOpportunity={(id) => {
              setSelectedOpportunityId(id);
              handleSelectOpportunity(id);
            }}
            onQuickRecover={async (id) => {
              await handleRetry(id);
            }}
            onOpenScanner={() => {
              setActiveTab('revenue');
              setIsScannerOpen(true);
            }}
          />
        )}

        {activeTab === 'missions' && (
          <RevenueMissionDashboard
            workspaceId={currentWorkspace?.id}
            currency={currency}
            onSelectOpportunity={(id) => {
              setSelectedOpportunityId(id);
              handleSelectOpportunity(id);
            }}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              if (tab !== 'revenue') setIsScannerOpen(false);
            }}
          />
        )}

        {activeTab === 'revenue' && (
          <RevenuePage
            opportunities={opportunities}
            currency={currency}
            metrics={metrics}
            funnel={funnel}
            breakdown={breakdown}
            campaigns={campaigns}
            onToggleCampaign={handleToggleCampaign}
            onCreateCampaign={handleCreateCampaign}
            isScannerOpen={isScannerOpen}
            onCloseScanner={() => setIsScannerOpen(false)}
            onSelectOpportunity={(id) => {
              setSelectedOpportunityId(id);
              handleSelectOpportunity(id);
            }}
            onRetry={handleRetry}
            onSettle={handleSettle}
            onOpenEmailModal={(opp) => setEmailModalOpp(opp)}
            onOpenCsvModal={() => setShowCsvModal(true)}
            onRefresh={loadWorkspaceData}
          />
        )}

        {activeTab === 'customers' && (
          <CustomersPage
            customers={customers}
            opportunities={opportunities}
            currency={currency}
            onSelectOpportunity={(id) => {
              setSelectedOpportunityId(id);
              handleSelectOpportunity(id);
            }}
            onQuickRecover={async (id) => {
              await handleRetry(id);
            }}
          />
        )}

        {activeTab === 'import' && (
          <CustomerImportWizard
            workspace={currentWorkspace}
            onSuccess={async (result) => {
              showToast('Import Complete!', `Successfully ingested ${result.importedCustomersCount} customers.`);
              await loadWorkspaceData();
            }}
            onCancel={() => setActiveTab('command')}
            onNavigateToCommandCenter={() => setActiveTab('command')}
          />
        )}

        {activeTab === 'ingestion' && (
          <UniversalDataIngestionCenter
            workspace={currentWorkspace}
            onNavigateToCommandCenter={() => setActiveTab('command')}
            onNavigateToRecovery={() => setActiveTab('revenue')}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            workspace={currentWorkspace}
            workspaces={workspaces}
            connections={connections}
            supportedProviders={supportedProviders}
            campaigns={campaigns}
            auditLogs={auditLogs}
            webhooks={webhooks}
            emails={emails}
            user={authSession?.user}
            userRole={authSession?.role}
            currency={currency}
            onUpdateWorkspace={handleUpdateWorkspace}
            onConnectProvider={handleConnectProvider}
            onDisconnectProvider={handleDisconnectProvider}
            onSyncProvider={handleSyncProvider}
            onToggleCampaign={handleToggleCampaign}
            onCreateCampaign={handleCreateCampaign}
            onOpenCsvModal={() => setShowCsvModal(true)}
            onOpenSimulatorModal={() => setShowSimulatorModal(true)}
          />
        )}

        {activeTab === 'email_health' && currentWorkspace && (
          <EmailHealthCenter workspaceId={currentWorkspace.id} />
        )}

        {activeTab === 'system_health' && (
          <SystemHealthCenter />
        )}

        {activeTab === 'opportunity_detail' && (
          <OpportunityDetailsView
            opportunityId={selectedOpportunityId || opportunities[0]?.id || ''}
            currency={currency}
            onBack={() => setActiveTab('revenue')}
            onRefreshData={loadWorkspaceData}
            onUpdate={loadWorkspaceData}
            onOpenEmailModal={(opp) => setEmailModalOpp(opp)}
            onShowToast={showToast}
            onNavigateToTimeline={(cid) => {
              setTimelineCustomerId(cid);
              setActiveTab('customers');
            }}
          />
        )}

        {activeTab === 'portal_preview' && (
          <div className="space-y-4">
            <CustomerPaymentPortal
              token={opportunities[0]?.recovery_token}
              onPaymentSuccess={async () => {
                showToast('Payment Captured!', 'Customer successfully updated payment method.');
                await loadWorkspaceData();
              }}
              onBackToApp={() => setActiveTab('home')}
            />
          </div>
        )}
      </main>

      {/* Global Modals and Drawers */}
      <CustomerDrawer
        opportunity={selectedOpportunity}
        currency={currency}
        onClose={() => setSelectedOpportunity(null)}
        onRetry={handleRetry}
        onSettle={handleSettle}
        onOpenEmailModal={(opp) => setEmailModalOpp(opp)}
        onViewFullDetails={(id) => {
          setSelectedOpportunityId(id);
          setActiveTab('opportunity_detail');
        }}
      />

      <SendEmailModal
        opportunity={emailModalOpp}
        businessName={currentWorkspace?.name || 'Your Company'}
        currency={currency}
        onClose={() => setEmailModalOpp(null)}
        onSend={handleSendRecoveryEmail}
      />

      {showCsvModal && (
        <CsvImportModal
          workspace={currentWorkspace}
          onClose={() => setShowCsvModal(false)}
          onImport={handleImportCsv}
        />
      )}

      {showSimulatorModal && (
        <WebhookSimulatorModal
          onClose={() => setShowSimulatorModal(false)}
          onSimulate={handleSimulateWebhook}
        />
      )}

      {/* Razorpay Recovery Payment Link Created Modal */}
      {paymentLinkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Recovery Payment Link Created</h3>
                  <p className="text-xs text-slate-400">Razorpay payment link ready for customer checkout</p>
                </div>
              </div>
              <button
                onClick={() => setPaymentLinkDialog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
              <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                <span>Hosted Payment Link URL</span>
                {paymentLinkDialog.providerCheckoutId && (
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {paymentLinkDialog.providerCheckoutId}
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-emerald-400 break-all select-all bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                {paymentLinkDialog.url}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed">
              Payment is pending. Revenue will be marked recovered only after Razorpay confirms the payment.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => window.open(paymentLinkDialog.url, '_blank')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>OPEN PAYMENT LINK</span>
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(paymentLinkDialog.url);
                  showToast('Link Copied', 'Payment link copied to clipboard.');
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>COPY LINK</span>
              </button>
              <button
                onClick={() => setPaymentLinkDialog(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Internal Developer Diagnostics & RLS Simulator Modal */}
      {currentWorkspace && (
        <AdminDevToolsModal
          isOpen={showDevToolsModal}
          onClose={() => setShowDevToolsModal(false)}
          currentWorkspaceId={currentWorkspace.id}
          isDemoWorkspace={currentWorkspace.is_demo === true}
          onSessionUpdated={(sess) => setAuthSession(sess)}
        />
      )}
    </div>
  );
}

export default App;
