import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient, getSupabaseUserClient, getSupabaseUrl, isSupabaseConfigured, DatabaseStatus } from './supabaseClient.js';
import { getStorageMode, isSupabaseAuthoritative } from './storageMode.js';
import { db } from '../store/db.js';
import { encryptSecret, decryptSecret, redactSensitiveData } from '../security/encryption.js';
import { validateCsvRowsAuthoritative } from '../validation/csvValidator.js';
import {
  Workspace,
  User,
  Membership,
  UserRole,
  Customer,
  Subscription,
  Invoice,
  Payment,
  PaymentFailure,
  RecoveryCampaign,
  RecoveryStep,
  RecoveryOpportunity,
  RecoveryEvent,
  CustomerTimelineEvent,
  RevenueEvent,
  WebhookEventRecord,
  AuditLog,
  ProviderConnection,
  ProviderType,
  RecoveryMetrics,
  DashboardChartData,
  FunnelStage,
  FailureCategoryBreakdown,
} from '../../src/types/index.js';
import { PaymentProviderFactory } from '../providers/factory.js';
import { calculateCanonicalFinancials } from '../scanner/canonicalFinancials.js';
import { generateCompleteDemoWorkspace } from '../store/demo_generator.js';
import {
  calculateMonthlyEquivalent,
  calculateAnnualEquivalent,
} from '../../src/utils/subscription.js';

export class SupabaseUnavailableError extends Error {
  statusCode = 503;
  storageMode = 'supabase_production';
  constructor(message = 'Supabase production database is unavailable or not configured.') {
    super(message);
    this.name = 'SupabaseUnavailableError';
  }
}

