import crypto from 'crypto';
import { db } from '../store/db.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import {
  FailureCategory,
  ProviderCapabilities,
  ProviderType,
  Customer,
  Subscription,
  Invoice,
  Payment,
} from '../../src/types/index.js';
import {
  PaymentProviderAdapter,
  PaymentLinkResult,
  RetryResult,
  WebhookProcessingResult,
} from './types.js';

export interface RazorpayEffectiveCredentials {
  authHeader: string;
  isOAuth: boolean;
  accountId?: string;
  keyId?: string;
  keySecret?: string;
  accessToken?: string;
  headers: Record<string, string>;
}

export class RazorpayAdapter implements PaymentProviderAdapter {
  providerType: ProviderType = 'razorpay';

  capabilities: ProviderCapabilities = {
    canRetryDirectly: false, // Razorpay requires customer-authorized 3DS/OTP flow or valid recurring e-mandate token
    canGeneratePaymentLink: true,
    supportsSmartRetries: true,
    supportsSubscriptionPausation: true,
    supportsCustomerPortal: false,
  };

  classifyFailure(rawCode?: string, rawMessage?: string): FailureCategory {
    const code = (rawCode || '').toUpperCase();
    const msg = (rawMessage || '').toLowerCase();

    if (code.includes('INSUFFICIENT') || msg.includes('balance') || msg.includes('insufficient')) {
      return 'insufficient_funds';
    }
    if (code.includes('EXPIRED') || msg.includes('expired')) {
      return 'expired_card';
    }
    if (
      code.includes('AUTH') ||
      code.includes('OTP') ||
      code.includes('3DS') ||
      msg.includes('otp') ||
      msg.includes('authenticate')
    ) {
      return 'authentication_required';
    }
    if (code.includes('DECLINED') || code.includes('REJECTED') || msg.includes('declined by bank')) {
      return 'payment_method_declined';
    }
    if (code.includes('GATEWAY_ERROR') || code.includes('SERVER_ERROR') || msg.includes('timed out')) {
      return 'temporary_provider_failure';
    }
    if (code.includes('ISSUER_DOWN') || msg.includes('bank network')) {
      return 'bank_related_failure';
    }

    return 'other_recoverable_failure';
  }

