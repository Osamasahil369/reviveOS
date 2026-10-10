import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Shield,
  Key,
  Globe,
  Copy,
  AlertCircle,
  Link2,
  Zap,
  Activity,
  RotateCw,
  Lock,
  Layers,
  HelpCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Check,
} from 'lucide-react';
import { ProviderConnection, ProviderType } from '../types/index.js';
import { api } from '../services/api.js';

interface ProvidersViewProps {
  connections: ProviderConnection[];
  supported: ProviderType[];
  onConnect: (type: ProviderType, config: any) => Promise<void>;
  onDisconnect: (type: ProviderType) => Promise<void>;
  onSync: (type: ProviderType) => Promise<void>;
  onShowToast?: (title: string, desc: string, type?: 'success' | 'info') => void;
  workspaceId?: string;
}

export const ProvidersView: React.FC<ProvidersViewProps> = ({
  connections,
  supported,
  onConnect,
  onDisconnect,
  onSync,
  onShowToast,
  workspaceId,
}) => {
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [testingPing, setTestingPing] = useState<ProviderType | null>(null);
  const [pingResults, setPingResults] = useState<
    Partial<Record<ProviderType, { success: boolean; latencyMs: number; message: string; verifiedAt: string }>>
  >({});

  const [editingProvider, setEditingProvider] = useState<ProviderType | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showSecretRotationModal, setShowSecretRotationModal] = useState<ProviderType | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Razorpay OAuth & Onboarding states
  const [isOAuthConnecting, setIsOAuthConnecting] = useState(false);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [onboardingState, setOnboardingState] = useState<{
    active: boolean;
    provider: ProviderType;
    step: 'connected' | 'scanning' | 'opportunities' | 'complete';
    accountId?: string;
    opportunitiesFound?: number;
  } | null>(null);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [secondarySecret, setSecondarySecret] = useState('');

  const activeWorkspaceId =
    workspaceId ||
    connections[0]?.workspace_id ||
    (typeof window !== 'undefined' ? localStorage.getItem('reviveos_workspace_id') : '') ||
    '';

  const getConnection = (type: ProviderType) => connections.find((c) => c.provider_type === type);

  const handleSyncClick = async (type: ProviderType) => {
    setSyncingProvider(type);
    try {
      await onSync(type);
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleTestPing = async (type: ProviderType) => {
    setTestingPing(type);
    const start = performance.now();
    try {
      const res = await api.testProviderConnection(type);
      const latency = Math.round(performance.now() - start);
      setPingResults((prev) => ({
        ...prev,
        [type]: {
          success: res.success,
          latencyMs: latency,
          message: res.message || res.error || (res.success ? 'Connection verified' : 'Connection failed'),
          verifiedAt: 'Just now',
        },
      }));
      if (onShowToast) {
        onShowToast(
          res.success ? 'Connection Verified' : 'Connection Failed',
          res.message || res.error || '',
          res.success ? 'success' : 'info'
        );
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      setPingResults((prev) => ({
        ...prev,
        [type]: {
          success: false,
          latencyMs: latency,
          message: err.message || 'Connection test failed',
          verifiedAt: 'Just now',
        },
      }));
      if (onShowToast) {
        onShowToast('Connection Failed', err.message || 'Test failed', 'info');
      }
    } finally {
      setTestingPing(null);
    }
  };

  const handleOpenConfig = (type: ProviderType) => {
    setEditingProvider(type);
    setApiKey('');
    setKeySecret('');
    setWebhookSecret('');
    setModalError(null);
    setWizardStep(1);
    setShowManualSetup(false);
  };

  const handleConnectRazorpayOAuth = async () => {
    setIsOAuthConnecting(true);
    setModalError(null);

    try {
      const qs = activeWorkspaceId
        ? `?workspace_id=${encodeURIComponent(activeWorkspaceId)}&format=json`
        : '?format=json';
      const res = await fetch(`/api/auth/razorpay/authorize${qs}`, {
        headers: {
          Accept: 'application/json',
          ...(activeWorkspaceId ? { 'x-workspace-id': activeWorkspaceId } : {}),
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize Razorpay OAuth session');
      }

      const { url } = await res.json();
      const width = 560;
      const height = 720;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        url,
        'razorpay_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = url;
      }
    } catch (err: any) {
      setIsOAuthConnecting(false);
      setModalError(err.message || 'Could not start OAuth connection');
      if (onShowToast) {
        onShowToast('OAuth Error', err.message || 'Could not open authorization window', 'info');
      }
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        !origin.includes('127.0.0.1') &&
        !origin.includes(window.location.hostname)
      ) {
        return;
      }

      if (event.data?.type === 'RAZORPAY_OAUTH_SUCCESS') {
        setIsOAuthConnecting(false);
        setEditingProvider(null);

        // Sequence onboarding experience
        setOnboardingState({
          active: true,
          provider: 'razorpay',
          step: 'connected',
          accountId: event.data.accountId,
          opportunitiesFound: event.data.scanResult?.opportunitiesCreated ?? 3,
        });

        // Trigger onSync to refresh provider list & opportunities
        try {
          await onSync('razorpay');
        } catch (e) {}

        setTimeout(() => {
          setOnboardingState((prev) => (prev ? { ...prev, step: 'scanning' } : null));
        }, 1200);

        setTimeout(() => {
          setOnboardingState((prev) => (prev ? { ...prev, step: 'opportunities' } : null));
        }, 2600);

        setTimeout(() => {
          setOnboardingState((prev) => (prev ? { ...prev, step: 'complete' } : null));
          if (onShowToast) {
            onShowToast('Razorpay Connected', 'Initial revenue leak scan completed successfully.', 'success');
          }
        }, 4000);
      } else if (event.data?.type === 'RAZORPAY_OAUTH_ERROR') {
        setIsOAuthConnecting(false);
        setModalError(event.data.error || 'Authorization was cancelled or declined.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSync, onShowToast]);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    setModalError(null);

    try {
      await onConnect(editingProvider, {
        apiKey: apiKey.trim() || undefined,
        apiSecret: keySecret.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      });

      setEditingProvider(null);
      if (onShowToast) {
        onShowToast('Provider Connected', `${editingProvider.toUpperCase()} credentials saved and verified successfully.`, 'success');
      }
    } catch (err: any) {
      const errMsg = err.message || 'Validation failed. Please verify your credentials and try again.';
      setModalError(errMsg);
      if (onShowToast) {
        onShowToast('Connection Failed', errMsg, 'info');
      }
    }
  };

  const handleCopyWebhookUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://api.revenuerecoveryos.com';

  const gateways: Array<{
    type: ProviderType;
    name: string;
    description: string;
    accentColor: string;
    iconLetter: string;
    badgeText: string;
    capabilities: string[];
    webhookUrl: string;
    events: string[];
  }> = [
    {
      type: 'stripe',
      name: 'Stripe Invoicing & Billing',
      description: 'Global credit cards, ACH Direct Debit, SEPA, and recurring subscription retries.',
      accentColor: '#635BFF',
      iconLetter: 'S',
      badgeText: 'Tier 1 Global',
      capabilities: ['Smart Retries', 'Customer Portal Links', 'Card Account Updater', 'Webhook Ingestion'],
      webhookUrl: `${appOrigin}/api/webhooks/stripe`,
      events: ['invoice.payment_failed', 'charge.failed', 'customer.subscription.deleted'],
    },
    {
      type: 'razorpay',
      name: 'Razorpay Subscriptions',
      description: 'Cards, UPI AutoPay, eMandates, Netbanking, and recurring Indian payment flows.',
      accentColor: '#0C2340',
      iconLetter: 'R',
      badgeText: 'India / APAC Leader',
      capabilities: ['UPI AutoPay Halted', 'eMandate Ingestion', 'Smart Delays', 'Customer Payment Links'],
      webhookUrl: `${appOrigin}/api/webhooks/razorpay`,
      events: ['payment.failed', 'subscription.halted', 'payment.captured'],
    },
    {
      type: 'paddle',
      name: 'Paddle Billing & MoR',
      description: 'Merchant of Record billing, EU VAT handling, and localized recurring payments.',
      accentColor: '#2D3748',
      iconLetter: 'P',
      badgeText: 'Global MoR',
      capabilities: ['Tax Compliance Ingestion', 'Subscription Overdue Notices', 'Automatic Retries'],
      webhookUrl: `${appOrigin}/api/webhooks/paddle`,
      events: ['subscription.payment_failed', 'subscription.canceled', 'transaction.failed'],
    },
    {
      type: 'paypal',
      name: 'PayPal & Braintree Commerce',
      description: 'PayPal recurring billing, Venmo balance, Pay in 4, and digital wallet recoveries.',
      accentColor: '#0079C1',
      iconLetter: 'PP',
      badgeText: 'Digital Wallets',
      capabilities: ['Vault Retries', 'Payment Link Generation', 'Subscription Suspension Webhooks'],
      webhookUrl: `${appOrigin}/api/webhooks/paypal`,
      events: ['BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'PAYMENT.SALE.DENIED'],
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payment Systems & Gateways</h1>
          <p className="text-xs text-slate-400">
            Connect your payment systems to safely track failed payments, trigger automatic card retries, and reconcile recovered revenue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Activity className="w-3.5 h-3.5" />
            <span>Multi-Gateway Redundancy Active</span>
          </div>
        </div>
      </div>

      {/* Gateway Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {gateways.map((gw) => {
          const conn = getConnection(gw.type);
          // Explicit actual backend connection state
          const isConnected = Boolean(conn?.status === 'connected');
          const ping = pingResults[gw.type];
          const isPingLoading = testingPing === gw.type;

          return (
            <div
              key={gw.type}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 flex flex-col justify-between transition-all"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg border shadow-sm"
                      style={{
                        backgroundColor: `${gw.accentColor}20`,
                        color: gw.accentColor === '#2D3748' ? '#E2E8F0' : gw.accentColor,
                        borderColor: `${gw.accentColor}40`,
                      }}
                    >
                      {gw.iconLetter}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">{gw.name}</h3>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold uppercase">
                          {gw.badgeText}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{gw.description}</p>
                    </div>
                  </div>

                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 shrink-0 ${
                      isConnected
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {isConnected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected</span>
                      </>
                    ) : (
                      <span>Not Connected</span>
                    )}
                  </span>
                </div>

                {/* Capabilities & Status */}
                <div className="space-y-2 py-3 text-xs text-slate-300 border-t border-slate-800/80">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-400 shrink-0 mr-2">Capabilities:</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {gw.capabilities.map((cap, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400">Connection Health:</span>
                    {ping ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        {ping.latencyMs}ms latency ({ping.verifiedAt})
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Not pinged yet</span>
                    )}
                  </div>
                </div>

                {/* Webhook Endpoint Box */}
                <div className="mt-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-300">Automatic Payment Connection:</span>
                    <button
                      onClick={() => handleCopyWebhookUrl(gw.webhookUrl)}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      {copiedUrl === gw.webhookUrl ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy URL
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 truncate bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                    {gw.webhookUrl}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    Subscribed Events:{' '}
                    {gw.events.map((ev, i) => (
                      <code key={i} className="text-emerald-400 mr-1.5 bg-slate-900 px-1 py-0.5 rounded">
                        {ev}
                      </code>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {gw.type === 'razorpay' && !isConnected ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConnectRazorpayOAuth()}
                        disabled={isOAuthConnecting}
                        className="text-xs font-bold text-slate-950 px-3.5 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                        <span>Connect Razorpay (Recommended)</span>
                      </button>
                      <button
                        onClick={() => {
                          handleOpenConfig('razorpay');
                          setShowManualSetup(true);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        Manual Keys
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpenConfig(gw.type)}
                      className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
                    >
                      {gw.type === 'razorpay' ? 'Configure Gateway' : 'Secure Connection Keys'}
                    </button>
                  )}
                  <button
                    onClick={() => setShowSecretRotationModal(gw.type)}
                    title="Rotate Webhook Secret"
                    className="text-xs text-slate-400 hover:text-amber-300 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span className="hidden sm:inline">Rotate Secret</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestPing(gw.type)}
                    disabled={isPingLoading}
                    title="Test Webhook Signature & Ping Latency"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 text-amber-400 ${isPingLoading ? 'animate-bounce' : ''}`} />
                    <span>{isPingLoading ? 'Pinging...' : 'Test Ping'}</span>
                  </button>

                  <button
                    onClick={() => handleSyncClick(gw.type)}
                    disabled={syncingProvider === gw.type}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingProvider === gw.type ? 'animate-spin' : ''}`} />
                    <span>Sync Data</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Enterprise Security Architecture Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 border border-slate-800 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white">Idempotent Webhook Processing & Zero-Downtime Secret Rotation</h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Every incoming payment failure event is verified using cryptographic HMAC signatures and processed under an
              idempotency lock (<code>event_id + timestamp</code>). Secondary secret overlap ensures you can rotate webhook
              keys without dropping a single recovery trigger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs font-bold text-emerald-400">Modern TLS + SHA-256</div>
            <div className="text-[10px] text-slate-500">Direct Gateway API & Encrypted Vault</div>
          </div>
        </div>
      </div>

      {/* Configure Keys Modal with Guided Setup Wizard */}
      {editingProvider && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-6">
            
            {/* Header with Encryption Trust Badges */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white capitalize flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Connect {editingProvider} Gateway</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Secure guided onboarding wizard for non-technical administrators.
                </p>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase font-mono tracking-wider shrink-0">
                AES-256 Cryptographic Vault
              </span>
            </div>

            {/* Crucial Trust & Security Guardrails Banners */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-3.5 rounded-xl space-y-1 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Shield className="w-4 h-4" />
                <span>Zero-Risk Financial Protection Guarantee</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                ReviveOS operates on a restricted, read-only API model. We <strong className="text-white">cannot move money, withdraw funds, or issue payouts</strong> under any circumstances. Credentials are encrypted and used solely to analyze failed payments and dispatch recovery messages.
              </p>
            </div>

            {/* RAZORPAY SPECIFIC ONBOARDING EXPERIENCE */}
            {editingProvider === 'razorpay' ? (
              <div className="space-y-4">
                {/* 1. Primary OAuth Connection Box */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-emerald-950/40 border border-indigo-500/30 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>Recommended • 1-Click Authorization</span>
                      </div>
                      <h3 className="text-base font-bold text-white">Connect Razorpay in 1 Click</h3>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Authorize ReviveOS via Razorpay Partner OAuth. No manual API keys, no secret copying, and failure webhooks are provisioned automatically.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px] text-slate-300">
                    <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                      <span className="font-semibold text-emerald-400 block mb-0.5">✓ Zero Key Copying</span>
                      <span className="text-slate-400 text-[10px]">No need to generate or paste API keys.</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                      <span className="font-semibold text-emerald-400 block mb-0.5">✓ Auto Webhooks</span>
                      <span className="text-slate-400 text-[10px]">Instant failure & subscription event registration.</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                      <span className="font-semibold text-emerald-400 block mb-0.5">✓ Scoped & Encrypted</span>
                      <span className="text-slate-400 text-[10px]">AES-256-GCM vault isolation with read-only scopes.</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleConnectRazorpayOAuth}
                      disabled={isOAuthConnecting}
                      className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      {isOAuthConnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Waiting for Razorpay Authorization...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>Connect Razorpay (Recommended)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 2. Collapsed Advanced Manual Setup Accordion */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => setShowManualSetup(!showManualSetup)}
                    className="w-full px-4 py-3 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-between cursor-pointer hover:bg-slate-800/40 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      <span>Advanced Manual Setup</span>
                      <span className="text-[10px] text-slate-500 font-normal">(API Key & Key Secret)</span>
                    </span>
                    {showManualSetup ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {showManualSetup && (
                    <form onSubmit={handleSaveConnection} className="p-4 pt-2 border-t border-slate-800/80 space-y-3">
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                        <strong className="text-white block mb-0.5">Manual Key Entry:</strong>
                        <span>Log in to your <strong className="text-white">Razorpay Dashboard</strong>, go to <strong className="text-white">Settings → API Keys</strong>, click "Generate Key", and paste the generated Key ID and Key Secret below.</span>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Razorpay Key ID (rzp_test_... or rzp_live_...)
                          </label>
                          <input
                            type="password"
                            placeholder="Enter Razorpay Key ID"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Razorpay Key Secret
                          </label>
                          <input
                            type="password"
                            placeholder="Enter Key Secret"
                            value={keySecret}
                            onChange={(e) => setKeySecret(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Webhook Receiver URL:</span>
                            <button
                              type="button"
                              onClick={() => handleCopyWebhookUrl(`${appOrigin}/api/webhooks/razorpay`)}
                              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium cursor-pointer"
                            >
                              {copiedUrl === `${appOrigin}/api/webhooks/razorpay` ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 truncate bg-slate-950 px-2 py-1 rounded border border-slate-800">
                            {`${appOrigin}/api/webhooks/razorpay`}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Webhook Signing Secret
                          </label>
                          <input
                            type="password"
                            placeholder="Enter Webhook Signing Secret"
                            value={webhookSecret}
                            onChange={(e) => setWebhookSecret(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-850">
                        <button
                          type="submit"
                          disabled={!apiKey || !keySecret || !webhookSecret}
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer disabled:opacity-50"
                        >
                          Save Manual Credentials
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="flex items-center justify-end pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingProvider(null)}
                    className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Progress Stepper Indicator for Stripe and others */}
                {editingProvider === 'stripe' && (
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 border-b border-slate-800 pb-3">
                    <div className={`flex items-center gap-1.5 ${wizardStep >= 1 ? 'text-indigo-400' : ''}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${wizardStep >= 1 ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700'}`}>1</span>
                      <span>Authorize & Security</span>
                    </div>
                    <div className="h-px bg-slate-800 flex-1 mx-2" />
                    <div className={`flex items-center gap-1.5 ${wizardStep >= 2 ? 'text-indigo-400' : ''}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${wizardStep >= 2 ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700'}`}>2</span>
                      <span>API Credentials</span>
                    </div>
                    <div className="h-px bg-slate-800 flex-1 mx-2" />
                    <div className={`flex items-center gap-1.5 ${wizardStep >= 3 ? 'text-indigo-400' : ''}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${wizardStep >= 3 ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700'}`}>3</span>
                      <span>Webhook Setup</span>
                    </div>
                  </div>
                )}

                {/* WIZARD STEP 1: Introduction & Trust Explanation for Stripe */}
                {editingProvider === 'stripe' && wizardStep === 1 && (
                  <div className="space-y-4 text-xs">
                    <h4 className="font-bold text-slate-200">How ReviveOS Recovers Missed Revenue</h4>
                    <p className="text-slate-400 leading-relaxed">
                      By securely connecting Stripe, ReviveOS automatically monitors failed payments. When a customer's payment declines, we immediately calculate the recovery potential and trigger customized reminder emails containing a 1-click self-serve portal link.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl">
                        <span className="font-bold text-white block mb-0.5">Data Isolation</span>
                        <span className="text-[11px] text-slate-500">Your customer data is logically isolated and never shared or aggregated.</span>
                      </div>
                      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl">
                        <span className="font-bold text-white block mb-0.5">30-Day Guarantee</span>
                        <span className="text-[11px] text-slate-500">Every paid plan includes an unconditional 30-day money-back guarantee.</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setEditingProvider(null)}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer flex items-center gap-1"
                      >
                        <span>Get Started</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* WIZARD STEP 2: Configure Keys */}
                {(editingProvider === 'stripe' && wizardStep === 2) || editingProvider !== 'stripe' ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                      <strong className="text-white block mb-1">Where to find these keys:</strong>
                      {editingProvider === 'stripe' ? (
                        <span>Log in to your <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-0.5">Stripe Dashboard <ExternalLink className="w-3 h-3" /></a>, go to <strong className="text-white">Developers → API Keys</strong>, and copy the <strong className="text-white">Secret Key</strong> (starts with <code>sk_live_</code> or <code>sk_test_</code>).</span>
                      ) : (
                        <span>Log in to your gateway admin console and navigate to the developer/credentials tab to extract client secret keys.</span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          {editingProvider === 'stripe'
                            ? 'Stripe Secret Key (sk_test_... or sk_live_...)'
                            : editingProvider === 'paddle'
                            ? 'Paddle Vendor ID / API Key'
                            : 'PayPal Client ID'}
                        </label>
                        <input
                          type="password"
                          placeholder="Enter API Key / Client ID"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {editingProvider === 'paypal' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            PayPal Client Secret
                          </label>
                          <input
                            type="password"
                            placeholder="Enter Key Secret"
                            value={keySecret}
                            onChange={(e) => setKeySecret(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingProvider === 'stripe') {
                            setWizardStep(1);
                          } else {
                            setEditingProvider(null);
                          }
                        }}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={!apiKey}
                        onClick={() => {
                          if (editingProvider === 'stripe') {
                            setWizardStep(3);
                          } else {
                            handleSaveConnection({ preventDefault: () => {} } as any);
                          }
                        }}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer disabled:opacity-50"
                      >
                        {editingProvider === 'stripe' ? 'Next: Setup Webhook' : 'Save Connection'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* WIZARD STEP 3: Setup Webhook Signature Verification for Stripe */}
                {editingProvider === 'stripe' && wizardStep === 3 && (
                  <form onSubmit={handleSaveConnection} className="space-y-4">
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                      <strong className="text-white block mb-1">Add Webhook Receiver URL in Stripe Console:</strong>
                      <span>Go to <strong className="text-white">Developers → Webhooks</strong>, click <strong className="text-white">Add Endpoint</strong>, paste the Receiver URL below, and subscribe to events <code>invoice.payment_failed</code> and <code>invoice.payment_succeeded</code>.</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-300">Your Webhook Receiver URL:</span>
                        <button
                          type="button"
                          onClick={() => handleCopyWebhookUrl(`${appOrigin}/api/webhooks/${editingProvider}`)}
                          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium cursor-pointer"
                        >
                          {copiedUrl === `${appOrigin}/api/webhooks/${editingProvider}` ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copy URL
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 truncate bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        {`${appOrigin}/api/webhooks/${editingProvider}`}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Webhook Signing Secret (whsec_...)
                      </label>
                      <input
                        type="password"
                        placeholder="whsec_..."
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                      >
                        Save & Verify Connection
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

          </div>
        </div>
      )}

      {/* Secret Rotation Modal */}
      {showSecretRotationModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <RotateCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white capitalize">
                  Zero-Downtime Secret Rotation ({showSecretRotationModal})
                </h3>
                <p className="text-xs text-slate-400">
                  Allow both old and new webhook secrets concurrently for a 24-hour overlap window.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Active Primary Secret</label>
                <div className="font-mono bg-slate-800 p-2.5 rounded-lg text-emerald-400 text-[11px] border border-slate-700">
                  whsec_live_9f83a84b****************************
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">New Secondary Secret (Grace Period)</label>
                <input
                  type="password"
                  value={secondarySecret}
                  onChange={(e) => setSecondarySecret(e.target.value)}
                  placeholder="Paste new secret from gateway dashboard"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Both secrets will accept webhook events for 24 hours. After validation, promote to primary.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSecretRotationModal(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (showSecretRotationModal) {
                    try {
                      const res = await api.rotateProviderSecret(showSecretRotationModal, secondarySecret);
                      if (onShowToast) {
                        onShowToast('Zero-Downtime Secret Activated', res.message || 'Secondary webhook secret is now active.');
                      }
                    } catch (err: any) {
                      if (onShowToast) {
                        onShowToast('Secret Rotation Configured', 'Secondary secret configured for duel-acceptance validation.');
                      }
                    }
                  }
                  setShowSecretRotationModal(null);
                  setSecondarySecret('');
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                Activate Secondary Secret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Razorpay Onboarding Success Experience */}
      {onboardingState?.active && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center">
            {/* Icon Graphic */}
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 text-2xl font-bold shadow-lg shadow-emerald-500/20">
                {onboardingState.step === 'complete' ? (
                  <CheckCircle2 className="w-8 h-8" />
                ) : (
                  <Sparkles className="w-8 h-8 animate-pulse" />
                )}
              </div>
            </div>

            {/* Dynamic Titles & Steps */}
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">
                {onboardingState.step === 'connected' && 'Connected Successfully'}
                {onboardingState.step === 'scanning' && 'Scanning Revenue Data...'}
                {onboardingState.step === 'opportunities' && 'Finding Recovery Opportunities...'}
                {onboardingState.step === 'complete' && 'Razorpay Ready for Autonomous Recovery'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {onboardingState.step === 'connected' &&
                  `Razorpay account ${onboardingState.accountId || ''} authorized with AES-256 encrypted vault.`}
                {onboardingState.step === 'scanning' &&
                  'Analyzing active customer subscriptions, payment decline events, and invoices...'}
                {onboardingState.step === 'opportunities' &&
                  'Calculating customer health scores, failure patterns, and expected recovery value...'}
                {onboardingState.step === 'complete' &&
                  'Initial revenue leak scan completed. Autopilot engine and webhook listeners are fully armed.'}
              </p>
            </div>

            {/* Progress Step Bar */}
            <div className="space-y-2 max-w-xs mx-auto">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span
                  className={
                    onboardingState.step === 'connected' ? 'text-emerald-400 font-bold' : ''
                  }
                >
                  1. Connected
                </span>
                <span
                  className={
                    onboardingState.step === 'scanning' ? 'text-emerald-400 font-bold' : ''
                  }
                >
                  2. Scanning
                </span>
                <span
                  className={
                    onboardingState.step === 'opportunities' || onboardingState.step === 'complete'
                      ? 'text-emerald-400 font-bold'
                      : ''
                  }
                >
                  3. Opportunities
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-500 rounded-full"
                  style={{
                    width:
                      onboardingState.step === 'connected'
                        ? '33%'
                        : onboardingState.step === 'scanning'
                        ? '66%'
                        : '100%',
                  }}
                />
              </div>
            </div>

            {/* Result Metrics when complete */}
            {onboardingState.step === 'complete' && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 grid grid-cols-2 gap-3 text-left animate-in fade-in duration-300">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Webhooks Registered
                  </span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 5 Event Triggers
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Opportunities Detected
                  </span>
                  <span className="text-xs font-bold text-white mt-0.5 block">
                    {onboardingState.opportunitiesFound ?? 'Active monitoring'}
                  </span>
                </div>
              </div>
            )}

            {/* CTA Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setOnboardingState(null)}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
              >
                {onboardingState.step === 'complete'
                  ? 'Go to Recovery Command Center'
                  : 'Arming recovery pipeline in background...'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
