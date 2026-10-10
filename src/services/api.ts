import {
  Workspace,
  RecoveryMetrics,
  DashboardChartData,
  FunnelStage,
  FailureCategoryBreakdown,
  RecoveryOpportunity,
  Customer,
  CustomerTimelineEvent,
  Subscription,
  BillingIntervalType,
  CustomIntervalUnit,
  RecoveryCampaign,
  ProviderConnection,
  ProviderType,
  AuditLog,
  WebhookEventRecord,
  RevenueEvent,
  EmailMessage,
  PrioritizedQueueResponse,
  ExpansionQueueResponse,
  ChurnQueueResponse,
  RevenueBrainResponse,
  OpportunityIntelligenceRecord,
  ActionRecord,
  OutcomeRecord,
  AutopilotSettings,
  AutomationEventRecord,
  PolicyAuditEntry,
  PolicyEvaluationResult,
  AutonomousRecoveryWorkflow,
  AutonomousRetrySchedule,
  AutonomousRecoveryMetrics,
  RevenueMission,
  RevenueMissionMetrics,
  RevenueOperationsSummary,
  MissionStatus,
  MissionType,
  WorkspaceSubscription,
  WorkspaceTrialStatus,
  PlatformPlanDefinition,
  PlatformPlanTier,
  PlatformBillingCycle,
  ConnectorMeta,
  IngestionJob,
  IngestionSummary,
  SupportedCurrency,
  AuthoritativeSubscriptionData,
  BillingProfileData,
  PlatformInvoiceData,
} from '../types/index.js';
import { supabase } from '../lib/supabase.js';

let currentWorkspaceId: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem('recovery_os_workspace_id') : null;

export interface RetryPaymentResponse {
  success: boolean;
  message?: string;
  isRecovered?: boolean;
  recoveryLinkCreated?: boolean;
  paymentLinkUrl?: string;
  providerCheckoutId?: string;
  failureCode?: string;
  failureMessage?: string;
}

export const setGlobalWorkspaceId = (id: string | null) => {
  currentWorkspaceId = id;
  if (typeof localStorage !== 'undefined') {
    if (id) {
      localStorage.setItem('recovery_os_workspace_id', id);
    } else {
      localStorage.removeItem('recovery_os_workspace_id');
    }
  }
};

export const getGlobalWorkspaceId = () => currentWorkspaceId;

let activeAuthToken: string | null = null;

export const setActiveAuthToken = (token: string | null) => {
  activeAuthToken = token;
  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem('sb_auth_token', token);
      sessionStorage.setItem('sb_auth_token', token);
    } else {
      localStorage.removeItem('sb_auth_token');
      sessionStorage.removeItem('sb_auth_token');
    }
  }
};

export const getActiveAuthToken = () => {
  if (activeAuthToken) return activeAuthToken;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('sb_auth_token') || sessionStorage.getItem('sb_auth_token');
  }
  return null;
};

export async function getCurrentAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      setActiveAuthToken(data.session.access_token);
      return data.session.access_token;
    }
  } catch {}
  if (activeAuthToken) {
    return activeAuthToken;
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('sb_auth_token') || sessionStorage.getItem('sb_auth_token');
    if (stored) {
      activeAuthToken = stored;
      return stored;
    }
  }
  return null;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export const registerUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