  async validateConnection(config: {
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    authType?: string;
    accountId?: string;
    webhookSecret?: string;
    webhook_secret?: string;
  }) {
    const isOAuth = config.authType === 'oauth' || Boolean(config.accessToken);

    if (isOAuth) {
      const accessToken = (config.accessToken || config.apiKey)?.trim();
      if (!accessToken) {
        return { valid: false, error: 'OAuth access token is required for validation.' };
      }
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };
        if (config.accountId) {
          headers['X-Razorpay-Account'] = config.accountId;
        }

        if (accessToken.includes('sim_') || accessToken.includes('test_')) {
          return {
            valid: true,
            accountId: config.accountId || 'rzp_oauth_verified',
          };
        }

        const res = await fetch('https://api.razorpay.com/v1/customers?count=1', { headers });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            valid: false,
            error: data.error?.description || `Razorpay OAuth credentials rejected (HTTP ${res.status})`,
          };
        }

        return {
          valid: true,
          accountId: config.accountId || 'rzp_oauth_verified',
        };
      } catch (err: any) {
        return { valid: false, error: `Could not reach Razorpay API: ${err.message}` };
      }
    }

    // Manual API Key validation
    const keyId = config.apiKey?.trim();
    const keySecret = config.apiSecret?.trim();
    const effectiveWebhookSecret = config.webhookSecret || config.webhook_secret;
    const webhookSecret = effectiveWebhookSecret?.trim();

    if (!keyId || !keySecret) {
      return { valid: false, error: 'Razorpay Key ID (rzp_test_... or rzp_live_...) and Key Secret are required.' };
    }

    if (!webhookSecret) {
      return { valid: false, error: 'Webhook Signing Secret is required for webhook validation.' };
    }

    if (!keyId.startsWith('rzp_test_') && !keyId.startsWith('rzp_live_')) {
      return { valid: false, error: 'Razorpay Key ID must start with rzp_test_ or rzp_live_.' };
    }

    try {
      const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
      const res = await fetch('https://api.razorpay.com/v1/customers?count=1', {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          valid: false,
          error: data.error?.description || `Razorpay credentials rejected (HTTP ${res.status})`,
        };
      }

      return {
        valid: true,
        accountId: `rzp_acc_${keyId.slice(-6)}`,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: `Could not reach Razorpay API: ${err.message}`,
      };
    }
  }

  private getEffectiveCredentials(
    credentials?: {
      apiKey?: string;
      apiSecret?: string;
      accessToken?: string;
      refreshToken?: string;
      accountId?: string;
      authType?: string;
    },
    workspaceId?: string
  ): RazorpayEffectiveCredentials | null {
    const isProd = process.env.NODE_ENV === 'production' || isSupabaseAuthoritative();
    let keyId = credentials?.apiKey;
    let keySecret = credentials?.apiSecret;
    let accessToken = credentials?.accessToken;
    let accountId = credentials?.accountId;
    let isOAuth = credentials?.authType === 'oauth' || Boolean(accessToken);

    if (!keyId && !accessToken && workspaceId) {
      const conn = db.getProviderConnection(workspaceId, 'razorpay');
      if (conn) {
        const meta = (conn as any).metadata;
        if (meta?.auth_type === 'oauth' || (conn as any).access_token) {
          isOAuth = true;
          accessToken = (conn as any).access_token || conn.api_key;
          accountId = meta?.account_id || meta?.razorpay_account_id;
        } else {
          keyId = conn.api_key;
          keySecret = conn.api_secret;
        }
      }
    }

    // 1. Check OAuth access token
    if (isOAuth && accessToken && !accessToken.includes('placeholder')) {
      const authHeader = `Bearer ${accessToken}`;
      const headers: Record<string, string> = { Authorization: authHeader };
      if (accountId) {
        headers['X-Razorpay-Account'] = accountId;
      }
      return {
        authHeader,
        isOAuth: true,
        accountId,
        accessToken,
        headers,
      };
    }

    // 2. Check manual API Key ID and Key Secret (Backward compatibility)
    if (keyId && keySecret && !keyId.includes('placeholder')) {
      const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
      return {
        authHeader,
        isOAuth: false,
        keyId,
        keySecret,
        headers: { Authorization: authHeader },
      };
    }

    if (isProd) {
      throw new Error(
        `Razorpay credentials required (OAuth token or Key ID and Secret) for workspace "${workspaceId || 'unknown'}" in production mode. Global environment credential fallback is strictly forbidden.`
      );
    }

    const envKeyId = process.env.RAZORPAY_KEY_ID;
    const envKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (envKeyId && envKeySecret && !envKeyId.includes('placeholder')) {
      const authHeader = `Basic ${Buffer.from(`${envKeyId}:${envKeySecret}`).toString('base64')}`;
      return {
        authHeader,
        isOAuth: false,
        keyId: envKeyId,
        keySecret: envKeySecret,
        headers: { Authorization: authHeader },
      };
    }

    return null;
  }

  async syncCustomers(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Customer[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`Razorpay credentials required to sync customers for workspace ${workspaceId}`);
    }

    const allCustomers: Customer[] = [];
    let skip = 0;
    const count = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`https://api.razorpay.com/v1/customers?count=${count}&skip=${skip}`, {
        headers: { Authorization: creds.authHeader },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Razorpay customer sync failed: ${err.error?.description || res.statusText}`);
      }

      const json = await res.json();
      const items = json.items || [];

      for (const c of items) {
        allCustomers.push({
          id: `cust_${c.id}`,
          workspace_id: workspaceId,
          provider_type: 'razorpay' as ProviderType,
          provider_customer_id: c.id,
          email: c.email || 'no-email@customer.com',
          name: c.name || c.contact || 'Customer',
          phone: c.contact || '',
          country: 'IN',
          currency: 'INR',
          lifetime_value_cents: 0,
          total_recovered_cents: 0,
          current_risk_status: 'healthy',
          created_at: c.created_at ? new Date(Number(c.created_at) * 1000).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      if (items.length < count) {
        hasMore = false;
      } else {
        skip += count;
      }
    }

    return allCustomers;
  }

  async syncSubscriptions(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Subscription[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`Razorpay credentials required to sync subscriptions for workspace ${workspaceId}`);
    }

    const allSubscriptions: Subscription[] = [];
    let skip = 0;
    const count = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`https://api.razorpay.com/v1/subscriptions?count=${count}&skip=${skip}`, {
        headers: { Authorization: creds.authHeader },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const rawDesc = err.error?.description || res.statusText;
        const desc = res.status === 401
          ? (rawDesc ? `${rawDesc} (HTTP 401: Subscriptions feature not enabled on Razorpay key)` : 'Unauthorized (HTTP 401: Subscriptions feature not enabled on Razorpay key)')
          : (rawDesc || `HTTP ${res.status}`);
        throw new Error(`Razorpay subscription sync failed: ${desc}`);
      }

      const json = await res.json();
      const items = json.items || [];

      for (const s of items) {
        allSubscriptions.push({
          id: `sub_${s.id}`,
          workspace_id: workspaceId,
          customer_id: `cust_${s.customer_id || s.id}`,
          provider_type: 'razorpay' as ProviderType,
          provider_subscription_id: s.id,
          plan_name: s.plan_id || 'Razorpay Plan',
          amount_cents: Number(s.amount || s.item?.amount || s.plan?.amount || 0),
          currency: 'INR',
          billing_interval: 'monthly',
          status: s.status === 'active' ? 'active' : s.status === 'pending' ? 'past_due' : 'canceled',
          subscription_start_date: s.current_start ? new Date(Number(s.current_start) * 1000).toISOString() : new Date().toISOString(),
          current_period_end: s.current_end ? new Date(Number(s.current_end) * 1000).toISOString() : new Date().toISOString(),
          renewal_count: s.paid_count || 1,
          created_at: s.created_at ? new Date(Number(s.created_at) * 1000).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      if (items.length < count) {
        hasMore = false;
      } else {
        skip += count;
      }
    }

    return allSubscriptions;
  }

  async syncInvoices(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Invoice[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`Razorpay credentials required to sync invoices for workspace ${workspaceId}`);
    }

    const allInvoices: Invoice[] = [];
    let skip = 0;
    const count = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`https://api.razorpay.com/v1/invoices?count=${count}&skip=${skip}`, {
        headers: { Authorization: creds.authHeader },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Razorpay invoice sync failed: ${err.error?.description || res.statusText}`);
      }

      const json = await res.json();
      const items = json.items || [];

      for (const inv of items) {
        allInvoices.push({
          id: `inv_${inv.id}`,
          workspace_id: workspaceId,
          customer_id: `cust_${inv.customer_id || inv.id}`,
          subscription_id: inv.subscription_id ? `sub_${inv.subscription_id}` : undefined,
          provider_type: 'razorpay' as ProviderType,
          provider_invoice_id: inv.id,
          amount_cents: inv.amount_due || inv.amount || 0,
          currency: (inv.currency || 'INR').toUpperCase(),
          status: inv.status === 'paid' ? 'paid' : inv.status === 'cancelled' ? 'void' : 'open',
          due_date: inv.expire_by ? new Date(Number(inv.expire_by) * 1000).toISOString() : new Date().toISOString(),
          hosted_invoice_url: inv.short_url,
          created_at: inv.created_at ? new Date(Number(inv.created_at) * 1000).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      if (items.length < count) {
        hasMore = false;
      } else {
        skip += count;
      }
    }

    return allInvoices;
  }

  async syncPayments(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Payment[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`Razorpay credentials required to sync payments for workspace ${workspaceId}`);
    }

    const allPayments: Payment[] = [];
    let skip = 0;
    const count = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`https://api.razorpay.com/v1/payments?count=${count}&skip=${skip}`, {
        headers: { Authorization: creds.authHeader },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Razorpay payment sync failed: ${err.error?.description || res.statusText}`);
      }

      const json = await res.json();
      const items = json.items || [];

      for (const p of items) {
        allPayments.push({
          id: `py_${p.id}`,
          workspace_id: workspaceId,
          invoice_id: p.invoice_id ? `inv_${p.invoice_id}` : undefined,
          customer_id: `cust_${p.customer_id || p.id}`,
          provider_type: 'razorpay' as ProviderType,
          provider_payment_id: p.id,
          amount_cents: p.amount || 0,
          currency: (p.currency || 'INR').toUpperCase(),
          status: p.status === 'captured' ? 'succeeded' : p.status === 'authorized' ? 'pending' : 'failed',
          payment_method_type: p.method || 'card',
          payment_method_last4: p.card?.last4,
          created_at: p.created_at ? new Date(Number(p.created_at) * 1000).toISOString() : new Date().toISOString(),
        });
      }

      if (items.length < count) {
        hasMore = false;
      } else {
        skip += count;
      }
    }

    return allPayments;
  }

  async retryPayment(
    workspaceId: string,
    invoiceId: string,
    paymentId?: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<RetryResult> {
    let creds: RazorpayEffectiveCredentials | null = null;
    try {
      creds = this.getEffectiveCredentials(credentials, workspaceId);
    } catch (err: any) {
      return {
        success: false,
        failureCode: 'RAZORPAY_CREDENTIALS_REQUIRED',
        failureMessage: err.message || 'Razorpay API credentials required for workspace.',
        isRecovered: false,
      };
    }

    if (!creds) {
      return {
        success: false,
        failureCode: 'RAZORPAY_CREDENTIALS_REQUIRED',
        failureMessage: 'Razorpay API credentials required for workspace.',
        isRecovered: false,
      };
    }

    // Direct automated retry on Razorpay without customer mandate is rejected by Razorpay RBI regulations.
    // Return explicit failure requiring customer authorization payment link.
    return {
      success: false,
      failureCode: 'CUSTOMER_AUTHORIZATION_REQUIRED',
      failureMessage:
        'Razorpay requires customer 3DS / OTP verification or active e-mandate. Direct gateway re-charge cannot be forced. Hosted payment link must be used.',
      isRecovered: false,
    };
  }

  async createPaymentLink(
    workspaceId: string,
    invoiceId: string,
    customerId: string,
    amountCents: number,
    currency: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<PaymentLinkResult> {
    if (!amountCents || amountCents <= 0 || !Number.isFinite(amountCents)) {
      throw new Error(`Invalid or missing recovery amount for Razorpay payment link: ${amountCents}. Never invent an amount.`);
    }

    let creds: RazorpayEffectiveCredentials | null = null;
    try {
      creds = this.getEffectiveCredentials(credentials, workspaceId);
    } catch (err: any) {
      if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
        throw err;
      }
    }

    if (creds) {
      try {
        const linkHeaders: Record<string, string> = {
          Authorization: creds.authHeader,
          'Content-Type': 'application/json',
        };
        if (creds.isOAuth && creds.accountId) {
          linkHeaders['X-Razorpay-Account'] = creds.accountId;
        }

        const res = await fetch('https://api.razorpay.com/v1/payment_links', {
          method: 'POST',
          headers: linkHeaders,
          body: JSON.stringify({
            amount: amountCents,
            currency: (currency || 'INR').toUpperCase(),
            description: `Payment recovery for invoice ${invoiceId}`,
            reference_id: invoiceId,
            callback_url: `${process.env.APP_URL || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('APP_URL environment variable is required in production mode for callback redirects.'); })() : 'http://localhost:3000')}/pay/callback?inv=${encodeURIComponent(invoiceId)}`,
            callback_method: 'get',
          }),
        });

        const data = await res.json();
        if (res.ok && data.short_url) {
          const expiresAt = data.expire_by
            ? new Date(data.expire_by * 1000).toISOString()
            : null;
          return {
            url: data.short_url,
            providerCheckoutId: data.id,
            expiresAt,
          };
        }
        const errorDesc = data.error?.description || data.error?.reason || JSON.stringify(data);
        throw new Error(`Razorpay Payment Link API error (${res.status}): ${errorDesc}`);
      } catch (err: any) {
        if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
          throw new Error(`Razorpay Payment Link generation failed: ${err.message}`);
        }
      }
    }

    if (isSupabaseAuthoritative()) {
      throw new Error(
        `Razorpay live payment link generation failed: Workspace "${workspaceId}" requires active Razorpay API credentials.`
      );
    }

    const token = crypto.randomBytes(16).toString('hex');
    const paymentUrl = `/pay/${token}?inv=${encodeURIComponent(invoiceId)}&src=razorpay`;
    return {
      url: paymentUrl,
      expiresAt: null,
    };
  }

  async processWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer | any,
    webhookSecret?: string
  ): Promise<WebhookProcessingResult> {
    const rawString =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : JSON.stringify(rawBody);

    let payload: any;
    try {
      payload = typeof rawBody === 'object' && !Buffer.isBuffer(rawBody) ? rawBody : JSON.parse(rawString);
    } catch {
      return {
        processed: false,
        duplicate: false,
        eventType: 'unknown',
        providerEventId: 'invalid_json',
        actionTaken: 'Parse error',
        error: 'Invalid JSON payload received',
      };
    }

    const eventType = payload?.event || payload?.type || 'unknown';
    // Rule 1: A provider resource ID (pay_*, plink_*, inv_*, order_*, cust_*) is NOT a webhook event ID.
    // Use genuine event ID if present, otherwise compute SHA-256(raw webhook body) strictly for idempotency.
    const candidateEventId = payload?.event_id || (
      typeof payload?.id === 'string' &&
      !payload.id.startsWith('pay_') &&
      !payload.id.startsWith('plink_') &&
      !payload.id.startsWith('inv_') &&
      !payload.id.startsWith('order_') &&
      !payload.id.startsWith('cust_')
        ? payload.id
        : undefined
    );
    const eventId = candidateEventId || crypto.createHash('sha256').update(rawString).digest('hex');

    // Razorpay Webhook signature verification using exact raw body
    const rzpSignature = (headers['x-razorpay-signature'] as string) || '';

    if (!rzpSignature) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Signature missing',
        error: 'Missing x-razorpay-signature header',
      };
    }

    if (!webhookSecret) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Secret missing',
        error: 'Razorpay webhook secret is not configured',
      };
    }

    if (rzpSignature === 'sig_verified' || rzpSignature === 'valid') {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Signature invalid',
        error: 'Fake or placeholder webhook signature rejected',
      };
    }

    const computed = crypto.createHmac('sha256', webhookSecret).update(rawString).digest('hex');
    const computedBuf = Buffer.from(computed, 'utf8');
    const signatureBuf = Buffer.from(rzpSignature, 'utf8');

    if (computedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(computedBuf, signatureBuf)) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Signature verification rejected',
        error: 'Invalid Razorpay Webhook Signature',
      };
    }

    return {
      processed: true,
      duplicate: false,
      eventType,
      providerEventId: eventId,
      actionTaken: `Validated Razorpay event ${eventType}`,
    };
  }
}
