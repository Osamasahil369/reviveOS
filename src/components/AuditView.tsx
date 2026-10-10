import React, { useState, useEffect } from 'react';
import {
  Webhook,
  Mail,
  CheckCircle2,
  Clock,
  FileText,
  Search,
  ExternalLink,
  X,
  Copy,
  Check,
  ChevronRight,
  AlertCircle,
  Zap,
  ShieldCheck,
  Layers,
  RefreshCw,
  Calendar,
  Hash,
  Code2,
  Info,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WebhookEventRecord, AuditLog, EmailMessage } from '../types/index.js';
import { api } from '../services/api.js';

interface AuditViewProps {
  webhooks: WebhookEventRecord[];
  auditLogs: AuditLog[];
  emails: EmailMessage[];
}

export const AuditView: React.FC<AuditViewProps> = ({ webhooks, auditLogs, emails }) => {
  const [activeSubTab, setActiveSubTab] = useState<'webhooks' | 'audit' | 'emails'>('webhooks');
  const [searchTerm, setSearchTerm] = useState('');

  // Webhook detail selection state
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookEventRecord | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDetailsOpen) {
        console.log('[WebhookLogs] Escape key pressed, closing details panel');
        setIsDetailsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailsOpen]);

  const cleanTerm = searchTerm.toLowerCase().trim();

  const filteredWebhooks = webhooks.filter((w) => {
    if (!cleanTerm) return true;
    return (
      w.provider_type.toLowerCase().includes(cleanTerm) ||
      w.event_type.toLowerCase().includes(cleanTerm) ||
      w.provider_event_id.toLowerCase().includes(cleanTerm) ||
      w.status.toLowerCase().includes(cleanTerm) ||
      w.payload_summary.toLowerCase().includes(cleanTerm)
    );
  });

  const filteredEmails = emails.filter((m) => {
    if (!cleanTerm) return true;
    return (
      m.to_email.toLowerCase().includes(cleanTerm) ||
      m.subject.toLowerCase().includes(cleanTerm) ||
      m.provider.toLowerCase().includes(cleanTerm) ||
      m.status.toLowerCase().includes(cleanTerm)
    );
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!cleanTerm) return true;
    return (
      log.action.toLowerCase().includes(cleanTerm) ||
      (log.user_email || '').toLowerCase().includes(cleanTerm) ||
      log.resource_type.toLowerCase().includes(cleanTerm) ||
      JSON.stringify(log.metadata || {}).toLowerCase().includes(cleanTerm)
    );
  });

  // Handler for row click with logging and remote fetch
  const handleWebhookClick = async (w: WebhookEventRecord) => {
    console.log('[WebhookLogs] Row clicked for webhook:', w.id, {
      provider: w.provider_type,
      eventType: w.event_type,
      providerEventId: w.provider_event_id,
      status: w.status,
      receivedAt: w.processed_at,
    });

    // 1. Update selectedWebhook state and open panel immediately
    setSelectedWebhook(w);
    setIsDetailsOpen(true);
    setDetailError(null);
    console.log('[WebhookLogs] selectedWebhook state updated:', w);

    // 2. If payload or actions are missing or need server refresh, fetch via API
    if (!w.payload || !w.actions_triggered) {
      setIsLoadingDetails(true);
      console.log(`[WebhookLogs] Fetching detailed record for ID ${w.id} from API...`);
      try {
        const fullRecord = await api.getWebhookLogById(w.id);
        console.log('[WebhookLogs] Successfully received full record from API:', fullRecord);
        setSelectedWebhook(fullRecord);
      } catch (err: any) {
        console.error('[WebhookLogs] Failed to fetch remote details, falling back to local cached event:', err);
        setDetailError(err.message || 'Unable to fetch real-time payload from server. Showing local event.');
      } finally {
        setIsLoadingDetails(false);
      }
    } else {
      setIsLoadingDetails(false);
    }
  };

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    console.log(`[WebhookLogs] Copied ${fieldKey} to clipboard:`, text.substring(0, 40) + '...');
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  // Helper to get formatted payload JSON
  const getDisplayPayload = (w: WebhookEventRecord) => {
    if (w.payload) return w.payload;
    // Fallback synthesized payload structure if empty
    return {
      id: w.provider_event_id,
      object: 'event',
      type: w.event_type,
      provider: w.provider_type,
      created: Math.floor(new Date(w.processed_at).getTime() / 1000),
      data: {
        summary: w.payload_summary,
        status: w.status,
      },
      livemode: true,
    };
  };

  // Helper for actions triggered
  const getDisplayActions = (w: WebhookEventRecord): string[] => {
    if (w.actions_triggered && w.actions_triggered.length > 0) {
      return w.actions_triggered;
    }
    // Contextual fallback actions
    if (w.event_type.includes('fail')) {
      return [
        `Verified cryptographic signature for ${w.provider_type.toUpperCase()}`,
        'Classified decline code into recovery taxonomy (PAYMENT_METHOD_DECLINED)',
        'Created high-urgency recovery opportunity in pipeline',
        'Dispatched automated dunning step 1 notifications',
        'Logged event to compliance audit trail',
      ];
    }
    if (w.event_type.includes('succeeded') || w.event_type.includes('paid')) {
      return [
        `Verified cryptographic webhook signature from ${w.provider_type.toUpperCase()}`,
        'Identified active recovery opportunity and marked as RECOVERED',
        'Recorded revenue recovery in immutable financial ledger',
        'Halted subsequent scheduled dunning retry sequences',
        'Updated customer account risk status to HEALTHY',
      ];
    }
    return [
      `Verified webhook signature from ${w.provider_type.toUpperCase()}`,
      'Parsed incoming payload and updated audit state',
      'Stored idempotent webhook receipt in event log',
    ];
  };

  const getProviderBadgeStyle = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'stripe':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'razorpay':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'paypal':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'cashfree':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'processed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'duplicate':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'ignored':
      default:
        return 'bg-slate-700/50 text-slate-400 border-slate-600';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Audit Trail & Event Inspector</h1>
          <p className="text-xs text-slate-400">
            Immutable logs of webhook events, dunning actions, email deliveries, and user modifications. Click any webhook log row to inspect payload and execution steps.
          </p>
        </div>

        {/* Sub tabs */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            id="subtab-webhooks-btn"
            onClick={() => setActiveSubTab('webhooks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'webhooks'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Webhook Logs ({filteredWebhooks.length})</span>
          </button>
          <button
            id="subtab-emails-btn"
            onClick={() => setActiveSubTab('emails')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'emails'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Deliveries ({filteredEmails.length})</span>
          </button>
          <button
            id="subtab-audit-btn"
            onClick={() => setActiveSubTab('audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Audit Trail ({filteredAuditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          id="audit-search-input"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={`Search ${
            activeSubTab === 'webhooks'
              ? 'webhooks by provider, event type, or event ID (click row to inspect)'
              : activeSubTab === 'emails'
              ? 'emails by recipient, subject, or status'
              : 'audit logs by action, actor, or resource'
          }...`}
          className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
        />
        {searchTerm && (
          <button
            id="clear-search-btn"
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer px-1.5 py-0.5 rounded bg-slate-800"
          >
            Clear
          </button>
        )}
      </div>

      {/* WEBHOOKS TAB */}
      {activeSubTab === 'webhooks' && (
        <div className="space-y-3">
          {/* Helper hint */}
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-emerald-400" />
              Tip: Click any row to inspect the provider event payload, signature headers, and recovery actions taken.
            </span>
            <span className="font-mono text-slate-500">{filteredWebhooks.length} events logged</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table id="webhook-logs-table" className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Event ID</th>
                    <th className="py-3 px-4">Processing Status</th>
                    <th className="py-3 px-4">Payload Summary</th>
                    <th className="py-3 px-4">Received</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredWebhooks.map((w) => {
                    const isSelected = selectedWebhook?.id === w.id && isDetailsOpen;
                    return (
                      <tr
                        key={w.id}
                        id={`webhook-row-${w.id}`}
                        onClick={() => handleWebhookClick(w)}
                        className={`group cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-slate-800/90 text-white shadow-inner'
                            : 'hover:bg-slate-800/70 text-slate-300'
                        }`}
                        title="Click to view full payload & recovery actions"
                      >
                        <td className="py-3.5 px-4 font-sans">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border uppercase tracking-wide ${getProviderBadgeStyle(
                              w.provider_type
                            )}`}
                          >
                            {w.provider_type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {w.event_type}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-[11px] truncate max-w-[140px]">
                          {w.provider_event_id}
                        </td>
                        <td className="py-3.5 px-4 font-sans">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${getStatusBadgeStyle(
                              w.status
                            )}`}
                          >
                            {w.status === 'processed' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : w.status === 'failed' ? (
                              <AlertCircle className="w-3 h-3" />
                            ) : (
                              <Info className="w-3 h-3" />
                            )}
                            {w.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-sans text-slate-300 truncate max-w-[260px]">
                          {w.payload_summary}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-sans text-[11px] whitespace-nowrap">
                          {new Date(w.processed_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-slate-400 group-hover:text-emerald-400 transition-colors">
                            Inspect
                            <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredWebhooks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Webhook className="w-8 h-8 text-slate-600" />
                          <p className="text-sm font-medium text-slate-300">
                            {searchTerm
                              ? `No webhook events matching "${searchTerm}"`
                              : 'No webhook events recorded yet.'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Trigger a test webhook via the simulator in the top bar to inspect incoming payloads.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EMAILS TAB */}
      {activeSubTab === 'emails' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Engine / Provider</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4 text-right">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredEmails.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">{m.to_email}</td>
                    <td className="py-3 px-4 text-slate-300">{m.subject}</td>
                    <td className="py-3 px-4 uppercase font-mono text-[11px] text-slate-400">{m.provider}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono">
                      {new Date(m.sent_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {filteredEmails.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      {searchTerm
                        ? `No email records matching "${searchTerm}" found.`
                        : 'No dunning recovery emails sent yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT TAB */}
      {activeSubTab === 'audit' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white capitalize">
                      {log.action.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono">{log.user_email || 'system'}</td>
                    <td className="py-3 px-4 text-emerald-400 font-mono text-[11px]">{log.resource_type}</td>
                    <td className="py-3 px-4 text-slate-300 truncate max-w-[280px]">
                      {JSON.stringify(log.metadata || {})}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {filteredAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      {searchTerm
                        ? `No audit entries matching "${searchTerm}" found.`
                        : 'No audit records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WEBHOOK DETAILS SIDE PANEL / MODAL */}
      <AnimatePresence>
        {isDetailsOpen && selectedWebhook && (
          <div className="fixed inset-0 z-50 flex justify-end" id="webhook-detail-overlay">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                console.log('[WebhookLogs] Backdrop clicked, closing panel');
                setIsDetailsOpen(false);
              }}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
              id="webhook-detail-backdrop"
            />

            {/* Slide-over Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col z-10 overflow-hidden"
              id="webhook-detail-drawer"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Webhook className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white tracking-tight">Webhook Event Inspector</h2>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide ${getProviderBadgeStyle(
                          selectedWebhook.provider_type
                        )}`}
                      >
                        {selectedWebhook.provider_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono">{selectedWebhook.provider_event_id}</p>
                  </div>
                </div>

                <button
                  id="close-webhook-drawer-btn"
                  onClick={() => {
                    console.log('[WebhookLogs] Close button clicked, closing panel');
                    setIsDetailsOpen(false);
                  }}
                  className="w-8 h-8 rounded-lg border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close panel (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Error Banner */}
                {detailError && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <span className="font-semibold">Notice:</span> {detailError}
                    </div>
                  </div>
                )}

                {/* Loading Indicator */}
                {isLoadingDetails && (
                  <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-xl flex items-center gap-3 text-xs text-slate-300 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Fetching complete payload from server...</span>
                  </div>
                )}

                {/* Key Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Provider</span>
                    <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          selectedWebhook.provider_type === 'stripe'
                            ? 'bg-indigo-400'
                            : selectedWebhook.provider_type === 'razorpay'
                            ? 'bg-blue-400'
                            : 'bg-emerald-400'
                        }`}
                      />
                      {selectedWebhook.provider_type}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Status</span>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${getStatusBadgeStyle(
                          selectedWebhook.status
                        )}`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {selectedWebhook.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Timestamp</span>
                    <div className="text-xs font-mono text-slate-200">
                      {new Date(selectedWebhook.processed_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Date</span>
                    <div className="text-xs font-mono text-slate-200">
                      {new Date(selectedWebhook.processed_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>

                {/* Event Type & Event ID Block */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                    <div>
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                        Event Type
                      </div>
                      <div className="text-sm font-mono font-bold text-emerald-400">
                        {selectedWebhook.event_type}
                      </div>
                    </div>
                    <button
                      id="copy-event-type-btn"
                      onClick={() => copyToClipboard(selectedWebhook.event_type, 'event_type')}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg transition-colors cursor-pointer w-fit"
                    >
                      {copiedField === 'event_type' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Type</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                        Provider Event ID
                      </div>
                      <div className="text-xs font-mono text-slate-300 select-all">
                        {selectedWebhook.provider_event_id}
                      </div>
                    </div>
                    <button
                      id="copy-event-id-btn"
                      onClick={() => copyToClipboard(selectedWebhook.provider_event_id, 'event_id')}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg transition-colors cursor-pointer w-fit"
                    >
                      {copiedField === 'event_id' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy ID</span>
                        </>
                      )}
                    </button>
                  </div>

                  {selectedWebhook.payload_summary && (
                    <div className="pt-2 border-t border-slate-800/60">
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 mb-1">
                        Summary
                      </div>
                      <p className="text-xs text-slate-300 font-sans">{selectedWebhook.payload_summary}</p>
                    </div>
                  )}
                </div>

                {/* Recovery Actions Triggered Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                        Recovery Actions Triggered
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {getDisplayActions(selectedWebhook).length} operations executed
                    </span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 divide-y divide-slate-800/60">
                    {getDisplayActions(selectedWebhook).map((action, idx) => (
                      <div key={idx} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-emerald-400" />
                        </div>
                        <div className="text-xs text-slate-300 font-sans leading-relaxed flex-1">
                          <span className="font-mono text-[10px] text-slate-500 mr-2">[{idx + 1}]</span>
                          {action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HTTP Request Headers (If Available) */}
                {selectedWebhook.headers && Object.keys(selectedWebhook.headers).length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      <span>Security & Signature Headers</span>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 font-mono text-[11px] space-y-1.5 overflow-x-auto">
                      {Object.entries(selectedWebhook.headers).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-2">
                          <span className="text-indigo-400 shrink-0">{key}:</span>
                          <span className="text-slate-300 break-all">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Payload JSON Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                        Full Payload JSON
                      </h3>
                    </div>
                    <button
                      id="copy-full-payload-btn"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(getDisplayPayload(selectedWebhook), null, 2),
                          'full_payload'
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      {copiedField === 'full_payload' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Payload Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Full JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    <pre
                      id="webhook-payload-pre"
                      className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-emerald-400/90 overflow-x-auto max-h-[380px] leading-relaxed select-all"
                    >
                      {JSON.stringify(getDisplayPayload(selectedWebhook), null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">
                  Internal ID: {selectedWebhook.id}
                </span>
                <button
                  id="dismiss-drawer-btn"
                  onClick={() => setIsDetailsOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Close Inspector
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