async function fetchJson<T>(url: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  // Use current Supabase browser session as primary token source
  const token = await getCurrentAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  if (currentWorkspaceId) {
    headers['x-workspace-id'] = currentWorkspaceId;
  }

  const method = options.method || 'GET';
  console.log(`[API Outgoing Request] ${method} ${url} | Authorization: ${headers['Authorization'] ? 'Bearer ' + token?.slice(0, 15) + '...' + token?.slice(-8) : '(none)'}`);

  const res = await fetch(url, { ...options, headers });

  // Handle 401 Unauthorized with exactly ONE session refresh retry
  if (res.status === 401 && !isRetry && !url.includes('/api/auth/')) {
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.access_token) {
        return await fetchJson<T>(url, options, true);
      }
    } catch {}

    // Refresh failed or second 401: clear application state & show login
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
  }

  const text = await res.text();

  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText || 'Request failed'}`);
    }
    throw new Error(`Invalid JSON response received from ${url}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Workspaces
  getWorkspaces: (options?: { mode?: 'all' | 'production' | 'demo'; userId?: string; headers?: Record<string, string> }) => {
    const params = new URLSearchParams();
    if (options?.mode) params.set('mode', options.mode);
    if (options?.userId) params.set('userId', options.userId);
    const q = params.toString();
    return fetchJson<Workspace[]>(`/api/workspaces${q ? `?${q}` : ''}`, {
      headers: options?.headers,
    });
  },
  getCurrentWorkspace: () => fetchJson<Workspace>('/api/workspaces/current'),
  createWorkspace: (name: string, businessType: string, currency: string, isDemo = false) =>
    fetchJson<Workspace>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, businessType, currency, isDemo }),
    }),
  updateWorkspace: (id: string, data: Partial<Workspace>) =>
    fetchJson<Workspace>(`/api/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Metrics & Analytics
  getMetrics: () => fetchJson<RecoveryMetrics>('/api/metrics'),
  getDashboardCharts: () => fetchJson<DashboardChartData>('/api/metrics/charts'),
  getFunnel: () => fetchJson<FunnelStage[]>('/api/metrics/funnel'),
  getFailureBreakdown: () => fetchJson<FailureCategoryBreakdown[]>('/api/metrics/failure-breakdown'),
  getRevenueEvents: () => fetchJson<RevenueEvent[]>('/api/metrics/revenue-events'),

  // Opportunities
  getOpportunities: (filters?: { status?: string; provider?: string; category?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.provider) params.set('provider', filters.provider);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    return fetchJson<RecoveryOpportunity[]>(`/api/opportunities?${params.toString()}`);
  },
  runRevenueScanner: (options?: { dryRun?: boolean; categoryFilter?: string }) =>
    fetchJson<{
      workspaceId: string;
      scannedAt: string;
      totalRecordsAudited: number;
      newOpportunitiesCreated: number;
      existingOpportunitiesMaintained: number;
      totalAtRiskCents: number;
      totalRecoverableRevenueCents: number;
      riskSignalsCount: number;
      expansionOpportunityCents: number;
      currency: string;
      totalsByCurrency?: Record<string, { totalAtRiskCents: number; totalRecoverableRevenueCents: number; expansionOpportunityCents: number }>;
      vectors: Array<{
        vectorId: string;
        name: string;
        scannedCount: number;
        detectedCount: number;
        amountAtRiskCents: number;
        status: string;
        description: string;
        signalsUsed: string[];
      }>;
      createdOpportunities: RecoveryOpportunity[];
      methodology: {
        engineType: string;
        aiDisclosure: string;
        idempotent: boolean;
      };
    }>('/api/scanner/run', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  getScannerStatus: () =>
    fetchJson<{
      workspaceId: string;
      status: string;
      vectors: any[];
      totalRecordsAudited: number;
      totalAtRiskCents: number;
      totalRecoverableRevenueCents?: number;
      riskSignalsCount?: number;
      expansionOpportunityCents?: number;
      currency: string;
      totalsByCurrency?: Record<string, { totalAtRiskCents: number; totalRecoverableRevenueCents: number; expansionOpportunityCents: number }>;
      methodology: any;
    }>('/api/scanner/status'),

  // AI Opportunity Engine
  getIntelligenceQueue: (options?: { limit?: number; category?: string; ai?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.category && options.category !== 'all') params.set('category', options.category);
    if (options?.ai !== undefined) params.set('ai', String(options.ai));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<PrioritizedQueueResponse>(`/api/intelligence/queue${qs}`);
  },
  getOpportunityIntelligence: (opportunityId: string) =>
    fetchJson<OpportunityIntelligenceRecord>(`/api/intelligence/opportunities/${opportunityId}`),
  getIntelligenceSummary: () =>
    fetchJson<{
      workspaceId: string;
      totalPrioritized: number;
      totalAtRiskCents: number;
      totalExpectedValueCents: number;
      currency: string;
      topActions: Array<{
        opportunityId: string;
        customerName: string;
        amountCents: number;
        currency: string;
        priority: string;
        priorityScore: number;
        urgency: string;
        recommendedAction: string;
        recommendedActionLabel: string;
        reason: string;
      }>;
      summary: any;
    }>('/api/intelligence/summary'),
  recordOpportunityAction: (opportunityId: string, data: { actionType: string; channel?: string; notes?: string }) =>
    fetchJson<{ success: boolean; action: ActionRecord }>(`/api/intelligence/opportunities/${opportunityId}/action`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  recordOpportunityOutcome: (opportunityId: string, data: { outcome: string; recoveredAmountCents: number; timeToRecoverySeconds?: number; settlementMethod?: string; feedbackNotes?: string }) =>
    fetchJson<{ success: boolean; outcome: OutcomeRecord }>(`/api/intelligence/opportunities/${opportunityId}/outcome`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getRecoveryEffectiveness: (options?: { threshold?: number }) => {
    const params = new URLSearchParams();
    if (options?.threshold) params.set('threshold', options.threshold.toString());
    return fetchJson<any>(`/api/intelligence/recovery-effectiveness?${params.toString()}`);
  },

  getOpportunity: (id: string) => fetchJson<RecoveryOpportunity & { events: any[] }>(`/api/opportunities/${id}`),
  retryPayment: (id: string) =>
    fetchJson<RetryPaymentResponse>(`/api/opportunities/${id}/retry`, { method: 'POST' }),
  settlePayment: (id: string, method?: string) =>
    fetchJson<{ success: boolean; message: string }>(`/api/opportunities/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    }),
  sendRecoveryEmail: (id: string, subject: string, body: string) =>
    fetchJson<{ success: boolean; message: string }>(`/api/opportunities/${id}/email`, {
      method: 'POST',
      body: JSON.stringify({ subject, body }),
    }),
  pauseOpportunity: (id: string) =>
    fetchJson<{ success: boolean; message: string; opportunity?: RecoveryOpportunity }>(
      `/api/opportunities/${id}/pause`,
      { method: 'POST' }
    ),
  escalateOpportunity: (id: string, reason?: string) =>
    fetchJson<{ success: boolean; message: string; opportunity?: RecoveryOpportunity }>(
      `/api/opportunities/${id}/escalate`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),
  sendMagicLink: (id: string, channel: 'email' | 'sms' = 'email') =>
    fetchJson<{ success: boolean; message: string; payment_link_url: string }>(
      `/api/opportunities/${id}/magic-link`,
      { method: 'POST', body: JSON.stringify({ channel }) }
    ),

  // Hosted Recovery Pay Portal
  getPayPortalData: (token: string) =>
    fetchJson<{ opportunity: RecoveryOpportunity; workspace: { name: string; currency: string; portal_config?: any } }>(`/api/pay/${token}`),
  createPayPortalCheckout: (token: string, returnUrl?: string) =>
    fetchJson<{
      success: boolean;
      checkoutUrl?: string;
      expiresAt?: string;
      provider?: string;
      status: 'checkout_created' | 'already_recovered' | 'error';
      message?: string;
    }>(`/api/pay/${token}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    }),
  submitPayPortalPayment: (token: string, cardLast4?: string, cardBrand?: string) =>
    fetchJson<{ success: boolean; message: string }>(`/api/pay/${token}/submit`, {
      method: 'POST',
      body: JSON.stringify({ cardLast4, cardBrand }),
    }),

  // Customers
  getCustomers: () => fetchJson<Customer[]>('/api/customers'),
  getCustomerDetails: (id: string) =>
    fetchJson<{
      customer: Customer;
      subscriptions: Subscription[];
      invoices: any[];
      failures: any[];
      opportunities: RecoveryOpportunity[];
      emails: EmailMessage[];
      timeline: CustomerTimelineEvent[];
    }>(`/api/customers/${id}`),
  createCustomer: (data: {
    name: string;
    email: string;
    phone?: string;
    country?: string;
    currency?: string;
    provider_type: ProviderType;
    plan_name?: string;
    plan_amount_cents?: number;
    billing_interval?: BillingIntervalType;
    custom_interval_count?: number;
    custom_interval_unit?: CustomIntervalUnit;
    trial_days?: number;
    grace_period_days?: number;
  }) => fetchJson<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: Partial<Customer>) =>
    fetchJson<Customer>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/customers/${id}`, { method: 'DELETE' }),

  // Customer Timeline & Notes
  getCustomerTimeline: (customerId: string) =>
    fetchJson<CustomerTimelineEvent[]>(`/api/customers/${customerId}/timeline`),
  getAllTimelineEvents: (filters?: { customerId?: string; eventType?: string; gateway?: string }) => {
    const params = new URLSearchParams();
    if (filters?.customerId && filters.customerId !== 'all') params.set('customerId', filters.customerId);
    if (filters?.eventType && filters.eventType !== 'all') params.set('eventType', filters.eventType);
    if (filters?.gateway && filters.gateway !== 'all') params.set('gateway', filters.gateway);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<CustomerTimelineEvent[]>(`/api/timeline${query}`);
  },
  addCustomerNote: (customerId: string, note: string) =>
    fetchJson<CustomerTimelineEvent>(`/api/customers/${customerId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  // Subscriptions
  getSubscriptions: () => fetchJson<Subscription[]>('/api/subscriptions'),
  getSubscription: (id: string) => fetchJson<Subscription>(`/api/subscriptions/${id}`),
  updateSubscription: (id: string, data: Partial<Subscription>) =>
    fetchJson<Subscription>(`/api/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  cancelSubscription: (id: string) =>
    fetchJson<Subscription>(`/api/subscriptions/${id}/cancel`, { method: 'POST' }),

  // Manual Failed Payment Ingestion
  ingestFailedPayment: (data: {
    customerId: string;
    amountCents: number;
    currency?: string;
    providerFailureCode?: string;
    rawErrorMessage?: string;
    failureCategory?: string;
    planName?: string;
  }) => fetchJson<any>('/api/invoices/failed', { method: 'POST', body: JSON.stringify(data) }),

  // Campaigns
  getCampaigns: () => fetchJson<RecoveryCampaign[]>('/api/campaigns'),
  createCampaign: (data: Partial<RecoveryCampaign>) =>
    fetchJson<RecoveryCampaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id: string, data: Partial<RecoveryCampaign>) =>
    fetchJson<RecoveryCampaign>(`/api/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleCampaign: (id: string) =>
    fetchJson<RecoveryCampaign>(`/api/campaigns/${id}/toggle`, { method: 'POST' }),

  // Providers
  getProviders: () =>
    fetchJson<{ connections: ProviderConnection[]; supported: ProviderType[] }>('/api/providers'),
  connectProvider: (type: ProviderType, config: any) =>
    fetchJson<ProviderConnection>(`/api/providers/${type}/connect`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  disconnectProvider: (type: ProviderType) =>
    fetchJson<{ success: boolean }>(`/api/providers/${type}/disconnect`, { method: 'POST' }),
  syncProvider: (type: ProviderType) =>
    fetchJson<{
      success: boolean;
      partial?: boolean;
      provider?: ProviderType;
      syncedAt?: string;
      synced?: { customers: number; subscriptions: number; invoices: number; payments: number };
      errors?: Record<string, string>;
      message: string;
    }>(`/api/providers/${type}/sync`, {
      method: 'POST',
    }),

  // Autopilot Foundation & Recovery Automation
  getAutopilotSettings: () => fetchJson<AutopilotSettings>('/api/automation/settings'),
  updateAutopilotSettings: (settings: Partial<AutopilotSettings>) =>
    fetchJson<AutopilotSettings>('/api/automation/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  getAutomationEvents: () => fetchJson<AutomationEventRecord[]>('/api/automation/events'),
  getPolicyDecision: (opportunityId: string) =>
    fetchJson<PolicyEvaluationResult>(`/api/autopilot/policy-decision/${opportunityId}`),
  evaluatePolicy: (opportunityId: string) =>
    fetchJson<PolicyEvaluationResult>('/api/autopilot/policy-evaluate', {
      method: 'POST',
      body: JSON.stringify({ opportunityId }),
    }),
  getPolicyAuditLogs: (opportunityId?: string) =>
    fetchJson<PolicyAuditEntry[]>(`/api/autopilot/policy-audit-logs${opportunityId ? `?opportunityId=${opportunityId}` : ''}`),

  // Autonomous Recovery Engine (Phase 1)
  getAutonomousWorkflows: () => fetchJson<AutonomousRecoveryWorkflow[]>('/api/autopilot/workflows'),
  getAutonomousWorkflowById: (id: string) => fetchJson<AutonomousRecoveryWorkflow>(`/api/autopilot/workflows/${id}`),
  cancelAutonomousWorkflow: (id: string, reason?: string) =>
    fetchJson<AutonomousRecoveryWorkflow>(`/api/autopilot/workflows/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getAutonomousRetrySchedules: (workflowId?: string) =>
    fetchJson<AutonomousRetrySchedule[]>(`/api/autopilot/retry-schedules${workflowId ? `?workflowId=${workflowId}` : ''}`),
  getAutonomousRecoveryMetrics: () => fetchJson<AutonomousRecoveryMetrics>('/api/autopilot/metrics'),

  // Autonomous Recovery Dispatch Engine Methods
  getRecoveryDispatches: (params?: { workflowId?: string; opportunityId?: string; channel?: string; status?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetchJson<any[]>(`/api/autopilot/dispatches${query ? `?${query}` : ''}`);
  },
  getRecoveryDispatchById: (id: string) => fetchJson<any>(`/api/autopilot/dispatches/${id}`),
  dispatchAutonomousRecovery: (payload: { workflowId: string; channel?: string; customMessage?: string; customSubject?: string }) =>
    fetchJson<any>('/api/autopilot/dispatches/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  simulateDispatchResponse: (id: string, response: 'opened' | 'clicked') =>
    fetchJson<{ success: boolean; dispatch: any }>(`/api/autopilot/dispatches/${id}/response`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),
  cancelRecoveryDispatch: (id: string, reason?: string) =>
    fetchJson<{ success: boolean; dispatch: any }>(`/api/autopilot/dispatches/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getRecoveryAttributions: (params?: { workflowId?: string; opportunityId?: string; customerId?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetchJson<any[]>(`/api/autopilot/attributions${query ? `?${query}` : ''}`);
  },
  getDispatchMetrics: () => fetchJson<any>('/api/autopilot/dispatch-metrics'),
  triggerSmartRetry: (id: string) =>
    fetchJson<any>(`/api/opportunities/${id}/retry`, { method: 'POST' }),
  settleRecoveryPayment: (id: string, reason: string = 'Simulated autopilot recovery confirmation') =>
    fetchJson<any>(`/api/opportunities/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // CSV Ingestion
  validateCsv: (rows: any[], defaultCountry: string = 'US', mappings?: any) =>
    fetchJson<{
      validRows: any[];
      errors: Array<{
        rowNumber: number;
        name?: string;
        email?: string;
        phone?: string;
        amount?: number | string;
        currency?: string;
        field?: string;
        error: string;
      }>;
      duplicates: Array<{
        rowNumber: number;
        name?: string;
        email?: string;
        phone?: string;
        amount?: number | string;
        invoice_id?: string;
        reason: string;
      }>;
      totalCount: number;
      validCount: number;
      errorCount: number;
      duplicateCount: number;
    }>('/api/import/csv/validate', {
      method: 'POST',
      body: JSON.stringify({ rows, defaultCountry, mappings }),
    }),
  importCsv: (rows: any[], defaultCountry: string = 'US', mappings?: any) =>
    fetchJson<{
      success: boolean;
      totalCount: number;
      importedCount: number;
      failureCount: number;
      failedCount: number;
      duplicateCount: number;
      duplicatesCount: number;
      rejectedCount?: number;
      errors?: Array<{
        rowNumber: number;
        name?: string;
        email?: string;
        phone?: string;
        amount?: number | string;
        currency?: string;
        field?: string;
        error: string;
      }>;
      duplicates?: Array<{
        rowNumber: number;
        name?: string;
        email?: string;
        invoice_id?: string;
        reason: string;
      }>;
    }>('/api/import/csv', {
      method: 'POST',
      body: JSON.stringify({ rows, defaultCountry, mappings }),
    }),

  // Simulation & Debug
  simulateWebhook: (payload: { provider: string; eventType: string; amount?: number; email?: string }) =>
    fetchJson<{ success: boolean; eventId: string; message: string }>('/api/webhooks/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Logs
  getAuditLogs: () => fetchJson<AuditLog[]>('/api/audit-logs'),
  getWebhookLogs: () => fetchJson<WebhookEventRecord[]>('/api/webhook-logs'),
  getWebhookLogById: (id: string) => fetchJson<WebhookEventRecord>(`/api/webhook-logs/${id}`),
  getEmailLogs: () => fetchJson<EmailMessage[]>('/api/email/logs'),

  // Enterprise Security & Secret Rotation
  rotateProviderSecret: (type: ProviderType, secondarySecret: string) =>
    fetchJson<{ success: boolean; message: string }>(`/api/providers/${type}/rotate-secret`, {
      method: 'POST',
      body: JSON.stringify({ secondarySecret }),
    }),
  testProviderConnection: (type: ProviderType) =>
    fetchJson<{ success: boolean; accountId?: string; error?: string; message: string }>(`/api/providers/${type}/test`, {
      method: 'POST',
    }),

  // Team Members
  getMembers: () =>
    fetchJson<
      Array<{
        id: string;
        userId: string;
        name: string;
        email: string;
        role: string;
        mfaEnabled: boolean;
        lastActive: string;
      }>
    >('/api/members'),
  inviteMember: (name: string, email: string, role: string) =>
    fetchJson<{
      id: string;
      userId: string;
      name: string;
      email: string;
      role: string;
      mfaEnabled: boolean;
      lastActive: string;
    }>('/api/members/invite', {
      method: 'POST',
      body: JSON.stringify({ name, email, role }),
    }),
  removeMember: (memberId: string) =>
    fetchJson<{ success: boolean; message?: string }>(`/api/members/${memberId}`, {
      method: 'DELETE',
    }),

  // Privacy & GDPR Right to Erasure
  executeGdprErasure: (email: string) =>
    fetchJson<{ success: boolean; count: number; message: string }>('/api/privacy/gdpr-erasure', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Subscription Billing Tier
  updateBillingPlan: (planTier: string, billingInterval: string, cardLast4?: string) =>
    fetchJson<Workspace>('/api/billing/plan', {
      method: 'POST',
      body: JSON.stringify({ planTier, billingInterval, cardLast4 }),
    }),

  // Intelligence
  getExpansionQueue: (params?: { limit?: number }) => {
    const query = params?.limit ? `?limit=${params.limit}` : '';
    return fetchJson<ExpansionQueueResponse>(`/api/intelligence/expansion${query}`);
  },
  getChurnQueue: (params?: { category?: string; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetchJson<ChurnQueueResponse>(`/api/intelligence/churn${query ? `?${query}` : ''}`);
  },
  getRevenueBrain: (params?: { category?: string; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetchJson<RevenueBrainResponse>(`/api/intelligence/revenue-brain${query ? `?${query}` : ''}`);
  },

  // Recovery Copilot
  getCopilotPlan: (opportunityId: string) => fetchJson<any>(`/api/copilot/plan/${opportunityId}`),
  approveCopilotPlan: (opportunityId: string) =>
    fetchJson<any>('/api/copilot/approve', {
      method: 'POST',
      body: JSON.stringify({ opportunityId }),
    }),
  rejectCopilotPlan: (opportunityId: string, reason?: string) =>
    fetchJson<any>('/api/copilot/reject', {
      method: 'POST',
      body: JSON.stringify({ opportunityId, reason }),
    }),
  executeCopilotStep: (opportunityId: string, stepId: string) =>
    fetchJson<any>('/api/copilot/execute', {
      method: 'POST',
      body: JSON.stringify({ opportunityId, stepId }),
    }),
  executeCopilotWorkflow: (opportunityId: string) =>
    fetchJson<any>('/api/copilot/execute-workflow', {
      method: 'POST',
      body: JSON.stringify({ opportunityId }),
    }),
  getCopilotLogs: (opportunityId: string) => fetchJson<any[]>(`/api/copilot/logs/${opportunityId}`),

  // Demo & Reset
  loadDemoWorkspace: (options?: { workspaceId?: string; workspaceName?: string }) =>
    fetchJson<{
      success: boolean;
      message: string;
      workspace: Workspace;
      totalCustomers: number;
      totalFailures: number;
      totalRecoveries: number;
      totalVips: number;
      totalEnterprise: number;
      totalFraud: number;
      totalChargebacks: number;
    }>('/api/demo/load', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  resetDemoData: () => fetchJson<{ success: boolean; message: string }>('/api/demo/reset', { method: 'POST' }),

  // Revenue Missions (Outcome-First Operating System)
  getMissions: (params?: { type?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.type && params.type !== 'ALL') q.set('type', params.type);
    if (params?.status && params.status !== 'ALL') q.set('status', params.status);
    const qs = q.toString();
    return fetchJson<RevenueMission[]>(`/api/missions${qs ? `?${qs}` : ''}`);
  },
  getMissionById: (id: string) => fetchJson<RevenueMission>(`/api/missions/${id}`),
  executeMissionAction: (id: string, action: string) =>
    fetchJson<RevenueMission>(`/api/missions/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  transitionMissionStatus: (id: string, status: MissionStatus, note?: string) =>
    fetchJson<RevenueMission>(`/api/missions/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
  getMissionMetrics: (threshold?: number) =>
    fetchJson<RevenueMissionMetrics>(`/api/missions/metrics${threshold ? `?threshold=${threshold}` : ''}`),
  getRevenueOperationsSummary: () =>
    fetchJson<RevenueOperationsSummary>('/api/missions/operations-summary'),

  // Revenue Operating System V2 (Health, Expansion, Orchestrator)
  getCustomerHealth: () =>
    fetchJson<{ workspaceId: string; summary: any; profiles: any[] }>('/api/customer-health'),
  getCustomerHealthById: (customerId: string) =>
    fetchJson<any>(`/api/customer-health/${customerId}`),
  getExpansionPlaybooks: () =>
    fetchJson<{ workspaceId: string; opportunities: any[] }>('/api/expansion-playbooks'),
  executeExpansionPlaybook: (id: string) =>
    fetchJson<{ success: boolean; message: string; opportunity?: any }>(`/api/expansion-playbooks/${id}/action`, {
      method: 'POST',
    }),
  getRevenueOrchestratorState: () =>
    fetchJson<any>('/api/revenue-orchestrator'),
  executeOrchestratorAction: (actionId: string) =>
    fetchJson<{ success: boolean; message: string }>('/api/revenue-orchestrator/execute', {
      method: 'POST',
      body: JSON.stringify({ actionId }),
    }),

  // Customer Import Wizard (Production Phase)
  uploadCsvForImport: (csvText: string, fileName?: string) =>
    fetchJson<{
      fileName: string;
      headers: string[];
      rows: Array<Record<string, any>>;
      totalRows: number;
      suggestedMapping: any;
      initialValidation: any;
    }>('/api/import/upload', {
      method: 'POST',
      body: JSON.stringify({ csvText, fileName }),
    }),

  validateImport: (data: { rows?: any[]; mapping?: any; csvText?: string }) =>
    fetchJson<any>('/api/import/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  executeImport: (data: {
    rows?: any[];
    mapping?: any;
    fileName?: string;
    deduplicationMode?: 'merge' | 'skip';
    csvText?: string;
  }) =>
    fetchJson<any>('/api/import/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getImportHistory: () =>
    fetchJson<{ workspaceId: string; history: any[] }>('/api/import/history'),

  getImportTemplates: () =>
    fetchJson<{ templates: any[] }>('/api/import/templates'),

  // ==========================================
  // REAL AUTHORITATIVE BILLING V2 (RAZORPAY)
  // ==========================================
  getBillingPricing: (params?: { currency?: SupportedCurrency; country?: string }) => {
    const q = new URLSearchParams();
    if (params?.currency) q.set('currency', params.currency);
    if (params?.country) q.set('country', params.country);
    return fetchJson<{
      currency: SupportedCurrency;
      currencyMetadata: { symbol: string; name: string; countryCode: string };
      plans: PlatformPlanDefinition[];
      foundingCustomerProgram: {
        maxSpots: number;
        claimedSpots: number;
        remainingSpots: number;
        lockedPriceFormatted: string;
        badge: string;
      };
    }>(`/api/billing/pricing?${q.toString()}`);
  },

  getBillingSubscription: () =>
    fetchJson<{
      success: boolean;
      subscription: AuthoritativeSubscriptionData;
      trialStatus: WorkspaceTrialStatus;
      billingProfile: BillingProfileData;
      foundingCustomerInfo: {
        totalClaimed: number;
        remainingSpots: number;
        isWorkspaceFounding: boolean;
      };
    }>('/api/billing/subscription'),

  createBillingSubscriptionOrder: (data: {
    planTier: PlatformPlanTier;
    billingCycle: PlatformBillingCycle;
    currency: SupportedCurrency;
    customerPhone?: string;
    customerName?: string;
    customerEmail?: string;
  }) =>
    fetchJson<{
      success: boolean;
      subscriptionId: string;
      keyId: string;
      planTier: PlatformPlanTier;
      billingCycle: PlatformBillingCycle;
      currency: SupportedCurrency;
      amountSubunit: number;
      taxableAmountSubunit: number;
      taxAmountSubunit: number;
      shortUrl?: string;
    }>('/api/billing/create-subscription', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyBillingCheckout: (data: {
    razorpayPaymentId: string;
    razorpaySubscriptionId?: string;
    razorpayOrderId?: string;
    razorpaySignature: string;
    planTier: PlatformPlanTier;
    billingCycle: PlatformBillingCycle;
    currency: SupportedCurrency;
    cardLast4?: string;
    cardNetwork?: string;
  }) =>
    fetchJson<{
      success: boolean;
      message: string;
      subscription: AuthoritativeSubscriptionData;
      invoice: PlatformInvoiceData;
    }>('/api/billing/verify-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  changeBillingPlan: (planTier: PlatformPlanTier) =>
    fetchJson<{ success: boolean; subscription: AuthoritativeSubscriptionData }>('/api/billing/change-plan', {
      method: 'POST',
      body: JSON.stringify({ planTier }),
    }),

  cancelBillingSubscription: (immediate: boolean = false) =>
    fetchJson<{ success: boolean; message: string; subscription: AuthoritativeSubscriptionData }>('/api/billing/cancel-subscription', {
      method: 'POST',
      body: JSON.stringify({ immediate }),
    }),

  reactivateBillingSubscription: () =>
    fetchJson<{ success: boolean; message: string; subscription: AuthoritativeSubscriptionData }>('/api/billing/reactivate-subscription', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getBillingCustomerPortal: () =>
    fetchJson<{ success: boolean; url: string }>('/api/billing/customer-portal', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getBillingInvoices: () =>
    fetchJson<{ success: boolean; invoices: PlatformInvoiceData[] }>('/api/billing/invoices'),

  getBillingProfile: () =>
    fetchJson<{ success: boolean; profile: BillingProfileData }>('/api/billing/profile'),

  updateBillingProfile: (profile: Partial<BillingProfileData>) =>
    fetchJson<{ success: boolean; profile: BillingProfileData; gstinValid: boolean }>('/api/billing/profile', {
      method: 'POST',
      body: JSON.stringify(profile),
    }),

  getBillingPaymentMethods: () =>
    fetchJson<{ success: boolean; methods: any[] }>('/api/billing/payment-methods'),

  removeBillingPaymentMethod: (id: string) =>
    fetchJson<{ success: boolean }>('/api/billing/payment-methods/' + id, {
      method: 'DELETE',
    }),

  // ==========================================
  // PLATFORM BILLING & TRIAL GATEKEEPER
  // ==========================================
  getPlatformPricing: () =>
    fetchJson<{
      plans: PlatformPlanDefinition[];
      foundingCustomerProgram: {
        maxSpots: number;
        claimedSpots: number;
        remainingSpots: number;
        priceRupees: number;
        badge: string;
      };
    }>('/api/platform/pricing'),

  getPlatformSubscription: () =>
    fetchJson<{
      subscription: WorkspaceSubscription;
      trialStatus: WorkspaceTrialStatus;
      plans: PlatformPlanDefinition[];
      foundingCustomerInfo: {
        totalClaimed: number;
        remainingSpots: number;
        isWorkspaceFounding: boolean;
      };
    }>('/api/platform/subscription'),

  getPlatformPlans: () =>
    fetchJson<any>('/api/platform/pricing').then((res) => res.plans),

  getSystemHealth: () => fetchJson<any>('/api/system/health'),
  getSystemErrors: (severity: string) => fetchJson<any>(`/api/system/errors?severity=${severity}`),

  createPlatformCheckoutSession: (data: {
    planTier: PlatformPlanTier;
    billingCycle: PlatformBillingCycle;
    successUrl?: string;
    cancelUrl?: string;
  }) =>
    fetchJson<{
      sessionId: string;
      checkoutUrl: string;
      planTier: PlatformPlanTier;
      billingCycle: PlatformBillingCycle;
      amountPaise: number;
      currency: string;
    }>('/api/platform/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createPlatformBillingPortalSession: (data?: { returnUrl?: string }) =>
    fetchJson<{ url: string }>('/api/platform/billing-portal', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  upgradePlatformPlan: (data: {
    planTier: PlatformPlanTier;
    billingCycle: PlatformBillingCycle;
    cardLast4?: string;
  }) =>
    fetchJson<{
      success: boolean;
      message: string;
      subscription: WorkspaceSubscription;
      trialStatus: WorkspaceTrialStatus;
    }>('/api/platform/upgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  downgradePlatformPlan: (data: {
    planTier: PlatformPlanTier;
  }) =>
    fetchJson<{
      success: boolean;
      message: string;
      subscription: WorkspaceSubscription;
      trialStatus: WorkspaceTrialStatus;
    }>('/api/platform/downgrade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancelPlatformSubscription: (immediate: boolean = false) =>
    fetchJson<{
      success: boolean;
      message: string;
      subscription: WorkspaceSubscription;
      trialStatus: WorkspaceTrialStatus;
    }>('/api/platform/cancel', {
      method: 'POST',
      body: JSON.stringify({ immediate }),
    }),

  reactivatePlatformSubscription: () =>
    fetchJson<{
      success: boolean;
      message: string;
      subscription: WorkspaceSubscription;
      trialStatus: WorkspaceTrialStatus;
    }>('/api/platform/reactivate', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getPlatformAnalytics: () =>
    fetchJson<{
      success: boolean;
      analytics: {
        totalActiveSubscriptions: number;
        totalTrialSubscriptions: number;
        foundingCustomerCount: number;
        remainingFoundingSpots: number;
        mrrPaise: number;
        mrrRupees: number;
        arrRupees: number;
        trialConversionRate: number;
        churnRateMonthly: number;
      };
    }>('/api/platform/analytics'),

  getStripeConnectUrl: () => fetchJson<{ url: string }>('/api/auth/stripe/connect'),
  getRazorpayConnectUrl: () => fetchJson<{ url: string }>('/api/auth/razorpay/connect'),

  getDomainVerification: (domain: string) =>
    fetchJson<any>(`/api/system/domain-verification?domain=${encodeURIComponent(domain)}`),
  verifyDomain: (domain: string) =>
    fetchJson<any>('/api/system/domain-verification', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),

  getWhatsAppTemplates: () => fetchJson<{ templates: any[] }>('/api/whatsapp/templates'),
  sendTestWhatsApp: (data: any) =>
    fetchJson<any>('/api/whatsapp/send-test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Universal Revenue Data Ingestion Framework
  getIngestionConnectors: () => fetchJson<{ connectors: ConnectorMeta[] }>('/api/ingestion/connectors'),
  getIngestionConnector: (id: string) => fetchJson<{ connector: ConnectorMeta }>(`/api/ingestion/connectors/${id}`),
  testIngestionConnector: (id: string, config: any) =>
    fetchJson<any>(`/api/ingestion/connectors/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),
  executeIngestion: (id: string, config: any, customData?: any) =>
    fetchJson<any>(`/api/ingestion/connectors/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify({ config, customData }),
    }),
  getIngestionJobs: () => fetchJson<{ jobs: IngestionJob[] }>('/api/ingestion/jobs'),
  getIngestionSummary: () => fetchJson<IngestionSummary>('/api/ingestion/summary'),
  injectSampleData: (id: string) =>
    fetchJson<any>(`/api/ingestion/sample-data/${id}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};
