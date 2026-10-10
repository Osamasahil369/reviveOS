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
  BillingIntervalType,
} from '../../src/types/index.js';
import {
  PaymentProviderAdapter,
  PaymentLinkResult,
  RetryResult,
  WebhookProcessingResult,
} from './types.js';

export class StripeAdapter implements PaymentProviderAdapter {
  providerType: ProviderType = 'stripe';

  capabilities: ProviderCapabilities = {
    canRetryDirectly: true,
    canGeneratePaymentLink: true,
    supportsSmartRetries: true,
    supportsSubscriptionPausation: true,
    supportsCustomerPortal: true,
  };

  classifyFailure(rawCode?: string, rawMessage?: string): FailureCategory {
    const code = (rawCode || '').toLowerCase();
    const msg = (rawMessage || '').toLowerCase();

    if (code === 'insufficient_funds' || msg.includes('insufficient funds')) {
      return 'insufficient_funds';
    }
    if (code === 'expired_card' || msg.includes('expired')) {
      return 'expired_card';
    }
    if (
      code === 'authentication_required' ||
      code === 'requires_action' ||
      msg.includes('3d secure') ||
      msg.includes('authentication required')
    ) {
      return 'authentication_required';
    }
    if (code === 'incorrect_cvc' || code === 'invalid_cvc' || code === 'lost_card' || code === 'stolen_card') {
      return 'invalid_payment_method';
    }
    if (
      code === 'card_declined' ||
      code === 'generic_decline' ||
      code === 'do_not_honor' ||
      msg.includes('declined')
    ) {
      return 'payment_method_declined';
    }
    if (
      code === 'processing_error' ||
      code === 'issuer_not_available' ||
      msg.includes('issuer') ||
      msg.includes('bank')
    ) {
      return 'bank_related_failure';
    }
    if (code === 'rate_limit' || code === 'api_connection_error' || msg.includes('temporary')) {
      return 'temporary_provider_failure';
    }
    if (code === 'fraudulent' || code === 'pickup_card') {
      return 'unrecoverable_failure';
    }

    return 'other_recoverable_failure';
  }

  async validateConnection(config: { apiKey?: string; apiSecret?: string; webhookSecret?: string }) {
    const secretKey = config.apiSecret || config.apiKey;
    if (!secretKey) {
      return { valid: false, error: 'Stripe Secret Key is required (starts with sk_test_ or sk_live_)' };
    }
    if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_') && !secretKey.startsWith('rk_')) {
      return { valid: false, error: 'Invalid Stripe Key format. Key must begin with sk_test_, sk_live_, or rk_' };
    }