function getClient(): SupabaseClient {
  const client = getSupabaseServerClient();
  if (!client) {
    throw new SupabaseUnavailableError(
      'Supabase server client could not be initialized. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }
  return client;
}

/**
 * Authoritative Server Profile Synchronization
 *
 * Requirements (P0 — 1):
 * - Accepts ONLY a trusted Supabase Auth user object directly from:
 *   supabase.auth.signInWithPassword(), supabase.auth.signUp(), or supabase.auth.getUser()
 * - Uses authUser.id, authUser.email, authUser.user_metadata.full_name
 * - Does NOT accept arbitrary browser-supplied userId, role, workspaceId, ownerUserId
 * - Uses getSupabaseServerClient() with SUPABASE_SERVICE_ROLE_KEY
 * - Verifies SUPABASE_SERVICE_ROLE_KEY is actually used (never anon key)
 */
export async function ensureUserProfileFromAuthUser(authUser: any): Promise<User> {
  if (!authUser || typeof authUser !== 'object' || !authUser.id || typeof authUser.id !== 'string') {
    throw new Error('A valid authenticated Supabase Auth user object is required.');
  }

  const fullName =
    authUser.user_metadata?.full_name ||
    authUser.raw_user_meta_data?.full_name ||
    (authUser.email ? authUser.email.split('@')[0] : 'Workspace User');

  const email = authUser.email || `${authUser.id}@user.recoveryos.internal`;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.includes('placeholder')) {
    throw new SupabaseUnavailableError('SUPABASE_SERVICE_ROLE_KEY is required for server profile synchronization.');
  }

  const anonEnvKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (anonEnvKey && serviceRoleKey === anonEnvKey) {
    throw new Error('Server profile synchronization cannot use anon key. SUPABASE_SERVICE_ROLE_KEY is required.');
  }

  const client = getSupabaseServerClient();
  if (!client) {
    throw new SupabaseUnavailableError('Supabase server client unavailable');
  }

  const profileData = {
    id: authUser.id,
    email,
    full_name: fullName,
  };

  try {
    const { data, error } = await client
      .from('users')
      .upsert(profileData, { onConflict: 'id' })
      .select('*')
      .single();

    if (!error && data) {
      return data as User;
    }

    if (error) {
      if (
        error.message?.includes('row-level security') ||
        error.message?.includes('violates row-level security') ||
        error.message?.includes('schema cache') ||
        error.message?.includes('column') ||
        error.message?.includes('permission denied')
      ) {
        try {
          const { data: existing } = await client.from('users').select('*').eq('id', authUser.id).maybeSingle();
          if (existing && existing.id) {
            return existing as User;
          }
        } catch {}

        return {
          ...profileData,
          created_at: new Date().toISOString(),
        } as User;
      }

      console.error('[Server Profile Sync] Error synchronizing user profile:', error.message);
      throw error;
    }
  } catch (err: any) {
    if (
      err.message?.includes('row-level security') ||
      err.message?.includes('violates row-level security') ||
      err.message?.includes('schema cache') ||
      err.message?.includes('column') ||
      err.message?.includes('permission denied')
    ) {
      return {
        ...profileData,
        created_at: new Date().toISOString(),
      } as User;
    }
    throw err;
  }

  return {
    ...profileData,
    created_at: new Date().toISOString(),
  } as User;
}

export const supabaseService = {
  async ensureUserProfileFromAuthUser(authUser: any): Promise<User> {
    return ensureUserProfileFromAuthUser(authUser);
  },
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    const client = getSupabaseServerClient();
    if (!client) {
      return {
        connected: false,
        error: 'Supabase credentials not configured or invalid.',
      };
    }
    try {
      const { error } = await client.from('workspaces').select('id', { count: 'exact', head: true });
      if (error) {
        return { connected: false, error: error.message };
      }
      return { connected: true };
    } catch (err: any) {
      return { connected: false, error: err.message || 'Connection failed' };
    }
  },

  async getTableCounts(): Promise<Record<string, number>> {
    const client = getSupabaseServerClient();
    if (!client) {
      throw new SupabaseUnavailableError('Supabase client is not configured');
    }

    const tables = [
      'workspaces',
      'users',
      'memberships',
      'provider_connections',
      'customers',
      'subscriptions',
      'invoices',
      'payments',
      'payment_failures',
      'recovery_campaigns',
      'recovery_steps',
      'recovery_opportunities',
      'recovery_events',
      'customer_timeline_events',
      'revenue_events',
      'webhook_events',
      'audit_logs',
    ];

    const counts: Record<string, number> = {};
    await Promise.all(
      tables.map(async (table) => {
        const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
        if (error) {
          throw new Error(`Failed to query table count for "${table}": ${error.message}`);
        }
        counts[table] = count ?? 0;
      })
    );
    return counts;
  },

  // ====================================================================
  // 1. WORKSPACES
  // ====================================================================
  async getWorkspaces(userId?: string): Promise<Workspace[]> {
    const client = getClient();
    let query = client.from('workspaces').select('*').order('created_at', { ascending: false });

    if (userId) {
      const { data: memberWs, error: memberErr } = await client
        .from('memberships')
        .select('workspace_id')
        .eq('user_id', userId);
      if (memberErr) throw memberErr;
      const ids = (memberWs || []).map((m) => m.workspace_id);
      if (ids.length === 0) return [];
      query = query.in('id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Workspace[];
  },

  async getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
    const client = getClient();
    const { data, error } = await client.from('workspaces').select('*').eq('id', workspaceId).maybeSingle();
    if (error) throw error;
    return (data as Workspace) || null;
  },

  async createWorkspace(
    name: string,
    businessType: string = 'saas',
    currency: string = 'USD',
    isDemo: boolean = false,
    ownerUserId?: string,
    ownerUserEmail?: string,
    ownerUserName?: string
  ): Promise<Workspace> {
    const client = getClient();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    const newWs: Partial<Workspace> = {
      name,
      slug,
      business_type: businessType as any,
      currency,
      is_demo: isDemo,
      timezone: 'UTC',
      recovery_rules: {
        max_retry_attempts: 4,
        retry_interval_hours: 48,
        grace_period_days: 7,
        auto_cancel_subscription: false,
        send_dunning_emails: true,
        smart_retry_enabled: true,
      } as any,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('workspaces').insert(newWs).select('*').single();
    if (error) throw error;
    const created = data as Workspace;

    // If an owner user is specified, create membership atomically
    if (ownerUserId) {
      try {
        const { error: memErr } = await client.from('memberships').insert({
          workspace_id: created.id,
          user_id: ownerUserId,
          role: 'owner',
          created_at: new Date().toISOString(),
        });
        if (memErr) throw memErr;
      } catch (err: any) {
        // Rollback created workspace on membership failure to guarantee atomicity (P0 - 16)
        console.error('[Workspace Creation] Membership creation failed, rolling back workspace:', err?.message || err);
        await client.from('workspaces').delete().eq('id', created.id);
        throw err;
      }
    }

    return created;
  },

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<Workspace | null> {
    const client = getClient();
    const { data, error } = await client
      .from('workspaces')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', workspaceId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as Workspace) || null;
  },

  async updateWorkspaceBillingPlan(
    workspaceId: string,
    planTier: 'starter' | 'growth' | 'enterprise',
    billingInterval: 'monthly' | 'annual',
    cardLast4?: string
  ): Promise<Workspace | null> {
    const client = getClient();
    const baseFees = {
      starter: billingInterval === 'annual' ? 7900 : 9900,
      growth: billingInterval === 'annual' ? 23900 : 29900,
      enterprise: billingInterval === 'annual' ? 71900 : 89900,
    };
    const successFees = {
      starter: 5,
      growth: 3,
      enterprise: 1.5,
    };
    const caps = {
      starter: 2500000,
      growth: 10000000,
      enterprise: 50000000,
    };

    const subscriptionPlan = {
      plan_tier: planTier,
      billing_interval: billingInterval,
      monthly_base_fee_cents: baseFees[planTier],
      success_fee_percent: successFees[planTier],
      monthly_recovery_cap_cents: caps[planTier],
      current_month_recovered_cents: 0,
      next_billing_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
      card_last4: cardLast4 || null,
      card_brand: cardLast4 ? 'Card' : null,
    };

    const { data, error } = await client
      .from('workspaces')
      .update({
        subscription_plan: subscriptionPlan,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspaceId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    await this.recordAuditLog(workspaceId, {
      action: 'WORKSPACE_BILLING_PLAN_UPDATED',
      resource_type: 'workspace',
      resource_id: workspaceId,
      metadata: { plan_tier: planTier, billing_interval: billingInterval, card_last4: cardLast4 },
    });

    return data as Workspace;
  },

  // ====================================================================
  // 2. USERS & MEMBERSHIPS
  // ====================================================================
  async getUserById(userId: string): Promise<User | null> {
    const client = getClient();
    const { data, error } = await client.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return (data as User) || null;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    const client = getClient();
    const { data, error } = await client.from('users').select('*').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (error) throw error;
    return (data as User) || null;
  },

  /**
   * Internal / Administrative profile sync utility.
   * Strictly for privileged server-side maintenance; never called in normal customer auth flows.
   */
  async createUser(user: { id?: string; email: string; full_name?: string; avatar_url?: string }): Promise<User> {
    const client = getClient();
    const { data, error } = await client
      .from('users')
      .upsert({
        id: user.id,
        email: user.email.toLowerCase().trim(),
        full_name: user.full_name || user.email.split('@')[0],
        avatar_url: user.avatar_url || null,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as User;
  },

  async getMembership(workspaceId: string, userId: string): Promise<Membership | null> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .select('*, user:users(*)')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as Membership) || null;
  },

  async getMembershipById(workspaceId: string, membershipId: string): Promise<Membership | null> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .select('*, user:users(*)')
      .eq('id', membershipId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    return (data as Membership) || null;
  },

  async getMemberships(workspaceId: string): Promise<Membership[]> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .select('*, user:users(*)')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return (data || []) as Membership[];
  },

  async getUserMemberships(userId: string): Promise<Membership[]> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .select('*, workspace:workspaces(*)')
      .eq('user_id', userId);
    if (error) throw error;
    return (data || []) as Membership[];
  },

  async addMembership(workspaceId: string, userId: string, role: UserRole = 'member'): Promise<Membership> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .upsert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        created_at: new Date().toISOString(),
      })
      .select('*, user:users(*)')
      .single();
    if (error) throw error;
    return data as Membership;
  },

  async updateMembershipRole(workspaceId: string, membershipId: string, role: UserRole): Promise<Membership | null> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .update({ role })
      .eq('id', membershipId)
      .eq('workspace_id', workspaceId)
      .select('*, user:users(*)')
      .maybeSingle();
    if (error) throw error;
    return (data as Membership) || null;
  },

  // ====================================================================
  // 3. PROVIDER CONNECTIONS (Securely Stored & Sanitized)
  // ====================================================================
  async getProviderConnections(workspaceId: string): Promise<ProviderConnection[]> {
    const client = getClient();
    const { data, error } = await client.from('provider_connections').select('*').eq('workspace_id', workspaceId);
    if (error) throw error;

    const supported = PaymentProviderFactory.getSupportedProviders();
    const connections: ProviderConnection[] = [];

    for (const prov of supported) {
      const row = (data || []).find((c: any) => c.provider_type === prov);
      const adapter = PaymentProviderFactory.getAdapter(prov);

      if (row) {
        connections.push({
          id: row.id,
          workspace_id: workspaceId,
          provider_type: row.provider_type,
          status: row.status,
          is_live: row.is_live,
          last_sync_at: row.last_sync_at,
          last_error: row.last_error,
          capabilities: adapter.capabilities,
          config_summary: {
            account_id: row.metadata?.account_id || row.metadata?.razorpay_account_id,
            webhook_url: `/api/webhooks/${row.provider_type}`,
            has_api_key: Boolean(row.api_key_encrypted),
            has_webhook_secret: Boolean(row.webhook_secret_encrypted),
            has_secondary_webhook_secret: Boolean(row.secondary_webhook_secret_encrypted),
            secondary_webhook_secret_expires_at: row.secondary_webhook_secret_expires_at,
            auth_type: row.metadata?.auth_type || 'api_key',
            is_oauth: row.metadata?.auth_type === 'oauth',
            auto_webhooks_provisioned: Boolean(row.metadata?.auto_webhooks_provisioned),
          },
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      } else {
        connections.push({
          id: `conn_${prov}_unconnected`,
          workspace_id: workspaceId,
          provider_type: prov,
          status: 'disconnected',
          is_live: false,
          capabilities: adapter.capabilities,
          config_summary: {
            webhook_url: `/api/webhooks/${prov}`,
            has_api_key: false,
            has_webhook_secret: false,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    return connections;
  },

  async updateProviderConnection(
    workspaceId: string,
    providerType: ProviderType,
    config: { apiKey?: string; apiSecret?: string; webhookSecret?: string; webhook_secret?: string; isLive?: boolean; last_sync_at?: string }
  ): Promise<ProviderConnection> {
    const client = getClient();
    const effectiveWebhookSecret = config.webhookSecret || config.webhook_secret;

    // 1. Fetch existing connection to preserve unsupplied/masked secrets
    const { data: existing, error: fetchErr } = await client
      .from('provider_connections')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType)
      .maybeSingle();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
      throw fetchErr;
    }

    const existingApiKey = existing?.api_key_encrypted ? decryptSecret(existing.api_key_encrypted) : '';
    const existingApiSecret = existing?.api_secret_encrypted ? decryptSecret(existing.api_secret_encrypted) : '';
    const existingWebhookSecret = existing?.webhook_secret_encrypted ? decryptSecret(existing.webhook_secret_encrypted) : '';

    const hasNewApiKey = Boolean(config.apiKey && config.apiKey.trim() && !config.apiKey.includes('••••'));
    const hasNewApiSecret = Boolean(config.apiSecret && config.apiSecret.trim() && !config.apiSecret.includes('••••'));
    const hasNewWebhookSecret = Boolean(effectiveWebhookSecret && effectiveWebhookSecret.trim() && !effectiveWebhookSecret.includes('••••'));

    const effectiveApiKey = hasNewApiKey ? config.apiKey!.trim() : existingApiKey;
    const effectiveApiSecret = hasNewApiSecret ? config.apiSecret!.trim() : existingApiSecret;
    const effectiveWebhook = hasNewWebhookSecret ? effectiveWebhookSecret!.trim() : existingWebhookSecret;

    // 2. Validate connection BEFORE writing or modifying any credentials in the DB
    const adapter = PaymentProviderFactory.getAdapter(providerType);
    const validation = await adapter.validateConnection({
      apiKey: effectiveApiKey,
      apiSecret: effectiveApiSecret,
      webhookSecret: effectiveWebhook,
    });

    if (!validation.valid) {
      throw new Error(validation.error || 'Provider credential validation failed.');
    }

    const status = validation.valid ? 'connected' : 'error';

    const isLiveDetected = config.isLive !== undefined
      ? config.isLive
      : (effectiveApiKey
          ? effectiveApiKey.startsWith('rzp_live_') || effectiveApiKey.startsWith('sk_live_') || effectiveApiKey.startsWith('live_') || (!effectiveApiKey.includes('test') && !effectiveApiKey.includes('rzp_test') && !effectiveApiKey.includes('sb_') && !effectiveApiKey.includes('placeholder'))
          : (existing?.is_live ?? false));

    const accountIdResolved = validation.accountId || (validation.valid ? `verified_${providerType}_account` : 'sandbox_unverified');

    const finalApiKeyEncrypted = hasNewApiKey ? encryptSecret(config.apiKey!.trim()) : (existing?.api_key_encrypted || null);
    const finalApiSecretEncrypted = hasNewApiSecret ? encryptSecret(config.apiSecret!.trim()) : (existing?.api_secret_encrypted || null);
    const finalWebhookSecretEncrypted = hasNewWebhookSecret ? encryptSecret(effectiveWebhookSecret!.trim()) : (existing?.webhook_secret_encrypted || null);

    const { data, error } = await client
      .from('provider_connections')
      .upsert({
        workspace_id: workspaceId,
        provider_type: providerType,
        status,
        api_key_encrypted: finalApiKeyEncrypted,
        api_secret_encrypted: finalApiSecretEncrypted,
        webhook_secret_encrypted: finalWebhookSecretEncrypted,
        is_live: isLiveDetected,
        last_sync_at: new Date().toISOString(),
        last_error: null,
        metadata: {
          account_id: accountIdResolved,
        },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'workspace_id,provider_type',
      })
      .select('*')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      workspace_id: workspaceId,
      provider_type: data.provider_type,
      status: data.status,
      is_live: data.is_live,
      last_sync_at: data.last_sync_at,
      last_error: data.last_error,
      capabilities: adapter.capabilities,
      config_summary: {
        account_id: data.metadata?.account_id,
        webhook_url: `/api/webhooks/${providerType}`,
        has_api_key: Boolean(data.api_key_encrypted),
        has_webhook_secret: Boolean(data.webhook_secret_encrypted),
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },

  async rotateProviderSecret(
    workspaceId: string,
    providerType: ProviderType,
    secondarySecret: string
  ): Promise<ProviderConnection> {
    const client = getClient();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await client
      .from('provider_connections')
      .update({
        secondary_webhook_secret_encrypted: encryptSecret(secondarySecret),
        secondary_webhook_secret_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType)
      .select('*')
      .single();

    if (error) throw error;

    const adapter = PaymentProviderFactory.getAdapter(providerType);
    return {
      id: data.id,
      workspace_id: workspaceId,
      provider_type: data.provider_type,
      status: data.status,
      is_live: data.is_live,
      last_sync_at: data.last_sync_at,
      last_error: data.last_error,
      capabilities: adapter.capabilities,
      config_summary: {
        account_id: data.metadata?.account_id,
        webhook_url: `/api/webhooks/${providerType}`,
        has_api_key: Boolean(data.api_key_encrypted),
        has_webhook_secret: Boolean(data.webhook_secret_encrypted),
        has_secondary_webhook_secret: true,
        secondary_webhook_secret_expires_at: expiresAt,
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },

  async saveOAuthProviderConnection(
    workspaceId: string,
    providerType: ProviderType,
    oauthData: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
      accountId?: string;
      webhookSecret?: string;
      webhookId?: string;
      isLive?: boolean;
      subscribedEvents?: string[];
      scope?: string;
    }
  ): Promise<ProviderConnection> {
    const client = getClient();
    const adapter = PaymentProviderFactory.getAdapter(providerType);

    const encryptedAccessToken = encryptSecret(oauthData.accessToken);
    const encryptedRefreshToken = oauthData.refreshToken ? encryptSecret(oauthData.refreshToken) : null;
    const encryptedWebhookSecret = oauthData.webhookSecret ? encryptSecret(oauthData.webhookSecret) : null;

    const metadata = {
      auth_type: 'oauth',
      account_id: oauthData.accountId || '',
      razorpay_account_id: oauthData.accountId || '',
      expires_at: oauthData.expiresAt || null,
      webhook_id: oauthData.webhookId || null,
      auto_webhooks_provisioned: true,
      subscribed_events: oauthData.subscribedEvents || [
        'payment.failed',
        'payment.captured',
        'subscription.halted',
        'subscription.charged',
        'subscription.cancelled',
      ],
      scope: oauthData.scope || 'read_write',
    };

    const { data, error } = await client
      .from('provider_connections')
      .upsert(
        {
          workspace_id: workspaceId,
          provider_type: providerType,
          status: 'connected',
          api_key_encrypted: encryptedAccessToken,
          api_secret_encrypted: encryptedRefreshToken,
          webhook_secret_encrypted: encryptedWebhookSecret,
          is_live: oauthData.isLive ?? true,
          last_sync_at: new Date().toISOString(),
          last_error: null,
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,provider_type' }
      )
      .select('*')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      workspace_id: workspaceId,
      provider_type: data.provider_type,
      status: data.status,
      is_live: data.is_live,
      last_sync_at: data.last_sync_at,
      last_error: data.last_error,
      capabilities: adapter.capabilities,
      config_summary: {
        account_id: data.metadata?.account_id,
        webhook_url: `/api/webhooks/${providerType}`,
        has_api_key: Boolean(data.api_key_encrypted),
        has_webhook_secret: Boolean(data.webhook_secret_encrypted),
        auth_type: 'oauth',
        is_oauth: true,
        auto_webhooks_provisioned: true,
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },

  async getDecryptedProviderCredentials(
    workspaceId: string,
    providerType: ProviderType
  ): Promise<{
    apiKey?: string;
    apiSecret?: string;
    webhookSecret?: string;
    secondaryWebhookSecret?: string;
    accountId?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    authType?: 'oauth' | 'api_key';
    isLive?: boolean;
    subscribedEvents?: string[];
    webhookId?: string;
  } | null> {
    const client = getClient();
    const { data, error } = await client
      .from('provider_connections')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType)
      .maybeSingle();

    if (error || !data || data.status === 'disconnected') return null;

    const apiKey = data.api_key_encrypted ? decryptSecret(data.api_key_encrypted) : undefined;
    const apiSecret = data.api_secret_encrypted ? decryptSecret(data.api_secret_encrypted) : undefined;
    const webhookSecret = data.webhook_secret_encrypted ? decryptSecret(data.webhook_secret_encrypted) : undefined;
    const secondaryWebhookSecret = data.secondary_webhook_secret_encrypted
      ? decryptSecret(data.secondary_webhook_secret_encrypted)
      : undefined;

    // Auto-migrate weak legacy 'enc_' secrets to AES-256-GCM ('gcm_')
    const needsMigration =
      (data.api_key_encrypted && data.api_key_encrypted.startsWith('enc_')) ||
      (data.api_secret_encrypted && data.api_secret_encrypted.startsWith('enc_')) ||
      (data.webhook_secret_encrypted && data.webhook_secret_encrypted.startsWith('enc_'));

    if (needsMigration) {
      const updates: any = {};
      if (apiKey) updates.api_key_encrypted = encryptSecret(apiKey);
      if (apiSecret) updates.api_secret_encrypted = encryptSecret(apiSecret);
      if (webhookSecret) updates.webhook_secret_encrypted = encryptSecret(webhookSecret);
      updates.updated_at = new Date().toISOString();

      Promise.resolve(
        client
          .from('provider_connections')
          .update(updates)
          .eq('id', data.id)
      ).catch(() => {});
    }

    const isOAuth = data.metadata?.auth_type === 'oauth';
    return {
      apiKey,
      apiSecret,
      webhookSecret,
      secondaryWebhookSecret,
      accountId: data.metadata?.account_id || data.metadata?.razorpay_account_id,
      accessToken: isOAuth ? apiKey : undefined,
      refreshToken: isOAuth ? apiSecret : undefined,
      expiresAt: data.metadata?.expires_at,
      authType: isOAuth ? 'oauth' : 'api_key',
      isLive: data.is_live,
      subscribedEvents: data.metadata?.subscribed_events,
      webhookId: data.metadata?.webhook_id,
    };
  },

  async syncProviderData(
    workspaceId: string,
    providerType: ProviderType
  ): Promise<{
    success: boolean;
    partial?: boolean;
    provider: ProviderType;
    syncedAt?: string;
    synced: {
      customers: number;
      subscriptions: number;
      invoices: number;
      payments: number;
    };
    errors?: Record<string, string>;
    message: string;
  }> {
    const client = getClient();
    const credentials = await this.getDecryptedProviderCredentials(workspaceId, providerType);
    const adapter = PaymentProviderFactory.getAdapter(providerType);
    const creds = credentials ? { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret } : undefined;

    const errors: Record<string, string> = {};
    let syncedCustomersCount = 0;
    let syncedSubscriptionsCount = 0;
    let syncedInvoicesCount = 0;
    let syncedPaymentsCount = 0;

    // 1. Sync Customers independently
    let rawCustomers: Customer[] = [];
    try {
      rawCustomers = await adapter.syncCustomers(workspaceId, creds);
    } catch (err: any) {
      errors.customers = err.message || 'Customer endpoint failed';
    }

    for (const c of rawCustomers) {
      try {
        await client.from('customers').upsert(
          {
            workspace_id: workspaceId,
            provider_type: providerType,
            provider_customer_id: c.provider_customer_id,
            email: c.email || 'no-email@customer.com',
            name: c.name || 'Customer',
            phone: c.phone || '',
            country: c.country || 'US',
            currency: (c.currency || 'USD').toUpperCase(),
            lifetime_value_cents: c.lifetime_value_cents || 0,
            total_recovered_cents: c.total_recovered_cents || 0,
            current_risk_status: c.current_risk_status || 'healthy',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,provider_type,provider_customer_id' }
        );
        syncedCustomersCount++;
      } catch (err: any) {
        console.warn(`[SupabaseSync] Customer upsert warning (${c.provider_customer_id}):`, err.message);
      }
    }

    // Build customer UUID mapping table: provider_customer_id -> UUID
    const { data: dbCustomers } = await client
      .from('customers')
      .select('id, provider_customer_id')
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType);

    const customerUuidMap = new Map<string, string>();
    for (const dc of dbCustomers || []) {
      if (dc.provider_customer_id) {
        customerUuidMap.set(dc.provider_customer_id, dc.id);
        if (dc.provider_customer_id.startsWith('cust_')) {
          customerUuidMap.set(dc.provider_customer_id.replace('cust_', ''), dc.id);
        }
      }
    }

    const resolveCustomerUuid = (rawId?: string): string | null => {
      if (!rawId) return null;
      if (customerUuidMap.has(rawId)) return customerUuidMap.get(rawId)!;
      const cleanId = rawId.startsWith('cust_') ? rawId.replace('cust_', '') : rawId;
      if (customerUuidMap.has(cleanId)) return customerUuidMap.get(cleanId)!;
      return null;
    };

    // 2. Sync Subscriptions independently
    let rawSubscriptions: Subscription[] = [];
    try {
      rawSubscriptions = await adapter.syncSubscriptions(workspaceId, creds);
    } catch (err: any) {
      errors.subscriptions = err.message || 'Subscription endpoint failed';
    }

    for (const s of rawSubscriptions) {
      try {
        const custUuid = resolveCustomerUuid(s.customer_id);
        if (!custUuid) {
          console.warn(`[SupabaseSync] Skipping subscription ${s.provider_subscription_id}: Customer UUID not resolved for ${s.customer_id}`);
          continue;
        }

        await client.from('subscriptions').upsert(
          {
            workspace_id: workspaceId,
            customer_id: custUuid,
            provider_type: providerType,
            provider_subscription_id: s.provider_subscription_id,
            plan_name: s.plan_name || 'Standard Plan',
            amount_cents: s.amount_cents || 0,
            currency: (s.currency || 'USD').toUpperCase(),
            billing_interval: s.billing_interval || 'monthly',
            status: s.status || 'active',
            current_period_end: s.current_period_end || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,provider_type,provider_subscription_id' }
        );
        syncedSubscriptionsCount++;
      } catch (err: any) {
        console.warn(`[SupabaseSync] Subscription upsert warning (${s.provider_subscription_id}):`, err.message);
      }
    }

    // Build subscription UUID mapping table: provider_subscription_id -> UUID
    const { data: dbSubscriptions } = await client
      .from('subscriptions')
      .select('id, provider_subscription_id')
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType);

    const subscriptionUuidMap = new Map<string, string>();
    for (const ds of dbSubscriptions || []) {
      if (ds.provider_subscription_id) {
        subscriptionUuidMap.set(ds.provider_subscription_id, ds.id);
        if (ds.provider_subscription_id.startsWith('sub_')) {
          subscriptionUuidMap.set(ds.provider_subscription_id.replace('sub_', ''), ds.id);
        }
      }
    }

    const resolveSubscriptionUuid = (rawId?: string): string | null => {
      if (!rawId) return null;
      if (subscriptionUuidMap.has(rawId)) return subscriptionUuidMap.get(rawId)!;
      const cleanId = rawId.startsWith('sub_') ? rawId.replace('sub_', '') : rawId;
      if (subscriptionUuidMap.has(cleanId)) return subscriptionUuidMap.get(cleanId)!;
      return null;
    };

    // 3. Sync Invoices independently
    let rawInvoices: Invoice[] = [];
    try {
      rawInvoices = await adapter.syncInvoices(workspaceId, creds);
    } catch (err: any) {
      errors.invoices = err.message || 'Invoice endpoint failed';
    }

    for (const inv of rawInvoices) {
      try {
        const custUuid = resolveCustomerUuid(inv.customer_id);
        if (!custUuid) {
          console.warn(`[SupabaseSync] Skipping invoice ${inv.provider_invoice_id}: Customer UUID not resolved for ${inv.customer_id}`);
          continue;
        }

        const subUuid = resolveSubscriptionUuid(inv.subscription_id);

        await client.from('invoices').upsert(
          {
            workspace_id: workspaceId,
            customer_id: custUuid,
            subscription_id: subUuid || null,
            provider_type: providerType,
            provider_invoice_id: inv.provider_invoice_id,
            amount_cents: inv.amount_cents || 0,
            currency: (inv.currency || 'USD').toUpperCase(),
            status: inv.status || 'open',
            due_date: inv.due_date || new Date().toISOString(),
            hosted_invoice_url: inv.hosted_invoice_url || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,provider_type,provider_invoice_id' }
        );
        syncedInvoicesCount++;
      } catch (err: any) {
        console.warn(`[SupabaseSync] Invoice upsert warning (${inv.provider_invoice_id}):`, err.message);
      }
    }

    // Build invoice UUID mapping table: provider_invoice_id -> UUID
    const { data: dbInvoices } = await client
      .from('invoices')
      .select('id, provider_invoice_id')
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType);

    const invoiceUuidMap = new Map<string, string>();
    for (const di of dbInvoices || []) {
      if (di.provider_invoice_id) {
        invoiceUuidMap.set(di.provider_invoice_id, di.id);
        if (di.provider_invoice_id.startsWith('inv_')) {
          invoiceUuidMap.set(di.provider_invoice_id.replace('inv_', ''), di.id);
        }
      }
    }

    const resolveInvoiceUuid = (rawId?: string): string | null => {
      if (!rawId) return null;
      if (invoiceUuidMap.has(rawId)) return invoiceUuidMap.get(rawId)!;
      const cleanId = rawId.startsWith('inv_') ? rawId.replace('inv_', '') : rawId;
      if (invoiceUuidMap.has(cleanId)) return invoiceUuidMap.get(cleanId)!;
      return null;
    };

    // 4. Sync Payments independently
    let rawPayments: Payment[] = [];
    try {
      rawPayments = await adapter.syncPayments(workspaceId, creds);
    } catch (err: any) {
      errors.payments = err.message || 'Payment endpoint failed';
    }

    for (const p of rawPayments) {
      try {
        const custUuid = resolveCustomerUuid(p.customer_id);
        if (!custUuid) {
          console.warn(`[SupabaseSync] Skipping payment ${p.provider_payment_id}: Customer UUID not resolved for ${p.customer_id}`);
          continue;
        }

        const invUuid = resolveInvoiceUuid(p.invoice_id);

        await client.from('payments').upsert(
          {
            workspace_id: workspaceId,
            customer_id: custUuid,
            invoice_id: invUuid || null,
            provider_type: providerType,
            provider_payment_id: p.provider_payment_id,
            amount_cents: p.amount_cents || 0,
            currency: (p.currency || 'USD').toUpperCase(),
            status: p.status || 'succeeded',
            payment_method_type: p.payment_method_type || 'card',
            payment_method_last4: p.payment_method_last4 || null,
          },
          { onConflict: 'workspace_id,provider_type,provider_payment_id' }
        );
        syncedPaymentsCount++;
      } catch (err: any) {
        console.warn(`[SupabaseSync] Payment upsert warning (${p.provider_payment_id}):`, err.message);
      }
    }

    const totalSyncedCount = syncedCustomersCount + syncedSubscriptionsCount + syncedInvoicesCount + syncedPaymentsCount;
    const hasErrors = Object.keys(errors).length > 0;

    // Count how many endpoints actually succeeded (regardless of record count)
    const totalSucceededEndpoints =
      (errors.customers ? 0 : 1) +
      (errors.subscriptions ? 0 : 1) +
      (errors.invoices ? 0 : 1) +
      (errors.payments ? 0 : 1);

    // Hard Failure ONLY if all 4 endpoints failed
    if (totalSucceededEndpoints === 0) {
      const firstErrMsg = Object.values(errors)[0] || 'All gateway endpoints failed';
      throw new Error(`Gateway sync failed: ${firstErrMsg}`);
    }

    const nowIso = new Date().toISOString();
    const partial = hasErrors;

    // Update connection status on provider_connections
    await client
      .from('provider_connections')
      .update({
        last_sync_at: nowIso,
        status: 'connected',
        last_error: partial ? Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('; ') : null,
        updated_at: nowIso,
      })
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType);

    // Audit Log
    await this.recordAuditLog(workspaceId, {
      action: 'PROVIDER_SYNCHRONIZED',
      entity_type: 'provider_connection',
      details: {
        provider: providerType,
        partial,
        customers_synced: syncedCustomersCount,
        subscriptions_synced: syncedSubscriptionsCount,
        invoices_synced: syncedInvoicesCount,
        payments_synced: syncedPaymentsCount,
        errors,
      },
    });

    let message = `Successfully synchronized data from ${providerType}.`;
    if (partial) {
      const errorSummaries = Object.entries(errors)
        .map(([endpoint, err]) => {
          if (err.includes('401') || err.includes('Unauthorized')) {
            return `${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)} feature unavailable on ${providerType} account`;
          }
          return `${endpoint}: ${err}`;
        })
        .join('. ');
      message = `Gateway sync completed with warnings: ${errorSummaries}.`;
    }

    return {
      success: true,
      partial,
      provider: providerType,
      syncedAt: nowIso,
      synced: {
        customers: syncedCustomersCount,
        subscriptions: syncedSubscriptionsCount,
        invoices: syncedInvoicesCount,
        payments: syncedPaymentsCount,
      },
      errors: hasErrors ? errors : undefined,
      message,
    };
  },

  async disconnectProvider(workspaceId: string, providerType: ProviderType): Promise<void> {
    const client = getClient();
    const { error } = await client
      .from('provider_connections')
      .update({
        status: 'disconnected',
        api_key_encrypted: null,
        api_secret_encrypted: null,
        webhook_secret_encrypted: null,
        last_sync_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType);
    if (error) throw error;
  },

  // ====================================================================
  // 4. CUSTOMERS
  // ====================================================================
  async getCustomers(workspaceId: string): Promise<Customer[]> {
    const client = getClient();
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Customer[];
  },

  async getCustomerById(workspaceId: string, customerId: string): Promise<Customer | null> {
    const client = getClient();
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', customerId)
      .maybeSingle();
    if (error) throw error;
    return (data as Customer) || null;
  },

  async getCustomerByEmail(workspaceId: string, email: string): Promise<Customer | null> {
    const client = getClient();
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
    if (error) throw error;
    return (data as Customer) || null;
  },

  async getCustomerByProviderId(
    workspaceId: string,
    providerType: string,
    providerCustomerId: string
  ): Promise<Customer | null> {
    if (!providerCustomerId) return null;
    const client = getClient();
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('provider_type', providerType)
      .eq('provider_customer_id', providerCustomerId)
      .maybeSingle();
    if (error) throw error;
    return (data as Customer) || null;
  },

  async createCustomer(workspaceId: string, customerData: any): Promise<Customer> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      provider_type: customerData.provider_type || 'stripe',
      provider_customer_id: customerData.provider_customer_id || `cus_${Date.now().toString(36)}`,
      email: customerData.email!.toLowerCase().trim(),
      name: customerData.name || customerData.email!.split('@')[0],
      phone: customerData.phone || null,
      country: customerData.country || 'US',
      currency: customerData.currency || 'USD',
      lifetime_value_cents: customerData.lifetime_value_cents || 0,
      total_recovered_cents: 0,
      current_risk_status: customerData.current_risk_status || 'healthy',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('customers').insert(row).select('*').single();
    if (error) throw error;

    if (customerData.plan_name || customerData.plan_amount_cents) {
      await this.createSubscription(workspaceId, {
        customer_id: data.id,
        provider_type: customerData.provider_type || 'stripe',
        plan_name: customerData.plan_name || 'Standard Plan',
        amount_cents: customerData.plan_amount_cents || 4900,
        currency: customerData.currency || 'USD',
        billing_interval: customerData.billing_interval || 'monthly',
        status: 'active',
        subscription_start_date: new Date().toISOString(),
        renewal_count: 1,
      });
    }

    // Timeline event
    await this.recordCustomerTimelineEvent(workspaceId, {
      customer_id: data.id,
      event_type: 'customer_created',
      title: 'Customer Profile Created',
      description: `Created customer ${data.name} (${data.email})`,
      actor: 'Operator',
    });

    return data as Customer;
  },

  async updateCustomer(workspaceId: string, customerId: string, updates: Partial<Customer>): Promise<Customer | null> {
    const client = getClient();
    const { data, error } = await client
      .from('customers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', customerId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as Customer) || null;
  },

  async deleteCustomer(workspaceId: string, customerId: string): Promise<boolean> {
    const client = getClient();
    const { error } = await client
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return true;
  },

  async getCustomerDetails(workspaceId: string, customerId: string): Promise<any | null> {
    const cust = await this.getCustomerById(workspaceId, customerId);
    if (!cust) return null;
    const subs = await this.getSubscriptions(workspaceId);
    const customerSubs = subs.filter((s) => s.customer_id === customerId);
    const invs = await this.getInvoices(workspaceId);
    const customerInvs = invs.filter((i) => i.customer_id === customerId);
    const fails = await this.getPaymentFailures(workspaceId);
    const customerFails = fails.filter((f) => f.customer_id === customerId);
    const opps = (await this.getRecoveryOpportunities(workspaceId)).filter((o) => o.customer_id === customerId);
    const timeline = await this.getCustomerTimelineEvents(workspaceId, customerId);

    return {
      customer: cust,
      subscriptions: customerSubs,
      invoices: customerInvs,
      paymentFailures: customerFails,
      recoveryOpportunities: opps,
      timelineEvents: timeline,
    };
  },

  // ====================================================================
  // 5. SUBSCRIPTIONS
  // ====================================================================
  async getSubscriptions(workspaceId: string): Promise<Subscription[]> {
    const client = getClient();
    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Subscription[];
  },

  async getSubscriptionById(workspaceId: string, id: string): Promise<Subscription | null> {
    const client = getClient();
    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as Subscription) || null;
  },

  async createSubscription(workspaceId: string, subData: Partial<Subscription>): Promise<Subscription> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      customer_id: subData.customer_id,
      provider_type: subData.provider_type || 'stripe',
      provider_subscription_id: subData.provider_subscription_id || `sub_${Date.now().toString(36)}`,
      plan_name: subData.plan_name || 'Standard Plan',
      amount_cents: subData.amount_cents || 0,
      currency: subData.currency || 'USD',
      billing_interval: subData.billing_interval || 'monthly',
      status: subData.status || 'active',
      subscription_start_date: subData.subscription_start_date || new Date().toISOString(),
      current_period_end: subData.current_period_end || new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('subscriptions').insert(row).select('*').single();
    if (error) throw error;
    return data as Subscription;
  },

  async updateSubscription(
    workspaceId: string,
    id: string,
    updates: Partial<Subscription>
  ): Promise<Subscription | null> {
    const client = getClient();
    const { data, error } = await client
      .from('subscriptions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as Subscription) || null;
  },

  // ====================================================================
  // 6. INVOICES & PAYMENTS
  // ====================================================================
  async getInvoices(workspaceId: string): Promise<Invoice[]> {
    const client = getClient();
    const { data, error } = await client
      .from('invoices')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Invoice[];
  },

  async createInvoice(workspaceId: string, invData: Partial<Invoice>): Promise<Invoice> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      customer_id: invData.customer_id,
      subscription_id: invData.subscription_id || null,
      provider_type: invData.provider_type || 'stripe',
      provider_invoice_id: invData.provider_invoice_id || `inv_${Date.now().toString(36)}`,
      amount_cents: invData.amount_cents || 0,
      currency: invData.currency || 'USD',
      status: invData.status || 'open',
      due_date: invData.due_date || new Date().toISOString(),
      paid_at: invData.paid_at || null,
      hosted_invoice_url: invData.hosted_invoice_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('invoices').insert(row).select('*').single();
    if (error) throw error;
    return data as Invoice;
  },

  async upsertInvoice(workspaceId: string, invData: any): Promise<Invoice> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      customer_id: invData.customer_id,
      subscription_id: invData.subscription_id || null,
      provider_type: invData.provider_type || 'stripe',
      provider_invoice_id: invData.provider_invoice_id,
      amount_cents: invData.amount_due_cents || invData.amount_cents || 0,
      currency: invData.currency || 'USD',
      status: invData.status || 'open',
      due_date: invData.due_date || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('invoices')
      .upsert(row, { onConflict: 'workspace_id,provider_invoice_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data as Invoice;
  },

  async getPayments(workspaceId: string): Promise<Payment[]> {
    const client = getClient();
    const { data, error } = await client
      .from('payments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Payment[];
  },

  async createPayment(workspaceId: string, paymentData: Partial<Payment>): Promise<Payment> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      customer_id: paymentData.customer_id,
      invoice_id: paymentData.invoice_id || null,
      provider_type: paymentData.provider_type || 'stripe',
      provider_payment_id: paymentData.provider_payment_id || `pay_${Date.now().toString(36)}`,
      amount_cents: paymentData.amount_cents || 0,
      currency: paymentData.currency || 'USD',
      status: paymentData.status || 'succeeded',
      failure_code: paymentData.failure_code || null,
      failure_message: paymentData.failure_message || null,
      payment_method_type: paymentData.payment_method_type || 'card',
      payment_method_last4: paymentData.payment_method_last4 || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('payments').insert(row).select('*').single();
    if (error) throw error;
    return data as Payment;
  },

  // ====================================================================
  // 7. PAYMENT FAILURES
  // ====================================================================
  async getPaymentFailures(workspaceId: string): Promise<PaymentFailure[]> {
    const client = getClient();
    const { data, error } = await client
      .from('payment_failures')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return (data || []) as PaymentFailure[];
  },

  async createPaymentFailure(workspaceId: string, failureData: Partial<PaymentFailure>): Promise<PaymentFailure> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      customer_id: failureData.customer_id,
      payment_id: failureData.payment_id || null,
      invoice_id: failureData.invoice_id || null,
      amount_cents: failureData.amount_cents || 0,
      currency: failureData.currency || 'USD',
      provider_type: failureData.provider_type || 'stripe',
      provider_failure_code: failureData.provider_failure_code || null,
      normalized_category: failureData.normalized_category || 'payment_method_declined',
      raw_error_message: failureData.raw_error_message || null,
      occurred_at: failureData.occurred_at || new Date().toISOString(),
      is_resolved: false,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('payment_failures').insert(row).select('*').single();
    if (error) throw error;
    return data as PaymentFailure;
  },

  async recordPaymentFailure(workspaceId: string, data: any): Promise<PaymentFailure> {
    return this.createPaymentFailure(workspaceId, {
      customer_id: data.customer_id,
      invoice_id: data.invoice_id,
      amount_cents: data.amount_cents,
      currency: data.currency,
      provider_type: data.provider_type || 'stripe',
      provider_failure_code: data.error_code || data.provider_failure_code,
      normalized_category: data.failure_category || 'payment_method_declined',
      raw_error_message: data.decline_reason || data.raw_error_message,
      occurred_at: new Date().toISOString(),
    });
  },

  // ====================================================================
  // 8. RECOVERY OPPORTUNITIES
  // ====================================================================
  async getRecoveryOpportunities(
    workspaceId: string,
    filters?: { status?: string; provider?: string; category?: string; search?: string }
  ): Promise<RecoveryOpportunity[]> {
    if (!isSupabaseAuthoritative()) {
      return db.getOpportunities(workspaceId);
    }
    const client = getClient();
    let query = client
      .from('recovery_opportunities')
      .select(
        `
        *,
        customer:customers(*),
        payment_failure:payment_failures(*)
      `
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.category && filters.category !== 'all') {
      query = query.eq('failure_category', filters.category);
    }

    const { data, error } = await query;
    if (error) throw error;

    let results = (data || []) as RecoveryOpportunity[];
    if (filters?.provider && filters.provider !== 'all') {
      results = results.filter((o) => o.customer?.provider_type === filters.provider);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (o) =>
          o.customer?.name?.toLowerCase().includes(q) ||
          o.customer?.email?.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q)
      );
    }

    return results;
  },

  async getRecoveryOpportunityById(workspaceId: string, id: string): Promise<RecoveryOpportunity | null> {
    if (!isSupabaseAuthoritative()) {
      return db.getOpportunityById(id, workspaceId);
    }
    const client = getClient();
    const { data, error } = await client
      .from('recovery_opportunities')
      .select(
        `
        *,
        customer:customers(*),
        payment_failure:payment_failures(*)
      `
      )
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return (data as RecoveryOpportunity) || null;
  },

  async hydrateOpportunityRelations(opp: any): Promise<RecoveryOpportunity | null> {
    if (!opp) return null;
    const client = getClient();
    let invoice = opp.invoice;
    let subscription = opp.subscription;

    const invoiceId = opp.invoice_id || opp.payment_failure?.invoice_id;
    if (!invoice && invoiceId) {
      const { data: inv } = await client.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
      if (inv) {
        invoice = inv;
        if (!subscription && inv.subscription_id) {
          const { data: sub } = await client.from('subscriptions').select('*').eq('id', inv.subscription_id).maybeSingle();
          if (sub) {
            subscription = sub;
          }
        }
      }
    }
    return {
      ...opp,
      invoice,
      subscription,
    } as RecoveryOpportunity;
  },

  async getRecoveryOpportunityByProviderCheckoutId(
    workspaceId: string,
    providerType: string,
    providerCheckoutId: string
  ): Promise<RecoveryOpportunity | null> {
    if (!isSupabaseAuthoritative()) {
      return db.getOpportunityByProviderCheckoutId(workspaceId, providerCheckoutId, providerType) || null;
    }
    const client = getClient();
    const { data, error } = await client
      .from('recovery_opportunities')
      .select(
        `
        *,
        customer:customers(*),
        payment_failure:payment_failures(*)
      `
      )
      .eq('workspace_id', workspaceId)
      .eq('provider_checkout_id', providerCheckoutId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (providerType && (data as any).customer?.provider_type && (data as any).customer.provider_type !== providerType) {
      return null;
    }
    return await this.hydrateOpportunityRelations(data);
  },

  async getRecoveryOpportunityByProviderInvoiceId(
    workspaceId: string,
    providerInvoiceId: string,
    providerType?: string
  ): Promise<RecoveryOpportunity | null> {
    if (!isSupabaseAuthoritative()) {
      return db.getOpportunityByProviderInvoiceId(workspaceId, providerInvoiceId, providerType) || null;
    }
    const client = getClient();
    const { data: invData, error: invErr } = await client
      .from('invoices')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('provider_invoice_id', providerInvoiceId)
      .maybeSingle();

    if (invErr) throw invErr;
    if (!invData) return null;

    const { data, error } = await client
      .from('recovery_opportunities')
      .select(
        `
        *,
        customer:customers(*),
        payment_failure:payment_failures(*)
      `
      )
      .eq('workspace_id', workspaceId)
      .eq('invoice_id', invData.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (providerType && (data as any).customer?.provider_type && (data as any).customer.provider_type !== providerType) {
      return null;
    }
    return await this.hydrateOpportunityRelations(data);
  },

  async getRecoveryOpportunityByToken(token: string): Promise<RecoveryOpportunity | null> {
    const client = getClient();
    if (!token || typeof token !== 'string') return null;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    let { data, error } = await client
      .from('recovery_opportunities')
      .select(
        `
        *,
        customer:customers(*),
        payment_failure:payment_failures(*)
      `
      )
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) throw error;

    if (!data && !isSupabaseAuthoritative()) {
      const { data: legacyData, error: legacyError } = await client
        .from('recovery_opportunities')
        .select(
          `
          *,
          customer:customers(*),
          payment_failure:payment_failures(*)
        `
        )
        .eq('recovery_token', token)
        .maybeSingle();

      if (legacyError) throw legacyError;
      data = legacyData;
    }

    if (!data) return null;

    const hydrated = await this.hydrateOpportunityRelations(data);
    if (!hydrated) return null;

    if ((hydrated as any).token_expires_at && new Date((hydrated as any).token_expires_at) < new Date()) {
      return { ...hydrated, is_expired: true } as any;
    }

    return hydrated;
  },

  async rotateRecoveryToken(
    workspaceId: string,
    opportunityId: string
  ): Promise<{ rawToken: string; tokenHash: string; expiresAt: string } | null> {
    const client = getClient();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await client
      .from('recovery_opportunities')
      .update({
        recovery_token: isSupabaseAuthoritative() ? null : rawToken,
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        payment_link_url: isSupabaseAuthoritative() ? null : `/pay/${rawToken}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .select('id')
      .maybeSingle();

    if (error || !data) return null;
    return { rawToken, tokenHash, expiresAt };
  },

  async commitRecoveryToken(
    workspaceId: string,
    opportunityId: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<boolean> {
    const client = getClient();
    const { data, error } = await client
      .from('recovery_opportunities')
      .update({
        recovery_token: null,
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        payment_link_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .select('id')
      .maybeSingle();

    return Boolean(!error && data);
  },

  async createRecoveryOpportunity(
    workspaceId: string,
    oppData: Partial<RecoveryOpportunity>
  ): Promise<RecoveryOpportunity> {
    const client = getClient();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const row = {
      workspace_id: workspaceId,
      customer_id: oppData.customer_id,
      payment_failure_id: oppData.payment_failure_id,
      campaign_id: oppData.campaign_id || null,
      current_step_number: 0,
      status: oppData.status || 'new',
      amount_at_risk_cents: oppData.amount_at_risk_cents || 0,
      currency: oppData.currency || 'USD',
      failure_category: oppData.failure_category || 'payment_method_declined',
      recommended_action: oppData.recommended_action || 'Smart Retry & 1-Click Update',
      recovery_token: isSupabaseAuthoritative() ? null : rawToken,
      token_hash: tokenHash,
      token_expires_at: expiresAt,
      payment_link_url: isSupabaseAuthoritative() ? null : `/pay/${rawToken}`,
      recovered_amount_cents: 0,
      metadata: (oppData as any).metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('recovery_opportunities').insert(row).select('*').single();
    if (error) throw error;

    await this.recordRecoveryEvent(workspaceId, {
      opportunity_id: data.id,
      event_type: 'opportunity_created',
      channel: 'system',
      status: 'success',
      details: { amount_at_risk_cents: row.amount_at_risk_cents, failure_category: row.failure_category },
    });

    return {
      ...(data as RecoveryOpportunity),
      recovery_token: rawToken,
    };
  },

  async updateRecoveryOpportunityStatus(
    workspaceId: string,
    id: string,
    status: string,
    metadata?: Record<string, any>
  ): Promise<RecoveryOpportunity | null> {
    const client = getClient();
    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (metadata) {
      updates.metadata = metadata;
    }

    const { data, error } = await client
      .from('recovery_opportunities')
      .update(updates)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return (data as RecoveryOpportunity) || null;
  },

  async updateRecoveryOpportunity(
    workspaceId: string,
    opportunityId: string,
    updates: Partial<RecoveryOpportunity>
  ): Promise<RecoveryOpportunity | null> {
    const client = getClient();
    const { data, error } = await client
      .from('recovery_opportunities')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    return data as RecoveryOpportunity;
  },

  // ====================================================================
  // 9. RECOVERY EVENTS
  // ====================================================================
  async getRecoveryEvents(workspaceId: string, opportunityId?: string): Promise<RecoveryEvent[]> {
    const client = getClient();
    let query = client.from('recovery_events').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });

    if (opportunityId) {
      query = query.eq('opportunity_id', opportunityId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RecoveryEvent[];
  },

  async recordRecoveryEvent(
    workspaceId: string,
    eventData: {
      opportunity_id: string;
      event_type: string;
      channel?: string;
      status?: string;
      details?: Record<string, any>;
    }
  ): Promise<RecoveryEvent> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      opportunity_id: eventData.opportunity_id,
      event_type: eventData.event_type,
      channel: eventData.channel || 'system',
      status: eventData.status || 'success',
      details: eventData.details || {},
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('recovery_events').insert(row).select('*').single();
    if (error) throw error;
    return data as RecoveryEvent;
  },

  // ====================================================================
  // 10. CUSTOMER TIMELINE EVENTS
  // ====================================================================
  async getCustomerTimelineEvents(workspaceId: string, customerId?: string): Promise<CustomerTimelineEvent[]> {
    const client = getClient();
    let query = client
      .from('customer_timeline_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as CustomerTimelineEvent[];
  },

  async recordCustomerTimelineEvent(
    workspaceId: string,
    timelineData: {
      customer_id: string;
      event_type: string;
      title: string;
      description?: string;
      actor?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<CustomerTimelineEvent> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      customer_id: timelineData.customer_id,
      event_type: timelineData.event_type,
      title: timelineData.title,
      description: timelineData.description || null,
      actor: timelineData.actor || 'System Automation',
      metadata: timelineData.metadata || {},
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('customer_timeline_events').insert(row).select('*').single();
    if (error) throw error;
    return data as CustomerTimelineEvent;
  },

  // ====================================================================
  // 11. REVENUE EVENTS
  // ====================================================================
  async getRevenueEvents(workspaceId: string): Promise<RevenueEvent[]> {
    const client = getClient();
    const { data, error } = await client
      .from('revenue_events')
      .select('*, customer:customers(name, email)')
      .eq('workspace_id', workspaceId)
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((r: any) => ({
      ...r,
      customer_name: r.customer?.name || 'Customer',
      customer_email: r.customer?.email || 'customer@acme.dev',
    })) as RevenueEvent[];
  },

  async recordRevenueEvent(
    workspaceId: string,
    revenueData: {
      opportunity_id?: string;
      customer_id: string;
      provider_type: ProviderType;
      event_type: string;
      amount_cents: number;
      currency?: string;
      recovered_via?: string;
    }
  ): Promise<RevenueEvent> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      opportunity_id: revenueData.opportunity_id || null,
      customer_id: revenueData.customer_id,
      provider_type: revenueData.provider_type,
      event_type: revenueData.event_type,
      amount_cents: revenueData.amount_cents,
      currency: revenueData.currency || 'USD',
      recovered_via: revenueData.recovered_via || 'automated_dunning',
      recorded_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('revenue_events').insert(row).select('*').single();
    if (error) throw error;
    return data as RevenueEvent;
  },

  // ====================================================================
  // 12. WEBHOOK EVENTS & IDEMPOTENCY
  // ====================================================================
  async getWebhookEvents(workspaceId?: string): Promise<WebhookEventRecord[]> {
    const client = getClient();
    let query = client.from('webhook_events').select('*').order('processed_at', { ascending: false });
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as WebhookEventRecord[];
  },

  async touchWebhookLease(eventId: string): Promise<void> {
    if (!eventId) return;
    if (isSupabaseAuthoritative()) {
      const client = getClient();
      await client.rpc('touch_webhook_processing_lease', { p_event_id: eventId });
    }
  },

  async recordWebhookEvent(event: {
    workspace_id?: string;
    provider_type: ProviderType;
    provider_event_id: string;
    event_type: string;
    idempotency_key?: string;
    status: 'received' | 'processing' | 'processed' | 'ignored' | 'failed' | 'duplicate';
    error_message?: string;
    payload_summary?: string;
    payload: any;
    processing_result?: any;
    headers?: Record<string, string>;
    actions_triggered?: string[];
  }): Promise<{ record: WebhookEventRecord; isDuplicate: boolean }> {
    if (!isSupabaseAuthoritative()) {
      const mockRecord: WebhookEventRecord = {
        id: `wh_evt_${Date.now()}`,
        workspace_id: event.workspace_id || 'ws_dev_local',
        provider_type: event.provider_type,
        provider_event_id: event.provider_event_id,
        event_type: event.event_type,
        status: (event.status === 'processing' || event.status === 'received') ? 'processed' : event.status,
        payload_summary: event.payload_summary || `${event.provider_type} ${event.event_type}`,
        payload: event.payload,
        processed_at: new Date().toISOString(),
      };
      return { record: mockRecord, isDuplicate: false };
    }
    const client = getClient();
    const idempotencyKey =
      event.idempotency_key || `${event.provider_type}_${event.provider_event_id}`;

    // Try atomic RPC claim first
    try {
      const { data: claimRes, error: claimErr } = await client.rpc('claim_webhook_event_atomic', {
        p_workspace_id: event.workspace_id || null,
        p_provider_type: event.provider_type,
        p_provider_event_id: event.provider_event_id,
        p_event_type: event.event_type,
        p_idempotency_key: idempotencyKey,
        p_payload_summary: event.payload_summary || `${event.provider_type} ${event.event_type}`,
        p_payload: redactSensitiveData(event.payload || {}),
        p_headers: redactSensitiveData(event.headers || {}),
        p_lease_timeout_seconds: 300,
      });

      if (claimErr && isSupabaseAuthoritative()) {
        throw new Error(`Authoritative webhook claim RPC failed: ${claimErr.message}`);
      }

      if (!claimErr && claimRes) {
        if (!claimRes.claimed) {
          const { data: existingRow } = await client
            .from('webhook_events')
            .select('*')
            .eq('id', claimRes.event_id)
            .maybeSingle();

          return {
            record: (existingRow || {
              id: claimRes.event_id,
              provider_type: event.provider_type,
              provider_event_id: event.provider_event_id,
              event_type: event.event_type,
              status: claimRes.status,
              payload_summary: event.payload_summary || '',
              processed_at: new Date().toISOString(),
            }) as WebhookEventRecord,
            isDuplicate: true,
          };
        }

        const { data: claimedRow } = await client
          .from('webhook_events')
          .select('*')
          .eq('id', claimRes.event_id)
          .single();

        return {
          record: (claimedRow || {
            id: claimRes.event_id,
            workspace_id: event.workspace_id,
            provider_type: event.provider_type,
            provider_event_id: event.provider_event_id,
            event_type: event.event_type,
            status: 'processing',
            payload_summary: event.payload_summary || '',
            processed_at: new Date().toISOString(),
          }) as WebhookEventRecord,
          isDuplicate: false,
        };
      }
    } catch (rpcErr: any) {
      if (isSupabaseAuthoritative()) {
        throw new Error(`Authoritative webhook claim RPC failed: ${rpcErr.message}`);
      }
    }

    // Direct Table Fallback with Lease Timestamp Protection
    const { data: existing } = await client
      .from('webhook_events')
      .select('*')
      .or(`idempotency_key.eq.${idempotencyKey},and(provider_type.eq.${event.provider_type},provider_event_id.eq.${event.provider_event_id})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'processed' || existing.status === 'ignored') {
        return {
          record: existing as WebhookEventRecord,
          isDuplicate: true,
        };
      }

      // Safe lease check using processing_started_at / heartbeat / updated_at (NOT created_at)
      const leaseTimestamp = existing.processing_heartbeat_at || existing.processing_started_at || existing.updated_at;
      const isStale =
        existing.status === 'processing' &&
        leaseTimestamp &&
        Date.now() - new Date(leaseTimestamp).getTime() > 300000;

      if (existing.status === 'processing' && !isStale) {
        return {
          record: existing as WebhookEventRecord,
          isDuplicate: true,
        };
      }

      if (existing.status === 'failed' || isStale) {
        const now = new Date().toISOString();
        await client
          .from('webhook_events')
          .update({
            status: 'processing',
            error_message: null,
            processing_started_at: now,
            processing_heartbeat_at: now,
            updated_at: now,
          })
          .eq('id', existing.id);

        return {
          record: { ...existing, status: 'processing' } as WebhookEventRecord,
          isDuplicate: false,
        };
      }
    }

    const nowIso = new Date().toISOString();
    const row = {
      workspace_id: event.workspace_id || null,
      provider_type: event.provider_type,
      provider_event_id: event.provider_event_id,
      event_type: event.event_type,
      idempotency_key: idempotencyKey,
      status: event.status || 'processing',
      error_message: event.error_message || null,
      payload_summary: event.payload_summary || `${event.provider_type} ${event.event_type}`,
      payload: redactSensitiveData(event.payload || {}),
      processing_result: redactSensitiveData({
        ...(event.processing_result || {}),
        actions_triggered: event.actions_triggered || [],
      }),
      headers: redactSensitiveData(event.headers || {}),
      received_at: nowIso,
      processing_started_at: nowIso,
      processing_heartbeat_at: nowIso,
      updated_at: nowIso,
      processed_at: event.status === 'processed' ? nowIso : null,
    };

    const { data, error } = await client.from('webhook_events').insert(row).select('*').single();
    if (error) {
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        const { data: retryExisting } = await client
          .from('webhook_events')
          .select('*')
          .eq('workspace_id', event.workspace_id)
          .eq('provider_type', event.provider_type)
          .eq('provider_event_id', event.provider_event_id)
          .maybeSingle();
        if (retryExisting) {
          return {
            record: retryExisting as WebhookEventRecord,
            isDuplicate: true,
          };
        }
      }
      throw error;
    }

    return {
      record: data as WebhookEventRecord,
      isDuplicate: false,
    };
  },

  async updateWebhookEventStatus(
    id: string,
    status: 'processing' | 'processed' | 'failed' | 'ignored',
    details?: {
      error_message?: string;
      processing_result?: any;
      actions_triggered?: string[];
    }
  ): Promise<void> {
    if (!isSupabaseAuthoritative()) {
      return;
    }
    const client = getClient();
    const updateData: any = {
      status,
      error_message: details?.error_message || null,
      processing_result: redactSensitiveData(details?.processing_result || {}),
      updated_at: new Date().toISOString(),
    };

    if (status === 'processed') {
      updateData.processed_at = new Date().toISOString();
    } else if (status === 'failed') {
      updateData.failed_at = new Date().toISOString();
    }

    await client
      .from('webhook_events')
      .update(updateData)
      .eq('id', id);
  },

  // ====================================================================
  // 13. AUDIT LOGS
  // ====================================================================
  async getAuditLogs(workspaceId: string): Promise<AuditLog[]> {
    const client = getClient();
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AuditLog[];
  },

  async recordAuditLog(
    workspaceId: string,
    log: {
      user_id?: string;
      user_email?: string;
      action: string;
      resource_type: string;
      resource_id?: string;
      metadata?: Record<string, any>;
      ip_address?: string;
    }
  ): Promise<AuditLog> {
    const client = getClient();
    const row = {
      workspace_id: workspaceId,
      user_id: log.user_id || null,
      user_email: log.user_email || null,
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id || null,
      metadata: redactSensitiveData(log.metadata || {}),
      ip_address: log.ip_address || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('audit_logs').insert(row).select('*').single();
    if (error) throw error;
    return data as AuditLog;
  },

  // ====================================================================
  // 14. ATOMIC RECOVERY PAYMENT SETTLEMENT
  // ====================================================================
  async settleRecoveryPayment(
    workspaceId: string,
    opportunityId: string,
    paymentDetails: {
      amountCents: number;
      providerPaymentId: string;
      method: string;
    },
    userId?: string
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!isSupabaseAuthoritative()) {
      return db.settleRecoveryPayment(opportunityId, paymentDetails, workspaceId);
    }
    const client = getClient();

    // 1. Validation checks
    if (!workspaceId || !opportunityId) {
      return { success: false, message: 'Workspace ID and Opportunity ID are required' };
    }
    if (!paymentDetails || !Number.isFinite(paymentDetails.amountCents) || paymentDetails.amountCents <= 0) {
      return { success: false, message: 'Settlement amount must be a finite positive number' };
    }
    if (!paymentDetails.providerPaymentId || typeof paymentDetails.providerPaymentId !== 'string') {
      return { success: false, message: 'Provider payment ID is required' };
    }

    // 2. Fetch & verify opportunity belongs to workspace
    const opp = await this.getRecoveryOpportunityById(workspaceId, opportunityId);
    if (!opp) {
      return { success: false, message: 'Recovery opportunity not found or workspace boundary mismatch' };
    }
    if (opp.status === 'recovered') {
      return { success: true, message: 'Opportunity is already recovered' };
    }

    // 3. Settlement amount integrity check
    if (paymentDetails.amountCents !== opp.amount_at_risk_cents) {
      return {
        success: false,
        message: `Settlement amount (${paymentDetails.amountCents}) does not match opportunity amount at risk (${opp.amount_at_risk_cents}). Partial or mismatched settlements are rejected.`,
      };
    }

    // 4. In Supabase Authoritative mode: call stored RPC function and FAIL CLOSED on error
    const { data, error } = await client.rpc('settle_recovery_payment_atomic', {
      p_workspace_id: workspaceId,
      p_opportunity_id: opportunityId,
      p_amount_cents: paymentDetails.amountCents,
      p_provider_payment_id: paymentDetails.providerPaymentId,
      p_method: paymentDetails.method || 'automated_dunning',
      p_user_id: userId || null,
    });

    if (error) {
      console.error('[Supabase RPC] settle_recovery_payment_atomic failed:', error);
      throw new Error(`Atomic settlement RPC failed: ${error.message}`);
    }

    return {
      success: true,
      message: 'Payment recovered and settled atomically in PostgreSQL.',
      data,
    };
  },


  // ====================================================================
  // 15. METRICS & AGGREGATIONS (Authoritative Supabase Source of Truth)
  // ====================================================================
  async getMetrics(workspaceId: string): Promise<RecoveryMetrics> {
    const client = getClient();

    // 1. Fetch opportunities
    const { data: opps, error: oppErr } = await client
      .from('recovery_opportunities')
      .select('status, customer_id, amount_at_risk_cents, recovered_amount_cents, failure_category')
      .eq('workspace_id', workspaceId);
    if (oppErr) throw oppErr;

    // 2. Fetch revenue events
    const { data: revEvents, error: revErr } = await client
      .from('revenue_events')
      .select('amount_cents, recorded_at, currency, opportunity_id')
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'revenue_recovered');
    if (revErr) throw revErr;

    // 3. Fetch payment failures
    const { data: failures, error: failErr } = await client
      .from('payment_failures')
      .select('id, workspace_id, customer_id, invoice_id, amount_cents, currency, is_resolved, occurred_at, normalized_category, provider_failure_code')
      .eq('workspace_id', workspaceId);
    if (failErr) throw failErr;

    // 4. Fetch invoices
    const { data: invs, error: invErr } = await client
      .from('invoices')
      .select('id, workspace_id, customer_id, provider_invoice_id, amount_cents, currency, status, due_date, created_at')
      .eq('workspace_id', workspaceId);
    if (invErr) throw invErr;

    const opportunities = opps || [];
    const rawRevenues = revEvents || [];
    const allFailures = failures || [];
    const allInvoices = invs || [];

    const ws = await this.getWorkspaceById(workspaceId);
    const currency = (ws?.currency || 'USD').toUpperCase();

    // Canonical Scanner Accounting for authoritative Revenue At Risk
    const canonical = calculateCanonicalFinancials({
      paymentFailures: allFailures as any,
      invoices: allInvoices as any,
      defaultCurrency: currency,
    });
    const totalAtRiskCents = canonical.totalAtRiskCents;

    const recoveredOpps = opportunities.filter((o) => o.status === 'recovered');
    const revenues = rawRevenues.filter((r: any) => r.recorded_at && !isNaN(new Date(r.recorded_at).getTime()));
    const primaryRevenues = revenues.filter(
      (r: any) => (r.currency || currency).toUpperCase() === currency
    );
    const totalRecoveredCents = primaryRevenues.reduce(
      (sum: number, r: any) => sum + Number(r.amount_cents || 0),
      0
    );

    const activeOpps = opportunities.filter((o) => ['new', 'active', 'contacted', 'payment_retry_pending'].includes(o.status));

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;

    const recoveredLast30dCents = primaryRevenues
      .filter((r) => new Date(r.recorded_at).getTime() >= thirtyDaysAgo)
      .reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);

    const recoveredLastMonthCents = primaryRevenues
      .filter((r) => {
        const t = new Date(r.recorded_at).getTime();
        return t >= sixtyDaysAgo && t < thirtyDaysAgo;
      })
      .reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);

    const { data: outcomes } = await client.from('opportunity_outcomes').select('time_to_recovery_seconds').eq('workspace_id', workspaceId);
    const validTimes = (outcomes || []).map((o: any) => o.time_to_recovery_seconds).filter((t: any) => typeof t === 'number' && t > 0);
    const avgRecoveryTimeHours = validTimes.length > 0
      ? Math.round((validTimes.reduce((a, b) => a + b, 0) / validTimes.length) / 3600)
      : 0;

    const totalOppsCount = opportunities.length;
    const { data: churnEvents } = await client
      .from('revenue_events')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'churn_prevented');
    const churnPreventedCount: number | null = (churnEvents || []).length > 0 ? (churnEvents || []).length : null;
    const customersAtRiskCount = new Set(activeOpps.map((o) => o.customer_id)).size;

    const { data: subs } = await client.from('subscriptions').select('*').eq('workspace_id', workspaceId);
    const { data: custs } = await client.from('customers').select('*').eq('workspace_id', workspaceId);
    const { data: payments } = await client.from('payments').select('amount_cents, status, currency').eq('workspace_id', workspaceId).eq('status', 'succeeded');
    const { data: camps } = await client.from('recovery_campaigns').select('id, is_active').eq('workspace_id', workspaceId).eq('is_active', true);

    const subscriptions = subs || [];
    const customers = custs || [];
    const succeededPayments = payments || [];
    const activeCampaigns = camps || [];

    const activeSubs = subscriptions.filter((s: any) => ['active', 'past_due', 'trialing'].includes(s.status));
    const activeSubsCount = activeSubs.length;

    const primaryActiveSubs = activeSubs.filter(
      (s: any) => (s.currency || currency).toUpperCase() === currency
    );

    const mrrCents = primaryActiveSubs.reduce(
      (sum: number, s: any) => sum + calculateMonthlyEquivalent(Number(s.amount_cents || 0), s.billing_interval, s.custom_interval_count, s.custom_interval_unit),
      0
    );

    const arrCents = primaryActiveSubs.reduce(
      (sum: number, s: any) => sum + calculateAnnualEquivalent(Number(s.amount_cents || 0), s.billing_interval, s.custom_interval_count, s.custom_interval_unit),
      0
    );

    const canceledSubsCount = subscriptions.filter((s: any) => s.status === 'canceled').length;
    const churnRate = subscriptions.length > 0 ? Number(((canceledSubsCount / subscriptions.length) * 100).toFixed(1)) : 0;

    const primaryCusts = customers.filter(
      (c: any) => (c.currency || currency).toUpperCase() === currency
    );
    const clvCents = primaryCusts.length > 0
      ? Math.round(primaryCusts.reduce((sum: number, c: any) => sum + Number(c.lifetime_value_cents || 0), 0) / primaryCusts.length)
      : 0;

    const primaryPayments = succeededPayments.filter(
      (p: any) => (p.currency || currency).toUpperCase() === currency
    );
    const directRevenueCents = primaryPayments.reduce((sum: number, p: any) => sum + Number(p.amount_cents || 0), 0);
    const totalRevenueCents = directRevenueCents;
    const activeCampaignsCount = activeCampaigns.length;

    const planFeeCents = ws?.subscription_plan?.monthly_base_fee_cents;
    const monthlyCostCents = typeof planFeeCents === 'number' && planFeeCents > 0 ? planFeeCents : 0;
    const roiMultiple = monthlyCostCents > 0 && totalRecoveredCents > 0
      ? parseFloat((totalRecoveredCents / monthlyCostCents).toFixed(1))
      : 0.0;

    // Multi-currency breakdown
    const currencies = new Set<string>();
    currencies.add(currency);
    opportunities.forEach((o: any) => { if (o.currency) currencies.add(o.currency.toUpperCase()); });
    subscriptions.forEach((s: any) => { if (s.currency) currencies.add(s.currency.toUpperCase()); });
    customers.forEach((c: any) => { if (c.currency) currencies.add(c.currency.toUpperCase()); });
    revenues.forEach((r: any) => { if (r.currency) currencies.add(r.currency.toUpperCase()); });
    succeededPayments.forEach((p: any) => { if (p.currency) currencies.add(p.currency.toUpperCase()); });

    const totalsByCurrency: Record<string, any> = {};
    currencies.forEach((curr) => {
      const cRevs = revenues.filter((r: any) => (r.currency || currency).toUpperCase() === curr);
      const cRec = cRevs.reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);

      const cRecThisMonth = cRevs
        .filter((r) => new Date(r.recorded_at).getTime() >= thirtyDaysAgo)
        .reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);
      const cRecLastMonth = cRevs
        .filter((r) => {
          const t = new Date(r.recorded_at).getTime();
          return t >= sixtyDaysAgo && t < thirtyDaysAgo;
        })
        .reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);

      const cActiveSubs = activeSubs.filter((s: any) => (s.currency || currency).toUpperCase() === curr);
      const cMrr = cActiveSubs.reduce(
        (sum: number, s: any) => sum + calculateMonthlyEquivalent(Number(s.amount_cents || 0), s.billing_interval, s.custom_interval_count, s.custom_interval_unit),
        0
      );
      const cArr = cActiveSubs.reduce(
        (sum: number, s: any) => sum + calculateAnnualEquivalent(Number(s.amount_cents || 0), s.billing_interval, s.custom_interval_count, s.custom_interval_unit),
        0
      );

      const cCusts = customers.filter((c: any) => (c.currency || currency).toUpperCase() === curr);
      const cClv = cCusts.length > 0
        ? Math.round(cCusts.reduce((sum: number, c: any) => sum + Number(c.lifetime_value_cents || 0), 0) / cCusts.length)
        : 0;

      const cPays = succeededPayments.filter((p: any) => (p.currency || currency).toUpperCase() === curr);
      const cTotalRev = cPays.reduce((sum: number, p: any) => sum + Number(p.amount_cents || 0), 0);

      const cAtRisk = canonical.totalsByCurrency[curr]?.totalAtRiskCents ?? 0;

      totalsByCurrency[curr] = {
        currency: curr,
        revenue_recovered_cents: cRec,
        revenue_at_risk_cents: cAtRisk,
        recovered_this_month_cents: cRecThisMonth,
        recovered_last_month_cents: cRecLastMonth,
        mrr_cents: cMrr,
        arr_cents: cArr,
        total_revenue_cents: cTotalRev,
        customer_lifetime_value_cents: cClv,
      };
    });

    const eligibleOpps = opportunities.filter((o: any) => ['recovered', 'lost', 'failed', 'abandoned', 'closed'].includes(o.status));
    const recoveryRate = opportunities.length === 0 ? 0 : (eligibleOpps.length > 0 ? Math.round((recoveredOpps.length / eligibleOpps.length) * 100) : null);

    return {
      revenue_recovered_cents: totalRecoveredCents,
      revenue_at_risk_cents: totalAtRiskCents,
      recovery_rate_percentage: recoveryRate,
      total_failed_payments_count: allFailures.length,
      active_opportunities_count: activeOpps.length,
      active_campaigns_count: activeCampaignsCount,
      customers_at_risk_count: customersAtRiskCount,
      churn_prevented_count: churnPreventedCount,
      currency,
      recovered_this_month_cents: recoveredLast30dCents,
      recovered_last_month_cents: recoveredLastMonthCents,
      average_recovery_time_hours: avgRecoveryTimeHours,
      roi_multiple: roiMultiple,
      mrr_cents: mrrCents,
      arr_cents: arrCents,
      churn_rate_percentage: churnRate,
      customer_lifetime_value_cents: clvCents,
      active_subscriptions_count: activeSubsCount,
      total_revenue_cents: totalRevenueCents,
    };
  },

  async getDashboardCharts(workspaceId: string): Promise<DashboardChartData> {
    // Return honest empty arrays for charts when genuine multi-period history is not present (no manufactured Current Period)
    return {
      revenue_trend: [],
      payment_failures: [],
      subscription_growth: [],
    };
  },

  async getFunnel(workspaceId: string): Promise<FunnelStage[]> {
    const client = getClient();
    const { data: failures, error: failErr } = await client.from('payment_failures').select('id, amount_cents').eq('workspace_id', workspaceId);
    if (failErr) throw failErr;
    const { data: opps, error: oppErr } = await client.from('recovery_opportunities').select('status, amount_at_risk_cents, recovered_amount_cents').eq('workspace_id', workspaceId);
    if (oppErr) throw oppErr;

    const totalFailed = (failures || []).length;
    const opportunities = opps || [];

    const contacted = opportunities.filter((o) => ['contacted', 'payment_retry_pending', 'recovered'].includes(o.status)).length;
    const engaged = opportunities.filter((o) => ['payment_retry_pending', 'recovered'].includes(o.status)).length;
    const recovered = opportunities.filter((o) => o.status === 'recovered').length;

    const totalFailedAmt = (failures || []).reduce((acc: number, f: any) => acc + Number(f.amount_cents || 0), 0);
    const oppsAmt = opportunities.reduce((acc: number, o: any) => acc + Number(o.amount_at_risk_cents || 0), 0);
    const recAmt = opportunities.filter((o: any) => o.status === 'recovered').reduce((acc: number, o: any) => acc + Number(o.recovered_amount_cents || 0), 0);

    return [
      {
        stage: 'Payment Failures Detected',
        count: totalFailed,
        conversion_rate: 100,
        amount_cents: totalFailedAmt,
      },
      {
        stage: 'Eligible Opportunities',
        count: opportunities.length,
        conversion_rate: totalFailed > 0 ? Math.round((opportunities.length / totalFailed) * 100) : 100,
        amount_cents: oppsAmt,
      },
      {
        stage: 'Customer Contacted',
        count: contacted,
        conversion_rate: opportunities.length > 0 ? Math.round((contacted / opportunities.length) * 100) : 0,
        amount_cents: oppsAmt,
      },
      {
        stage: 'Customer Engaged',
        count: engaged,
        conversion_rate: opportunities.length > 0 ? Math.round((engaged / opportunities.length) * 100) : 0,
        amount_cents: oppsAmt,
      },
      {
        stage: 'Revenue Recovered',
        count: recovered,
        conversion_rate: opportunities.length > 0 ? Math.round((recovered / opportunities.length) * 100) : 0,
        amount_cents: recAmt,
      },
    ];
  },

  async getFailureBreakdown(workspaceId: string): Promise<FailureCategoryBreakdown[]> {
    const client = getClient();
    const { data: opps, error } = await client
      .from('recovery_opportunities')
      .select('failure_category, amount_at_risk_cents, recovered_amount_cents, status')
      .eq('workspace_id', workspaceId);

    if (error) throw error;
    const opportunities = opps || [];

    const categories = [
      'insufficient_funds',
      'expired_card',
      'authentication_required',
      'payment_method_declined',
      'bank_related_failure',
      'temporary_provider_failure',
      'invalid_payment_method',
    ] as const;

    const labels: Record<string, string> = {
      insufficient_funds: 'Insufficient Funds',
      expired_card: 'Expired Card',
      authentication_required: '3D Secure / SCA Required',
      payment_method_declined: 'Card Declined (General)',
      bank_related_failure: 'Bank Network Downtime',
      temporary_provider_failure: 'Temporary Provider Glitch',
      invalid_payment_method: 'Invalid / Lost Card',
    };

    return categories.map((cat) => {
      const match = opportunities.filter((o: any) => o.failure_category === cat);
      const count = match.length;
      const amountCents = match.reduce((acc: number, o: any) => acc + Number(o.amount_at_risk_cents || 0), 0);
      const recoveredAmt = match
        .filter((o: any) => o.status === 'recovered')
        .reduce((acc: number, o: any) => acc + Number(o.recovered_amount_cents || 0), 0);
      const rate = amountCents > 0 ? Math.round((recoveredAmt / amountCents) * 100) : 0;

      return {
        category: cat,
        label: labels[cat] || cat,
        count,
        amount_cents: amountCents,
        recovered_amount_cents: recoveredAmt,
        recovery_rate: rate,
        recovery_rate_percentage: rate,
      };
    });
  },

  async importCsvData(
    workspaceId: string,
    rows: any[],
    defaultCountry: string = 'US',
    mappings?: Record<string, string>
  ): Promise<{
    success: boolean;
    totalRows: number;
    validCount: number;
    invalidCount: number;
    importedCount: number;
    duplicatesCount: number;
    duplicateDbRows: any[];
  }> {
    const client = getClient();
    const validation = await validateCsvRowsAuthoritative(workspaceId, rows, defaultCountry, mappings);
    let importedCount = 0;
    let duplicatesCount = 0;
    const duplicateDbRows: any[] = [];

    for (const validRow of validation.validRows) {
      // Find or create customer in Supabase
      const { data: existingCust } = await client
        .from('customers')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('email', validRow.email)
        .maybeSingle();

      let customerId: string;
      if (!existingCust) {
        const { data: newCust, error: custErr } = await client
          .from('customers')
          .insert({
            workspace_id: workspaceId,
            provider_type: validRow.provider,
            provider_customer_id: `cus_csv_${Date.now()}_${importedCount}`,
            email: validRow.email,
            name: validRow.name,
            phone: validRow.phone || '',
            country: defaultCountry || 'US',
            currency: validRow.currency,
            lifetime_value_cents: Math.round(validRow.amount * 100 * 3),
            total_recovered_cents: 0,
            current_risk_status: 'at_risk',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (custErr || !newCust) throw custErr || new Error('Failed to create customer');
        customerId = newCust.id;

        await this.recordCustomerTimelineEvent({
          customer_id: customerId,
          workspace_id: workspaceId,
          event_type: 'customer_created',
          title: 'Customer Created (CSV Import)',
          description: `Customer ${validRow.name} (${validRow.email}) imported from CSV into Supabase`,
          actor: 'CSV Data Pipeline',
        });
      } else {
        customerId = existingCust.id;
      }

      // Check duplicate invoice in Supabase
      const { data: existingInv } = await client
        .from('invoices')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('provider_invoice_id', validRow.invoice_id)
        .maybeSingle();

      if (existingInv) {
        duplicatesCount++;
        duplicateDbRows.push({
          rowNumber: validRow.rowNumber,
          name: validRow.name,
          email: validRow.email,
          invoice_id: validRow.invoice_id,
          reason: `Invoice ID "${validRow.invoice_id}" already exists in Supabase`,
        });
        continue;
      }

      const amountCents = Math.round(validRow.amount * 100);

      // Create Subscription in Supabase
      const { data: subData } = await client
        .from('subscriptions')
        .insert({
          workspace_id: workspaceId,
          customer_id: customerId,
          provider_type: validRow.provider,
          provider_subscription_id: `sub_csv_${Date.now()}_${importedCount}`,
          plan_name: `${validRow.subscription_type.toUpperCase()} Subscription`,
          amount_cents: amountCents,
          currency: validRow.currency,
          status: 'past_due',
          billing_interval: validRow.subscription_type,
          subscription_start_date: new Date(Date.now() - 30 * 86400000).toISOString(),
          renewal_count: 1,
          current_period_end: new Date(validRow.next_billing_date).toISOString(),
          next_billing_date: validRow.next_billing_date,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      // Create Invoice in Supabase
      const { data: invData, error: invErr } = await client
        .from('invoices')
        .insert({
          workspace_id: workspaceId,
          customer_id: customerId,
          subscription_id: subData?.id || null,
          provider_type: validRow.provider,
          provider_invoice_id: validRow.invoice_id,
          amount_cents: amountCents,
          currency: validRow.currency,
          status: 'open',
          due_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (invErr) throw invErr;

      // Classify failure
      const adapter = PaymentProviderFactory.getAdapter(validRow.provider);
      const category = adapter.classifyFailure(validRow.failure_reason);

      // Create Payment Failure in Supabase
      const { data: failData, error: failErr } = await client
        .from('payment_failures')
        .insert({
          workspace_id: workspaceId,
          customer_id: customerId,
          invoice_id: invData.id,
          amount_cents: amountCents,
          currency: validRow.currency,
          provider_type: validRow.provider,
          provider_failure_code: validRow.failure_reason,
          normalized_category: category,
          raw_error_message: validRow.error_message || `Payment declined: ${validRow.failure_reason}`,
          occurred_at: new Date().toISOString(),
          is_resolved: false,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (failErr) throw failErr;

      // Create Recovery Opportunity in Supabase
      await this.createRecoveryOpportunity(workspaceId, {
        customer_id: customerId,
        payment_failure_id: failData.id,
        amount_at_risk_cents: amountCents,
        currency: validRow.currency,
        failure_category: category,
        status: 'new',
      });

      importedCount++;
    }

    await this.recordAuditLog(workspaceId, {
      user_email: 'pipeline@revenue-recovery.io',
      action: 'csv_data_imported',
      resource_type: 'data_pipeline',
      resource_id: `import_${Date.now()}`,
      metadata: {
        totalRows: rows.length,
        importedCount,
        duplicatesCount,
        invalidCount: validation.invalidCount,
      },
    });

    return {
      success: true,
      totalRows: rows.length,
      validCount: validation.validCount,
      invalidCount: validation.invalidCount,
      importedCount,
      duplicatesCount,
      duplicateDbRows,
    };
  },

  // ====================================================================
  // CAMPAIGNS & STEPS
  // ====================================================================
  async getCampaigns(workspaceId: string): Promise<RecoveryCampaign[]> {
    const client = getClient();
    const { data: camps, error: campErr } = await client
      .from('recovery_campaigns')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (campErr) throw campErr;

    const { data: steps, error: stepErr } = await client
      .from('recovery_steps')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (stepErr) throw stepErr;

    return (camps || []).map((c: any) => ({
      ...c,
      steps: (steps || [])
        .filter((s: any) => s.campaign_id === c.id)
        .sort((a: any, b: any) => a.step_number - b.step_number),
    }));
  },

  async getRecoveryCampaigns(workspaceId: string): Promise<RecoveryCampaign[]> {
    return this.getCampaigns(workspaceId);
  },

  async createCampaign(workspaceId: string, campaignData: any): Promise<RecoveryCampaign> {
    const client = getClient();
    const { data: camp, error: campErr } = await client
      .from('recovery_campaigns')
      .insert({
        workspace_id: workspaceId,
        name: campaignData.name,
        description: campaignData.description || '',
        is_active: campaignData.is_active !== undefined ? campaignData.is_active : true,
        target_categories: campaignData.target_categories || ['insufficient_funds', 'payment_method_declined'],
        min_amount_cents: campaignData.min_amount_cents || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (campErr) throw campErr;

    const stepsToInsert = (campaignData.steps || []).map((s: any, idx: number) => ({
      campaign_id: camp.id,
      workspace_id: workspaceId,
      step_number: s.step_number || idx + 1,
      delay_hours: s.delay_hours || 0,
      action_type: s.action_type || 'send_email',
      email_subject: s.email_subject || 'Payment Failed',
      email_body_template: s.email_body_template || '',
      is_active: s.is_active !== undefined ? s.is_active : true,
      created_at: new Date().toISOString(),
    }));

    let insertedSteps: RecoveryStep[] = [];
    if (stepsToInsert.length > 0) {
      const { data: sData } = await client.from('recovery_steps').insert(stepsToInsert).select('*');
      insertedSteps = sData || [];
    }

    return {
      ...camp,
      steps: insertedSteps,
    };
  },

  async updateCampaign(workspaceId: string, campaignId: string, updates: any): Promise<RecoveryCampaign | null> {
    const client = getClient();
    const { data: camp, error } = await client
      .from('recovery_campaigns')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();
    if (error) return null;

    const { data: steps } = await client
      .from('recovery_steps')
      .select('*')
      .eq('campaign_id', campaignId);

    return {
      ...camp,
      steps: steps || [],
    };
  },

  async toggleCampaign(workspaceId: string, campaignId: string): Promise<RecoveryCampaign | null> {
    const client = getClient();
    const { data: current } = await client
      .from('recovery_campaigns')
      .select('is_active')
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .single();
    if (!current) return null;

    return this.updateCampaign(workspaceId, campaignId, { is_active: !current.is_active });
  },

  // ====================================================================
  // WEBHOOK EVENT DETAIL
  // ====================================================================
  async getWebhookEventById(workspaceId: string, eventId: string): Promise<WebhookEventRecord | null> {
    const client = getClient();
    const { data, error } = await client
      .from('webhook_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', eventId)
      .maybeSingle();
    if (error) throw error;
    return (data as WebhookEventRecord) || null;
  },

  // ====================================================================
  // MEMBERSHIPS
  // ====================================================================
  async getWorkspaceMembers(workspaceId: string): Promise<any[]> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .select('*, user:users(*)')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      name: m.user?.full_name || 'Team Member',
      email: m.user?.email || 'team@revenuerecoveryos.com',
      role: m.role || 'Billing Ops',
      mfaEnabled: true,
      lastActive: 'Active recently',
    }));
  },

  async createMembership(membership: { workspace_id: string; user_id: string; role: UserRole }): Promise<Membership> {
    const client = getClient();
    const { data, error } = await client
      .from('memberships')
      .insert({
        workspace_id: membership.workspace_id,
        user_id: membership.user_id,
        role: membership.role,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as Membership;
  },

  async deleteMembership(workspaceId: string, membershipId: string): Promise<void> {
    const client = getClient();
    const { error } = await client
      .from('memberships')
      .delete()
      .eq('id', membershipId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
  },

  // ====================================================================
  // COPILOT & INTELLIGENCE FEEDBACK PERSISTENCE
  // ====================================================================
  async recordCopilotExecutionLog(log: {
    id: string;
    workspace_id: string;
    opportunity_id: string;
    step_id: string;
    action_type: string;
    state_before: string;
    state_after: string;
    executed_by: string;
    provider_reference?: string;
    result_status: string;
    failure_reason?: string;
    executed_at: string;
  }): Promise<void> {
    const client = getClient();
    const { error } = await client.from('copilot_execution_logs').insert(log);
    if (error) {
      throw new Error(`Failed to persist copilot execution log: ${error.message}`);
    }
  },

  async getCopilotExecutionLogs(workspaceId: string, opportunityId?: string): Promise<any[]> {
    const client = getClient();
    let query = client.from('copilot_execution_logs').select('*').eq('workspace_id', workspaceId);
    if (opportunityId) {
      query = query.eq('opportunity_id', opportunityId);
    }
    const { data, error } = await query.order('executed_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to fetch copilot execution logs: ${error.message}`);
    }
    return (data || []).map((l: any) => ({
      id: l.id,
      workspaceId: l.workspace_id,
      opportunityId: l.opportunity_id,
      stepId: l.step_id,
      actionType: l.action_type,
      stateBefore: l.state_before,
      stateAfter: l.state_after,
      executedBy: l.executed_by,
      providerReference: l.provider_reference,
      resultStatus: l.result_status,
      failureReason: l.failure_reason,
      executedAt: l.executed_at,
    }));
  },

  async recordOpportunityAction(action: {
    id: string;
    workspace_id: string;
    opportunity_id: string;
    action_type: string;
    channel?: string;
    executed_by: string;
    notes?: string;
    executed_at: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const client = getClient();
    const { error } = await client.from('opportunity_actions').insert(action);
    if (error) {
      throw new Error(`Failed to persist opportunity action: ${error.message}`);
    }
  },

  async recordOpportunityOutcome(outcome: {
    id: string;
    workspace_id: string;
    opportunity_id: string;
    outcome: string;
    recovered_amount_cents: number;
    time_to_recovery_seconds?: number;
    settlement_method?: string;
    resolved_at: string;
    feedback_notes?: string;
  }): Promise<void> {
    const client = getClient();
    const { error } = await client.from('opportunity_outcomes').insert(outcome);
    if (error) {
      throw new Error(`Failed to persist opportunity outcome: ${error.message}`);
    }
  },

  async getOpportunityActions(workspaceId: string, opportunityId?: string): Promise<any[]> {
    const client = getClient();
    let query = client.from('opportunity_actions').select('*').eq('workspace_id', workspaceId);
    if (opportunityId) {
      query = query.eq('opportunity_id', opportunityId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch opportunity actions: ${error.message}`);
    return data || [];
  },

  async getOpportunityOutcomes(workspaceId: string, opportunityId?: string): Promise<any[]> {
    const client = getClient();
    let query = client.from('opportunity_outcomes').select('*').eq('workspace_id', workspaceId);
    if (opportunityId) {
      query = query.eq('opportunity_id', opportunityId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch opportunity outcomes: ${error.message}`);
    return data || [];
  },

  async escalateRecoveryOpportunity(workspaceId: string, opportunityId: string, reason: string): Promise<void> {
    const client = getClient();
    const { error } = await client
      .from('recovery_opportunities')
      .update({ status: 'contacted', notes: reason, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', opportunityId);
    if (error) throw error;

    await client.from('audit_logs').insert({
      id: `audit_${crypto.randomUUID()}`,
      workspace_id: workspaceId,
      user_email: 'copilot_operator',
      action: 'opportunity.escalated',
      resource_type: 'recovery_opportunity',
      resource_id: opportunityId,
      metadata: { reason },
      created_at: new Date().toISOString(),
    });
  },

  async seedDemoWorkspace(workspaceId: string, workspaceName: string = 'Acme Cloud Platform (Live Demo)'): Promise<{
    totalCustomers: number;
    totalFailures: number;
    totalRecoveries: number;
  }> {
    const client = getClient();
    const dataset = generateCompleteDemoWorkspace(workspaceId, workspaceName);

    // 1. Seed sample customers
    const rawCustomers = dataset.customers.slice(0, 150);
    const custInserts = rawCustomers.map((c) => ({
      workspace_id: workspaceId,
      provider_type: c.provider_type || 'stripe',
      provider_customer_id: c.provider_customer_id || c.id,
      email: c.email || 'no-email@customer.com',
      name: c.name || 'Customer',
      phone: c.phone || '',
      country: c.country || 'US',
      currency: (c.currency || 'USD').toUpperCase(),
      lifetime_value_cents: c.lifetime_value_cents || 0,
      total_recovered_cents: c.total_recovered_cents || 0,
      current_risk_status: c.current_risk_status || 'healthy',
    }));

    const { data: insertedCusts, error: cErr } = await client
      .from('customers')
      .upsert(custInserts, { onConflict: 'workspace_id,provider_type,provider_customer_id' })
      .select('id, provider_customer_id');

    if (cErr) {
      console.warn('[Demo Seed] Customers upsert warning:', cErr.message);
    }

    const pCustMap = new Map<string, string>();
    insertedCusts?.forEach((c) => pCustMap.set(c.provider_customer_id, c.id));
    const datasetCustIdToUuid = new Map<string, string>();
    rawCustomers.forEach((c) => {
      const uuid = pCustMap.get(c.provider_customer_id || c.id);
      if (uuid) datasetCustIdToUuid.set(c.id, uuid);
    });

    // 2. Seed invoices
    const rawInvs = dataset.invoices.filter((i) => datasetCustIdToUuid.has(i.customer_id)).slice(0, 150);
    const invInserts = rawInvs.map((inv) => ({
      workspace_id: workspaceId,
      customer_id: datasetCustIdToUuid.get(inv.customer_id)!,
      provider_type: inv.provider_type || 'stripe',
      provider_invoice_id: inv.provider_invoice_id || inv.id,
      amount_cents: inv.amount_cents || 0,
      currency: (inv.currency || 'USD').toUpperCase(),
      status: inv.status || 'open',
      due_date: inv.due_date || new Date().toISOString(),
      created_at: inv.created_at || new Date().toISOString(),
    }));

    const { data: insertedInvs, error: iErr } = await client
      .from('invoices')
      .upsert(invInserts, { onConflict: 'workspace_id,provider_type,provider_invoice_id' })
      .select('id, provider_invoice_id');

    if (iErr) {
      console.warn('[Demo Seed] Invoices upsert warning:', iErr.message);
    }

    const pInvMap = new Map<string, string>();
    insertedInvs?.forEach((i) => pInvMap.set(i.provider_invoice_id, i.id));
    const datasetInvIdToUuid = new Map<string, string>();
    rawInvs.forEach((i) => {
      const uuid = pInvMap.get(i.provider_invoice_id || i.id);
      if (uuid) datasetInvIdToUuid.set(i.id, uuid);
    });

    // 3. Seed payment failures
    const rawFails = dataset.paymentFailures.filter((f) => datasetCustIdToUuid.has(f.customer_id)).slice(0, 150);
    const failInserts = rawFails.map((f) => ({
      workspace_id: workspaceId,
      customer_id: datasetCustIdToUuid.get(f.customer_id)!,
      invoice_id: f.invoice_id ? datasetInvIdToUuid.get(f.invoice_id) || null : null,
      amount_cents: f.amount_cents || 0,
      currency: (f.currency || 'USD').toUpperCase(),
      provider_type: f.provider_type || 'stripe',
      normalized_category: f.normalized_category || 'payment_method_declined',
      raw_error_message: f.raw_error_message || (f as any).failure_reason || null,
      occurred_at: f.occurred_at || new Date().toISOString(),
      is_resolved: f.is_resolved ?? false,
    }));

    const { data: insertedFails, error: fErr } = await client
      .from('payment_failures')
      .insert(failInserts)
      .select('id, customer_id, amount_cents, normalized_category');

    if (fErr) {
      console.warn('[Demo Seed] Payment failures insert warning:', fErr.message);
    }

    // 4. Seed recovery opportunities
    const oppInserts = (insertedFails || []).map((f, idx) => ({
      workspace_id: workspaceId,
      customer_id: f.customer_id,
      payment_failure_id: f.id,
      amount_at_risk_cents: f.amount_cents,
      recovered_amount_cents: idx % 3 === 0 ? f.amount_cents : 0,
      status: idx % 3 === 0 ? 'recovered' : (idx % 2 === 0 ? 'payment_retry_pending' : 'active'),
      currency: 'USD',
      failure_category: f.normalized_category,
      recommended_action: 'Smart Retry & 1-Click Update',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data: insertedOpps, error: oErr } = await client
      .from('recovery_opportunities')
      .insert(oppInserts)
      .select('id, customer_id, amount_at_risk_cents, recovered_amount_cents, status');

    if (oErr) {
      console.warn('[Demo Seed] Recovery opportunities insert warning:', oErr.message);
    }

    // 5. Seed revenue events for recovered transactions
    const revInserts = (insertedOpps || []).filter((o) => o.status === 'recovered').map((o) => ({
      workspace_id: workspaceId,
      opportunity_id: o.id,
      customer_id: o.customer_id,
      provider_type: 'stripe',
      amount_cents: o.recovered_amount_cents || o.amount_at_risk_cents,
      currency: 'USD',
      event_type: 'revenue_recovered',
      recorded_at: new Date().toISOString(),
    }));

    const { error: rErr } = await client.from('revenue_events').insert(revInserts);
    if (rErr) {
      console.warn('[Demo Seed] Revenue events insert warning:', rErr.message);
    }

    return {
      totalCustomers: (insertedCusts || []).length,
      totalFailures: (insertedFails || []).length,
      totalRecoveries: revInserts.length,
    };
  },
};