    // Verify key with Stripe API
    try {
      const res = await fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          valid: true,
          accountId: data.id || undefined,
        };
      }
      // Fallback balance check if restricted key cannot access /v1/account
      const balRes = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!balRes.ok) {
        const data = await balRes.json().catch(() => ({}));
        return {
          valid: false,
          error: data.error?.message || `Stripe authentication failed (HTTP ${balRes.status})`,
        };
      }
      return {
        valid: true,
        accountId: undefined,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: `Could not reach Stripe API: ${err.message}`,
      };
    }
  }

  private getEffectiveApiKey(credentials?: { apiKey?: string; apiSecret?: string }, workspaceId?: string): string {
    let key = credentials?.apiSecret || credentials?.apiKey;

    if (!key && workspaceId) {
      const conn = db.getProviderConnection(workspaceId, 'stripe');
      if (conn?.api_key || conn?.api_secret) {
        key = conn.api_secret || conn.api_key;
      }
    }

    if (key && !key.includes('placeholder')) return key;

    // AUTHORITATIVE / PRODUCTION: credentials.apiSecret OR credentials.apiKey must be present.
    // NEVER use process.env.STRIPE_SECRET_KEY as a fallback in production mode.
    if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
      throw new Error(
        `Stripe API key is required for workspace "${workspaceId || 'unknown'}" in production mode. Global environment credential fallback is strictly forbidden.`
      );
    }

    // DEVELOPMENT ONLY: global env credentials may remain available if explicitly useful for local development.
    const envKey = process.env.STRIPE_SECRET_KEY;
    if (envKey && !envKey.includes('placeholder')) return envKey;

    throw new Error(`Stripe API key is required for workspace "${workspaceId || 'unknown'}".`);
  }

  async syncCustomers(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Customer[]> {
    const key = this.getEffectiveApiKey(credentials, workspaceId);

    const allCustomers: Customer[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    while (hasMore) {
      const url: string = `https://api.stripe.com/v1/customers?limit=100${startingAfter ? `&starting_after=${startingAfter}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Stripe Customer Sync failed: ${err.error?.message || res.statusText}`);
      }

      const json = await res.json();
      const data = json.data || [];

      for (const c of data) {
        allCustomers.push({
          id: `cust_${c.id}`,
          workspace_id: workspaceId,
          provider_type: 'stripe' as ProviderType,
          provider_customer_id: c.id,
          email: c.email || 'no-email@customer.com',
          name: c.name || c.description || c.email || 'Customer',
          phone: c.phone || '',
          country: c.address?.country || 'US',
          currency: (c.currency || 'USD').toUpperCase(),
          lifetime_value_cents: 0,
          total_recovered_cents: 0,
          current_risk_status: 'healthy',
          created_at: new Date(c.created * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      hasMore = Boolean(json.has_more && data.length > 0);
      if (data.length > 0) {
        startingAfter = data[data.length - 1].id;
      }
    }

    return allCustomers;
  }

  async syncSubscriptions(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Subscription[]> {
    const key = this.getEffectiveApiKey(credentials, workspaceId);

    const allSubscriptions: Subscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    while (hasMore) {
      const url: string = `https://api.stripe.com/v1/subscriptions?limit=100${startingAfter ? `&starting_after=${startingAfter}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Stripe Subscription Sync failed: ${err.error?.message || res.statusText}`);
      }

      const json = await res.json();
      const data = json.data || [];

      for (const s of data) {
        allSubscriptions.push({
          id: `sub_${s.id}`,
          workspace_id: workspaceId,
          customer_id: `cust_${s.customer}`,
          provider_type: 'stripe' as ProviderType,
          provider_subscription_id: s.id,
          plan_name: s.items?.data?.[0]?.price?.nickname || s.items?.data?.[0]?.plan?.nickname || 'Default Plan',
          amount_cents: s.items?.data?.[0]?.price?.unit_amount || 0,
          currency: (s.currency || 'USD').toUpperCase(),
          billing_interval: (s.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly') as BillingIntervalType,
          status: s.status === 'active' ? 'active' : s.status === 'past_due' ? 'past_due' : 'canceled',
          subscription_start_date: new Date(s.current_period_start * 1000).toISOString(),
          current_period_end: new Date(s.current_period_end * 1000).toISOString(),
          renewal_count: 1,
          created_at: new Date(s.created * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      hasMore = Boolean(json.has_more && data.length > 0);
      if (data.length > 0) {
        startingAfter = data[data.length - 1].id;
      }
    }

    return allSubscriptions;
  }

  async syncInvoices(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Invoice[]> {
    const key = this.getEffectiveApiKey(credentials, workspaceId);

    const allInvoices: Invoice[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    while (hasMore) {
      const url: string = `https://api.stripe.com/v1/invoices?limit=100${startingAfter ? `&starting_after=${startingAfter}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Stripe Invoice Sync failed: ${err.error?.message || res.statusText}`);
      }

      const json = await res.json();
      const data = json.data || [];

      for (const inv of data) {
        allInvoices.push({
          id: `inv_${inv.id}`,
          workspace_id: workspaceId,
          customer_id: `cust_${inv.customer}`,
          subscription_id: inv.subscription ? `sub_${inv.subscription}` : undefined,
          provider_type: 'stripe' as ProviderType,
          provider_invoice_id: inv.id,
          amount_cents: inv.amount_due || 0,
          currency: (inv.currency || 'USD').toUpperCase(),
          status: inv.status === 'paid' ? 'paid' : inv.status === 'void' ? 'void' : 'open',
          due_date: new Date((inv.due_date || inv.created) * 1000).toISOString(),
          hosted_invoice_url: inv.hosted_invoice_url,
          created_at: new Date(inv.created * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      hasMore = Boolean(json.has_more && data.length > 0);
      if (data.length > 0) {
        startingAfter = data[data.length - 1].id;
      }
    }

    return allInvoices;
  }

  async syncPayments(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Payment[]> {
    const key = this.getEffectiveApiKey(credentials, workspaceId);

    const allPayments: Payment[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    while (hasMore) {
      const url: string = `https://api.stripe.com/v1/charges?limit=100${startingAfter ? `&starting_after=${startingAfter}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Stripe Payments Sync failed: ${err.error?.message || res.statusText}`);
      }

      const json = await res.json();
      const data = json.data || [];

      for (const ch of data) {
        allPayments.push({
          id: `py_${ch.id}`,
          workspace_id: workspaceId,
          invoice_id: ch.invoice ? `inv_${ch.invoice}` : undefined,
          customer_id: `cust_${ch.customer}`,
          provider_type: 'stripe' as ProviderType,
          provider_payment_id: ch.id,
          amount_cents: ch.amount || 0,
          currency: (ch.currency || 'USD').toUpperCase(),
          status: ch.status === 'succeeded' ? 'succeeded' : ch.status === 'pending' ? 'pending' : 'failed',
          payment_method_type: ch.payment_method_details?.type || 'card',
          payment_method_last4: ch.payment_method_details?.card?.last4,
          created_at: new Date(ch.created * 1000).toISOString(),
        });
      }

      hasMore = Boolean(json.has_more && data.length > 0);
      if (data.length > 0) {
        startingAfter = data[data.length - 1].id;
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
    let apiKey: string;
    try {
      apiKey = this.getEffectiveApiKey(credentials, workspaceId);
    } catch (err: any) {
      return {
        success: false,
        failureCode: 'STRIPE_API_KEY_REQUIRED',
        failureMessage: err.message || 'Valid Stripe API key is required for workspace to execute live payment retries.',
        isRecovered: false,
      };
    }

    try {
      const res = await fetch(`https://api.stripe.com/v1/invoices/${encodeURIComponent(invoiceId)}/pay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `recovery_retry_${workspaceId}_${invoiceId}`,
        },
      });

      const stripeData = await res.json();
      if (res.ok && stripeData.status === 'paid') {
        const realPaymentId = stripeData.payment_intent || stripeData.charge || stripeData.id;
        if (!realPaymentId || typeof realPaymentId !== 'string' || realPaymentId.startsWith('py_str_')) {
          return {
            success: false,
            failureCode: 'STRIPE_PAYMENT_ID_MISSING',
            failureMessage: 'Stripe reported payment success but did not provide an authoritative payment intent or charge ID.',
            isRecovered: false,
          };
        }
        return {
          success: true,
          paymentId: realPaymentId,
          isRecovered: true,
        };
      } else {
        const errMessage = stripeData.error?.message || 'Invoice payment failed on Stripe';
        const errCode = stripeData.error?.decline_code || stripeData.error?.code || 'card_declined';
        return {
          success: false,
          failureCode: errCode,
          failureMessage: errMessage,
          isRecovered: false,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        failureCode: 'stripe_connection_error',
        failureMessage: err.message || 'Failed to connect to Stripe API',
        isRecovered: false,
      };
    }
  }

  async createPaymentLink(
    workspaceId: string,
    invoiceId: string,
    customerId: string,
    amountCents: number,
    currency: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<PaymentLinkResult> {
    let apiKey: string | null = null;
    try {
      apiKey = this.getEffectiveApiKey(credentials, workspaceId);
    } catch (err: any) {
      if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
        throw err;
      }
    }

    if (apiKey) {
      try {
        const appUrl = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('APP_URL environment variable is required in production mode for checkout redirects.'); })() : 'http://localhost:3000');
        const bodyParams = new URLSearchParams({
          'payment_method_types[0]': 'card',
          'mode': 'payment',
          'line_items[0][price_data][currency]': (currency || 'usd').toLowerCase(),
          'line_items[0][price_data][unit_amount]': String(amountCents > 0 ? amountCents : 1000),
          'line_items[0][price_data][product_data][name]': `Invoice Payment ${invoiceId}`,
          'client_reference_id': invoiceId,
          'success_url': `${appUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
          'cancel_url': `${appUrl}/pay/cancel`,
        });

        const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        });

        const data = await res.json();
        if (res.ok && data.url) {
          return {
            url: data.url,
            providerCheckoutId: data.id,
            expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
          };
        }
      } catch (err: any) {
        if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
          throw new Error(`Stripe Checkout Session generation failed: ${err.message}`);
        }
      }
    }

    if (isSupabaseAuthoritative()) {
      throw new Error(
        `Stripe live payment link generation failed: Workspace "${workspaceId}" requires active Stripe API credentials.`
      );
    }

    const secureToken = crypto.randomBytes(16).toString('hex');
    const paymentUrl = `/pay/${secureToken}?inv=${encodeURIComponent(invoiceId)}&src=stripe`;
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

    const eventType = payload?.type || 'unknown';
    const rawEventId = payload?.id;
    const isGenuineEventId = typeof rawEventId === 'string' && (rawEventId.startsWith('evt_') || rawEventId.startsWith('we_'));
    const eventId = isGenuineEventId
      ? rawEventId
      : crypto.createHash('sha256').update(rawString).digest('hex');

    // Webhook Signature verification logic using exact raw body
    const signatureHeader = (headers['stripe-signature'] as string) || '';

    if (!signatureHeader) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Signature missing',
        error: 'Missing stripe-signature header',
      };
    }

    if (!webhookSecret) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Secret missing',
        error: 'Stripe webhook secret is not configured',
      };
    }

    const parts = signatureHeader.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='))?.split('=')[1];
    const signaturePart = parts.find((p) => p.startsWith('v1='))?.split('=')[1];

    if (!timestampPart || !signaturePart || signaturePart === 'valid' || signatureHeader.includes('v1=valid')) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Signature format invalid',
        error: 'Missing or malformed timestamp/v1 signature component in stripe-signature header',
      };
    }

    // Check timestamp tolerance (300 seconds)
    const currentTime = Math.floor(Date.now() / 1000);
    const eventTime = parseInt(timestampPart, 10);
    if (isNaN(eventTime) || Math.abs(currentTime - eventTime) > 300) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Timestamp out of tolerance',
        error: `Stripe webhook timestamp drift exceeded tolerance (${Math.abs(currentTime - eventTime)}s)`,
      };
    }

    const signedPayload = `${timestampPart}.${rawString}`;
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    const computedBuf = Buffer.from(computedSignature, 'utf8');
    const signatureBuf = Buffer.from(signaturePart, 'utf8');

    if (computedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(computedBuf, signatureBuf)) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Signature verification rejected',
        error: 'Invalid Stripe Webhook Signature',
      };
    }

    if (eventType === 'invoice.payment_failed') {
      return {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Payment failure detected. Initiated Recovery Opportunity.',
        recoveredAmountCents: 0,
      };
    }

    if (eventType === 'invoice.payment_succeeded') {
      const invoice = payload.data?.object;
      const amount = invoice?.amount_paid || invoice?.amount_due || 0;
      return {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        actionTaken: 'Payment succeeded. Resolved recovery workflow and registered recovered revenue.',
        recoveredAmountCents: amount,
      };
    }

    return {
      processed: true,
      duplicate: false,
      eventType,
      providerEventId: eventId,
      actionTaken: 'Recorded event for audit trail.',
    };
  }
}
